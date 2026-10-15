import type { ServerModule } from "@hub/core";
import { createLoopsRoutes } from "./routes.ts";
import { createLoopsService, type LoopsDeps } from "./service.ts";

export { DomainError, completeLoop, completeStep, isStale, nextAction } from "./domain.ts";
export { seedDefaults } from "./repository.ts";

/** Tipo de las rutas del módulo, para el cliente RPC (`hc`) de `@hub/loops/client`. */
export type LoopsRoutes = ReturnType<typeof createLoopsRoutes>;

export function loopsServerModule(deps: LoopsDeps) {
  return {
    name: "loops",
    routes: createLoopsRoutes(createLoopsService(deps)),
  } satisfies ServerModule;
}
