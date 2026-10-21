import { describe, expect, it } from "vitest";
import type { Loop, Step } from "../contract.ts";
import {
  addStep,
  captureLoop,
  completeLoop,
  completeStep,
  DomainError,
  dropLoop,
  isStale,
  nextAction,
  processLoop,
  removeStep,
  reopenLoop,
  reopenStep,
  reorderSteps,
  rescheduleLoop,
  setLoopArea,
  setStepContext,
  shelveLoop,
} from "./domain.ts";

const USER = "00000000-0000-4000-8000-000000000001";
const LOOP_ID = "00000000-0000-4000-8000-0000000000aa";
const AREA_ID = "00000000-0000-4000-8000-0000000000bb";
const STEP_ID = "00000000-0000-4000-8000-0000000000cc";
const CONTEXT_ID = "00000000-0000-4000-8000-0000000000dd";
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
    lastActivityAt: T0,
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

describe("addStep", () => {
  it("agrega al final, también desde el inbox, y cuenta como actividad", () => {
    const loop = makeLoop({ status: "inbox", horizon: null });
    const steps = [makeStep("a", 0), makeStep("b", 4, { status: "done", completedAt: T0 })];
    const result = addStep(loop, steps, { id: STEP_ID, title: "  Comprar filtro ", contextId: CONTEXT_ID }, T1);

    expect(result.step).toMatchObject({ id: STEP_ID, loopId: LOOP_ID, title: "Comprar filtro", position: 5, status: "pending" });
    expect(result.loop).toMatchObject({ status: "inbox", updatedAt: T1, lastActivityAt: T1 });
    expect(result.events).toEqual([]);
  });

  it("el primer paso va en la posición 0", () => {
    expect(addStep(makeLoop(), [], { id: STEP_ID, title: "Medir", contextId: null }, T1).step.position).toBe(0);
  });

  it("rechaza loops cerrados", () => {
    const loop = makeLoop({ status: "done", horizon: null });
    expect(() => addStep(loop, [], { id: STEP_ID, title: "x", contextId: null }, T1)).toThrow(DomainError);
  });
});

describe("reorderSteps", () => {
  const steps = [makeStep("a", 0), makeStep("b", 1, { status: "done" }), makeStep("c", 2)];

  it("renumera en el orden pedido sin contar como actividad", () => {
    const result = reorderSteps(makeLoop(), steps, ["c", "a", "b"], T1);
    expect(result.steps.map((s) => [s.id, s.position])).toEqual([
      ["c", 0],
      ["a", 1],
      ["b", 2],
    ]);
    expect(result.loop).toMatchObject({ updatedAt: T1, lastActivityAt: T0 });
  });

  it("rechaza listas que no coinciden con los pasos del loop", () => {
    expect(() => reorderSteps(makeLoop(), steps, ["a", "c"], T1)).toThrow(DomainError);
    expect(() => reorderSteps(makeLoop(), steps, ["a", "a", "c"], T1)).toThrow(DomainError);
    expect(() => reorderSteps(makeLoop(), steps, ["a", "b", "z"], T1)).toThrow(DomainError);
  });
});

describe("setStepContext y removeStep", () => {
  it("cambian un paso pendiente sin contar como actividad", () => {
    const steps = [makeStep("a", 0)];
    const withContext = setStepContext(makeLoop(), steps, "a", CONTEXT_ID, T1);
    expect(withContext.step.contextId).toBe(CONTEXT_ID);
    expect(withContext.loop.lastActivityAt).toEqual(T0);
    expect(removeStep(makeLoop(), steps, "a", T1).step.id).toBe("a");
  });

  it("no tocan pasos hechos ni loops cerrados", () => {
    const done = [makeStep("a", 0, { status: "done", completedAt: T0 })];
    expect(() => setStepContext(makeLoop(), done, "a", null, T1)).toThrow(DomainError);
    expect(() => removeStep(makeLoop(), done, "a", T1)).toThrow(DomainError);
    const dropped = makeLoop({ status: "dropped", horizon: null });
    expect(() => removeStep(dropped, [makeStep("b", 0)], "b", T1)).toThrow(DomainError);
  });
});

