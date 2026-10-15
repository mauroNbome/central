import type { Db } from "@hub/db";
import { sql } from "drizzle-orm";
import { Hono } from "hono";

export function createApp(deps: { db: Db }) {
  return new Hono().basePath("/api").get("/health", async (c) => {
    await deps.db.execute(sql`select 1`);
    return c.json({ ok: true });
  });
}

/** Tipo de la API completa, para el cliente RPC (`hc`) del front. */
export type AppType = ReturnType<typeof createApp>;
