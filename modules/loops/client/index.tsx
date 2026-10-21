import { Kbd } from "@hub/ui";
import { useRef, useState } from "react";
import { CaptureInput } from "./CaptureInput.tsx";
import { Inbox } from "./Inbox.tsx";
import { Loops } from "./Loops.tsx";
import { isCaptureKey, isUndoKey, tabForKey, tabKeys, type Tab } from "./keys.ts";
import { NoticeBar, useNotice } from "./Notice.tsx";
import { useLoops } from "./queries.ts";
import { Today } from "./Today.tsx";
import { useHotkeys } from "./useHotkeys.ts";

export function LoopsHome() {
  const captureRef = useRef<HTMLInputElement>(null);
  const [notice, showNotice, undo] = useNotice();
  const [tab, setTab] = useState<Tab>("inbox");

  // Las dos listas se cargan siempre: alimentan los contadores y cambiar de pestaña es instantáneo.
  const inbox = useLoops("inbox");
  const active = useLoops("active");
  const counts: Record<Tab, number | undefined> = {
    inbox: inbox.data?.length,
    today: active.data?.filter((l) => l.horizon === "today").length,
    loops: undefined,
  };

  useHotkeys((e) => {
    if (isUndoKey(e.key)) return !e.repeat && undo();
    if (isCaptureKey(e.key)) {
      captureRef.current?.focus();
      return true;
    }
    const next = tabForKey(e.key);
    if (!next) return false;
    setTab(next);
    return true;
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 pt-12">
      <CaptureInput inputRef={captureRef} onNotice={showNotice} />

      <nav className="mt-10 flex items-center gap-1 border-b border-line">
        {tabKeys.map((t) => (
          <button
            key={t.tab}
            type="button"
            aria-current={tab === t.tab ? "page" : undefined}
            onClick={() => setTab(t.tab)}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition ${
              tab === t.tab ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <Kbd>{t.key}</Kbd>
            {t.label}
            <span className="tabular-nums text-muted">{counts[t.tab] ?? ""}</span>
          </button>
        ))}
        <span className="ml-auto hidden items-center gap-1 text-xs text-muted sm:inline-flex">
          <Kbd>j</Kbd>
          <Kbd>k</Kbd> moverse
        </span>
      </nav>

      <section className="mt-4 flex flex-1 flex-col">
        {tab === "inbox" && <Inbox onNotice={showNotice} />}
        {tab === "today" && <Today onNotice={showNotice} />}
        {tab === "loops" && <Loops onNotice={showNotice} />}
      </section>

      <NoticeBar notice={notice} onUndo={undo} />
    </main>
  );
}
