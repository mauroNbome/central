import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { CaptureLoopInput, LoopHorizon, LoopStatus, ProcessDecision } from "../contract.ts";
import {
  addStep,
  captureLoop,
  completeLoop,
  completeStep,
  dropLoop,
  fetchAreas,
  fetchContexts,
  fetchLoops,
  fetchSteps,
  processLoop,
  removeStep,
  reopenLoop,
  reopenStep,
  reorderSteps,
  rescheduleLoop,
  setLoopArea,
  setStepContext,
  shelveLoop,
  type LoopDto,
  type StepDto,
} from "./api.ts";
import type { LoopCall } from "./loopsView.ts";

export const loopKeys = {
  all: ["loops"] as const,
  list: (status?: LoopStatus) => ["loops", "list", status ?? "all"] as const,
  /** Adentro de `all`: un cambio de pasos refresca los loops (y al revés). */
  steps: ["loops", "steps"] as const,
};

export function useLoops(status?: LoopStatus) {
  return useQuery({ queryKey: loopKeys.list(status), queryFn: () => fetchLoops(status) });
}

/** Fuera de `loopKeys.all` a propósito: cada decisión refresca los loops, y las áreas casi no cambian. */
const areasKey = ["loops:areas"] as const;

export function useAreas() {
  return useQuery({ queryKey: areasKey, queryFn: fetchAreas, staleTime: Infinity });
}

/** Como las áreas: fijas por ahora. */
const contextsKey = ["loops:contexts"] as const;

export function useContexts() {
  return useQuery({ queryKey: contextsKey, queryFn: fetchContexts, staleTime: Infinity });
}

/** Todos los pasos del usuario: alcanzan para Hoy, los contadores y el editor. */
export function useSteps() {
  return useQuery({ queryKey: loopKeys.steps, queryFn: fetchSteps });
}

/**
 * Refresca sólo cuando termina la última mutación en vuelo. Si refrescara
 * después de cada una, con varias decisiones seguidas el refetch traería
 * loops que el servidor todavía no procesó y reaparecerían en la lista.
 */
function settle(qc: QueryClient) {
  if (qc.isMutating({ mutationKey: loopKeys.all }) === 1) {
    return qc.invalidateQueries({ queryKey: loopKeys.all });
  }
}

/**
 * Fila única para completar, deshacer y cambiar pasos. Un "deshacer" rápido
 * tiene que llegar después del "hecho" que deshace (si no, el servidor todavía
 * no lo cerró y da 409), y un reordenar después del paso que se acaba de agregar.
 */
const serial = { id: "loops:serial" };

/** Lo que el servidor va a devolver, armado en el cliente para mostrarlo ya. */
function optimisticLoop(input: CaptureLoopInput): LoopDto {
  const now = new Date().toISOString();
  const rawText = input.rawText.trim();
  return {
    id: input.id,
    userId: "",
    title: rawText.split("\n", 1)[0]!.trim(),
    rawText,
    status: "inbox",
    areaId: null,
    horizon: null,
    source: input.source,
    createdAt: now,
    processedAt: null,
    completedAt: null,
    updatedAt: now,
    lastActivityAt: now,
  };
}

export function useCaptureLoop() {
  const qc = useQueryClient();
  const inbox = loopKeys.list("inbox");
  return useMutation({
    mutationKey: loopKeys.all,
    mutationFn: captureLoop,
    // El id es del cliente y el servidor ignora duplicados: reintentar es seguro.
    retry: 3,
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: inbox });
      qc.setQueryData<LoopDto[]>(inbox, (old = []) => [...old, optimisticLoop(input)]);
    },
    // Se saca sólo este loop: restaurar una foto previa borraría otras capturas en vuelo.
    onError: (_err, input) => {
      qc.setQueryData<LoopDto[]>(inbox, (old) => old?.filter((l) => l.id !== input.id));
    },
    onSettled: () => settle(qc),
  });
}

/**
 * Saca un loop de una lista del cache y devuelve cómo volver a ponerlo en su
 * lugar si la api falla, para que se pueda intentar de nuevo.
 */
async function removeOptimistically(qc: QueryClient, key: readonly unknown[], loop: LoopDto) {
  await qc.cancelQueries({ queryKey: key });
  const index = qc.getQueryData<LoopDto[]>(key)?.findIndex((l) => l.id === loop.id) ?? -1;
  qc.setQueryData<LoopDto[]>(key, (old) => old?.filter((l) => l.id !== loop.id));
  return () =>
    qc.setQueryData<LoopDto[]>(key, (old = []) => {
      if (old.some((l) => l.id === loop.id)) return old;
      const at = index >= 0 ? Math.min(index, old.length) : old.length;
      return [...old.slice(0, at), loop, ...old.slice(at)];
    });
}

