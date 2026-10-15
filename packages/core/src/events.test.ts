import { describe, expect, it, vi } from "vitest";
import { createEventBus } from "./events.ts";

declare module "./events.ts" {
  interface HubEvents {
    "test.happened": { id: string };
  }
}

describe("createEventBus", () => {
  it("entrega el payload a todos los suscriptores", async () => {
    const bus = createEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on("test.happened", a);
    bus.on("test.happened", b);

    await bus.emit("test.happened", { id: "1" });

    expect(a).toHaveBeenCalledWith({ id: "1" });
    expect(b).toHaveBeenCalledWith({ id: "1" });
  });

  it("un suscriptor que falla no corta a los demás", async () => {
    const onError = vi.fn();
    const bus = createEventBus(onError);
    const ok = vi.fn();
    bus.on("test.happened", () => {
      throw new Error("boom");
    });
    bus.on("test.happened", ok);

    await bus.emit("test.happened", { id: "1" });

    expect(ok).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("test.happened", expect.any(Error));
  });

  it("on() devuelve una función para desuscribirse", async () => {
    const bus = createEventBus();
    const handler = vi.fn();
    const off = bus.on("test.happened", handler);
    off();

    await bus.emit("test.happened", { id: "1" });

    expect(handler).not.toHaveBeenCalled();
  });
});
