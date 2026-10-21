import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Versiones locales de loops recién cambiados, encima de la lista del cache.
 *
 * Es el mismo problema que resuelve `hide` en useLoopCursor, pero para una
 * vista donde el loop no desaparece, sino que cambia de sección: el cache lo
 * actualiza un tick después de `mutate` y una segunda tecla rápida vería el
 * estado viejo. `put` lo cambia en el mismo evento.
 *
 * Cada versión se descarta apenas el cache cambia ese loop respecto de lo que
 * tenía al ponerla (ver useStepOverlay: esperar el mismo objeto puede dejarla
 * pegada si el refetch llega en el mismo render que el update optimista).
 */
export function useLoopOverlay<T extends { id: string }>(source: readonly T[] | undefined) {
  const [overlay, setOverlay] = useState<ReadonlyMap<string, { item: T; base: T | undefined }>>(() => new Map());
  const sourceRef = useRef(source);
  sourceRef.current = source;

  useEffect(() => {
    setOverlay((prev) => {
      const byId = new Map(source?.map((l) => [l.id, l]));
      const next = new Map([...prev].filter(([id, entry]) => byId.has(id) && byId.get(id) === entry.base));
      return next.size === prev.size ? prev : next;
    });
  }, [source]);

  const items = useMemo(() => source?.map((l) => overlay.get(l.id)?.item ?? l), [source, overlay]);

  return {
    items,
    put: (loop: T) =>
      setOverlay((prev) => {
        const base = prev.has(loop.id) ? prev.get(loop.id)!.base : sourceRef.current?.find((l) => l.id === loop.id);
        return new Map(prev).set(loop.id, { item: loop, base });
      }),
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
