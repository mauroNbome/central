import { Fragment, useMemo, useState, type ReactNode } from "react";
import type { ContextDto, LoopDto, StepDto } from "./api.ts";
import { breakdownKey, horizonKeys, todayActionForKey, type HorizonKey, type TodayMode } from "./keys.ts";
import type { Notice } from "./Notice.tsx";
import { Chip, EmptyState, KeyButton, Legend, LoadState, LoopList, LoopRow } from "./parts.tsx";
import {
  useCompleteLoop,
  useCompleteStep,
  useContexts,
  useLoops,
  useReopenLoop,
  useReopenStep,
  useRescheduleLoop,
  useSteps,
} from "./queries.ts";
import { StepEditor } from "./StepEditor.tsx";
import { closedLoop, closesLoop, completedStep, matchesContext, nextStep } from "./steps.ts";
import { clockTime, startOfDay } from "./time.ts";
import { doneId, doneToday, matchesDoneContext, type DoneEntry } from "./todayView.ts";
import { useHotkeys } from "./useHotkeys.ts";
import { useLoopCursor } from "./useLoopCursor.ts";
import { useStepEditing } from "./useStepEditing.ts";
import { useStepOverlay } from "./useStepOverlay.ts";

const noContexts: ContextDto[] = [];
const noSteps: StepDto[] = [];

type Section = "today" | "week";

/** Una fila del cursor: una próxima acción, o algo de "Hecho hoy". */
type Row = { id: string; kind: "next"; loop: LoopDto } | { id: string; kind: "done"; entry: DoneEntry };

/** Copia tachada de una fila recién completada, que se desvanece en su lugar. No entra al cursor. */
interface Ghost {
  key: string;
  section: Section;
  /** La fila de arriba en su sección (null: primera). */
  afterId: string | null;
  title: string;
  detail?: string;
  meta?: string;
}

/** Lo que dura `animate-done-out` en theme.css. */
const GHOST_MS = 700;

/**
 * Próximas acciones de los loops activos de hoy y de la semana: el primer paso
 * pendiente de cada loop, o el loop mismo si no tiene pasos. `f` + número
 * filtra por el contexto del próximo paso. Abajo, "Hecho hoy": lo completado
 * desde la medianoche, para que lo hecho en el día siga a la vista.
 */
