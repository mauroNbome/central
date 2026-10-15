import { Kbd } from "@hub/ui";
import { useState, type RefObject } from "react";
import { newLoopId } from "./ids.ts";
import type { Notice } from "./Notice.tsx";
import { useCaptureLoop } from "./queries.ts";

export function CaptureInput({
  inputRef,
  onNotice,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onNotice: (n: Notice) => void;
}) {
  const [text, setText] = useState("");
  const capture = useCaptureLoop();

  function submit() {
    const rawText = text.trim();
    if (!rawText) return;
    setText("");
    capture.mutate(
      { id: newLoopId(), rawText, source: "web" },
      {
        // Que no se pierda lo escrito: vuelve al campo si está vacío.
        onError: () => {
          setText((t) => t || rawText);
          onNotice({ tone: "error", text: `No se pudo guardar «${rawText}»` });
        },
      },
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") e.currentTarget.blur();
        }}
        autoFocus
        aria-label="Capturar un loop"
        placeholder="¿Qué tenés en la cabeza?"
        className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-lg shadow-sm outline-none transition placeholder:text-muted focus:border-accent focus:ring-4 focus:ring-accent/15"
      />
      <p className="mt-2 flex gap-3 text-xs text-muted">
        <span>
          <Kbd>Enter</Kbd> guarda
        </span>
        <span>
          <Kbd>Esc</Kbd> sale
        </span>
        <span>
          <Kbd>c</Kbd> vuelve acá
        </span>
      </p>
    </form>
  );
}
