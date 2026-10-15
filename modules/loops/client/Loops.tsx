import { useMemo, useState, type ReactNode } from "react";
import type { AreaDto, LoopDto } from "./api.ts";
import {
  decisionKeys,
  loopsActionForKey,
  statusFilterKeys,
  type DecisionKey,
  type LoopsMode,
  type StatusFilterKey,
} from "./keys.ts";
import { cursorOrder, decidedLoop, groupLoops, isFolded, planDecision, type LoopFilters } from "./loopsView.ts";
import type { Notice } from "./Notice.tsx";
import { EmptyState, KeyButton, Legend, LoadState, LoopList, LoopRow } from "./parts.tsx";
import { useAreas, useDecideLoop, useLoops, useSetLoopArea } from "./queries.ts";
import { timeAgo } from "./time.ts";
import { useHotkeys } from "./useHotkeys.ts";
import { useLoopCursor } from "./useLoopCursor.ts";
import { useLoopOverlay } from "./useLoopOverlay.ts";

const noAreas: AreaDto[] = [];

const isClosed = (l: LoopDto) => l.status === "done" || l.status === "dropped";

/**
 * Todos los loops, por secciones de estado. Es el único lugar donde se ven los
 * de "Más adelante" y "Algún día", y desde donde se les asigna área.
 */
