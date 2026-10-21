/**
 * Lógica pura de "Hecho hoy": lo que se completó desde la medianoche, para que
 * lo hecho en el día siga a la vista en vez de desaparecer.
 */
import type { LoopDto, StepDto } from "./api.ts";

export interface DoneEntry {
  /** `done:` + id del paso o del loop: no choca con los ids de las filas pendientes. */
  id: string;
  at: string;
  title: string;
  /** El loop, cuando la entrada es un paso. */
  detail?: string;
  /** Completar esto cerró el loop (o es un loop sin pasos). */
  closedLoop: boolean;
  loop: LoopDto;
  step?: StepDto;
}

export const doneId = (id: string) => `done:${id}`;

const since = (iso: string | null, from: Date) => iso !== null && new Date(iso).getTime() >= from.getTime();

/**
 * Pasos completados desde `from`, y loops cerrados desde `from` que no tienen un
 * paso completado en ese lapso (sin pasos, o cerrados con `x` en el inbox o en
 * Loops). Un loop que se cerró con su último paso aparece una vez: como ese
 * paso, marcado como "loop cerrado". Del más viejo al más nuevo, como un diario.
 */
export function doneToday(loops: readonly LoopDto[], steps: readonly StepDto[], from: Date): DoneEntry[] {
  const loopById = new Map(loops.map((l) => [l.id, l]));
  const stepEntries = steps.flatMap((step): DoneEntry[] => {
    const loop = loopById.get(step.loopId);
    if (step.status !== "done" || !since(step.completedAt, from) || !loop) return [];
    return [
      {
        id: doneId(step.id),
        at: step.completedAt!,
        title: step.title,
        detail: loop.title,
        // El dominio cierra el loop con el mismo instante que el último paso.
        closedLoop: loop.status === "done" && loop.completedAt === step.completedAt,
        loop,
        step,
      },
    ];
  });
  const withSteps = new Set(stepEntries.map((e) => e.loop.id));
  const loopEntries = loops
    .filter((l) => l.status === "done" && since(l.completedAt, from) && !withSteps.has(l.id))
    .map((loop): DoneEntry => ({ id: doneId(loop.id), at: loop.completedAt!, title: loop.title, closedLoop: true, loop }));
  return [...stepEntries, ...loopEntries].sort((a, b) => a.at.localeCompare(b.at));
}

/** Con un contexto elegido, sólo los pasos de ese contexto (como las próximas acciones). */
export function matchesDoneContext(entry: DoneEntry, contextId: string | null): boolean {
  return contextId === null || entry.step?.contextId === contextId;
}
