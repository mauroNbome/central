import { decisionKeys, inboxActionForKey, type DecisionKey } from "./keys.ts";
import type { Notice } from "./Notice.tsx";
import { EmptyState, KeyButton, Legend, LoadState, LoopList, LoopRow } from "./parts.tsx";
import { useLoops, useProcessLoop } from "./queries.ts";
import { timeAgo } from "./time.ts";
import { useHotkeys } from "./useHotkeys.ts";
import { useLoopCursor } from "./useLoopCursor.ts";

export function Inbox({ onNotice }: { onNotice: (n: Notice) => void }) {
  const query = useLoops("inbox");
  const process = useProcessLoop();
  const { items: loops, index, current, select, move, hide } = useLoopCursor(query.data);

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
    if (!action || loops.length === 0) return false;
    if (action.type === "move") move(action.delta);
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
            <LoopRow
              key={loop.id}
              title={loop.title}
              meta={timeAgo(loop.createdAt)}
              active={i === index}
              onSelect={() => select(i)}
            />
          ))}
        </LoopList>
      )}

      <Legend>
        {decisionKeys.map((d) => (
          <KeyButton key={d.key} k={d.key} label={d.label} disabled={!current} onClick={() => decide(d)} />
        ))}
      </Legend>
    </>
  );
}
