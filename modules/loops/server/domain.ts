/**
 * Reglas del módulo Loops como funciones puras: reciben el estado, devuelven el
 * estado nuevo y los eventos a emitir. No tocan la base ni el bus; eso lo hace
 * quien las llama, después de guardar (un evento no puede anunciar algo que
 * terminó en rollback).
 */
import type { HubEvents } from "@hub/core";
import type {
  CaptureLoopInput,
  CreateStepInput,
  Loop,
  LoopHorizon,
  NextAction,
  ProcessDecision,
  Step,
} from "../contract.ts";

export class DomainError extends Error {
  override name = "DomainError";
}

type DomainEvent = { [K in keyof HubEvents]: { name: K; payload: HubEvents[K] } }[keyof HubEvents];

const TITLE_MAX = 120;

export function captureLoop(input: CaptureLoopInput, userId: string, now: Date): { loop: Loop; events: DomainEvent[] } {
  const rawText = input.rawText.trim();
  const firstLine = rawText.split("\n", 1)[0]!.trim();
  const loop: Loop = {
    id: input.id,
    userId,
    title: firstLine.length > TITLE_MAX ? `${firstLine.slice(0, TITLE_MAX - 1)}…` : firstLine,
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
  return { loop, events: [{ name: "loop.captured", payload: { loopId: loop.id, userId } }] };
}

export function processLoop(loop: Loop, decision: ProcessDecision, now: Date): { loop: Loop; events: DomainEvent[] } {
  // También se procesa desde "someday" en la revisión semanal.
  if (loop.status !== "inbox" && loop.status !== "someday") {
    throw new DomainError(`No se puede procesar un loop en estado "${loop.status}"`);
  }

  const base = { ...loop, processedAt: now, updatedAt: now, lastActivityAt: now };
  let next: Loop;
  switch (decision.kind) {
    case "activate":
      next = { ...base, status: "active", horizon: decision.horizon };
      break;
    case "someday":
      next = { ...base, status: "someday", horizon: null };
      break;
    case "done":
      next = { ...base, status: "done", horizon: null, completedAt: now };
      break;
    case "drop":
      next = { ...base, status: "dropped", horizon: null };
      break;
  }

  return {
    loop: next,
    events: [{ name: "loop.processed", payload: { loopId: loop.id, userId: loop.userId, status: next.status } }],
  };
}

const byPosition = (a: Step, b: Step) => a.position - b.position;

/**
 * La próxima acción se calcula, no se guarda (D4). Un loop activo sin pasos
 * pendientes es su propia próxima acción: así nunca desaparece de "Hoy" sin cerrarse.
 */
export function nextAction(loop: Loop, steps: Step[]): NextAction | null {
  if (loop.status !== "active") return null;
  const first = steps.filter((s) => s.loopId === loop.id && s.status === "pending").sort(byPosition)[0];
  return first ? { kind: "step", loop, step: first } : { kind: "loop", loop };
}

/** Completar un paso promueve el siguiente; completar el último cierra el loop. */
export function completeStep(
  loop: Loop,
  steps: Step[],
  stepId: string,
  now: Date,
): { loop: Loop; step: Step; events: DomainEvent[] } {
  if (loop.status !== "active") {
    throw new DomainError(`No se puede completar un paso de un loop en estado "${loop.status}"`);
  }
  const step = findPendingStep(loop, steps, stepId);

  const doneStep: Step = { ...step, status: "done", completedAt: now };
  const events: DomainEvent[] = [
    { name: "step.completed", payload: { loopId: loop.id, stepId, userId: loop.userId } },
  ];

  const othersPending = steps.some((s) => s.loopId === loop.id && s.id !== stepId && s.status === "pending");
  if (othersPending) {
    return { loop: { ...loop, updatedAt: now, lastActivityAt: now }, step: doneStep, events };
  }

  const closed = closeLoop(loop, now);
  return { loop: closed.loop, step: doneStep, events: [...events, ...closed.events] };
}

const isOpen = (loop: Loop) => loop.status === "inbox" || loop.status === "active" || loop.status === "someday";

function assertEditable(loop: Loop) {
  if (!isOpen(loop)) throw new DomainError(`No se pueden editar los pasos de un loop en estado "${loop.status}"`);
}

function findPendingStep(loop: Loop, steps: Step[], stepId: string): Step {
  const step = steps.find((s) => s.id === stepId && s.loopId === loop.id);
  if (!step) throw new DomainError("El paso no pertenece al loop");
  if (step.status === "done") throw new DomainError("El paso ya está completo");
  return step;
}

/**
 * Agrega un paso al final. Se desglosa desde el inbox (antes de decidir el
 * horizonte) o desde un loop abierto cualquiera. Desglosar es avance: mueve
 * `lastActivityAt`.
 */
export function addStep(
  loop: Loop,
  steps: Step[],
  input: CreateStepInput,
  now: Date,
): { loop: Loop; step: Step; events: DomainEvent[] } {
  assertEditable(loop);
  const own = steps.filter((s) => s.loopId === loop.id);
  const step: Step = {
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
  return { loop: { ...loop, updatedAt: now, lastActivityAt: now }, step, events: [] };
}

/**
 * Renumera los pasos 0..n-1 en el orden pedido. La lista tiene que traer todos
 * los pasos del loop: si no coincide, el cliente tenía una foto vieja y es mejor
 * un 409 que adivinar dónde van los que faltan. Ordenar no es avance.
 */
export function reorderSteps(
  loop: Loop,
  steps: Step[],
  stepIds: string[],
  now: Date,
): { loop: Loop; steps: Step[]; events: DomainEvent[] } {
  assertEditable(loop);
  const own = new Map(steps.filter((s) => s.loopId === loop.id).map((s) => [s.id, s]));
  if (stepIds.length !== own.size || new Set(stepIds).size !== stepIds.length || stepIds.some((id) => !own.has(id))) {
    throw new DomainError("La lista de pasos no coincide con la del loop");
  }
  return {
    loop: { ...loop, updatedAt: now },
    steps: stepIds.map((id, position) => ({ ...own.get(id)!, position })),
    events: [],
  };
}

/** Clasificar un paso no es avance, como el área de un loop. Sólo pasos pendientes. */
export function setStepContext(
  loop: Loop,
  steps: Step[],
  stepId: string,
  contextId: string | null,
  now: Date,
): { loop: Loop; step: Step; events: DomainEvent[] } {
  assertEditable(loop);
  const step = findPendingStep(loop, steps, stepId);
  return { loop: { ...loop, updatedAt: now }, step: { ...step, contextId }, events: [] };
}

/** Borra un paso pendiente. Los hechos quedan: son la historia del loop. */
export function removeStep(
  loop: Loop,
  steps: Step[],
  stepId: string,
  now: Date,
): { loop: Loop; step: Step; events: DomainEvent[] } {
  assertEditable(loop);
  const step = findPendingStep(loop, steps, stepId);
  return { loop: { ...loop, updatedAt: now }, step, events: [] };
}

/**
 * Deshace un paso completado por error. Si el loop se había cerrado al
 * completarlo, se reabre. No es avance: `lastActivityAt` queda como está.
 */
export function reopenStep(
  loop: Loop,
  steps: Step[],
  stepId: string,
  horizon: LoopHorizon | undefined,
  now: Date,
): { loop: Loop; step: Step; events: DomainEvent[] } {
  const step = steps.find((s) => s.id === stepId && s.loopId === loop.id);
  if (!step) throw new DomainError("El paso no pertenece al loop");
  if (step.status !== "done") throw new DomainError("El paso no está completo");
  const reopened = loop.status === "done" ? reopenLoop(loop, horizon, now).loop : loop;
  assertEditable(reopened);
  return {
    loop: { ...reopened, updatedAt: now },
    step: { ...step, status: "pending", completedAt: null },
    events: [],
  };
}

/**
 * Deshace el cierre de un loop: vuelve a activo con el horizonte que tenía.
 * Sin eventos, como reprogramar: ningún módulo escucha todavía.
 */
export function reopenLoop(loop: Loop, horizon: LoopHorizon | undefined, now: Date): { loop: Loop; events: DomainEvent[] } {
  if (loop.status !== "done") throw new DomainError(`No se puede reabrir un loop en estado "${loop.status}"`);
  return {
    loop: { ...loop, status: "active", horizon: horizon ?? "today", completedAt: null, updatedAt: now },
    events: [],
  };
}

/** Cierra un loop activo directamente (p. ej. un loop sin pasos que es su propia próxima acción). */
export function completeLoop(loop: Loop, now: Date): { loop: Loop; events: DomainEvent[] } {
  if (loop.status !== "active") {
    throw new DomainError(`No se puede completar un loop en estado "${loop.status}"`);
  }
  return closeLoop(loop, now);
}

/**
 * Cambia el horizonte de un loop activo. Es aparte de `processLoop` a propósito:
 * procesar sólo acepta inbox/someday, y eso es lo que hace que una doble tecla
 * en el inbox dé 409 en vez de pisar la primera decisión.
 * No emite eventos: ningún otro módulo lo necesita todavía. Tampoco cuenta como
 * actividad: un loop que se posterga cada semana tiene que verse estancado.
 */
export function rescheduleLoop(loop: Loop, horizon: LoopHorizon, now: Date): { loop: Loop; events: DomainEvent[] } {
  if (loop.status !== "active") {
    throw new DomainError(`No se puede reprogramar un loop en estado "${loop.status}"`);
  }
  return { loop: { ...loop, horizon, updatedAt: now }, events: [] };
}

/** Manda un loop activo a "algún día". Como reprogramar: sin eventos todavía. */
export function shelveLoop(loop: Loop, now: Date): { loop: Loop; events: DomainEvent[] } {
  if (loop.status !== "active") {
    throw new DomainError(`No se puede mandar a algún día un loop en estado "${loop.status}"`);
  }
  return { loop: { ...loop, status: "someday", horizon: null, updatedAt: now }, events: [] };
}

/** Descarta un loop activo. Desde inbox o someday se descarta procesando. */
export function dropLoop(loop: Loop, now: Date): { loop: Loop; events: DomainEvent[] } {
  if (loop.status !== "active") {
    throw new DomainError(`No se puede descartar un loop en estado "${loop.status}"`);
  }
  return { loop: { ...loop, status: "dropped", horizon: null, updatedAt: now }, events: [] };
}

/** Clasificar no es avanzar: no toca `lastActivityAt`. Los cerrados no se editan. */
export function setLoopArea(loop: Loop, areaId: string | null, now: Date): { loop: Loop; events: DomainEvent[] } {
  if (loop.status === "done" || loop.status === "dropped") {
    throw new DomainError(`No se puede cambiar el área de un loop en estado "${loop.status}"`);
  }
  return { loop: { ...loop, areaId, updatedAt: now }, events: [] };
}

function closeLoop(loop: Loop, now: Date): { loop: Loop; events: DomainEvent[] } {
  return {
    loop: { ...loop, status: "done", horizon: null, completedAt: now, updatedAt: now, lastActivityAt: now },
    events: [{ name: "loop.completed", payload: { loopId: loop.id, userId: loop.userId } }],
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Estancado: activo y sin actividad real (ver `lastActivityAt`) ni pasos completados en `days` días. */
export function isStale(loop: Loop, steps: Step[], now: Date, days = 7): boolean {
  if (loop.status !== "active") return false;
  const lastActivity = steps
    .filter((s) => s.loopId === loop.id && s.completedAt)
    .reduce((latest, s) => Math.max(latest, s.completedAt!.getTime()), loop.lastActivityAt.getTime());
  return now.getTime() - lastActivity >= days * DAY_MS;
}
