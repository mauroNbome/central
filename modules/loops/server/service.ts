/**
 * Casos de uso: combinan dominio (reglas), repositorio (datos) y bus (eventos).
 * Los eventos se emiten después del commit, nunca adentro de la transacción.
 */
import type { EventBus } from "@hub/core";
import type { Db } from "@hub/db";
import type { CaptureLoopInput, Loop, LoopStatus, ProcessDecision } from "../contract.ts";
import { captureLoop, processLoop } from "./domain.ts";
import * as repo from "./repository.ts";

export class NotFoundError extends Error {
  override name = "NotFoundError";
}

export interface LoopsDeps {
  db: Db;
  bus: EventBus;
  now?: () => Date;
}

async function emitAll(bus: EventBus, events: { name: string; payload: unknown }[]) {
  for (const e of events) await bus.emit(e.name as never, e.payload as never);
}

export function createLoopsService({ db, bus, now = () => new Date() }: LoopsDeps) {
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

    async process(userId: string, id: string, decision: ProcessDecision): Promise<Loop> {
      // FOR UPDATE: si llegan dos decisiones a la vez (doble tecla), la segunda
      // espera a la primera y ve el loop ya procesado, en vez de pisarlo.
      const result = await db.transaction(async (tx) => {
        const current = await repo.findLoop(tx, userId, id, { forUpdate: true });
        if (!current) throw new NotFoundError("Loop no encontrado");
        const next = processLoop(current, decision, now());
        await repo.updateLoop(tx, next.loop);
        return next;
      });
      await emitAll(bus, result.events);
      return result.loop;
    },
  };
}

export type LoopsService = ReturnType<typeof createLoopsService>;
