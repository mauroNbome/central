import { Kbd } from "@hub/ui";
import { useEffect, useRef, type ReactNode } from "react";

export function LoopList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul aria-label={label} className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {children}
    </ul>
  );
}

export function LoopRow({
  title,
  meta,
  active,
  muted = false,
  onSelect,
}: {
  title: string;
  meta?: string;
  active: boolean;
  muted?: boolean;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <li
      ref={ref}
      aria-current={active}
      onClick={onSelect}
      className={`flex items-baseline gap-3 border-l-2 px-4 py-2.5 ${
        active ? "border-accent bg-accent-soft" : "border-transparent"
      }`}
    >
      <span className={`min-w-0 flex-1 truncate ${muted && !active ? "text-muted" : ""}`}>{title}</span>
      {meta && <span className="shrink-0 text-xs text-muted tabular-nums">{meta}</span>}
    </li>
  );
}

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-4 py-10 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted">{hint}</p>
    </div>
  );
}

/** Cargando o error de una lista; null cuando hay datos. */
export function LoadState({
  isPending,
  isError,
  refetch,
  what,
}: {
  isPending: boolean;
  isError: boolean;
  refetch: () => unknown;
  what: string;
}) {
  if (isPending) return <p className="text-sm text-muted">Cargando…</p>;
  if (isError) {
    return (
      <p className="text-sm text-danger">
        No se pudo cargar {what}.{" "}
        <button type="button" onClick={() => refetch()} className="underline">
          Reintentar
        </button>
      </p>
    );
  }
  return null;
}

/** Leyenda de atajos pegada abajo. */
export function Legend({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-canvas/90 py-3 text-sm backdrop-blur">
      {children}
    </div>
  );
}

export function KeyButton({
  k,
  label,
  disabled = false,
  onClick,
}: {
  k: string;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-muted transition hover:text-ink disabled:opacity-40"
    >
      <Kbd>{k}</Kbd>
      {label}
    </button>
  );
}
