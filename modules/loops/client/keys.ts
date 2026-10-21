import type { LoopHorizon, ProcessDecision } from "../contract.ts";
import type { StatusFilter } from "./loopsView.ts";

/**
 * Mapa de teclas del procesado. Inicial de la palabra en español, salvo
 * Hecho (`x`, como tachar), que choca con Hoy. El orden es el de la leyenda.
 */
export const decisionKeys = [
  { key: "h", label: "Hoy", decision: { kind: "activate", horizon: "today" } },
  { key: "s", label: "Semana", decision: { kind: "activate", horizon: "week" } },
  { key: "m", label: "Más adelante", decision: { kind: "activate", horizon: "later" } },
  { key: "a", label: "Algún día", decision: { kind: "someday" } },
  { key: "x", label: "Hecho", decision: { kind: "done" } },
  { key: "d", label: "Descartar", decision: { kind: "drop" } },
] as const satisfies readonly { key: string; label: string; decision: ProcessDecision }[];

export type DecisionKey = (typeof decisionKeys)[number];

/** Abre el editor de pasos del loop bajo el cursor (en Inbox, Hoy y Loops). */
export const breakdownKey = { key: "p", label: "Desglosar" } as const;

/** Las mismas teclas de horizonte que en el inbox, para reprogramar desde Hoy. */
export const horizonKeys = [
  { key: "h", label: "Hoy", horizon: "today" },
  { key: "s", label: "Semana", horizon: "week" },
  { key: "m", label: "Más adelante", horizon: "later" },
] as const satisfies readonly { key: string; label: string; horizon: LoopHorizon }[];

export type HorizonKey = (typeof horizonKeys)[number];

/** Pestañas por número. */
export const tabKeys = [
  { key: "1", tab: "inbox", label: "Inbox" },
  { key: "2", tab: "today", label: "Hoy" },
  { key: "3", tab: "loops", label: "Loops" },
] as const;

export type Tab = (typeof tabKeys)[number]["tab"];

type Move = { type: "move"; delta: 1 | -1 };

function moveForKey(key: string): Move | null {
  if (key === "j" || key === "ArrowDown") return { type: "move", delta: 1 };
  if (key === "k" || key === "ArrowUp") return { type: "move", delta: -1 };
  return null;
}

type Breakdown = { type: "breakdown" };

export type InboxAction = Move | Breakdown | { type: "decide"; choice: DecisionKey };

export function inboxActionForKey(key: string): InboxAction | null {
  const move = moveForKey(key);
  if (move) return move;
  if (key.toLowerCase() === breakdownKey.key) return { type: "breakdown" };
  // Bloq Mayús no debería romper el procesado.
  const choice = decisionKeys.find((d) => d.key === key.toLowerCase());
  return choice ? { type: "decide", choice } : null;
}

export type TodayMode = "normal" | "reschedule" | "filter";

/** Contextos por posición: `1` es el primero; `0` es "todos" al filtrar y "sin contexto" al asignar. */
type ContextSlot = number | null;

export type TodayAction =
  | Move
  | Breakdown
  | { type: "complete" }
  | { type: "startReschedule" }
  | { type: "reschedule"; choice: HorizonKey }
  | { type: "startFilter" }
  | { type: "filterContext"; slot: ContextSlot }
  | { type: "cancel" };

/**
 * `r` y `f` abren un segundo paso: la próxima tecla elige el horizonte nuevo o
 * el contexto (`f` + número, como el filtro de área en la vista Loops).
 */
export function todayActionForKey(key: string, mode: TodayMode): TodayAction | null {
  if (mode === "reschedule") {
    const choice = horizonKeys.find((h) => h.key === key.toLowerCase());
    // Cualquier otra tecla cancela, para no quedar atrapado en el modo.
    return choice ? { type: "reschedule", choice } : { type: "cancel" };
  }
  if (mode === "filter") {
    const slot = slotForKey(key);
    return slot === undefined ? { type: "cancel" } : { type: "filterContext", slot };
  }
  const move = moveForKey(key);
  if (move) return move;
  switch (key.toLowerCase()) {
    case "x":
      return { type: "complete" };
    case "r":
      return { type: "startReschedule" };
    case "f":
      return { type: "startFilter" };
    case breakdownKey.key:
      return { type: "breakdown" };
  }
  return null;
}

