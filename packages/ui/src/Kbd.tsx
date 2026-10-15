import type { ReactNode } from "react";

/** Tecla de un atajo, para leyendas y hints. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-5 items-center justify-center rounded border border-line bg-surface px-1 font-mono text-xs leading-5 text-muted">
      {children}
    </kbd>
  );
}
