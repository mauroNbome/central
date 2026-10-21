import { Kbd } from "@hub/ui";
import { useEffect, useRef, useState } from "react";
import type { ContextDto, LoopDto, StepDto } from "./api.ts";
import { newLoopId } from "./ids.ts";
import { editorActionForKey, type EditorMode } from "./keys.ts";
import type { Notice } from "./Notice.tsx";
import { useCompleteStep, useReopenStep, useStepChanges } from "./queries.ts";
import { closedLoop, closesLoop, completedStep, moveStep, newStep, nextPendingIndex, stepsOf } from "./steps.ts";
import { useHotkeys } from "./useHotkeys.ts";
import { useStepOverlay } from "./useStepOverlay.ts";

type Mode = "insert" | EditorMode;

/**
 * Editor de pasos inline, debajo de la fila del loop. Abre escribiendo: Enter
 * agrega y deja el input listo para el siguiente. Esc pasa a moverse entre los
 * pasos (j/k, Shift+J/K reordena, c contexto, x completa o vuelve a pendiente,
 * d borra) y otro Esc cierra.
 */
export function StepEditor({
  loop,
  steps,
  contexts,
  onClose,
  onNotice,
}: {
  loop: LoopDto;
  steps: readonly StepDto[] | undefined;
  contexts: readonly ContextDto[];
  onClose: () => void;
  onNotice: (n: Notice) => void;
}) {
  const overlay = useStepOverlay(steps);
  const changes = useStepChanges(loop.id);
  const complete = useCompleteStep();
  const reopen = useReopenStep();
  const own = stepsOf(overlay.items ?? [], loop.id);
  const [mode, setMode] = useState<Mode>("insert");
  const [cursor, setCursor] = useState(0);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const index = Math.min(cursor, Math.max(own.length - 1, 0));
  const current = own[index];
  const contextById = new Map(contexts.map((c) => [c.id, c]));

  useEffect(() => {
    if (mode === "insert") inputRef.current?.focus();
  }, [mode]);

  const fail = (what: string, ids: string[]) => (err: Error) => {
    overlay.discard(...ids);
    onNotice({ tone: "error", text: `No se pudo ${what}: ${err.message}` });
  };

  function add() {
    const title = draft.trim();
    if (!title) return;
    const step = newStep(loop, own, { id: newLoopId(), title, contextId: null }, new Date().toISOString());
    setDraft("");
    setCursor(own.length);
    overlay.put(step);
    changes.add.mutate(step, { onError: fail(`agregar «${title}»`, [step.id]) });
  }

  function leaveInput() {
    setDraft("");
    if (own.length === 0) return onClose();
    inputRef.current?.blur();
    setMode("normal");
  }

  function reorder(delta: 1 | -1) {
    const next = moveStep(own, index, delta);
    if (!next) return;
    // moveStep devuelve el mismo objeto para los pasos que no cambiaron de lugar.
    overlay.put(...next.filter((s) => !own.includes(s)));
    setCursor(index + delta);
    changes.reorder.mutate({ before: own, next }, { onError: fail("reordenar los pasos", own.map((s) => s.id)) });
  }

  /** Vuelve a pendiente un paso hecho. `closed`: el loop, si completarlo lo había cerrado. */
  function reopenStep(done: StepDto, pending: StepDto, closed: LoopDto | null) {
    overlay.put(pending);
    reopen.mutate(
      { loop: closed ?? loop, step: done, next: pending, reopened: closed ? loop : null },
      { onError: fail(`deshacer «${pending.title}»`, [pending.id]) },
    );
    onNotice({ tone: "info", text: `«${pending.title}» vuelve a pendiente` });
  }

  function toggleCurrent() {
    if (!current) return;
    if (current.status === "done") {
      reopenStep(current, { ...current, status: "pending", completedAt: null }, null);
      return;
    }
    if (loop.status !== "active") {
      onNotice({ tone: "info", text: "Los pasos se completan cuando el loop está activo: decidí primero cuándo." });
      return;
    }
    const now = new Date().toISOString();
    const next = completedStep(current, now);
    const closed = closesLoop(own, current) ? closedLoop(loop, now) : null;
    overlay.put(next);
    setCursor(nextPendingIndex(own, index));
    complete.mutate(
      { loop, step: current, next, closed },
      { onError: fail(`completar «${current.title}»`, [current.id]) },
    );
    const step = current;
    onNotice({
      tone: "info",
      text: closed ? `«${loop.title}» ✓ Último paso, loop cerrado` : `«${step.title}» ✓ Hecho`,
      undo: () => reopenStep(next, step, closed),
    });
    if (closed) onClose();
  }

  function removeCurrent() {
    if (!current || current.status === "done") return;
    const step = current;
    overlay.remove(step.id);
    changes.remove.mutate(step, { onError: fail(`borrar «${step.title}»`, [step.id]) });
  }

  function assignContext(context: ContextDto | null) {
    setMode("normal");
    if (!current || current.status === "done") return;
    const contextId = context?.id ?? null;
    if (current.contextId === contextId) return;
    const next = { ...current, contextId };
    overlay.put(next);
    changes.setContext.mutate({ step: current, next }, { onError: fail("cambiar el contexto", [current.id]) });
  }

  useHotkeys(
    (e) => {
      // Escribiendo, las teclas son del input (shouldIgnoreHotkey ya las deja pasar).
      if (mode === "insert") return false;
      const action = editorActionForKey(e, mode);
      if (!action) return false;
      if (e.repeat && action.type !== "move" && action.type !== "reorder") return true;
      switch (action.type) {
        case "move":
          setCursor(Math.min(Math.max(index + action.delta, 0), Math.max(own.length - 1, 0)));
          break;
        case "reorder":
          reorder(action.delta);
          break;
        case "insert":
          setMode("insert");
          break;
        case "complete":
          toggleCurrent();
          break;
        case "remove":
          removeCurrent();
          break;
        case "startContext":
          if (current?.status === "pending" && contexts.length > 0) setMode("context");
          break;
        case "context": {
          const context = action.slot === null ? null : contexts[action.slot];
          if (context === undefined) setMode("normal");
          else assignContext(context);
          break;
        }
        case "close":
          onClose();
          break;
        case "cancel":
          setMode("normal");
          break;
      }
      return true;
    },
    // Las teclas del editor (x, d, c, números) le ganan a las de la vista y del shell.
    { first: true },
  );

  return (
    <li className="border-l-2 border-accent bg-canvas/60 py-2 pr-4 pl-8 text-sm">
      {own.length > 0 && (
        <ol aria-label={`Pasos de ${loop.title}`} className="mb-1">
          {own.map((step, i) => {
            const active = mode !== "insert" && i === index;
            const context = step.contextId ? contextById.get(step.contextId)?.name : undefined;
            return (
              <li
                key={step.id}
                aria-current={active}
                onClick={() => {
                  setCursor(i);
                  setMode("normal");
                }}
                className={`flex items-baseline gap-2 rounded px-2 py-1 ${active ? "bg-accent-soft" : ""}`}
              >
                <span className="w-4 shrink-0 text-right text-xs text-muted tabular-nums">{i + 1}</span>
                <span
                  className={`min-w-0 flex-1 truncate ${step.status === "done" ? "text-muted line-through" : ""}`}
                >
                  {step.title}
                </span>
                {context && <span className="shrink-0 text-xs text-muted">{context}</span>}
              </li>
            );
          })}
        </ol>
      )}

      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setMode("insert")}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          } else if (e.key === "Escape") {
            e.preventDefault();
            leaveInput();
          }
        }}
        aria-label="Nuevo paso"
        placeholder={own.length === 0 ? "Primer paso concreto…" : "Otro paso…"}
        className="w-full rounded px-2 py-1 placeholder:text-muted focus:bg-surface focus:outline-none"
      />

      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 px-2 text-xs text-muted">
        {mode === "insert" ? (
          <>
            <Hint k="Enter" label="Agregar" />
            <Hint k="Esc" label={own.length === 0 ? "Cerrar" : "Ordenar"} />
          </>
        ) : mode === "context" ? (
          <>
            {contexts.map((c, i) => (
              <Hint key={c.id} k={String(i + 1)} label={c.name} />
            ))}
            <Hint k="0" label="Sin contexto" />
          </>
        ) : (
          <>
            <Hint k="⇧J/K" label="Mover" />
            <Hint k="c" label="Contexto" />
            {loop.status === "active" && <Hint k="x" label={current?.status === "done" ? "Pendiente" : "Hecho"} />}
            <Hint k="d" label="Borrar" />
            <Hint k="i" label="Agregar" />
            <Hint k="Esc" label="Cerrar" />
          </>
        )}
      </p>
    </li>
  );
}

function Hint({ k, label }: { k: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Kbd>{k}</Kbd>
      {label}
    </span>
  );
}