export function useProcessLoop() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: loopKeys.all,
    mutationFn: ({ loop, decision }: { loop: LoopDto; decision: ProcessDecision }) => processLoop(loop.id, decision),
    onMutate: ({ loop }) => removeOptimistically(qc, loopKeys.list("inbox"), loop),
    onError: (_err, _vars, restore) => restore?.(),
    onSettled: () => settle(qc),
  });
}

/** Cierra un loop sin pasos desde Hoy. `closed` va a todas las listas: sale de activos y entra a "Hecho hoy". */
export function useCompleteLoop() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: loopKeys.all,
    scope: serial,
    mutationFn: ({ loop }: { loop: LoopDto; closed: LoopDto }) => completeLoop(loop.id),
    onMutate: async ({ closed }) => {
      await qc.cancelQueries({ queryKey: loopKeys.all });
      placeLoop(qc, closed);
    },
    onError: (_err, { loop }) => placeLoop(qc, loop),
    onSettled: () => settle(qc),
  });
}

function setHorizon(qc: QueryClient, id: string, horizon: LoopDto["horizon"]) {
  qc.setQueryData<LoopDto[]>(loopKeys.list("active"), (old) => old?.map((l) => (l.id === id ? { ...l, horizon } : l)));
}

export function useRescheduleLoop() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: loopKeys.all,
    mutationFn: ({ loop, horizon }: { loop: LoopDto; horizon: LoopHorizon }) => rescheduleLoop(loop.id, horizon),
    onMutate: async ({ loop, horizon }) => {
      await qc.cancelQueries({ queryKey: loopKeys.list("active") });
      setHorizon(qc, loop.id, horizon);
    },
    onError: (_err, { loop }) => setHorizon(qc, loop.id, loop.horizon),
    onSettled: () => settle(qc),
  });
}

/**
 * Pone el loop en cada lista del cache donde le toca estar (por su estado) y lo
 * saca de las demás. Con el loop nuevo es el update optimista; con el original,
 * el rollback de ese loop solo.
 */
function placeLoop(qc: QueryClient, loop: LoopDto) {
  for (const [key] of qc.getQueriesData<LoopDto[]>({ queryKey: [...loopKeys.all, "list"] })) {
    const belongs = key[2] === "all" || key[2] === loop.status;
    qc.setQueryData<LoopDto[]>(key, (old) => {
      if (!old) return old;
      const present = old.some((l) => l.id === loop.id);
      if (!belongs) return present ? old.filter((l) => l.id !== loop.id) : old;
      if (present) return old.map((l) => (l.id === loop.id ? loop : l));
      // Las listas vienen ordenadas por fecha de captura.
      const at = old.findIndex((l) => l.createdAt > loop.createdAt);
      return at < 0 ? [...old, loop] : [...old.slice(0, at), loop, ...old.slice(at)];
    });
  }
}

/** Cambio sobre un loop cualquiera, con `next` como lo que se muestra mientras responde la api. */
function useLoopChange<V extends { loop: LoopDto; next: LoopDto }>(mutationFn: (vars: V) => Promise<LoopDto>) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: loopKeys.all,
    mutationFn,
    onMutate: async ({ next }) => {
      await qc.cancelQueries({ queryKey: loopKeys.all });
      placeLoop(qc, next);
    },
    onError: (_err, { loop }) => placeLoop(qc, loop),
    onSettled: () => settle(qc),
  });
}

function runLoopCall(id: string, call: LoopCall): Promise<LoopDto> {
  switch (call.kind) {
    case "process":
      return processLoop(id, call.decision);
    case "reschedule":
      return rescheduleLoop(id, call.horizon);
    case "complete":
      return completeLoop(id);
    case "shelve":
      return shelveLoop(id);
    case "drop":
      return dropLoop(id);
  }
}

/** Decide sobre un loop en cualquier estado abierto (vista Loops). */
export function useDecideLoop() {
  return useLoopChange(({ loop, call }: { loop: LoopDto; next: LoopDto; call: LoopCall }) => runLoopCall(loop.id, call));
}

export function useSetLoopArea() {
  return useLoopChange(({ loop, next }: { loop: LoopDto; next: LoopDto }) => setLoopArea(loop.id, next.areaId));
}

