/**
 * Reglas del módulo Loops como funciones puras: reciben el estado, devuelven el
 * estado nuevo y los eventos a emitir. No tocan la base ni el bus; eso lo hace
 * quien las llama, después de guardar (un evento no puede anunciar algo que
 * terminó en rollback).
 */
import type { HubEvents } from "@hub/core";
import type { CaptureLoopInput, Loop, LoopHorizon, NextAction, ProcessDecision, Step } from "../contract.ts";

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
  };
  return { loop, events: [{ name: "loop.captured", payload: { loopId: loop.id, userId } }] };
}

export function processLoop(loop: Loop, decision: ProcessDecision, now: Date): { loop: Loop; events: DomainEvent[] } {
  // También se procesa desde "someday" en la revisión semanal.
  if (loop.status !== "inbox" && loop.status !== "someday") {
    throw new DomainError(`No se puede procesar un loop en estado "${loop.status}"`);
  }

  const base = { ...loop, processedAt: now, updatedAt: now };
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
  const step = steps.find((s) => s.id === stepId && s.loopId === loop.id);
  if (!step) throw new DomainError("El paso no pertenece al loop");
  if (step.status === "done") throw new DomainError("El paso ya está completo");

  const doneStep: Step = { ...step, status: "done", completedAt: now };
  const events: DomainEvent[] = [
    { name: "step.completed", payload: { loopId: loop.id, stepId, userId: loop.userId } },
  ];

  const othersPending = steps.some((s) => s.loopId === loop.id && s.id !== stepId && s.status === "pending");
  if (othersPending) {
    return { loop: { ...loop, updatedAt: now }, step: doneStep, events };
  }

  const closed = closeLoop(loop, now);
  return { loop: closed.loop, step: doneStep, events: [...events, ...closed.events] };
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
 * No emite eventos: ningún otro módulo lo necesita todavía.
 */
export function rescheduleLoop(loop: Loop, horizon: LoopHorizon, now: Date): { loop: Loop; events: DomainEvent[] } {
  if (loop.status !== "active") {
    throw new DomainError(`No se puede reprogramar un loop en estado "${loop.status}"`);
  }
  return { loop: { ...loop, horizon, updatedAt: now }, events: [] };
}

function closeLoop(loop: Loop, now: Date): { loop: Loop; events: DomainEvent[] } {
  return {
    loop: { ...loop, status: "done", horizon: null, completedAt: now, updatedAt: now },
    events: [{ name: "loop.completed", payload: { loopId: loop.id, userId: loop.userId } }],
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Estancado: activo y sin pasos completados ni ediciones en `days` días. */
export function isStale(loop: Loop, steps: Step[], now: Date, days = 7): boolean {
  if (loop.status !== "active") return false;
  const lastActivity = steps
    .filter((s) => s.loopId === loop.id && s.completedAt)
    .reduce((latest, s) => Math.max(latest, s.completedAt!.getTime()), loop.updatedAt.getTime());
  return now.getTime() - lastActivity >= days * DAY_MS;
}
