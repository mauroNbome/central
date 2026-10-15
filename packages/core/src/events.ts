/**
 * Bus de eventos de dominio en memoria (MVP).
 *
 * Cada módulo declara sus eventos en su contract.ts y los suma a `HubEvents`
 * por declaration merging, así el bus queda tipado sin que core conozca a nadie.
 */
export interface HubEvents {}

export type EventName = keyof HubEvents & string;
export type Handler<K extends EventName> = (payload: HubEvents[K]) => void | Promise<void>;

export interface EventBus {
  on<K extends EventName>(name: K, handler: Handler<K>): () => void;
  emit<K extends EventName>(name: K, payload: HubEvents[K]): Promise<void>;
}

export function createEventBus(
  onHandlerError: (name: string, error: unknown) => void = (name, error) =>
    console.error(`[events] handler de "${name}" falló`, error),
): EventBus {
  const handlers = new Map<string, Set<Handler<EventName>>>();

  return {
    on(name, handler) {
      const set = handlers.get(name) ?? new Set();
      set.add(handler as Handler<EventName>);
      handlers.set(name, set);
      return () => set.delete(handler as Handler<EventName>);
    },

    // Un suscriptor que falla no rompe al que emite ni a los demás suscriptores:
    // el evento describe algo que ya pasó y no se puede deshacer.
    async emit(name, payload) {
      const set = handlers.get(name);
      if (!set) return;
      await Promise.all(
        [...set].map(async (handler) => {
          try {
            await handler(payload as never);
          } catch (error) {
            onHandlerError(name, error);
          }
        }),
      );
    },
  };
}
