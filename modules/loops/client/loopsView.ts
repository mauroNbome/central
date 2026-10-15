/**
 * Lógica pura de la vista Loops: qué llamada corresponde a cada decisión según
 * el estado del loop, y cómo se agrupan y filtran los loops en secciones.
 */
import type { LoopHorizon, LoopStatus, ProcessDecision } from "../contract.ts";
import type { LoopDto } from "./api.ts";

/** Qué ruta de la api aplica una decisión, según dónde está el loop hoy. */
export type LoopCall =
  | { kind: "process"; decision: ProcessDecision }
  | { kind: "reschedule"; horizon: LoopHorizon }
  | { kind: "complete" }
  | { kind: "shelve" }
  | { kind: "drop" };

/**
 * Las teclas del inbox sirven para cualquier loop abierto. Inbox y algún día se
 * procesan; un activo tiene una operación por decisión. Null si no cambia nada
 * o si el loop está cerrado (sólo lectura).
 */
export function planDecision(
  loop: { status: LoopStatus; horizon: LoopHorizon | null },
  decision: ProcessDecision,
): LoopCall | null {
  switch (loop.status) {
    case "inbox":
      return { kind: "process", decision };
    case "someday":
      return decision.kind === "someday" ? null : { kind: "process", decision };
    case "active":
      return planForActive(loop.horizon, decision);
    case "done":
    case "dropped":
      return null;
  }
}

function planForActive(horizon: LoopHorizon | null, decision: ProcessDecision): LoopCall | null {
  switch (decision.kind) {
    case "activate":
      return decision.horizon === horizon ? null : { kind: "reschedule", horizon: decision.horizon };
    case "someday":
      return { kind: "shelve" };
    case "done":
      return { kind: "complete" };
    case "drop":
      return { kind: "drop" };
  }
}

/** Cómo queda el loop después de la decisión, para mostrarlo antes de que responda la api. */
export function decidedLoop(loop: LoopDto, decision: ProcessDecision, now: string): LoopDto {
  const next = { ...loop, updatedAt: now };
  switch (decision.kind) {
    case "activate":
      return { ...next, status: "active", horizon: decision.horizon };
    case "someday":
      return { ...next, status: "someday", horizon: null };
    case "done":
      return { ...next, status: "done", horizon: null, completedAt: now };
    case "drop":
      return { ...next, status: "dropped", horizon: null };
  }
}

export type StatusFilter = "all" | "inbox" | "active" | "someday" | "closed";

export interface LoopFilters {
  status: StatusFilter;
  /** null: todas las áreas. */
  areaId: string | null;
}

type SectionId = "inbox" | "today" | "week" | "later" | "someday" | "closed";

const sectionDefs: { id: SectionId; label: string; filter: StatusFilter; match: (l: LoopDto) => boolean }[] = [
  { id: "inbox", label: "Inbox", filter: "inbox", match: (l) => l.status === "inbox" },
  { id: "today", label: "Hoy", filter: "active", match: (l) => l.status === "active" && l.horizon === "today" },
  { id: "week", label: "Esta semana", filter: "active", match: (l) => l.status === "active" && l.horizon === "week" },
  { id: "later", label: "Más adelante", filter: "active", match: (l) => l.status === "active" && l.horizon === "later" },
  { id: "someday", label: "Algún día", filter: "someday", match: (l) => l.status === "someday" },
  { id: "closed", label: "Cerrados", filter: "closed", match: (l) => l.status === "done" || l.status === "dropped" },
];

export interface LoopSection {
  id: SectionId;
  label: string;
  loops: LoopDto[];
}

const closedAt = (l: LoopDto) => l.completedAt ?? l.updatedAt;

/** Secciones con loops, en orden. Los cerrados van del más reciente al más viejo. */
export function groupLoops(loops: readonly LoopDto[], filters: LoopFilters): LoopSection[] {
  const visible = loops.filter((l) => filters.areaId === null || l.areaId === filters.areaId);
  return sectionDefs
    .filter((s) => filters.status === "all" || s.filter === filters.status)
    .map((s) => {
      const matched = visible.filter(s.match);
      if (s.id === "closed") matched.sort((a, b) => closedAt(b).localeCompare(closedAt(a)));
      return { id: s.id, label: s.label, loops: matched };
    })
    .filter((s) => s.loops.length > 0);
}

/**
 * Los cerrados se pliegan en "Todos" para que no tapen lo abierto; filtrando
 * por "Cerrados" se ven siempre.
 */
export function isFolded(section: LoopSection, filters: LoopFilters, showClosed: boolean): boolean {
  return section.id === "closed" && filters.status === "all" && !showClosed;
}

/** Orden del cursor: las secciones visibles, una detrás de otra. */
export function cursorOrder(sections: readonly LoopSection[], filters: LoopFilters, showClosed: boolean): LoopDto[] {
  return sections.filter((s) => !isFolded(s, filters, showClosed)).flatMap((s) => s.loops);
}