/** Filtros de estado de la vista Loops, después de `f`. Inicial de cada palabra. */
export const statusFilterKeys = [
  { key: "t", label: "Todos", filter: "all" },
  { key: "i", label: "Inbox", filter: "inbox" },
  { key: "e", label: "En curso", filter: "active" },
  { key: "a", label: "Algún día", filter: "someday" },
  { key: "c", label: "Cerrados", filter: "closed" },
] as const satisfies readonly { key: string; label: string; filter: StatusFilter }[];

export type StatusFilterKey = (typeof statusFilterKeys)[number];

export type LoopsMode = "normal" | "area" | "filter";

/** Áreas por posición: `1` es la primera; `0` es "sin área" al asignar y "todas" al filtrar. */
type AreaSlot = number | null;

export type LoopsAction =
  | Move
  | Breakdown
  | { type: "decide"; choice: DecisionKey }
  | { type: "startArea" }
  | { type: "area"; slot: AreaSlot }
  | { type: "startFilter" }
  | { type: "filterStatus"; choice: StatusFilterKey }
  | { type: "filterArea"; slot: AreaSlot }
  | { type: "cancel" };

/** Número a posición en una lista (áreas, contextos): `1` es la primera, `0` es null. */
function slotForKey(key: string): number | null | undefined {
  if (!/^[0-9]$/.test(key)) return undefined;
  return key === "0" ? null : Number(key) - 1;
}

/**
 * En la vista Loops las teclas del inbox re-deciden cualquier loop abierto.
 * `e` (área) y `f` (filtro) abren un segundo paso, como `r` en Hoy.
 */
export function loopsActionForKey(key: string, mode: LoopsMode): LoopsAction | null {
  const slot = slotForKey(key);
  if (mode === "area") return slot === undefined ? { type: "cancel" } : { type: "area", slot };
  if (mode === "filter") {
    if (slot !== undefined) return { type: "filterArea", slot };
    const choice = statusFilterKeys.find((f) => f.key === key.toLowerCase());
    return choice ? { type: "filterStatus", choice } : { type: "cancel" };
  }
  const move = moveForKey(key);
  if (move) return move;
  switch (key.toLowerCase()) {
    case "e":
      return { type: "startArea" };
    case "f":
      return { type: "startFilter" };
    case breakdownKey.key:
      return { type: "breakdown" };
  }
  const choice = decisionKeys.find((d) => d.key === key.toLowerCase());
  return choice ? { type: "decide", choice } : null;
}

export type EditorMode = "normal" | "context";

export type EditorAction =
  | Move
  | { type: "reorder"; delta: 1 | -1 }
  | { type: "insert" }
  | { type: "complete" }
  | { type: "remove" }
  | { type: "startContext" }
  | { type: "context"; slot: ContextSlot }
  | { type: "close" }
  | { type: "cancel" };

/**
 * Teclas del editor de pasos, cuando el foco no está en el input. Estilo vim:
 * j/k mueven, Shift+J/K reordenan (por Shift y no por mayúscula, así Bloq Mayús
 * no reordena sin querer), `i`/`o`/Enter vuelven a escribir, Esc cierra.
 */
export function editorActionForKey(e: { key: string; shiftKey: boolean }, mode: EditorMode): EditorAction | null {
  if (mode === "context") {
    const slot = slotForKey(e.key);
    return slot === undefined ? { type: "cancel" } : { type: "context", slot };
  }
  if (e.key === "Escape") return { type: "close" };
  if (e.key === "Enter") return { type: "insert" };
  // Con Shift, `e.key` llega en mayúscula ("J"); las flechas no cambian.
  const move = moveForKey(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  if (move) return e.shiftKey ? { type: "reorder", delta: move.delta } : move;
  switch (e.key.toLowerCase()) {
    case "i":
    case "o":
      return { type: "insert" };
    case "x":
      return { type: "complete" };
    case "d":
      return { type: "remove" };
    case "c":
      return { type: "startContext" };
  }
  return null;
}

export function tabForKey(key: string): Tab | null {
  return tabKeys.find((t) => t.key === key)?.tab ?? null;
}

/** `u` deshace lo del último aviso, como en vim. */
export function isUndoKey(key: string): boolean {
  return key.toLowerCase() === "u";
}

export function isCaptureKey(key: string): boolean {
  return key === "c" || key === "/";
}

/**
 * Los atajos de una letra no se disparan mientras se escribe, ni con
 * modificadores (Ctrl+C, Cmd+S, … son del navegador).
 */
export function shouldIgnoreHotkey(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return true;
  const el = e.target as { tagName?: string; isContentEditable?: boolean } | null;
  if (!el) return false;
  return el.isContentEditable === true || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
}