/** Pone (o reemplaza) pasos en el cache. Con los originales, es el rollback de esos solos. */
function putSteps(qc: QueryClient, steps: readonly StepDto[]) {
  const byId = new Map(steps.map((s) => [s.id, s]));
  qc.setQueryData<StepDto[]>(loopKeys.steps, (old = []) => [
    ...old.map((s) => byId.get(s.id) ?? s),
    ...steps.filter((s) => !old.some((o) => o.id === s.id)),
  ]);
}

function dropStep(qc: QueryClient, id: string) {
  qc.setQueryData<StepDto[]>(loopKeys.steps, (old) => old?.filter((s) => s.id !== id));
}

/** Cambios de pasos de un loop, en la fila de `serial`. */
export function useStepChanges(loopId: string) {
  const qc = useQueryClient();
  const base = { mutationKey: loopKeys.all, scope: serial, onSettled: () => settle(qc) };
  const cancel = () => qc.cancelQueries({ queryKey: loopKeys.steps });

  return {
    add: useMutation({
      ...base,
      mutationFn: (step: StepDto) => addStep(loopId, { id: step.id, title: step.title, contextId: step.contextId }),
      // El id es del cliente: reintentar no duplica.
      retry: 3,
      onMutate: async (step) => {
        await cancel();
        putSteps(qc, [step]);
      },
      onError: (_err, step) => dropStep(qc, step.id),
    }),
    reorder: useMutation({
      ...base,
      mutationFn: ({ next }: { before: StepDto[]; next: StepDto[] }) =>
        reorderSteps(
          loopId,
          [...next].sort((a, b) => a.position - b.position).map((s) => s.id),
        ),
      onMutate: async ({ next }) => {
        await cancel();
        putSteps(qc, next);
      },
      onError: (_err, { before }) => putSteps(qc, before),
    }),
    setContext: useMutation({
      ...base,
      mutationFn: ({ next }: { step: StepDto; next: StepDto }) => setStepContext(loopId, next.id, next.contextId),
      onMutate: async ({ next }) => {
        await cancel();
        putSteps(qc, [next]);
      },
      onError: (_err, { step }) => putSteps(qc, [step]),
    }),
    remove: useMutation({
      ...base,
      mutationFn: (step: StepDto) => removeStep(loopId, step.id),
      onMutate: async (step) => {
        await cancel();
        dropStep(qc, step.id);
      },
      onError: (_err, step) => putSteps(qc, [step]),
    }),
  };
}

/**
 * Completa un paso. Si era el último pendiente, `closed` es el loop cerrado y
 * sale de las listas de abiertos en el acto.
 */
export function useCompleteStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: loopKeys.all,
    scope: serial,
    mutationFn: ({ step }: { loop: LoopDto; step: StepDto; next: StepDto; closed: LoopDto | null }) =>
      completeStep(step.loopId, step.id),
    onMutate: async ({ next, closed }) => {
      await qc.cancelQueries({ queryKey: loopKeys.all });
      putSteps(qc, [next]);
      if (closed) placeLoop(qc, closed);
    },
    onError: (_err, { loop, step, closed }) => {
      putSteps(qc, [step]);
      if (closed) placeLoop(qc, loop);
    },
    onSettled: () => settle(qc),
  });
}

/**
 * Deshace completar un paso. `reopened` es el loop como estaba antes de
 * cerrarse (si completar el paso lo había cerrado): vuelve con su horizonte.
 */
export function useReopenStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: loopKeys.all,
    scope: serial,
    mutationFn: ({ next, reopened }: { loop: LoopDto; step: StepDto; next: StepDto; reopened: LoopDto | null }) =>
      reopenStep(next.loopId, next.id, reopened?.horizon ?? null),
    onMutate: async ({ next, reopened }) => {
      await qc.cancelQueries({ queryKey: loopKeys.all });
      putSteps(qc, [next]);
      if (reopened) placeLoop(qc, reopened);
    },
    onError: (_err, { loop, step, reopened }) => {
      putSteps(qc, [step]);
      if (reopened) placeLoop(qc, loop);
    },
    onSettled: () => settle(qc),
  });
}

/** Deshace cerrar un loop sin pasos: `next` es el loop como estaba, con su horizonte. */
export function useReopenLoop() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: loopKeys.all,
    scope: serial,
    mutationFn: ({ next }: { loop: LoopDto; next: LoopDto }) => reopenLoop(next.id, next.horizon),
    onMutate: async ({ next }) => {
      await qc.cancelQueries({ queryKey: loopKeys.all });
      placeLoop(qc, next);
    },
    onError: (_err, { loop }) => placeLoop(qc, loop),
    onSettled: () => settle(qc),
  });
}
