/** Acceso a las tablas loops.*. Sin reglas de negocio: eso vive en domain.ts. */
import type { Db } from "@hub/db";
import { and, asc, eq } from "drizzle-orm";
import type { Loop, LoopStatus } from "../contract.ts";
import { areas, contexts, loops } from "./schema.ts";

/** Db o transacción: los dos exponen la misma API de consultas. */
export type Executor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Inserta si el id no existe. Devuelve false si ya estaba (reintento de una captura). */
export async function insertLoopIfAbsent(db: Executor, loop: Loop): Promise<boolean> {
  const inserted = await db.insert(loops).values(loop).onConflictDoNothing({ target: loops.id }).returning({ id: loops.id });
  return inserted.length > 0;
}

export async function findLoop(db: Executor, userId: string, id: string, opts: { forUpdate?: boolean } = {}) {
  const query = db
    .select()
    .from(loops)
    .where(and(eq(loops.userId, userId), eq(loops.id, id)));
  const [row] = await (opts.forUpdate ? query.for("update") : query);
  return row ?? null;
}

export async function listLoops(db: Executor, userId: string, status?: LoopStatus): Promise<Loop[]> {
  return db
    .select()
    .from(loops)
    .where(status ? and(eq(loops.userId, userId), eq(loops.status, status)) : eq(loops.userId, userId))
    .orderBy(asc(loops.createdAt));
}

export async function updateLoop(db: Executor, loop: Loop): Promise<void> {
  const { id, userId, ...fields } = loop;
  await db
    .update(loops)
    .set(fields)
    .where(and(eq(loops.userId, userId), eq(loops.id, id)));
}

const DEFAULT_AREAS = [
  { name: "SELL", color: "#e5484d" },
  { name: "BUILD", color: "#3e63dd" },
  { name: "SHARE", color: "#30a46c" },
  { name: "Hogar", color: "#f76b15" },
];

const DEFAULT_CONTEXTS = [
  { name: "Calle", icon: "map-pin" },
  { name: "Compu", icon: "laptop" },
  { name: "Casa", icon: "home" },
  { name: "Teléfono", icon: "phone" },
];

/** Crea áreas y contextos por defecto si el usuario no tiene ninguno. Idempotente. */
export async function seedDefaults(db: Db, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const hasAreas = await tx.select({ id: areas.id }).from(areas).where(eq(areas.userId, userId)).limit(1);
    if (hasAreas.length === 0) {
      await tx.insert(areas).values(DEFAULT_AREAS.map((a, position) => ({ ...a, userId, position })));
    }
    const hasContexts = await tx.select({ id: contexts.id }).from(contexts).where(eq(contexts.userId, userId)).limit(1);
    if (hasContexts.length === 0) {
      await tx.insert(contexts).values(DEFAULT_CONTEXTS.map((c, position) => ({ ...c, userId, position })));
    }
  });
}
