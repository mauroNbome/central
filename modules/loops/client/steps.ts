/**
 * Lógica pura de los pasos en el cliente: orden, próxima acción y los cambios
 * optimistas que se muestran antes de que responda la api.
 */
import type { LoopDto, StepDto } from "./api.ts";

/** Pasos de un loop, en orden. */
export function stepsOf(steps: readonly StepDto[], loopId: string): StepDto[] {
  return steps.filter((s) => s.loopId === loopId).sort((a, b) => a.position - b.position);
}

/** Primer paso pendiente del loop, o undefined si el loop es su propia próxima acción. */
export function nextStep(steps: readonly StepDto[], loopId: string): StepDto | undefined {
  return stepsOf(steps, loopId).find((s) => s.status === "pending");
}

export function pendingCount(steps: readonly StepDto[], loopId: string): number {
  return steps.filter((s) => s.loopId === loopId && s.status === "pending").length;
}

/** "3 pasos" o undefined si no tiene pendientes, para el meta de una fila. */
export function pendingLabel(steps: readonly StepDto[], loopId: string): string | undefined {
  const n = pendingCount(steps, loopId);
  return n === 0 ? undefined : n === 1 ? "1 paso" : `${n} pasos`;
}

/** El paso como lo va a devolver el servidor: al final del loop. */
export function newStep(
  loop: Pick<LoopDto, "id" | "userId">,
  own: readonly StepDto[],
  input: { id: string; title: string; contextId: string | null },
  now: string,
): StepDto {
  return {
    id: input.id,
    userId: loop.userId,
    loopId: loop.id,
    title: input.title.trim(),
    position: own.reduce((max, s) => Math.max(max, s.position + 1), 0),
    contextId: input.contextId,
    status: "pending",
    estimateMinutes: null,
    completedAt: null,
    createdAt: now,
  };
}

/**
 * Mueve el paso `index` un lugar y renumera 0..n-1, como el servidor. Null si
 * ya está en el borde.
 */
export function moveStep(own: readonly StepDto[], index: number, delta: 1 | -1): StepDto[] | null {
  const to = index + delta;
  if (index < 0 || index >= own.length || to < 0 || to >= own.length) return null;
  const order = [...own];
  [order[index], order[to]] = [order[to]!, order[index]!];
  return order.map((s, position) => (s.position === position ? s : { ...s, position }));
}

/**
 * Adónde va el cursor del editor después de completar el paso `index`: al
 * próximo pendiente de abajo, o si no hay, al primero pendiente de arriba.
 */
export function nextPendingIndex(own: readonly StepDto[], index: number): number {
  const pending = (i: number) => i !== index && own[i]?.status === "pending";
  for (let i = index + 1; i < own.length; i++) if (pending(i)) return i;
  for (let i = 0; i < index; i++) if (pending(i)) return i;
  return index;
}

export function completedStep(step: StepDto, now: string): StepDto {
  return { ...step, status: "done", completedAt: now };
}

/** Completar este paso cierra el loop si no queda otro pendiente. */
export function closesLoop(steps: readonly StepDto[], step: StepDto): boolean {
  return !steps.some((s) => s.loopId === step.loopId && s.id !== step.id && s.status === "pending");
}

export function closedLoop(loop: LoopDto, now: string): LoopDto {
  return { ...loop, status: "done", horizon: null, completedAt: now, updatedAt: now, lastActivityAt: now };
}

/**
 * Filtro por contexto de Hoy: con un contexto elegido, sólo quedan los loops
 * cuyo próximo paso es de ese contexto. Un loop sin pasos no dice dónde se
 * hace, así que queda afuera.
 */
export function matchesContext(steps: readonly StepDto[], loopId: string, contextId: string | null): boolean {
  if (contextId === null) return true;
  return nextStep(steps, loopId)?.contextId === contextId;
}
