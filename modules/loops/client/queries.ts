import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { CaptureLoopInput, LoopHorizon, LoopStatus, ProcessDecision } from "../contract.ts";
import { captureLoop, completeLoop, fetchLoops, processLoop, rescheduleLoop, type LoopDto } from "./api.ts";

export const loopKeys = {
  all: ["loops"] as const,
  list: (status?: LoopStatus) => ["loops", "list", status ?? "all"] as const,
};

export function useLoops(status?: LoopStatus) {
  return useQuery({ queryKey: loopKeys.list(status), queryFn: () => fetchLoops(status) });
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