export function Today({ onNotice }: { onNotice: (n: Notice) => void }) {
  const query = useLoops("active");
  // Los cerrados no están en la lista de activos: "Hecho hoy" los saca de acá.
  const all = useLoops();
  const stepsQuery = useSteps();
  const contexts = useContexts().data ?? noContexts;
  const complete = useCompleteLoop();
  const completeStep = useCompleteStep();
  const reopenStep = useReopenStep();
  const reopenLoop = useReopenLoop();
  const reschedule = useRescheduleLoop();
  const [mode, setMode] = useState<TodayMode>("normal");
  const [contextId, setContextId] = useState<string | null>(null);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  // Entradas de "Hecho hoy" completadas en esta visita: entran con destello (las demás no).
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  // El cursor llegó a la fila actual a propósito (j/k o clic). Al completar lo
  // último pendiente, el cursor cae solo en "Hecho hoy": sin esto, una `x` de
  // más reabriría lo primero que hiciste en el día.
  const [byHand, setByHand] = useState(false);

  // Overlay: con dos `x` seguidas, la segunda tiene que ver el paso ya completo.
  const stepOverlay = useStepOverlay(stepsQuery.data);
  const steps = stepOverlay.items ?? noSteps;

  // Un solo orden para el cursor: primero hoy, después la semana, al final lo hecho.
  const rows = useMemo((): Row[] => {
    const active = (query.data ?? []).filter((l) => matchesContext(steps, l.id, contextId));
    const done = doneToday(all.data ?? [], steps, startOfDay(new Date())).filter((e) =>
      matchesDoneContext(e, contextId),
    );
    return [
      ...active.filter((l) => l.horizon === "today").map((loop) => ({ id: loop.id, kind: "next" as const, loop })),
      ...active.filter((l) => l.horizon === "week").map((loop) => ({ id: loop.id, kind: "next" as const, loop })),
      ...done.map((entry) => ({ id: entry.id, kind: "done" as const, entry })),
    ];
  }, [query.data, all.data, steps, contextId]);
  const cursor = useLoopCursor(query.data && rows);
  const { items, index, current, hide, unhide } = cursor;
  const select = (i: number) => {
    setByHand(true);
    cursor.select(i);
  };
  const move = (delta: 1 | -1) => {
    setByHand(true);
    cursor.move(delta);
  };
  const currentLoop = current?.kind === "next" ? current.loop : undefined;
  const editing = useStepEditing(currentLoop);
  const pending = items.flatMap((r) => (r.kind === "next" ? [r.loop] : []));
  const done = items.flatMap((r) => (r.kind === "done" ? [r.entry] : []));
  const today = pending.filter((l) => l.horizon === "today");
  const week = pending.filter((l) => l.horizon === "week");
  const contextById = useMemo(() => new Map(contexts.map((c) => [c.id, c])), [contexts]);
  const contextName = (step: StepDto | undefined) =>
    step?.contextId ? contextById.get(step.contextId)?.name : undefined;

  /** Deja una copia tachada de la fila donde estaba, mientras se desvanece. */
  function leave(loop: LoopDto, ghost: Pick<Ghost, "title" | "detail" | "meta">) {
    const section: Section = loop.horizon === "week" ? "week" : "today";
    const list = section === "today" ? today : week;
    const at = list.findIndex((l) => l.id === loop.id);
    const key = `${loop.id}:${Date.now()}`;
    setGhosts((g) => [...g, { ...ghost, key, section, afterId: at > 0 ? list[at - 1]!.id : null }]);
    setTimeout(() => setGhosts((g) => g.filter((x) => x.key !== key)), GHOST_MS);
  }

  const markFresh = (id: string) => setFresh((prev) => new Set(prev).add(id));

  function completeCurrent() {
    if (!current) return;
    if (current.kind === "done") return reopenEntry(current.entry);
    setByHand(false);
    const loop = current.loop;
    const step = nextStep(steps, loop.id);
    const now = new Date().toISOString();

    if (!step) {
      const closed = closedLoop(loop, now);
      leave(loop, { title: loop.title });
      hide(loop.id);
      markFresh(doneId(loop.id));
      complete.mutate(
        { loop, closed },
        { onError: (err) => onNotice({ tone: "error", text: `No se pudo completar «${loop.title}»: ${err.message}` }) },
      );
      const undo = () => {
        unhide(loop.id);
        reopenLoop.mutate(
          { loop: closed, next: loop },
          { onError: (err) => onNotice({ tone: "error", text: `No se pudo deshacer: ${err.message}` }) },
        );
        onNotice({ tone: "info", text: `«${loop.title}» vuelve a ${loop.horizon === "week" ? "la semana" : "hoy"}` });
      };
      onNotice({ tone: "info", text: `«${loop.title}» ✓ Hecho`, undo });
      return;
    }

    const next = completedStep(step, now);
    const closed = closesLoop(steps, step) ? closedLoop(loop, now) : null;
    leave(loop, { title: step.title, detail: loop.title, meta: contextName(step) });
    stepOverlay.put(next);
    if (closed) hide(loop.id);
    markFresh(doneId(step.id));
    completeStep.mutate(
      { loop, step, next, closed },
      {
        onError: (err) => {
          stepOverlay.discard(step.id);
          onNotice({ tone: "error", text: `No se pudo completar «${step.title}»: ${err.message}` });
        },
      },
    );
    const undo = () => {
      if (closed) unhide(loop.id);
      stepOverlay.put(step);
      reopenStep.mutate(
        { loop: closed ?? loop, step: next, next: step, reopened: closed ? loop : null },
        {
          onError: (err) => {
            stepOverlay.discard(step.id);
            onNotice({ tone: "error", text: `No se pudo deshacer: ${err.message}` });
          },
        },
      );
      onNotice({ tone: "info", text: `«${step.title}» vuelve a pendiente` });
    };
    onNotice({
      tone: "info",
      text: closed ? `«${loop.title}» ✓ Último paso, loop cerrado` : `«${step.title}» ✓ Hecho`,
      undo,
    });
  }

  /**
   * `x` sobre algo de "Hecho hoy": vuelve a pendiente. Si el loop estaba
   * cerrado, se reabre en Hoy (el horizonte que tenía se perdió al cerrarlo).
   */
  function reopenEntry(entry: DoneEntry) {
    const now = new Date().toISOString();
    const reopened: LoopDto | null =
      entry.loop.status === "done"
        ? { ...entry.loop, status: "active", horizon: "today", completedAt: null, updatedAt: now }
        : null;
    const fail = (err: Error) => onNotice({ tone: "error", text: `No se pudo reabrir «${entry.title}»: ${err.message}` });
    hide(entry.id);
    setByHand(false);
    if (entry.step) {
      const pendingStep: StepDto = { ...entry.step, status: "pending", completedAt: null };
      stepOverlay.put(pendingStep);
      reopenStep.mutate(
        { loop: entry.loop, step: entry.step, next: pendingStep, reopened },
        {
          onError: (err) => {
            stepOverlay.discard(pendingStep.id);
            fail(err);
          },
        },
      );
    } else if (reopened) {
      reopenLoop.mutate({ loop: entry.loop, next: reopened }, { onError: fail });
    }
    onNotice({ tone: "info", text: `«${entry.title}» vuelve a pendiente` });
  }

  function rescheduleCurrent(choice: HorizonKey) {
    setMode("normal");
    if (!currentLoop || currentLoop.horizon === choice.horizon) return;
    const loop = currentLoop;
    // "Más adelante" sale de esta vista: se oculta ya, como al completar.
    if (choice.horizon === "later") hide(loop.id);
    reschedule.mutate(
      { loop, horizon: choice.horizon },
      { onError: (err) => onNotice({ tone: "error", text: `No se pudo reprogramar «${loop.title}»: ${err.message}` }) },
    );
    onNotice({ tone: "info", text: `«${loop.title}» → ${choice.label}` });
  }

  function filterContext(context: ContextDto | null) {
    setMode("normal");
    setContextId(context?.id ?? null);
    cursor.select(0);
    setByHand(false);
  }

  useHotkeys(
    (e) => {
      if (editing.loop) return false;
      const action = todayActionForKey(e.key, mode);
      if (!action) return false;
      // Sin filas a la vista, sólo el filtro sigue teniendo sentido (para salir de él).
      if (items.length === 0 && mode === "normal" && action.type !== "startFilter") return false;
      if (e.repeat && action.type !== "move") return true;
      switch (action.type) {
        case "move":
          move(action.delta);
          break;
        case "complete":
          // Reabrir algo hecho pide haber elegido la fila (j/k o clic).
          if (current?.kind === "done" && !byHand) break;
          completeCurrent();
          break;
        case "breakdown":
          if (currentLoop) editing.open();
          break;
        case "startReschedule":
          if (currentLoop) setMode("reschedule");
          break;
        case "reschedule":
          rescheduleCurrent(action.choice);
          break;
        case "startFilter":
          if (contexts.length > 0) setMode("filter");
          break;
        case "filterContext": {
          const context = action.slot === null ? null : contexts[action.slot];
          if (context === undefined) setMode("normal");
          else filterContext(context);
          break;
        }
        case "cancel":
          setMode("normal");
          break;
      }
      return true;
    },
    // En el filtro, los números son contextos y no pestañas.
    { first: true },
  );

  const row = (loop: LoopDto, i: number) => {
    const step = nextStep(steps, loop.id);
    return (
      <Fragment key={loop.id}>
        <LoopRow
          title={step?.title ?? loop.title}
          detail={step ? loop.title : undefined}
          meta={contextName(step)}
          active={i === index}
          muted={loop.horizon === "week"}
          onSelect={() => select(i)}
        />
        {editing.loop?.id === loop.id && (
          <StepEditor
            loop={loop}
            steps={stepsQuery.data}
            contexts={contexts}
            onClose={editing.close}
            onNotice={onNotice}
          />
        )}
      </Fragment>
    );
  };

  /** Las filas de una sección, con las copias que se están desvaneciendo en su lugar. */
  function sectionRows(list: LoopDto[], section: Section, offset: number): ReactNode[] {
    const ghostsAfter = (id: string | null) =>
      ghosts
        .filter((g) => g.section === section && g.afterId === id)
        .map((g) => <LoopRow key={g.key} title={g.title} detail={g.detail} meta={g.meta} active={false} done effect="out" />);
    return [...ghostsAfter(null), ...list.flatMap((loop, i) => [row(loop, offset + i), ...ghostsAfter(loop.id)])];
  }

  const hasGhosts = (section: Section) => ghosts.some((g) => g.section === section);
  const contextLabel = contextId ? (contextById.get(contextId)?.name ?? "este contexto") : null;

  return (
    <>
      {contexts.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Contexto">
          <Chip pressed={contextId === null} onClick={() => filterContext(null)}>
            Todos
          </Chip>
          {contexts.map((c) => (
            <Chip key={c.id} pressed={contextId === c.id} onClick={() => filterContext(c)}>
              {c.name}
            </Chip>
          ))}
        </div>
      )}

      {query.data === undefined ? (
        <LoadState {...query} what="Hoy" />
      ) : (
        <div className="flex flex-col gap-6">
          {pending.length === 0 && ghosts.length === 0 ? (
            done.length > 0 ? (
              <EmptyState
                title={contextLabel ? `Nada más para hacer en ${contextLabel}.` : "Todo hecho por hoy."}
                hint="Lo que completaste está abajo."
              />
            ) : contextLabel ? (
              <EmptyState
                title={`Nada para hacer en ${contextLabel}.`}
                hint="f 0 muestra todos los contextos. Un loop sin pasos no tiene contexto: desglosalo con p."
              />
            ) : (
              <EmptyState title="Nada para hoy." hint="Procesá el inbox con h o s para traer loops acá." />
            )
          ) : (
            <>
              <section>
                <h3 className="mb-2 text-xs font-medium text-muted">Hoy</h3>
                {today.length === 0 && !hasGhosts("today") ? (
                  <p className="text-sm text-muted">Nada para hoy. Abajo está lo de la semana.</p>
                ) : (
                  <LoopList label="Para hoy">{sectionRows(today, "today", 0)}</LoopList>
                )}
              </section>
              {(week.length > 0 || hasGhosts("week")) && (
                <section>
                  <h3 className="mb-2 text-xs font-medium text-muted">Esta semana</h3>
                  <LoopList label="Esta semana">{sectionRows(week, "week", today.length)}</LoopList>
                </section>
              )}
            </>
          )}

          {done.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-medium text-success">✓ Hecho hoy · {done.length}</h3>
              <LoopList label="Hecho hoy">
                {done.map((entry, i) => (
                  <LoopRow
                    key={entry.id}
                    title={entry.title}
                    detail={entry.detail}
                    meta={[entry.step && entry.closedLoop ? "loop cerrado" : undefined, clockTime(entry.at)]
                      .filter(Boolean)
                      .join(" · ")}
                    active={pending.length + i === index}
                    done
                    effect={fresh.has(entry.id) ? "in" : undefined}
                    onSelect={() => select(pending.length + i)}
                  />
                ))}
              </LoopList>
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
        ) : mode === "filter" ? (
          <>
            <span className="text-ink">Contexto</span>
            <KeyButton k="0" label="Todos" onClick={() => filterContext(null)} />
            {contexts.map((c, i) => (
              <KeyButton key={c.id} k={String(i + 1)} label={c.name} onClick={() => filterContext(c)} />
            ))}
            <KeyButton k="Esc" label="Cancelar" onClick={() => setMode("normal")} />
          </>
        ) : (
          <>
            <KeyButton
              k="x"
              label={current?.kind === "done" ? "Reabrir" : "Hecho"}
              disabled={!current || !!editing.loop}
              onClick={completeCurrent}
            />
            <KeyButton
              k="r"
              label="Reprogramar"
              disabled={!currentLoop || !!editing.loop}
              onClick={() => setMode("reschedule")}
            />
            <KeyButton
              k={breakdownKey.key}
              label="Pasos"
              disabled={!currentLoop || !!editing.loop}
              onClick={editing.open}
            />
            <KeyButton k="f" label="Contexto" disabled={contexts.length === 0} onClick={() => setMode("filter")} />
          </>
        )}
      </Legend>
    </>
  );
}
