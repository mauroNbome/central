import { describe, expect, it } from "vitest";
import type { LoopDto, StepDto } from "./api.ts";
import { doneToday, matchesDoneContext } from "./todayView.ts";

const MIDNIGHT = new Date("2026-10-16T03:00:00.000Z");
const YESTERDAY = "2026-10-15T20:00:00.000Z";
const T1 = "2026-10-16T12:00:00.000Z";
const T2 = "2026-10-16T14:00:00.000Z";

function loop(id: string, overrides: Partial<LoopDto> = {}): LoopDto {
  return {
    id,
    userId: "u",
    title: `Loop ${id}`,
    rawText: `Loop ${id}`,
    status: "active",
    areaId: null,
    horizon: "today",
    source: "web",
    createdAt: YESTERDAY,
    processedAt: YESTERDAY,
    completedAt: null,
    updatedAt: YESTERDAY,
    lastActivityAt: YESTERDAY,
    ...overrides,
  };
}

function step(id: string, loopId: string, overrides: Partial<StepDto> = {}): StepDto {
  return {
    id,
    userId: "u",
    loopId,
    title: `Paso ${id}`,
    position: 0,
    contextId: null,
    status: "pending",
    estimateMinutes: null,
    completedAt: null,
    createdAt: YESTERDAY,
    ...overrides,
  };
}

describe("doneToday", () => {
  it("junta pasos y loops cerrados desde la medianoche, del más viejo al más nuevo", () => {
    const loops = [
      loop("a"),
      loop("b", { status: "done", horizon: null, completedAt: T1 }),
      loop("viejo", { status: "done", horizon: null, completedAt: YESTERDAY }),
      loop("tirado", { status: "dropped", horizon: null, completedAt: null }),
    ];
    const steps = [
      step("s1", "a", { status: "done", completedAt: T2 }),
      step("s0", "a", { status: "done", completedAt: YESTERDAY }),
      step("s2", "a"),
    ];

    const done = doneToday(loops, steps, MIDNIGHT);
    expect(done.map((e) => [e.id, e.closedLoop])).toEqual([
      ["done:b", true],
      ["done:s1", false],
    ]);
    expect(done[1]).toMatchObject({ title: "Paso s1", detail: "Loop a" });
  });

  it("un loop cerrado con su último paso aparece una sola vez, como ese paso", () => {
    const loops = [loop("a", { status: "done", horizon: null, completedAt: T1 })];
    const steps = [step("s1", "a", { status: "done", completedAt: T1 })];

    expect(doneToday(loops, steps, MIDNIGHT).map((e) => [e.id, e.closedLoop])).toEqual([["done:s1", true]]);
  });
});

describe("matchesDoneContext", () => {
  it("con contexto, sólo los pasos de ese contexto", () => {
    const loops = [loop("a"), loop("b", { status: "done", horizon: null, completedAt: T1 })];
    const steps = [step("s1", "a", { status: "done", completedAt: T2, contextId: "calle" })];
    const done = doneToday(loops, steps, MIDNIGHT);

    expect(done.filter((e) => matchesDoneContext(e, "calle")).map((e) => e.id)).toEqual(["done:s1"]);
    expect(done.filter((e) => matchesDoneContext(e, null))).toHaveLength(2);
  });
});