export function Loops({ onNotice }: { onNotice: (n: Notice) => void }) {
  const query = useLoops();
  const areas = useAreas().data ?? noAreas;
  const decide = useDecideLoop();
  const setArea = useSetLoopArea();
  const [filters, setFilters] = useState<LoopFilters>({ status: "all", areaId: null });
  const [showClosed, setShowClosed] = useState(false);
  const [mode, setMode] = useState<LoopsMode>("normal");

  const overlay = useLoopOverlay(query.data);
  const sections = useMemo(() => groupLoops(overlay.items ?? [], filters), [overlay.items, filters]);
  const ordered = useMemo(() => cursorOrder(sections, filters, showClosed), [sections, filters, showClosed]);
  const { items, index, current, select, move } = useLoopCursor(query.data && ordered);
  const areaById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);
  const editable = current !== undefined && !isClosed(current);

  /**
   * Un loop que cambia de sección no desaparece: salta a otro lado de la lista.
   * El cursor pasa al que le seguía, para revisar de corrido. Si `stay` y el
   * loop sigue a la vista (p. ej. al asignarle área), el cursor se queda en él.
   */
  function show(next: LoopDto, stay: boolean) {
    const after = cursorOrder(
      groupLoops((overlay.items ?? []).map((l) => (l.id === next.id ? next : l)), filters),
      filters,
      showClosed,
    );
    const target = stay && after.some((l) => l.id === next.id) ? next : (items[index + 1] ?? items[index - 1]);
    select(Math.max(after.findIndex((l) => l.id === target?.id), 0));
    overlay.put(next);
  }

  function decideCurrent(choice: DecisionKey) {
    if (!current) return;
    const loop = current;
    const call = planDecision(loop, choice.decision);
    if (!call) return;
    const next = decidedLoop(loop, choice.decision, new Date().toISOString());
    show(next, false);
    decide.mutate(
      { loop, next, call },
      {
        onError: (err) => {
          overlay.discard(loop.id);
          onNotice({ tone: "error", text: `No se pudo cambiar «${loop.title}»: ${err.message}` });
        },
      },
    );
    onNotice({ tone: "info", text: `«${loop.title}» → ${choice.label}` });
  }

  function assignArea(area: AreaDto | null) {
    setMode("normal");
    if (!current || isClosed(current)) return;
    const loop = current;
    const areaId = area?.id ?? null;
    if (loop.areaId === areaId) return;
    const next = { ...loop, areaId, updatedAt: new Date().toISOString() };
    show(next, true);
    setArea.mutate(
      { loop, next },
      {
        onError: (err) => {
          overlay.discard(loop.id);
          onNotice({ tone: "error", text: `No se pudo cambiar el área de «${loop.title}»: ${err.message}` });
        },
      },
    );
    onNotice({ tone: "info", text: `«${loop.title}» → ${area?.name ?? "sin área"}` });
  }

  function filterStatus(choice: StatusFilterKey) {
    setMode("normal");
    setFilters((f) => ({ ...f, status: choice.filter }));
    select(0);
  }

  function filterArea(area: AreaDto | null) {
    setMode("normal");
    setFilters((f) => ({ ...f, areaId: area?.id ?? null }));
    select(0);
  }

  const areaAt = (slot: number | null) => (slot === null ? null : areas[slot]);

  useHotkeys(
    (e) => {
      const action = loopsActionForKey(e.key, mode);
      if (!action) return false;
      if (e.repeat && action.type !== "move") return true;
      switch (action.type) {
        case "move":
          move(action.delta);
          break;
        case "decide":
          decideCurrent(action.choice);
          break;
        case "startArea":
          if (editable && areas.length > 0) setMode("area");
          break;
        case "area": {
          const area = areaAt(action.slot);
          if (area === undefined) setMode("normal");
          else assignArea(area);
          break;
        }
        case "startFilter":
          setMode("filter");
          break;
        case "filterStatus":
          filterStatus(action.choice);
          break;
        case "filterArea": {
          const area = areaAt(action.slot);
          if (area === undefined) setMode("normal");
          else filterArea(area);
          break;
        }
        case "cancel":
          setMode("normal");
          break;
      }
      return true;
    },
    // Dentro de un modo, los números son áreas y no pestañas.
    { first: true },
  );

  const meta = (loop: LoopDto) => {
    const area = loop.areaId ? areaById.get(loop.areaId)?.name : undefined;
    const closed = isClosed(loop)
      ? `${loop.status === "done" ? "hecho" : "descartado"} ${timeAgo(loop.completedAt ?? loop.updatedAt)}`
      : undefined;
    return [area, closed].filter(Boolean).join(" · ") || undefined;
  };

  let offset = 0;

  return (
    <>
      <FilterBar filters={filters} areas={areas} onStatus={filterStatus} onArea={filterArea} />

      {query.data === undefined ? (
        <LoadState {...query} what="los loops" />
      ) : sections.length === 0 ? (
        query.data.length === 0 ? (
          <EmptyState title="Todavía no hay loops." hint="Lo que captures arriba aparece acá." />
        ) : (
          <EmptyState title="Nada con este filtro." hint="f t muestra todos los estados; f 0, todas las áreas." />
        )
      ) : (
        <div className="flex flex-col gap-6">
          {sections.map((section) => {
            const folded = isFolded(section, filters, showClosed);
            const start = offset;
            if (!folded) offset += section.loops.length;
            const foldable = section.id === "closed" && filters.status === "all";
            return (
              <section key={section.id}>
                {foldable ? (
                  <button
                    type="button"
                    aria-expanded={!folded}
                    onClick={() => setShowClosed((v) => !v)}
                    className="mb-2 text-xs font-medium text-muted hover:text-ink"
                  >
                    {folded ? "▸" : "▾"} {section.label} ({section.loops.length})
                  </button>
                ) : (
                  <h3 className="mb-2 text-xs font-medium text-muted">{section.label}</h3>
                )}
                {!folded && (
                  <LoopList label={section.label}>
                    {section.loops.map((loop, i) => (
                      <LoopRow
                        key={loop.id}
                        title={loop.title}
                        meta={meta(loop)}
                        active={start + i === index}
                        muted={loop.status === "someday" || isClosed(loop)}
                        onSelect={() => select(start + i)}
                      />
                    ))}
                  </LoopList>
                )}
              </section>
            );
          })}
        </div>
      )}

      <Legend>
        {mode === "area" ? (
          <>
            <span className="text-ink">Área</span>
            {areas.map((a, i) => (
              <KeyButton key={a.id} k={String(i + 1)} label={a.name} onClick={() => assignArea(a)} />
            ))}
            <KeyButton k="0" label="Sin área" onClick={() => assignArea(null)} />
            <KeyButton k="Esc" label="Cancelar" onClick={() => setMode("normal")} />
          </>
        ) : mode === "filter" ? (
          <>
            <span className="text-ink">Filtrar</span>
            {statusFilterKeys.map((f) => (
              <KeyButton key={f.key} k={f.key} label={f.label} onClick={() => filterStatus(f)} />
            ))}
            <KeyButton k="0" label="Todas las áreas" onClick={() => filterArea(null)} />
            {areas.map((a, i) => (
              <KeyButton key={a.id} k={String(i + 1)} label={a.name} onClick={() => filterArea(a)} />
            ))}
            <KeyButton k="Esc" label="Cancelar" onClick={() => setMode("normal")} />
          </>
        ) : (
          <>
            {decisionKeys.map((d) => (
              <KeyButton key={d.key} k={d.key} label={d.label} disabled={!editable} onClick={() => decideCurrent(d)} />
            ))}
            <KeyButton k="e" label="Área" disabled={!editable || areas.length === 0} onClick={() => setMode("area")} />
            <KeyButton k="f" label="Filtrar" onClick={() => setMode("filter")} />
          </>
        )}
      </Legend>
    </>
  );
}

function FilterBar({
  filters,
  areas,
  onStatus,
  onArea,
}: {
  filters: LoopFilters;
  areas: readonly AreaDto[];
  onStatus: (choice: StatusFilterKey) => void;
  onArea: (area: AreaDto | null) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Estado">
        {statusFilterKeys.map((f) => (
          <Chip key={f.key} pressed={filters.status === f.filter} onClick={() => onStatus(f)}>
            {f.label}
          </Chip>
        ))}
      </div>
      {areas.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Área">
          <Chip pressed={filters.areaId === null} onClick={() => onArea(null)}>
            Todas
          </Chip>
          {areas.map((a) => (
            <Chip key={a.id} pressed={filters.areaId === a.id} onClick={() => onArea(a)}>
              <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: a.color }} />
              {a.name}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition ${
        pressed ? "border-accent bg-accent-soft text-ink" : "border-line text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