describe("reopenStep y reopenLoop", () => {
  it("vuelve un paso a pendiente sin tocar la última actividad", () => {
    const steps = [makeStep("a", 0, { status: "done", completedAt: T0 }), makeStep("b", 1)];
    const result = reopenStep(makeLoop(), steps, "a", undefined, T1);
    expect(result.step).toMatchObject({ status: "pending", completedAt: null });
    expect(result.loop).toMatchObject({ status: "active", horizon: "today", updatedAt: T1, lastActivityAt: T0 });
  });

  it("si completar el paso había cerrado el loop, lo reabre con el horizonte que tenía", () => {
    const closed = makeLoop({ status: "done", horizon: null, completedAt: T0 });
    const steps = [makeStep("a", 0, { status: "done", completedAt: T0 })];
    expect(reopenStep(closed, steps, "a", "week", T1).loop).toMatchObject({
      status: "active",
      horizon: "week",
      completedAt: null,
    });
    expect(reopenLoop(closed, undefined, T1).loop).toMatchObject({ status: "active", horizon: "today" });
  });

  it("rechaza pasos pendientes, loops descartados y loops que no están cerrados", () => {
    expect(() => reopenStep(makeLoop(), [makeStep("a", 0)], "a", undefined, T1)).toThrow(DomainError);
    const dropped = makeLoop({ status: "dropped", horizon: null });
    expect(() => reopenStep(dropped, [makeStep("a", 0, { status: "done" })], "a", undefined, T1)).toThrow(DomainError);
    expect(() => reopenLoop(makeLoop(), "today", T1)).toThrow(DomainError);
  });
});

describe("completeLoop", () => {
  it("cierra un loop activo y le saca el horizonte", () => {
    const { loop, events } = completeLoop(makeLoop(), T1);
    expect(loop).toMatchObject({ status: "done", horizon: null, completedAt: T1 });
    expect(events).toEqual([{ name: "loop.completed", payload: { loopId: LOOP_ID, userId: USER } }]);
  });
});

describe("completeLoop: estados", () => {
  it("no completa un loop que no está activo", () => {
    expect(() => completeLoop(makeLoop({ status: "inbox", horizon: null }), T1)).toThrow(DomainError);
    expect(() => completeLoop(makeLoop({ status: "done", horizon: null }), T1)).toThrow(DomainError);
  });
});

describe("rescheduleLoop", () => {
  it("cambia el horizonte de un loop activo, sin eventos", () => {
    const { loop, events } = rescheduleLoop(makeLoop({ horizon: "today" }), "week", T1);
    expect(loop).toMatchObject({ status: "active", horizon: "week", updatedAt: T1 });
    expect(events).toEqual([]);
  });

  it("no reprograma un loop que no está activo", () => {
    expect(() => rescheduleLoop(makeLoop({ status: "inbox", horizon: null }), "today", T1)).toThrow(DomainError);
  });

  it("no cuenta como actividad", () => {
    expect(rescheduleLoop(makeLoop(), "week", T1).loop.lastActivityAt).toEqual(T0);
  });
});

describe("shelveLoop y dropLoop", () => {
  it("sacan un loop activo y le borran el horizonte, sin eventos", () => {
    const shelved = shelveLoop(makeLoop(), T1);
    expect(shelved.loop).toMatchObject({ status: "someday", horizon: null, updatedAt: T1, lastActivityAt: T0 });
    expect(shelved.events).toEqual([]);
    expect(dropLoop(makeLoop(), T1).loop).toMatchObject({ status: "dropped", horizon: null, completedAt: null });
  });

  it("sólo aceptan loops activos (inbox y someday se procesan)", () => {
    const someday = makeLoop({ status: "someday", horizon: null });
    expect(() => shelveLoop(someday, T1)).toThrow(DomainError);
    expect(() => dropLoop(makeLoop({ status: "inbox", horizon: null }), T1)).toThrow(DomainError);
  });
});

describe("setLoopArea", () => {
  it("asigna o quita el área sin contar como actividad", () => {
    const { loop } = setLoopArea(makeLoop(), AREA_ID, T1);
    expect(loop).toMatchObject({ areaId: AREA_ID, updatedAt: T1, lastActivityAt: T0 });
    expect(setLoopArea(loop, null, T1).loop.areaId).toBeNull();
    expect(setLoopArea(makeLoop({ status: "inbox", horizon: null }), AREA_ID, T1).loop.areaId).toBe(AREA_ID);
  });

  it("no toca loops cerrados", () => {
    expect(() => setLoopArea(makeLoop({ status: "done", horizon: null }), AREA_ID, T1)).toThrow(DomainError);
    expect(() => setLoopArea(makeLoop({ status: "dropped", horizon: null }), AREA_ID, T1)).toThrow(DomainError);
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

  it("procesar, completar un paso o cerrar mueven la actividad; reprogramar no", () => {
    const processed = processLoop(makeLoop({ status: "someday", horizon: null }), { kind: "activate", horizon: "later" }, days(5));
    expect(processed.loop.lastActivityAt).toEqual(days(5));
    const postponed = rescheduleLoop(makeLoop(), "week", days(5)).loop;
    expect(isStale(postponed, [], days(7))).toBe(true);
  });

  it("el umbral es configurable y sólo aplica a activos", () => {
    expect(isStale(makeLoop(), [], days(3), 3)).toBe(true);
    expect(isStale(makeLoop({ status: "someday", horizon: null }), [], days(30))).toBe(false);
  });
});
