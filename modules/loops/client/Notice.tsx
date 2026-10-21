import { Kbd } from "@hub/ui";
import { useCallback, useEffect, useState } from "react";

/**
 * Aviso de abajo. Con `undo`, ofrece deshacer hasta que lo reemplace el aviso
 * de la próxima acción (o hasta que se vaya solo): `u` nunca deshace algo que
 * ya no está a la vista.
 */
export type Notice = { tone: "info" | "error"; text: string; undo?: () => void };

export function useNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!notice) return;
    const ms = notice.tone === "error" ? 6000 : notice.undo ? 10000 : 2500;
    const t = setTimeout(() => setNotice(null), ms);
    return () => clearTimeout(t);
  }, [notice]);

  /** Deshace lo del aviso actual, si se puede. Devuelve si hubo algo para deshacer. */
  const undo = useCallback(() => {
    const run = notice?.undo;
    if (!run) return false;
    setNotice(null);
    run();
    return true;
  }, [notice]);

  return [notice, useCallback((n: Notice) => setNotice(n), []), undo] as const;
}

export function NoticeBar({ notice, onUndo }: { notice: Notice | null; onUndo: () => void }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 sm:bottom-16 flex justify-center px-4">
      {notice && (
        <p
          className={`flex max-w-xl items-center gap-3 rounded-full border px-4 py-1.5 text-sm shadow-sm ${
            notice.tone === "error" ? "border-danger/30 bg-surface text-danger" : "border-line bg-surface text-muted"
          }`}
        >
          <span className="min-w-0 truncate">{notice.text}</span>
          {notice.undo && (
            <button
              type="button"
              onClick={onUndo}
              className="pointer-events-auto inline-flex shrink-0 items-center gap-1.5 font-medium text-ink hover:text-accent"
            >
              <Kbd>u</Kbd>
              Deshacer
            </button>
          )}
        </p>
      )}
    </div>
  );
}
