import { useEffect, useEffectEvent } from "react";
import { shouldIgnoreHotkey } from "./keys.ts";

/** Escucha atajos de una tecla en toda la ventana. El handler devuelve true si la usó. */
export function useHotkeys(handler: (e: KeyboardEvent) => boolean) {
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (shouldIgnoreHotkey(e)) return;
    if (handler(e)) e.preventDefault();
  });

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
