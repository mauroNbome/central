/**
 * Casos de uso: combinan dominio (reglas), repositorio (datos) y bus (eventos).
 * Los eventos se emiten después del commit, nunca adentro de la transacción.
 */
import type { EventBus } from "@hub/core";
import type { Db } from "@hub/db";
import type { CaptureLoopInput, Loop, LoopHorizon, LoopStatus, ProcessDecision } from "../contract.ts";
import { captureLoop, completeLoop, processLoop, rescheduleLoop } from "./domain.ts";
import * as repo from "./repository.ts";

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

    reschedule(userId: string, id: string, horizon: LoopHorizon): Promise<Loop> {
      return change(userId, id, (loop, at) => rescheduleLoop(loop, horizon, at));
    },
  };
}

export type LoopsService = ReturnType<typeof createLoopsService>;
