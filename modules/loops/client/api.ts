import { hc, type InferResponseType } from "hono/client";
import type { CaptureLoopInput, LoopHorizon, LoopStatus, ProcessDecision } from "../contract.ts";
import type { LoopsRoutes } from "../server/index.ts";

/** Cliente RPC tipado con las rutas del propio módulo: el shell no lo conoce. */
const api = hc<LoopsRoutes>("/api/loops");

/** Un loop tal como llega por JSON: las fechas son strings ISO. */
export type LoopDto = InferResponseType<typeof api.index.$get, 200>[number];

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function fail(res: Response): Promise<never> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  throw new ApiError(res.status, typeof body?.error === "string" ? body.error : `Error ${res.status}`);
}

export async function fetchLoops(status?: LoopStatus): Promise<LoopDto[]> {
  const res = await api.index.$get({ query: status ? { status } : {} });
  if (!res.ok) return fail(res);
  return res.json();
}

export async function captureLoop(input: CaptureLoopInput): Promise<LoopDto> {
  const res = await api.index.$post({ json: input });
  if (!res.ok) return fail(res);
  return res.json();
}

export async function processLoop(id: string, decision: ProcessDecision): Promise<LoopDto> {
  const res = await api[":id"].process.$post({ param: { id }, json: decision });
  if (!res.ok) return fail(res);
  return res.json();
}

export async function completeLoop(id: string): Promise<LoopDto> {
  const res = await api[":id"].complete.$post({ param: { id } });
  if (!res.ok) return fail(res);
  return res.json();
}

export async function rescheduleLoop(id: string, horizon: LoopHorizon): Promise<LoopDto> {
  const res = await api[":id"].reschedule.$post({ param: { id }, json: { horizon } });
  if (!res.ok) return fail(res);
  return res.json();
}
