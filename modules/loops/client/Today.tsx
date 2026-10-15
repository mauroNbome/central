import { useMemo, useState } from "react";
import { horizonKeys, todayActionForKey, type HorizonKey, type TodayMode } from "./keys.ts";
import type { Notice } from "./Notice.tsx";
import { EmptyState, KeyButton, Legend, LoadState, LoopList, LoopRow } from "./parts.tsx";
import { useCompleteLoop, useLoops, useRescheduleLoop } from "./queries.ts";
import { useHotkeys } from "./useHotkeys.ts";
import { useLoopCursor } from "./useLoopCursor.ts";

/**
 * Próximas acciones de los loops activos de hoy y de la semana. Sin pasos
 * todavía, cada loop es su propia próxima acción; cuando haya pasos, la fila
 * va a mostrar el primero pendiente.
 */
export function Today({ onNotice }: { onNotice: (n: Notice) => void }) {
  const query = useLoops("active");
  const complete = useCompleteLoop();
  const reschedule = useRescheduleLoop();
  const [mode, setMode] = useState<TodayMode>("normal");

  // Un solo orden para el cursor: primero hoy, después la semana.
  const ordered = useMemo(() => {
    const active = query.data ?? [];
    return [...active.filter((l) => l.horizon === "today"), ...active.filter((l) => l.horizon === "week")];
  }, [query.data]);
  const { items, index, current, select, move, hide } = useLoopCursor(query.data && ordered);
  const today = items.filter((l) => l.horizon === "today");
  const week = items.filter((l) => l.horizon === "week");

  function completeCurrent() {
    if (!current) return;
    const loop = current;
    hide(loop.id);
    complete.mutate(loop, {
      onError: (err) => onNotice({ tone: "error", text: `No se pudo completar «${loop.title}»: ${err.message}` }),
    });
    onNotice({ tone: "info", text: `«${loop.title}» ✓ Hecho` });
  }

  function rescheduleCurrent(choice: HorizonKey) {
    setMode("normal");
    if (!current || current.horizon === choice.horizon) return;
    const loop = current;
    // "Más adelante" sale de esta vista: se oculta ya, como al completar.
    if (choice.horizon === "later") hide(loop.id);
    reschedule.mutate(
      { loop, horizon: choice.horizon },
      { onError: (err) => onNotice({ tone: "error", text: `No se pudo reprogramar «${loop.title}»: ${err.message}` }) },
    );
    onNotice({ tone: "info", text: `«${loop.title}» → ${choice.label}` });
  }

  useHotkeys((e) => {
    const action = todayActionForKey(e.key, mode);
    if (!action || (items.length === 0 && mode === "normal")) return false;
    if (e.repeat && action.type !== "move") return true;
    switch (action.type) {
      case "move":
        move(action.delta);
        break;
      case "complete":
        completeCurrent();
        break;
      case "startReschedule":
        if (current) setMode("reschedule");
        break;
      case "reschedule":
        rescheduleCurrent(action.choice);
        break;
      case "cancel":
        setMode("normal");
        break;
    }
    return true;
  });

  const row = (i: number) => {
    const loop = items[i]!;
    return (
      <LoopRow
        key={loop.id}
        title={loop.title}
        active={i === index}
        muted={loop.horizon === "week"}
        onSelect={() => select(i)}
      />
    );
  };

  return (
    <>
      {query.data === undefined ? (
        <LoadState {...query} what="Hoy" />
      ) : items.length === 0 ? (
        <EmptyState title="Nada para hoy." hint="Procesá el inbox con h o s para traer loops acá." />
      ) : (
        <div className="flex flex-col gap-6">
          <section>
            <h3 className="mb-2 text-xs font-medium text-muted">Hoy</h3>
            {today.length === 0 ? (
              <p className="text-sm text-muted">Nada para hoy. Abajo está lo de la semana.</p>
            ) : (
              <LoopList label="Para hoy">{today.map((_, i) => row(i))}</LoopList>
            )}
          </section>
          {week.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-medium text-muted">Esta semana</h3>
              <LoopList label="Esta semana">{week.map((_, i) => row(today.length + i))}</LoopList>
            </section>
          )}
        </div>
      )}

      <Legend>
        {mode === "reschedule" ? (
          <>
            <span className="text-ink">Reprogramar a</span>
            {horizonKeys.map((h) => (
              <KeyButton key={h.key} k={h.key} label={h.label} onClick={() => rescheduleCurrent(h)} />
            ))}
            <KeyButton k="Esc" label="Cancelar" onClick={() => setMode("normal")} />
          </>
        ) : (
          <>
            <KeyButton k="x" label="Hecho" disabled={!current} onClick={completeCurrent} />
            <KeyButton k="r" label="Reprogramar" disabled={!current} onClick={() => setMode("reschedule")} />
          </>
        )}
      </Legend>
    </>
  );
}
