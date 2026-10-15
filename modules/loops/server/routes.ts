import { zValidator } from "@hono/zod-validator";
import type { HubEnv } from "@hub/core";
import { Hono } from "hono";
import { z } from "zod";
import { captureLoopInput, loopHorizon, loopStatus, processDecision } from "../contract.ts";
import { DomainError } from "./domain.ts";
import { NotFoundError, type LoopsService } from "./service.ts";

const idParam = z.object({ id: z.uuid() });

export function createLoopsRoutes(service: LoopsService) {
  return new Hono<HubEnv>()
    .onError((err, c) => {
      if (err instanceof DomainError) return c.json({ error: err.message }, 409);
      if (err instanceof NotFoundError) return c.json({ error: err.message }, 404);
      throw err;
    })
    .post("/", zValidator("json", captureLoopInput), async (c) => {
      const { loop, created } = await service.capture(c.get("userId"), c.req.valid("json"));
      return c.json(loop, created ? 201 : 200);
    })
    .get("/", zValidator("query", z.object({ status: loopStatus.optional() })), async (c) => {
      return c.json(await service.list(c.get("userId"), c.req.valid("query").status));
    })
    .post("/:id/process", zValidator("param", idParam), zValidator("json", processDecision), async (c) => {
      return c.json(await service.process(c.get("userId"), c.req.valid("param").id, c.req.valid("json")));
    })
    .post("/:id/complete", zValidator("param", idParam), async (c) => {
      return c.json(await service.complete(c.get("userId"), c.req.valid("param").id));
    })
    .post(
      "/:id/reschedule",
      zValidator("param", idParam),
      zValidator("json", z.object({ horizon: loopHorizon })),
      async (c) => {
        return c.json(await service.reschedule(c.get("userId"), c.req.valid("param").id, c.req.valid("json").horizon));
      },
    );
}
