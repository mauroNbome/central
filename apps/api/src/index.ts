import { serve } from "@hono/node-server";
import { createEventBus } from "@hub/core";
import { createDb } from "@hub/db";
import { createApp } from "./app.ts";
import { requireEnv } from "./env.ts";

const { db, close } = createDb(requireEnv("DATABASE_URL"));
const port = Number(process.env.API_PORT ?? 3001);
const app = createApp({ db, bus: createEventBus(), userId: requireEnv("HUB_USER_ID") });

const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`api escuchando en http://localhost:${port}`);
});

process.on("SIGTERM", () => server.close(() => void close()));
