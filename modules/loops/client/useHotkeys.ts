import { useEffect, useEffectEvent } from "react";
import { shouldIgnoreHotkey } from "./keys.ts";

/**
 * Escucha atajos de una tecla en toda la ventana. El handler devuelve true si
 * la usó, y entonces ningún otro handler la ve.
 *
 * `first` lo atiende antes que los demás (fase de captura). Hace falta en una
 * vista con modos: dentro de "asignar área", el `1` es un área y no la pestaña
 * 1. El orden de registro no sirve, porque una vista se monta después que el shell.
 */
export function useHotkeys(handler: (e: KeyboardEvent) => boolean, { first = false } = {}) {
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented || shouldIgnoreHotkey(e)) return;
    if (handler(e)) e.preventDefault();
  });

  useEffect(() => {
    window.addEventListener("keydown", onKey, { capture: first });
    return () => window.removeEventListener("keydown", onKey, { capture: first });
  }, [first]);
}
