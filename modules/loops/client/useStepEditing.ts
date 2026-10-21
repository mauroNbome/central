import { useEffect, useState } from "react";

/**
 * Qué loop tiene el editor de pasos abierto. Sólo el que está bajo el cursor:
 * si el cursor se va (clic en otra fila, el loop cambió de sección), el editor
 * se cierra.
 */
export function useStepEditing<T extends { id: string }>(current: T | undefined) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const loop = current && current.id === editingId ? current : undefined;

  useEffect(() => {
    if (editingId && current?.id !== editingId) setEditingId(null);
  }, [current, editingId]);

  return {
    loop,
    open: () => setEditingId(current?.id ?? null),
    close: () => setEditingId(null),
  };
}
