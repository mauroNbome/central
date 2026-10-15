import { useCallback, useEffect, useState } from "react";

export type Notice = { tone: "info" | "error"; text: string };

export function useNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), notice.tone === "error" ? 6000 : 2500);
    return () => clearTimeout(t);
  }, [notice]);

  return [notice, useCallback((n: Notice) => setNotice(n), [])] as const;
}

export function NoticeBar({ notice }: { notice: Notice | null }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 sm:bottom-16 flex justify-center px-4">
      {notice && (
        <p
          className={`max-w-xl truncate rounded-full border px-4 py-1.5 text-sm shadow-sm ${
            notice.tone === "error" ? "border-danger/30 bg-surface text-danger" : "border-line bg-surface text-muted"
          }`}
        >
          {notice.text}
        </p>
      )}
    </div>
  );
}
