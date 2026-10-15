import { useEffect, useMemo, useState } from "react";

/**
 * Versiones locales de loops recién cambiados, encima de la lista del cache.
 *
 * Es el mismo problema que resuelve `hide` en useLoopCursor, pero para una
 * vista donde el loop no desaparece, sino que cambia de sección: el cache lo
 * actualiza un tick después de `mutate` y una segunda tecla rápida vería el
 * estado viejo. `put` lo cambia en el mismo evento.
 */
export function useLoopOverlay<T extends { id: string }>(source: readonly T[] | undefined) {
  const [overlay, setOverlay] = useState<ReadonlyMap<string, T>>(() => new Map());

  useEffect(() => {
    // El update optimista pone en el cache el mismo objeto: cuando llega, ya no hace falta.
    setOverlay((prev) => {
      const byId = new Map(source?.map((l) => [l.id, l]));
      const next = new Map([...prev].filter(([id, loop]) => byId.has(id) && byId.get(id) !== loop));
      return next.size === prev.size ? prev : next;
    });
  }, [source]);

  const items = useMemo(() => source?.map((l) => overlay.get(l.id) ?? l), [source, overlay]);

  return {
    items,
    put: (loop: T) => setOverlay((prev) => new Map(prev).set(loop.id, loop)),
    /** Si la api falla: vuelve a mandar el cache, que ya hizo su rollback. */
    discard: (id: string) =>
      setOverlay((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      }),
  };
}
