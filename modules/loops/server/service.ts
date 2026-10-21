/**
 * Casos de uso: combinan dominio (reglas), repositorio (datos) y bus (eventos).
 * Los eventos se emiten después del commit, nunca adentro de la transacción.
 */
import type { EventBus } from "@hub/core";
import type { Db } from "@hub/db";
import type {
  Area,
  CaptureLoopInput,
  Context,
  CreateStepInput,
  Loop,
  LoopHorizon,
  LoopStatus,
  ProcessDecision,
  Step,
} from "../contract.ts";
import {
  addStep,
  captureLoop,
  completeLoop,
  completeStep,
  dropLoop,
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
import * as repo from "./repository.ts";
import type { Executor } from "./repository.ts";

export class NotFoundError extends Error {
  override name = "NotFoundError";
}

export interface LoopsDeps {
  db: Db;
  bus: EventBus;
  now?: () => Date;
}

type Events = { name: string; payload: unknown }[];

async function emitAll(bus: EventBus, events: Events) {
  for (const e of events) await bus.emit(e.name as never, e.payload as never);
}

export function createLoopsService({ db, bus, now = () => new Date() }: LoopsDeps) {
  /**
   * Aplica una regla del dominio a un loop existente. FOR UPDATE: si llegan dos
   * cambios a la vez (doble tecla), el segundo espera al primero y ve el loop
   * ya cambiado, en vez de pisarlo. Los eventos salen después del commit.
   */
  async function change(userId: string, id: string, apply: (loop: Loop, now: Date) => { loop: Loop; events: Events }) {
    const result = await db.transaction(async (tx) => {
      const current = await repo.findLoop(tx, userId, id, { forUpdate: true });
      if (!current) throw new NotFoundError("Loop no encontrado");
      const next = apply(current, now());
      await repo.updateLoop(tx, next.loop);
      return next;
    });
    await emitAll(bus, result.events);
    return result.loop;
  }

  /**
   * Como `change`, para reglas que miran los pasos del loop. El lock sobre el
   * loop serializa también sus pasos: dos cambios de pasos del mismo loop nunca
   * se cruzan, así que no hace falta lockear cada paso.
   */
  async function changeSteps<R extends { loop: Loop; events: Events }>(
    userId: string,
    loopId: string,
    apply: (loop: Loop, steps: Step[], now: Date) => R,
    persist: (tx: Executor, result: R) => Promise<void>,
  ): Promise<R> {
    const result = await db.transaction(async (tx) => {
      const loop = await repo.findLoop(tx, userId, loopId, { forUpdate: true });
      if (!loop) throw new NotFoundError("Loop no encontrado");
      const next = apply(loop, await repo.listSteps(tx, userId, loopId), now());
      await repo.updateLoop(tx, next.loop);
      await persist(tx, next);
      return next;
    });
    await emitAll(bus, result.events);
    return result;
  }

  async function assertContext(userId: string, contextId: string | null) {
    if (contextId && !(await repo.findContext(db, userId, contextId))) throw new NotFoundError("Contexto no encontrado");
  }

  return {
    /** Idempotente por id: un reintento devuelve el loop existente y no re-emite eventos. */
    async capture(userId: string, input: CaptureLoopInput): Promise<{ loop: Loop; created: boolean }> {
      const { loop, events } = captureLoop(input, userId, now());
      const created = await repo.insertLoopIfAbsent(db, loop);
      if (!created) {
        const existing = await repo.findLoop(db, userId, input.id);
        // Mismo id pero de otro usuario: no se revela que existe.
        if (!existing) throw new NotFoundError("Loop no encontrado");
        return { loop: existing, created: false };
      }
      await emitAll(bus, events);
      return { loop, created: true };
    },

    list(userId: string, status?: LoopStatus): Promise<Loop[]> {
      return repo.listLoops(db, userId, status);
    },

    process(userId: string, id: string, decision: ProcessDecision): Promise<Loop> {
      return change(userId, id, (loop, at) => processLoop(loop, decision, at));
    },

    /** Cierra un loop sin pasos desde Hoy: es su propia próxima acción. */
    complete(userId: string, id: string): Promise<Loop> {
      return change(userId, id, completeLoop);
    },

    reopen(userId: string, id: string, horizon: LoopHorizon | undefined): Promise<Loop> {
      return change(userId, id, (loop, at) => reopenLoop(loop, horizon, at));
    },

    reschedule(userId: string, id: string, horizon: LoopHorizon): Promise<Loop> {
      return change(userId, id, (loop, at) => rescheduleLoop(loop, horizon, at));
    },

    shelve(userId: string, id: string): Promise<Loop> {
      return change(userId, id, shelveLoop);
    },

    drop(userId: string, id: string): Promise<Loop> {
      return change(userId, id, dropLoop);
    },

    listAreas(userId: string): Promise<Area[]> {
      return repo.listAreas(db, userId);
    },

    /**
     * La FK de area_id sólo garantiza que el área exista, no que sea del mismo
     * usuario: eso se chequea acá.
     */
    async setArea(userId: string, id: string, areaId: string | null): Promise<Loop> {
      if (areaId && !(await repo.findArea(db, userId, areaId))) throw new NotFoundError("Área no encontrada");
      return change(userId, id, (loop, at) => setLoopArea(loop, areaId, at));
    },

    listContexts(userId: string): Promise<Context[]> {
      return repo.listContexts(db, userId);
    },

    listSteps(userId: string): Promise<Step[]> {
      return repo.listSteps(db, userId);
    },

    /** Idempotente por id, como la captura: un reintento devuelve el paso que ya existe. */
    async addStep(userId: string, loopId: string, input: CreateStepInput): Promise<{ step: Step; created: boolean }> {
      await assertContext(userId, input.contextId);
      return db.transaction(async (tx) => {
        const loop = await repo.findLoop(tx, userId, loopId, { forUpdate: true });
        if (!loop) throw new NotFoundError("Loop no encontrado");
        const steps = await repo.listSteps(tx, userId, loopId);
        const existing = steps.find((s) => s.id === input.id);
        if (existing) return { step: existing, created: false };
        const next = addStep(loop, steps, input, now());
        // Si el id ya lo usa otro loop (u otro usuario), no se inserta y no se revela.
        if (!(await repo.insertStepIfAbsent(tx, next.step))) throw new NotFoundError("Paso no encontrado");
        await repo.updateLoop(tx, next.loop);
        return { step: next.step, created: true };
      });
    },

    async reorderSteps(userId: string, loopId: string, stepIds: string[]): Promise<Step[]> {
      const result = await changeSteps(
        userId,
        loopId,
        (loop, steps, at) => reorderSteps(loop, steps, stepIds, at),
        async (tx, { steps }) => {
          for (const step of steps) await repo.updateStep(tx, step);
        },
      );
      return result.steps;
    },

    /** Completa un paso; si era el último pendiente, el loop se cierra. */
    async completeStep(userId: string, loopId: string, stepId: string): Promise<{ loop: Loop; step: Step }> {
      const { loop, step } = await changeSteps(
        userId,
        loopId,
        (current, steps, at) => completeStep(current, steps, stepId, at),
        (tx, result) => repo.updateStep(tx, result.step),
      );
      return { loop, step };
    },

    /** Deshace completar un paso; si eso había cerrado el loop, lo reabre. */
    async reopenStep(
      userId: string,
      loopId: string,
      stepId: string,
      horizon: LoopHorizon | undefined,
    ): Promise<{ loop: Loop; step: Step }> {
      const { loop, step } = await changeSteps(
        userId,
        loopId,
        (current, steps, at) => reopenStep(current, steps, stepId, horizon, at),
        (tx, result) => repo.updateStep(tx, result.step),
      );
      return { loop, step };
    },

    async setStepContext(userId: string, loopId: string, stepId: string, contextId: string | null): Promise<Step> {
      await assertContext(userId, contextId);
      const result = await changeSteps(
        userId,
        loopId,
        (loop, steps, at) => setStepContext(loop, steps, stepId, contextId, at),
        (tx, { step }) => repo.updateStep(tx, step),
      );
      return result.step;
    },

    async removeStep(userId: string, loopId: string, stepId: string): Promise<void> {
      await changeSteps(
        userId,
        loopId,
        (loop, steps, at) => removeStep(loop, steps, stepId, at),
        (tx, { step }) => repo.deleteStep(tx, userId, step.id),
      );
    },
  };
}

export type LoopsService = ReturnType<typeof createLoopsService>;
