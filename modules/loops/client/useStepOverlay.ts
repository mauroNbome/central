import { useEffect, useMemo, useRef, useState } from "react";
import type { StepDto } from "./api.ts";

/** Lo que muestra el overlay (null: borrado) y lo que tenía el cache cuando se puso. */
type Entry = { step: StepDto | null; base: StepDto | undefined };

/**
 * Como useLoopOverlay, para pasos. Además de cambiar, un paso puede aparecer
 * (recién agregado) o desaparecer (borrado) antes de que el cache se entere.
 * Sin esto, con Enter y J seguidos, el reordenar mandaría una lista sin el paso
 * nuevo y el servidor daría 409.
 *
 * Cada entrada se descarta apenas el cache cambia ese paso respecto de lo que
 * tenía al ponerla (`base`), sea con el update optimista o con lo que trae el
 * servidor. Esperar a ver el mismo objeto no alcanza: si el refetch llega en el
 * mismo render que el update optimista, ese objeto nunca se ve y la entrada
 * quedaría pegada para siempre, tapando lo que diga el servidor.
 */
export function useStepOverlay(source: readonly StepDto[] | undefined) {
  const [overlay, setOverlay] = useState<ReadonlyMap<string, Entry>>(() => new Map());
  const sourceRef = useRef(source);
  sourceRef.current = source;

  useEffect(() => {
    setOverlay((prev) => {
      const byId = new Map(source?.map((s) => [s.id, s]));
      const next = new Map([...prev].filter(([id, entry]) => byId.get(id) === entry.base));
      return next.size === prev.size ? prev : next;
    });
  }, [source]);

  const items = useMemo(() => {
    if (!source) return undefined;
    const known = new Set(source.map((s) => s.id));
    const changed = source.flatMap((s) => {
      const entry = overlay.get(s.id);
      if (!entry) return [s];
      return entry.step ? [entry.step] : [];
    });
    const added = [...overlay.entries()].flatMap(([id, e]) => (e.step && !known.has(id) ? [e.step] : []));
    return [...changed, ...added];
  }, [source, overlay]);

  function set(entries: [string, StepDto | null][]) {
    setOverlay((prev) => {
      const byId = new Map(sourceRef.current?.map((s) => [s.id, s]));
      const next = new Map(prev);
      // Si ya había una entrada, se mantiene su base: el cache todavía no la alcanzó.
      for (const [id, step] of entries) next.set(id, { step, base: prev.has(id) ? prev.get(id)!.base : byId.get(id) });
      return next;
    });
  }

  return {
    items,
    put: (...steps: StepDto[]) => set(steps.map((s) => [s.id, s])),
    remove: (id: string) => set([[id, null]]),
    /** Si la api falla: vuelve a mandar el cache, que ya hizo su rollback. */
    discard: (...ids: string[]) =>
      setOverlay((prev) => {
        if (!ids.some((id) => prev.has(id))) return prev;
        const next = new Map(prev);
        for (const id of ids) next.delete(id);
        return next;
      }),
  };
}
