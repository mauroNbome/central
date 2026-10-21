import { Fragment } from "react";
import { breakdownKey, decisionKeys, inboxActionForKey, type DecisionKey } from "./keys.ts";
import type { Notice } from "./Notice.tsx";
import { EmptyState, KeyButton, Legend, LoadState, LoopList, LoopRow } from "./parts.tsx";
import { useContexts, useLoops, useProcessLoop, useSteps } from "./queries.ts";
import { StepEditor } from "./StepEditor.tsx";
import { pendingLabel } from "./steps.ts";
import { timeAgo } from "./time.ts";
import { useHotkeys } from "./useHotkeys.ts";
import { useLoopCursor } from "./useLoopCursor.ts";
import { useStepEditing } from "./useStepEditing.ts";

export function Inbox({ onNotice }: { onNotice: (n: Notice) => void }) {
  const query = useLoops("inbox");
  const process = useProcessLoop();
  const steps = useSteps().data;
  const contexts = useContexts().data ?? [];
  const { items: loops, index, current, select, move, hide } = useLoopCursor(query.data);
  const editing = useStepEditing(current);

  function decide(choice: DecisionKey) {
    if (!current) return;
    const loop = current;
    hide(loop.id);
    process.mutate(
      { loop, decision: choice.decision },
      { onError: (err) => onNotice({ tone: "error", text: `No se pudo procesar «${loop.title}»: ${err.message}` }) },
    );
    onNotice({ tone: "info", text: `«${loop.title}» → ${choice.label}` });
  }

  useHotkeys((e) => {
    const action = inboxActionForKey(e.key);
    if (!action || loops.length === 0 || editing.loop) return false;
    if (action.type === "move") move(action.delta);
    else if (action.type === "breakdown") editing.open();
    // Mantener apretada una tecla de decisión no procesa medio inbox.
    else if (!e.repeat) decide(action.choice);
    return true;
  });

  return (
    <>
      {query.data === undefined ? (
        <LoadState {...query} what="el inbox" />
      ) : loops.length === 0 ? (
        <EmptyState title="Inbox en cero." hint="Lo que captures arriba aparece acá para procesarlo." />
      ) : (
        <LoopList label="Loops del inbox">
          {loops.map((loop, i) => (
            <Fragment key={loop.id}>
              <LoopRow
                title={loop.title}
                meta={[pendingLabel(steps ?? [], loop.id), timeAgo(loop.createdAt)].filter(Boolean).join(" · ")}
                active={i === index}
                onSelect={() => select(i)}
              />
              {editing.loop?.id === loop.id && (
                <StepEditor
                  loop={loop}
                  steps={steps}
                  contexts={contexts}
                  onClose={editing.close}
                  onNotice={onNotice}
                />
              )}
            </Fragment>
          ))}
        </LoopList>
      )}

      <Legend>
        {decisionKeys.map((d) => (
          <KeyButton key={d.key} k={d.key} label={d.label} disabled={!current || !!editing.loop} onClick={() => decide(d)} />
        ))}
        <KeyButton
          k={breakdownKey.key}
          label={breakdownKey.label}
          disabled={!current || !!editing.loop}
          onClick={editing.open}
        />
      </Legend>
    </>
  );
}
