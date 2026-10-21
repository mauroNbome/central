/**
 * API pública del módulo Loops. Otros módulos y las apps importan sólo esto
 * (o @hub/loops/server|client); el resto del módulo es privado.
 */
import { z } from "zod";

export const loopStatus = z.enum(["inbox", "active", "someday", "done", "dropped"]);
export const loopHorizon = z.enum(["today", "week", "later"]);
export const loopSource = z.enum(["web", "pwa", "voice", "bot", "mcp"]);
export const stepStatus = z.enum(["pending", "done"]);

export type LoopStatus = z.infer<typeof loopStatus>;
export type LoopHorizon = z.infer<typeof loopHorizon>;
export type LoopSource = z.infer<typeof loopSource>;
export type StepStatus = z.infer<typeof stepStatus>;

export const loop = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  title: z.string(),
  rawText: z.string(),
  status: loopStatus,
  areaId: z.uuid().nullable(),
  horizon: loopHorizon.nullable(),
  source: loopSource,
  createdAt: z.date(),
  processedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  /** Cualquier cambio. Lo usan el cache y la sincronización. */
  updatedAt: z.date(),
  /** Avance real (procesar, completar pasos, editar). Reprogramar no cuenta: define "estancado". */
  lastActivityAt: z.date(),
});
export type Loop = z.infer<typeof loop>;

export const area = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  name: z.string(),
  color: z.string(),
  position: z.number().int(),
});
export type Area = z.infer<typeof area>;

export const context = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  name: z.string(),
  icon: z.string(),
  position: z.number().int(),
});
export type Context = z.infer<typeof context>;

export const step = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  loopId: z.uuid(),
  title: z.string(),
  position: z.number().int(),
  contextId: z.uuid().nullable(),
  status: stepStatus,
  estimateMinutes: z.number().int().positive().nullable(),
  completedAt: z.date().nullable(),
  createdAt: z.date(),
});
export type Step = z.infer<typeof step>;

/** Decisión al procesar un loop del inbox. Una tecla, una decisión. */
export const processDecision = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("activate"), horizon: loopHorizon }),
  z.object({ kind: z.literal("someday") }),
  z.object({ kind: z.literal("done") }),
  z.object({ kind: z.literal("drop") }),
]);
export type ProcessDecision = z.infer<typeof processDecision>;

/**
 * El id lo genera el cliente: una captura offline que se reintenta llega con
 * el mismo id y el servidor la descarta en vez de duplicarla.
 */
export const captureLoopInput = z.object({
  id: z.uuid(),
  rawText: z.string().trim().min(1),
  source: loopSource,
});
export type CaptureLoopInput = z.infer<typeof captureLoopInput>;

/**
 * Paso nuevo, al final del loop. Como en la captura, el id es del cliente: un
 * reintento no duplica el paso.
 */
export const createStepInput = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1),
  contextId: z.uuid().nullable().default(null),
});
export type CreateStepInput = z.infer<typeof createStepInput>;

/** Orden nuevo: todos los pasos del loop (pendientes y hechos), cada uno una vez. */
export const reorderStepsInput = z.object({
  stepIds: z.array(z.uuid()).min(1),
});
export type ReorderStepsInput = z.infer<typeof reorderStepsInput>;

/**
 * Deshacer un "hecho". Si al completar se cerró el loop, vuelve a activo con
 * este horizonte (al cerrar se pierde); sin horizonte, vuelve a Hoy.
 */
export const reopenInput = z.object({
  horizon: loopHorizon.optional(),
});
export type ReopenInput = z.infer<typeof reopenInput>;

/** Próxima acción: el primer paso pendiente, o el loop mismo si no tiene pasos. */
export type NextAction =
  | { kind: "step"; loop: Loop; step: Step }
  | { kind: "loop"; loop: Loop };

declare module "@hub/core" {
  interface HubEvents {
    "loop.captured": { loopId: string; userId: string };
    "loop.processed": { loopId: string; userId: string; status: LoopStatus };
    "step.completed": { loopId: string; stepId: string; userId: string };
    "loop.completed": { loopId: string; userId: string };
  }
}
