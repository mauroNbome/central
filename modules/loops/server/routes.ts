import { zValidator } from "@hono/zod-validator";
import type { HubEnv } from "@hub/core";
import { Hono } from "hono";
import { z } from "zod";
import {
  captureLoopInput,
  createStepInput,
  loopHorizon,
  loopStatus,
  processDecision,
  reopenInput,
  reorderStepsInput,
} from "../contract.ts";
import { DomainError } from "./domain.ts";
import { NotFoundError, type LoopsService } from "./service.ts";

const idParam = z.object({ id: z.uuid() });
const stepParam = z.object({ id: z.uuid(), stepId: z.uuid() });

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
    .get("/areas", async (c) => c.json(await service.listAreas(c.get("userId"))))
    .get("/contexts", async (c) => c.json(await service.listContexts(c.get("userId"))))
    .get("/steps", async (c) => c.json(await service.listSteps(c.get("userId"))))
    .post("/:id/process", zValidator("param", idParam), zValidator("json", processDecision), async (c) => {
      return c.json(await service.process(c.get("userId"), c.req.valid("param").id, c.req.valid("json")));
    })
    .post("/:id/complete", zValidator("param", idParam), async (c) => {
      return c.json(await service.complete(c.get("userId"), c.req.valid("param").id));
    })
    .post("/:id/reopen", zValidator("param", idParam), zValidator("json", reopenInput), async (c) => {
      return c.json(await service.reopen(c.get("userId"), c.req.valid("param").id, c.req.valid("json").horizon));
    })
    .post(
      "/:id/reschedule",
      zValidator("param", idParam),
      zValidator("json", z.object({ horizon: loopHorizon })),
      async (c) => {
        return c.json(await service.reschedule(c.get("userId"), c.req.valid("param").id, c.req.valid("json").horizon));
      },
    )
    .post("/:id/shelve", zValidator("param", idParam), async (c) => {
      return c.json(await service.shelve(c.get("userId"), c.req.valid("param").id));
    })
    .post("/:id/drop", zValidator("param", idParam), async (c) => {
      return c.json(await service.drop(c.get("userId"), c.req.valid("param").id));
    })
    .post(
      "/:id/area",
      zValidator("param", idParam),
      zValidator("json", z.object({ areaId: z.uuid().nullable() })),
      async (c) => {
        return c.json(await service.setArea(c.get("userId"), c.req.valid("param").id, c.req.valid("json").areaId));
      },
    )
    .post("/:id/steps", zValidator("param", idParam), zValidator("json", createStepInput), async (c) => {
      const { step, created } = await service.addStep(c.get("userId"), c.req.valid("param").id, c.req.valid("json"));
      return c.json(step, created ? 201 : 200);
    })
    .post("/:id/steps/reorder", zValidator("param", idParam), zValidator("json", reorderStepsInput), async (c) => {
      const { id } = c.req.valid("param");
      return c.json(await service.reorderSteps(c.get("userId"), id, c.req.valid("json").stepIds));
    })
    .post("/:id/steps/:stepId/complete", zValidator("param", stepParam), async (c) => {
      const { id, stepId } = c.req.valid("param");
      return c.json(await service.completeStep(c.get("userId"), id, stepId));
    })
    .post("/:id/steps/:stepId/reopen", zValidator("param", stepParam), zValidator("json", reopenInput), async (c) => {
      const { id, stepId } = c.req.valid("param");
      return c.json(await service.reopenStep(c.get("userId"), id, stepId, c.req.valid("json").horizon));
    })
    .post(
      "/:id/steps/:stepId/context",
      zValidator("param", stepParam),
      zValidator("json", z.object({ contextId: z.uuid().nullable() })),
      async (c) => {
        const { id, stepId } = c.req.valid("param");
        return c.json(await service.setStepContext(c.get("userId"), id, stepId, c.req.valid("json").contextId));
      },
    )
    .delete("/:id/steps/:stepId", zValidator("param", stepParam), async (c) => {
      const { id, stepId } = c.req.valid("param");
      await service.removeStep(c.get("userId"), id, stepId);
      return c.body(null, 204);
    });
}
