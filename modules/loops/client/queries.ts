import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { CaptureLoopInput, LoopHorizon, LoopStatus, ProcessDecision } from "../contract.ts";
import {
  captureLoop,
  completeLoop,
  dropLoop,
  fetchAreas,
  fetchLoops,
  processLoop,
  rescheduleLoop,
  setLoopArea,
  shelveLoop,
  type LoopDto,
} from "./api.ts";
import type { LoopCall } from "./loopsView.ts";

export const loopKeys = {
  all: ["loops"] as const,
  list: (status?: LoopStatus) => ["loops", "list", status ?? "all"] as const,
};

export function useLoops(status?: LoopStatus) {
  return useQuery({ queryKey: loopKeys.list(status), queryFn: () => fetchLoops(status) });
}

/** Fuera de `loopKeys.all` a propósito: cada decisión refresca los loops, y las áreas casi no cambian. */
const areasKey = ["loops:areas"] as const;

export function useAreas() {
  return useQuery({ queryKey: areasKey, queryFn: fetchAreas, staleTime: Infinity });
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

export function useCompleteLoop() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: loopKeys.all,
    mutationFn: (loop: LoopDto) => completeLoop(loop.id),
    onMutate: (loop) => removeOptimistically(qc, loopKeys.list("active"), loop),
    onError: (_err, _loop, restore) => restore?.(),
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
