import { useEffect, useMemo, useState } from "react";

/**
 * Cursor sobre una lista de loops, con ocultamiento inmediato.
 *
 * TanStack Query saca un loop del cache recién un tick después de `mutate`:
 * sin `hide`, una segunda tecla rápida caería sobre el mismo loop (409).
 */
export function useLoopCursor<T extends { id: string }>(source: readonly T[] | undefined) {
  const [cursor, setCursor] = useState(0);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const items = useMemo(() => (source ?? []).filter((l) => !hidden.has(l.id)), [source, hidden]);

  useEffect(() => {
    // Cuando la lista ya no lo trae, deja de hacer falta ocultarlo. Si vuelve
    // por un error, tiene que verse.
    setHidden((prev) => {
      const ids = new Set(source?.map((l) => l.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [source]);

  // Al sacar un loop, el siguiente ocupa su índice: el cursor queda quieto y "baja" solo.
  const index = Math.min(cursor, Math.max(items.length - 1, 0));

  return {
    items,
    index,
    current: items[index] as T | undefined,
    select: setCursor,
    move: (delta: 1 | -1) => setCursor(Math.min(Math.max(index + delta, 0), Math.max(items.length - 1, 0))),
    hide: (id: string) => {
      setHidden((prev) => new Set(prev).add(id));
      setCursor(index);
    },
  };
}
