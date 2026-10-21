// Tests de integración: api + Postgres real (pnpm db:up && pnpm db:migrate).
// Cada test usa un user_id nuevo, así no se pisan entre sí ni con datos de dev.
import { randomUUID } from "node:crypto";
import { createEventBus } from "@hub/core";
import { createDb } from "@hub/db";
import { seedDefaults } from "@hub/loops/server";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.ts";

process.loadEnvFile("../../.env");
const { db, close } = createDb(process.env.DATABASE_URL!);
afterAll(() => close());

function setup() {
  const bus = createEventBus();
  const userId = randomUUID();
  const app = createApp({ db, bus, userId });
  const post = (path: string, body: unknown) =>
    app.request(`/api${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
  const get = (path: string) => app.request(`/api${path}`);
  return { bus, userId, app, post, get };
}

describe("POST /loops (captura)", () => {
  it("crea el loop en el inbox y emite loop.captured", async () => {
    const { post, get, bus } = setup();
    const captured = vi.fn();
    bus.on("loop.captured", captured);
    const id = randomUUID();

    const res = await post("/loops", { id, rawText: "Cambiar filtro de aire", source: "web" });

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id, status: "inbox", title: "Cambiar filtro de aire" });
    expect(captured).toHaveBeenCalledOnce();
    expect(await (await get("/loops?status=inbox")).json()).toHaveLength(1);
  });

  it("un reintento con el mismo id no duplica ni re-emite", async () => {
    const { post, get, bus } = setup();
    const captured = vi.fn();
    bus.on("loop.captured", captured);
    const body = { id: randomUUID(), rawText: "Llamar al plomero", source: "pwa" };

    await post("/loops", body);
    const retry = await post("/loops", body);

    expect(retry.status).toBe(200);
    expect(captured).toHaveBeenCalledOnce();
    expect(await (await get("/loops")).json()).toHaveLength(1);
  });

  it("rechaza texto vacío", async () => {
    const { post } = setup();
    const res = await post("/loops", { id: randomUUID(), rawText: "   ", source: "web" });
    expect(res.status).toBe(400);
  });

  it("no expone loops de otro usuario aunque se reuse el id", async () => {
    const a = setup();
    const b = setup();
    const id = randomUUID();
    await a.post("/loops", { id, rawText: "Privado", source: "web" });

    expect((await b.post("/loops", { id, rawText: "Otro", source: "web" })).status).toBe(404);
    expect(await (await b.get("/loops")).json()).toHaveLength(0);
  });
});

describe("POST /loops/:id/process", () => {
  it("activa con horizonte y saca el loop del inbox", async () => {
    const { post, get, bus } = setup();
    const processed = vi.fn();
    bus.on("loop.processed", processed);
    const id = randomUUID();
    await post("/loops", { id, rawText: "Comprar filtro", source: "web" });

    const res = await post(`/loops/${id}/process`, { kind: "activate", horizon: "today" });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "active", horizon: "today" });
    expect(processed).toHaveBeenCalledWith(expect.objectContaining({ loopId: id, status: "active" }));
    expect(await (await get("/loops?status=inbox")).json()).toHaveLength(0);
    expect(await (await get("/loops?status=active")).json()).toHaveLength(1);
  });

  it("procesar dos veces da 409", async () => {
    const { post } = setup();
    const id = randomUUID();
    await post("/loops", { id, rawText: "Algo", source: "web" });
    await post(`/loops/${id}/process`, { kind: "drop" });

    const again = await post(`/loops/${id}/process`, { kind: "someday" });
    expect(again.status).toBe(409);
  });

  it("dos decisiones simultáneas: una gana, la otra da 409", async () => {
    const { post } = setup();
    const id = randomUUID();
    await post("/loops", { id, rawText: "Doble tecla", source: "web" });

    const statuses = (
      await Promise.all([
        post(`/loops/${id}/process`, { kind: "activate", horizon: "week" }),
        post(`/loops/${id}/process`, { kind: "drop" }),
      ])
    ).map((r) => r.status);

    expect(statuses.sort()).toEqual([200, 409]);
  });

  it("loop inexistente da 404 y decisión inválida da 400", async () => {
    const { post } = setup();
    expect((await post(`/loops/${randomUUID()}/process`, { kind: "drop" })).status).toBe(404);
    expect((await post(`/loops/${randomUUID()}/process`, { kind: "activate" })).status).toBe(400);
  });
});

/** Captura un loop y lo activa con horizonte "today". */
async function activeLoop(post: ReturnType<typeof setup>["post"], rawText = "Algo activo") {
  const id = randomUUID();
  await post("/loops", { id, rawText, source: "web" });
  await post(`/loops/${id}/process`, { kind: "activate", horizon: "today" });
  return id;
}

describe("POST /loops/:id/complete", () => {
  it("cierra un loop activo y emite loop.completed", async () => {
    const { post, get, bus } = setup();
    const completed = vi.fn();
    bus.on("loop.completed", completed);
    const id = await activeLoop(post);

    const res = await post(`/loops/${id}/complete`, {});

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "done", horizon: null });
    expect(completed).toHaveBeenCalledWith(expect.objectContaining({ loopId: id }));
    expect(await (await get("/loops?status=active")).json()).toHaveLength(0);
  });

  it("completar dos veces o un loop del inbox da 409", async () => {
    const { post } = setup();
    const id = await activeLoop(post);
    await post(`/loops/${id}/complete`, {});
    expect((await post(`/loops/${id}/complete`, {})).status).toBe(409);

    const inboxId = randomUUID();
    await post("/loops", { id: inboxId, rawText: "Sin procesar", source: "web" });
    expect((await post(`/loops/${inboxId}/complete`, {})).status).toBe(409);
  });
});

describe("POST /loops/:id/reschedule", () => {
  it("cambia el horizonte de un loop activo", async () => {
    const { post } = setup();
    const id = await activeLoop(post);

    const res = await post(`/loops/${id}/reschedule`, { horizon: "week" });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "active", horizon: "week" });
  });

  it("un loop no activo da 409 y un horizonte inválido da 400", async () => {
    const { post } = setup();
    const id = randomUUID();
    await post("/loops", { id, rawText: "En el inbox", source: "web" });
    expect((await post(`/loops/${id}/reschedule`, { horizon: "today" })).status).toBe(409);
    expect((await post(`/loops/${id}/reschedule`, { horizon: "nunca" })).status).toBe(400);
  });
});

describe("POST /loops/:id/shelve y /drop", () => {
  it("sacan un loop activo de los activos", async () => {
    const { post, get } = setup();
    const shelved = await activeLoop(post);
    const dropped = await activeLoop(post);

    expect(await (await post(`/loops/${shelved}/shelve`, {})).json()).toMatchObject({ status: "someday", horizon: null });
    expect(await (await post(`/loops/${dropped}/drop`, {})).json()).toMatchObject({ status: "dropped", horizon: null });
    expect(await (await get("/loops?status=active")).json()).toHaveLength(0);
  });

  it("un loop que no está activo da 409", async () => {
    const { post } = setup();
    const id = await activeLoop(post);
    await post(`/loops/${id}/shelve`, {});
    expect((await post(`/loops/${id}/shelve`, {})).status).toBe(409);
    expect((await post(`/loops/${id}/drop`, {})).status).toBe(409);
  });
});

describe("áreas", () => {
  it("lista las áreas del usuario en orden y asigna o quita una", async () => {
    const { post, get, userId } = setup();
    await seedDefaults(db, userId);
    const areas = (await (await get("/loops/areas")).json()) as { id: string; name: string }[];
    expect(areas.map((a) => a.name)).toEqual(["SELL", "BUILD", "SHARE", "Hogar"]);
    const id = await activeLoop(post);

    const res = await post(`/loops/${id}/area`, { areaId: areas[1]!.id });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ areaId: areas[1]!.id });
    expect(await (await post(`/loops/${id}/area`, { areaId: null })).json()).toMatchObject({ areaId: null });
  });

  it("no deja usar un área de otro usuario", async () => {
    const a = setup();
    const b = setup();
    await seedDefaults(db, a.userId);
    const [foreign] = (await (await a.get("/loops/areas")).json()) as { id: string }[];
    const id = await activeLoop(b.post);

    expect((await b.post(`/loops/${id}/area`, { areaId: foreign!.id })).status).toBe(404);
  });

  it("reprogramar y asignar área no mueven la última actividad", async () => {
    const { post, get, userId } = setup();
    await seedDefaults(db, userId);
    const [area] = (await (await get("/loops/areas")).json()) as { id: string }[];
    const id = await activeLoop(post);
    const before = ((await (await get("/loops")).json()) as { lastActivityAt: string }[])[0]!.lastActivityAt;

    await post(`/loops/${id}/reschedule`, { horizon: "later" });
    const after = (await (await post(`/loops/${id}/area`, { areaId: area!.id })).json()) as {
      lastActivityAt: string;
      updatedAt: string;
    };

    expect(after.lastActivityAt).toBe(before);
    expect(after.updatedAt > before).toBe(true);
  });
});

describe("pasos", () => {
  type StepJson = { id: string; title: string; position: number; status: string; contextId: string | null };

  async function addSteps(post: ReturnType<typeof setup>["post"], loopId: string, titles: string[]) {
    const ids: string[] = [];
    for (const title of titles) {
      const id = randomUUID();
      const res = await post(`/loops/${loopId}/steps`, { id, title });
      expect(res.status).toBe(201);
      ids.push(id);
    }
    return ids;
  }

  it("desglosa un loop del inbox: agrega al final, sin duplicar reintentos, y mueve la última actividad", async () => {
    const { post, get } = setup();
    const loopId = randomUUID();
    await post("/loops", { id: loopId, rawText: "Cambiar filtro de aire", source: "web" });
    const before = ((await (await get("/loops")).json()) as { lastActivityAt: string }[])[0]!.lastActivityAt;

    const [first] = await addSteps(post, loopId, ["Medir el filtro", "Comprar filtro"]);
    const retry = await post(`/loops/${loopId}/steps`, { id: first, title: "Medir el filtro" });

    expect(retry.status).toBe(200);
    const steps = (await (await get("/loops/steps")).json()) as StepJson[];
    expect(steps.map((s) => [s.title, s.position])).toEqual([
      ["Medir el filtro", 0],
      ["Comprar filtro", 1],
    ]);
    const loop = ((await (await get("/loops")).json()) as { status: string; lastActivityAt: string }[])[0]!;
    expect(loop.status).toBe("inbox");
    expect(loop.lastActivityAt > before).toBe(true);
  });

  it("reordena con la lista completa y da 409 si la lista no coincide", async () => {
    const { post } = setup();
    const loopId = await activeLoop(post);
    const [a, b, c] = await addSteps(post, loopId, ["a", "b", "c"]);

    const res = await post(`/loops/${loopId}/steps/reorder`, { stepIds: [c, a, b] });
    expect(res.status).toBe(200);
    expect(((await res.json()) as StepJson[]).map((s) => s.title)).toEqual(["c", "a", "b"]);
    expect((await post(`/loops/${loopId}/steps/reorder`, { stepIds: [a, b] })).status).toBe(409);
  });

  it("completar un paso promueve el siguiente y el último cierra el loop", async () => {
    const { post, bus } = setup();
    const events = vi.fn();
    bus.on("step.completed", () => events("step.completed"));
    bus.on("loop.completed", () => events("loop.completed"));
    const loopId = await activeLoop(post);
    const [a, b] = await addSteps(post, loopId, ["a", "b"]);

    const first = await post(`/loops/${loopId}/steps/${a}/complete`, {});
    expect(await first.json()).toMatchObject({ loop: { status: "active" }, step: { id: a, status: "done" } });
    const last = await post(`/loops/${loopId}/steps/${b}/complete`, {});
    expect(await last.json()).toMatchObject({ loop: { status: "done" }, step: { id: b, status: "done" } });
    expect(events.mock.calls.flat()).toEqual(["step.completed", "step.completed", "loop.completed"]);
    expect((await post(`/loops/${loopId}/steps/${a}/complete`, {})).status).toBe(409);
  });

  it("deshacer el último paso reabre el loop con su horizonte", async () => {
    const { post } = setup();
    const loopId = await activeLoop(post);
    await post(`/loops/${loopId}/reschedule`, { horizon: "week" });
    const [a] = await addSteps(post, loopId, ["a"]);
    await post(`/loops/${loopId}/steps/${a}/complete`, {});

    const res = await post(`/loops/${loopId}/steps/${a}/reopen`, { horizon: "week" });
    expect(await res.json()).toMatchObject({
      loop: { status: "active", horizon: "week", completedAt: null },
      step: { id: a, status: "pending", completedAt: null },
    });
    expect((await post(`/loops/${loopId}/steps/${a}/reopen`, {})).status).toBe(409);
  });

  it("deshacer el cierre de un loop sin pasos lo vuelve a activo", async () => {
    const { post } = setup();
    const id = await activeLoop(post);
    await post(`/loops/${id}/complete`, {});

    expect(await (await post(`/loops/${id}/reopen`, {})).json()).toMatchObject({ status: "active", horizon: "today" });
    expect((await post(`/loops/${id}/reopen`, {})).status).toBe(409);
  });

  it("asigna contexto, no acepta uno ajeno y borra pasos pendientes", async () => {
    const { post, get, app, userId } = setup();
    const other = setup();
    await seedDefaults(db, userId);
    await seedDefaults(db, other.userId);
    const [ctx] = (await (await get("/loops/contexts")).json()) as { id: string; name: string }[];
    const [foreign] = (await (await other.get("/loops/contexts")).json()) as { id: string }[];
    const loopId = await activeLoop(post);
    const [a, b] = await addSteps(post, loopId, ["a", "b"]);

    const res = await post(`/loops/${loopId}/steps/${a}/context`, { contextId: ctx!.id });
    expect(await res.json()).toMatchObject({ id: a, contextId: ctx!.id });
    expect((await post(`/loops/${loopId}/steps/${a}/context`, { contextId: foreign!.id })).status).toBe(404);

    const del = await app.request(`/api/loops/${loopId}/steps/${b}`, { method: "DELETE" });
    expect(del.status).toBe(204);
    expect(((await (await get("/loops/steps")).json()) as StepJson[]).map((s) => s.id)).toEqual([a]);
  });

  it("no deja tocar pasos de un loop de otro usuario", async () => {
    const a = setup();
    const b = setup();
    const loopId = await activeLoop(a.post);
    const [stepId] = await addSteps(a.post, loopId, ["a"]);

    expect((await b.post(`/loops/${loopId}/steps`, { id: randomUUID(), title: "x" })).status).toBe(404);
    expect((await b.post(`/loops/${loopId}/steps/${stepId}/complete`, {})).status).toBe(404);
    // Reusar el id de un paso ajeno en un loop propio tampoco lo revela.
    const own = await activeLoop(b.post);
    expect((await b.post(`/loops/${own}/steps`, { id: stepId, title: "x" })).status).toBe(404);
    expect(await (await b.get("/loops/steps")).json()).toEqual([]);
  });
});

describe("seedDefaults", () => {
  it("es idempotente", async () => {
    const userId = randomUUID();
    await seedDefaults(db, userId);
    await seedDefaults(db, userId);
    const rows = await db.execute<{ n: number }>(
      sql`select (select count(*) from loops.areas where user_id = ${userId})::int
               + (select count(*) from loops.contexts where user_id = ${userId})::int as n`,
    );
    expect(rows[0]?.n).toBe(8);
  });
});
