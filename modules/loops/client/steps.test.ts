import { describe, expect, it } from "vitest";
import type { LoopDto, StepDto } from "./api.ts";
import {
  closesLoop,
  matchesContext,
  moveStep,
  newStep,
  nextPendingIndex,
  nextStep,
  pendingLabel,
  stepsOf,
} from "./steps.ts";

const LOOP = "loop-1";
const CALLE = "ctx-calle";

function step(id: string, position: number, overrides: Partial<StepDto> = {}): StepDto {
  return {
    id,
    userId: "u",
    loopId: LOOP,
    title: id,
    position,
    contextId: null,
    status: "pending",
    estimateMinutes: null,
    completedAt: null,
    createdAt: "2026-10-15T10:00:00.000Z",
    ...overrides,
  };
}

describe("stepsOf y nextStep", () => {
  const steps = [step("c", 2), step("a", 0, { status: "done" }), step("b", 1), step("z", 0, { loopId: "otro" })];

  it("ordena por posición y deja afuera los de otros loops", () => {
    expect(stepsOf(steps, LOOP).map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("la próxima acción es el primer pendiente", () => {
    expect(nextStep(steps, LOOP)?.id).toBe("b");
    expect(nextStep([], LOOP)).toBeUndefined();
  });

  it("cuenta los pendientes para el meta de la fila", () => {
    expect(pendingLabel(steps, LOOP)).toBe("2 pasos");
    expect(pendingLabel([step("b", 0)], LOOP)).toBe("1 paso");
    expect(pendingLabel([], LOOP)).toBeUndefined();
  });
});

describe("newStep", () => {
  it("va al final, como lo pone el servidor", () => {
    const loop = { id: LOOP, userId: "u" } as LoopDto;
    const s = newStep(loop, [step("a", 0), step("b", 3)], { id: "n", title: " Comprar ", contextId: null }, "now");
    expect(s).toMatchObject({ id: "n", title: "Comprar", position: 4, status: "pending" });
  });
});

describe("moveStep", () => {
  const own = [step("a", 0), step("b", 1), step("c", 2)];

  it("intercambia con el vecino y renumera", () => {
    const moved = moveStep(own, 0, 1)!;
    expect(moved.map((s) => [s.id, s.position])).toEqual([
      ["b", 0],
      ["a", 1],
      ["c", 2],
    ]);
    // El que no se movió es el mismo objeto: no hace falta pisarlo en el overlay.
    expect(moved[2]).toBe(own[2]);
  });

  it("en el borde no hace nada", () => {
    expect(moveStep(own, 0, -1)).toBeNull();
    expect(moveStep(own, 2, 1)).toBeNull();
  });
});

describe("closesLoop", () => {
  it("sólo si no queda otro pendiente", () => {
    expect(closesLoop([step("a", 0), step("b", 1)], step("a", 0))).toBe(false);
    expect(closesLoop([step("a", 0, { status: "done" }), step("b", 1)], step("b", 1))).toBe(true);
  });
});

describe("matchesContext", () => {
  it("filtra por el contexto del próximo paso; un loop sin pasos queda afuera", () => {
    const steps = [step("a", 0, { contextId: CALLE }), step("b", 1)];
    expect(matchesContext(steps, LOOP, null)).toBe(true);
    expect(matchesContext(steps, LOOP, CALLE)).toBe(true);
    expect(matchesContext([step("b", 0)], LOOP, CALLE)).toBe(false);
    expect(matchesContext([], LOOP, CALLE)).toBe(false);
  });
});

describe("nextPendingIndex", () => {
  const done = { status: "done" as const };

  it("pasa al próximo pendiente de abajo, salteando los hechos", () => {
    expect(nextPendingIndex([step("a", 0), step("b", 1, done), step("c", 2)], 0)).toBe(2);
  });

  it("si abajo no queda ninguno, vuelve al primero pendiente de arriba", () => {
    expect(nextPendingIndex([step("a", 0, done), step("b", 1), step("c", 2)], 2)).toBe(1);
  });

  it("sin otro pendiente se queda donde está", () => {
    expect(nextPendingIndex([step("a", 0, done), step("b", 1)], 1)).toBe(1);
  });
});
