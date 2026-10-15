import type { ServerModule } from "@hub/core";
import { createLoopsRoutes } from "./routes.ts";
import { createLoopsService, type LoopsDeps } from "./service.ts";

export { DomainError, completeLoop, completeStep, isStale, nextAction } from "./domain.ts";
export { seedDefaults } from "./repository.ts";

export function loopsServerModule(deps: LoopsDeps) {
  return {
    name: "loops",
    routes: createLoopsRoutes(createLoopsService(deps)),
  } satisfies ServerModule;
}
