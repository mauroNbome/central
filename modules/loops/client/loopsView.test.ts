import { describe, expect, it } from "vitest";
import type { LoopDto } from "./api.ts";
import { cursorOrder, decidedLoop, groupLoops, planDecision, type LoopFilters } from "./loopsView.ts";

const T0 = "2026-10-01T10:00:00.000Z";
const AREA = "00000000-0000-4000-8000-0000000000bb";
let seq = 0;

function makeLoop(overrides: Partial<LoopDto> = {}): LoopDto {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    userId: "",
    title: `Loop ${seq}`,
    rawText: `Loop ${seq}`,
    status: "active",
    areaId: null,
    horizon: "today",
    source: "web",
    createdAt: T0,
    processedAt: T0,
    completedAt: null,
    updatedAt: T0,
    lastActivityAt: T0,
    ...overrides,
  };
}

describe("planDecision", () => {
  it("inbox y algún día se procesan", () => {
    const decision = { kind: "activate", horizon: "week" } as const;
    expect(planDecision({ status: "inbox", horizon: null }, decision)).toEqual({ kind: "process", decision });
    expect(planDecision({ status: "someday", horizon: null }, decision)).toEqual({ kind: "process", decision });
  });

  it("un activo usa la operación de cada decisión", () => {
    const active = { status: "active", horizon: "today" } as const;
    expect(planDecision(active, { kind: "activate", horizon: "later" })).toEqual({ kind: "reschedule", horizon: "later" });
    expect(planDecision(active, { kind: "someday" })).toEqual({ kind: "shelve" });
    expect(planDecision(active, { kind: "done" })).toEqual({ kind: "complete" });
    expect(planDecision(active, { kind: "drop" })).toEqual({ kind: "drop" });
  });

  it("no llama a la api si no cambia nada o si el loop está cerrado", () => {
    expect(planDecision({ status: "active", horizon: "today" }, { kind: "activate", horizon: "today" })).toBeNull();
    expect(planDecision({ status: "someday", horizon: null }, { kind: "someday" })).toBeNull();
    expect(planDecision({ status: "done", horizon: null }, { kind: "activate", horizon: "today" })).toBeNull();
    expect(planDecision({ status: "dropped", horizon: null }, { kind: "drop" })).toBeNull();
  });
});

describe("decidedLoop", () => {
  it("refleja el estado nuevo sin tocar la última actividad", () => {
    const now = "2026-10-02T10:00:00.000Z";
    const done = decidedLoop(makeLoop(), { kind: "done" }, now);
    expect(done).toMatchObject({ status: "done", horizon: null, completedAt: now, updatedAt: now, lastActivityAt: T0 });
    expect(decidedLoop(makeLoop(), { kind: "someday" }, now)).toMatchObject({ status: "someday", horizon: null });
  });
});

describe("groupLoops", () => {
  const all: LoopFilters = { status: "all", areaId: null };

  it("ordena las secciones y omite las vacías", () => {
    const loops = [
      makeLoop({ status: "someday", horizon: null }),
      makeLoop({ horizon: "later" }),
      makeLoop({ status: "inbox", horizon: null }),
      makeLoop({ horizon: "today" }),
    ];
    expect(groupLoops(loops, all).map((s) => s.label)).toEqual(["Inbox", "Hoy", "Más adelante", "Algún día"]);
  });

  it("filtra por estado y por área", () => {
    const tagged = makeLoop({ horizon: "week", areaId: AREA });
    const loops = [tagged, makeLoop({ horizon: "week" }), makeLoop({ status: "someday", horizon: null, areaId: AREA })];
    expect(groupLoops(loops, { status: "active", areaId: null }).map((s) => s.label)).toEqual(["Esta semana"]);
    const byArea = groupLoops(loops, { status: "active", areaId: AREA });
    expect(byArea[0]!.loops).toEqual([tagged]);
  });

  it("los cerrados van del más reciente al más viejo y se pliegan en Todos", () => {
    const old = makeLoop({ status: "done", horizon: null, completedAt: "2026-10-03T00:00:00.000Z" });
    const recent = makeLoop({ status: "dropped", horizon: null, updatedAt: "2026-10-05T00:00:00.000Z" });
    const open = makeLoop();
    const sections = groupLoops([old, open, recent], all);
    expect(sections.at(-1)!.loops).toEqual([recent, old]);
    expect(cursorOrder(sections, all, false)).toEqual([open]);
    expect(cursorOrder(sections, all, true)).toEqual([open, recent, old]);
    const closedOnly: LoopFilters = { status: "closed", areaId: null };
    expect(cursorOrder(groupLoops([old, open, recent], closedOnly), closedOnly, false)).toEqual([recent, old]);
  });
});
