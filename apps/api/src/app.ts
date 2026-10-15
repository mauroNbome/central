import type { EventBus, HubEnv } from "@hub/core";
import type { Db } from "@hub/db";
import { loopsServerModule } from "@hub/loops/server";
import { sql } from "drizzle-orm";
import { Hono } from "hono";

export interface AppDeps {
  db: Db;
  bus: EventBus;
  /** Usuario único mientras no haya auth. Cuando la haya, el middleware lo saca de la sesión. */
  userId: string;
}

export function createApp(deps: AppDeps) {
  const loops = loopsServerModule(deps);

  return new Hono<HubEnv>()
    .basePath("/api")
    .use(async (c, next) => {
      c.set("userId", deps.userId);
      await next();
    })
    .get("/health", async (c) => {
      await deps.db.execute(sql`select 1`);
      return c.json({ ok: true });
    })
    .route(`/${loops.name}`, loops.routes);
}

/** Tipo de la API completa, para el cliente RPC (`hc`) del front. */
export type AppType = ReturnType<typeof createApp>;
