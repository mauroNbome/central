import { describe, expect, it } from "vitest";
import type { Loop, Step } from "../contract.ts";
import { captureLoop, completeLoop, completeStep, DomainError, isStale, nextAction, processLoop } from "./domain.ts";

const USER = "00000000-0000-4000-8000-000000000001";
const LOOP_ID = "00000000-0000-4000-8000-0000000000aa";
const T0 = new Date("2026-10-01T10:00:00Z");
const T1 = new Date("2026-10-02T10:00:00Z");

function makeLoop(overrides: Partial<Loop> = {}): Loop {
  return {
    id: LOOP_ID,
    userId: USER,
    title: "Cambiar filtro de aire",
    rawText: "Cambiar filtro de aire",
    status: "active",
    areaId: null,
    horizon: "today",
    source: "web",
    createdAt: T0,
    processedAt: T0,
    completedAt: null,
    updatedAt: T0,
    ...overrides,
  };
}

function makeStep(id: string, position: number, overrides: Partial<Step> = {}): Step {
  return {
    id,
    userId: USER,
    loopId: LOOP_ID,
    title: `Paso ${id}`,
    position,
    contextId: null,
    status: "pending",
    estimateMinutes: null,
    completedAt: null,
    createdAt: T0,
    ...overrides,
  };
}

describe("captureLoop", () => {
  it("entra al inbox con la primera línea como título", () => {
    const { loop, events } = captureLoop(
      { id: LOOP_ID, rawText: "  Cambiar filtro\nel del living  ", source: "web" },
      USER,
      T0,
    );
    expect(loop).toMatchObject({ status: "inbox", horizon: null, title: "Cambiar filtro", rawText: "Cambiar filtro\nel del living" });
    expect(events).toEqual([{ name: "loop.captured", payload: { loopId: LOOP_ID, userId: USER } }]);
  });

  it("recorta títulos largos", () => {
    const { loop } = captureLoop({ id: LOOP_ID, rawText: "a".repeat(300), source: "web" }, USER, T0);
    expect(loop.title).toHaveLength(120);
    expect(loop.title.endsWith("…")).toBe(true);
  });
});

describe("processLoop", () => {
  const inbox = makeLoop({ status: "inbox", horizon: null, processedAt: null });

  it("activar le asigna horizonte", () => {
    const { loop } = processLoop(inbox, { kind: "activate", horizon: "week" }, T1);
    expect(loop).toMatchObject({ status: "active", horizon: "week", processedAt: T1, updatedAt: T1 });
  });

  it.each([
    [{ kind: "someday" } as const, "someday"],
    [{ kind: "drop" } as const, "dropped"],
  ])("%o deja el loop en %s sin horizonte", (decision, status) => {
    const { loop } = processLoop(inbox, decision, T1);
    expect(loop).toMatchObject({ status, horizon: null, completedAt: null });
  });

  it("'hecho' lo cierra con fecha", () => {
    const { loop, events } = processLoop(inbox, { kind: "done" }, T1);
    expect(loop).toMatchObject({ status: "done", completedAt: T1 });
    expect(events[0]).toMatchObject({ name: "loop.processed", payload: { status: "done" } });
  });

  it("se puede reprocesar desde someday", () => {
    const { loop } = processLoop(makeLoop({ status: "someday", horizon: null }), { kind: "activate", horizon: "today" }, T1);
    expect(loop.status).toBe("active");
  });

  it("no procesa un loop activo", () => {
    expect(() => processLoop(makeLoop(), { kind: "drop" }, T1)).toThrow(DomainError);
  });
});

describe("nextAction", () => {
  it("es el primer paso pendiente por posición", () => {
    const steps = [makeStep("c", 3), makeStep("a", 1, { status: "done" }), makeStep("b", 2)];
    expect(nextAction(makeLoop(), steps)).toMatchObject({ kind: "step", step: { id: "b" } });
  });

  it("un loop sin pasos es su propia próxima acción", () => {
    expect(nextAction(makeLoop(), [])).toMatchObject({ kind: "loop" });
  });

  it("ignora pasos de otros loops", () => {
    const ajeno = makeStep("x", 0, { loopId: "otro" });
    expect(nextAction(makeLoop(), [ajeno])).toMatchObject({ kind: "loop" });
  });

  it("un loop no activo no tiene próxima acción", () => {
    expect(nextAction(makeLoop({ status: "someday", horizon: null }), [makeStep("a", 1)])).toBeNull();
  });
});

describe("completeStep", () => {
  it("promueve el siguiente paso", () => {
    const steps = [makeStep("a", 1), makeStep("b", 2)];
    const result = completeStep(makeLoop(), steps, "a", T1);

    expect(result.step).toMatchObject({ status: "done", completedAt: T1 });
    expect(result.loop).toMatchObject({ status: "active", updatedAt: T1 });
    expect(result.events.map((e) => e.name)).toEqual(["step.completed"]);

    const after = steps.map((s) => (s.id === result.step.id ? result.step : s));
    expect(nextAction(result.loop, after)).toMatchObject({ kind: "step", step: { id: "b" } });
  });

  it("completar el último cierra el loop", () => {
    const steps = [makeStep("a", 1, { status: "done", completedAt: T0 }), makeStep("b", 2)];
    const result = completeStep(makeLoop(), steps, "b", T1);

    expect(result.loop).toMatchObject({ status: "done", horizon: null, completedAt: T1 });
    expect(result.events.map((e) => e.name)).toEqual(["step.completed", "loop.completed"]);
  });

  it("rechaza pasos ajenos, ya completos o de loops no activos", () => {
    const steps = [makeStep("a", 1, { status: "done" }), makeStep("x", 1, { loopId: "otro" })];
    expect(() => completeStep(makeLoop(), steps, "a", T1)).toThrow(DomainError);
    expect(() => completeStep(makeLoop(), steps, "x", T1)).toThrow(DomainError);
    expect(() => completeStep(makeLoop({ status: "inbox", horizon: null }), [makeStep("b", 1)], "b", T1)).toThrow(DomainError);
  });
});

describe("completeLoop", () => {
  it("cierra un loop activo y le saca el horizonte", () => {
    const { loop, events } = completeLoop(makeLoop(), T1);
    expect(loop).toMatchObject({ status: "done", horizon: null, completedAt: T1 });
    expect(events).toEqual([{ name: "loop.completed", payload: { loopId: LOOP_ID, userId: USER } }]);
  });
});

describe("isStale", () => {
  const days = (n: number) => new Date(T0.getTime() + n * 24 * 60 * 60 * 1000);

  it("activo sin actividad en 7 días está estancado", () => {
    expect(isStale(makeLoop(), [], days(7))).toBe(true);
    expect(isStale(makeLoop(), [], days(6))).toBe(false);
  });

  it("un paso completado reciente cuenta como actividad", () => {
    const steps = [makeStep("a", 1, { status: "done", completedAt: days(3) })];
    expect(isStale(makeLoop(), steps, days(8))).toBe(false);
  });

  it("el umbral es configurable y sólo aplica a activos", () => {
    expect(isStale(makeLoop(), [], days(3), 3)).toBe(true);
    expect(isStale(makeLoop({ status: "someday", horizon: null }), [], days(30))).toBe(false);
  });
});
