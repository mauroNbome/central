import { serve } from "@hono/node-server";
import { createDb } from "@hub/db";
import { createApp } from "./app.ts";

const { db, close } = createDb(process.env.DATABASE_URL!);
const port = Number(process.env.API_PORT ?? 3001);

const server = serve({ fetch: createApp({ db }).fetch, port }, () => {
  console.log(`api escuchando en http://localhost:${port}`);
});

process.on("SIGTERM", () => server.close(() => void close()));
