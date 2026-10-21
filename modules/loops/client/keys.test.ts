import { describe, expect, it } from "vitest";
import { captureLoopInput } from "../contract.ts";
import { newLoopId } from "./ids.ts";
import {
  decisionKeys,
  editorActionForKey,
  horizonKeys,
  inboxActionForKey,
  isCaptureKey,
  isUndoKey,
  loopsActionForKey,
  shouldIgnoreHotkey,
  tabForKey,
  todayActionForKey,
} from "./keys.ts";

describe("inboxActionForKey", () => {
  it("mapea cada tecla de decisión a su decisión", () => {
    expect(inboxActionForKey("h")).toEqual({ type: "decide", choice: decisionKeys[0] });
    expect(inboxActionForKey("x")).toMatchObject({ choice: { decision: { kind: "done" } } });
    expect(inboxActionForKey("d")).toMatchObject({ choice: { decision: { kind: "drop" } } });
  });

  it("acepta mayúsculas por si está Bloq Mayús", () => {
    expect(inboxActionForKey("S")).toMatchObject({ choice: { label: "Semana" } });
  });

  it("mueve el cursor con j/k y flechas", () => {
    expect(inboxActionForKey("j")).toEqual({ type: "move", delta: 1 });
    expect(inboxActionForKey("ArrowUp")).toEqual({ type: "move", delta: -1 });
  });

  it("ignora teclas sin acción", () => {
    expect(inboxActionForKey("q")).toBeNull();
    expect(inboxActionForKey("Enter")).toBeNull();
  });

  it("no repite teclas", () => {
    const keys = decisionKeys.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain("j");
    expect(keys).not.toContain("k");
    expect(keys).not.toContain("c");
  });
});

describe("todayActionForKey", () => {
  it("x completa, r abre el reprogramado, j/k mueven", () => {
    expect(todayActionForKey("x", "normal")).toEqual({ type: "complete" });
    expect(todayActionForKey("r", "normal")).toEqual({ type: "startReschedule" });
    expect(todayActionForKey("j", "normal")).toEqual({ type: "move", delta: 1 });
    expect(todayActionForKey("h", "normal")).toBeNull();
  });

  it("en modo reprogramar, h/s/m eligen horizonte y cualquier otra tecla cancela", () => {
    expect(todayActionForKey("s", "reschedule")).toEqual({ type: "reschedule", choice: horizonKeys[1] });
    expect(todayActionForKey("Escape", "reschedule")).toEqual({ type: "cancel" });
    expect(todayActionForKey("x", "reschedule")).toEqual({ type: "cancel" });
  });

  it("los horizontes usan las mismas teclas que el inbox", () => {
    for (const h of horizonKeys) {
      expect(inboxActionForKey(h.key)).toMatchObject({ choice: { decision: { kind: "activate", horizon: h.horizon } } });
    }
  });

  it("ninguna tecla de una vista choca con las globales", () => {
    const viewKeys = [...decisionKeys.map((d) => d.key), "x", "r", "e", "f", "j", "k"];
    for (const k of viewKeys) {
      expect(isCaptureKey(k)).toBe(false);
      expect(tabForKey(k)).toBeNull();
    }
  });
});

describe("shouldIgnoreHotkey", () => {
  const base = { key: "h", ctrlKey: false, metaKey: false, altKey: false, target: null };

  it("deja pasar una letra sola fuera de un campo", () => {
    expect(shouldIgnoreHotkey(base)).toBe(false);
    expect(shouldIgnoreHotkey({ ...base, target: { tagName: "LI" } as unknown as EventTarget })).toBe(false);
  });

  it("ignora mientras se escribe y con modificadores", () => {
    expect(shouldIgnoreHotkey({ ...base, target: { tagName: "INPUT" } as unknown as EventTarget })).toBe(true);
    expect(shouldIgnoreHotkey({ ...base, target: { isContentEditable: true } as unknown as EventTarget })).toBe(true);
    expect(shouldIgnoreHotkey({ ...base, metaKey: true })).toBe(true);
  });
});

describe("newLoopId", () => {
  it("genera un uuid v4 válido sin randomUUID (contexto no seguro)", () => {
    const id = newLoopId({ getRandomValues: (a) => crypto.getRandomValues(a) });
    expect(captureLoopInput.safeParse({ id, rawText: "x", source: "web" }).success).toBe(true);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("loopsActionForKey", () => {
  it("las teclas del inbox deciden y j/k mueven", () => {
    expect(loopsActionForKey("a", "normal")).toMatchObject({ type: "decide", choice: { label: "Algún día" } });
    expect(loopsActionForKey("j", "normal")).toEqual({ type: "move", delta: 1 });
  });

  it("los números quedan libres para las pestañas fuera de un modo", () => {
    expect(loopsActionForKey("3", "normal")).toBeNull();
  });

  it("e asigna área por posición; 0 la quita; otra tecla cancela", () => {
    expect(loopsActionForKey("e", "normal")).toEqual({ type: "startArea" });
    expect(loopsActionForKey("2", "area")).toEqual({ type: "area", slot: 1 });
    expect(loopsActionForKey("0", "area")).toEqual({ type: "area", slot: null });
    expect(loopsActionForKey("Escape", "area")).toEqual({ type: "cancel" });
  });

  it("f filtra por estado con letras y por área con números", () => {
    expect(loopsActionForKey("F", "normal")).toEqual({ type: "startFilter" });
    expect(loopsActionForKey("c", "filter")).toMatchObject({ type: "filterStatus", choice: { filter: "closed" } });
    expect(loopsActionForKey("1", "filter")).toEqual({ type: "filterArea", slot: 0 });
    expect(loopsActionForKey("0", "filter")).toEqual({ type: "filterArea", slot: null });
    expect(loopsActionForKey("h", "filter")).toEqual({ type: "cancel" });
  });
});

describe("desglosar con p", () => {
  it("abre el editor en Inbox, Hoy y Loops", () => {
    expect(inboxActionForKey("p")).toEqual({ type: "breakdown" });
    expect(todayActionForKey("p", "normal")).toEqual({ type: "breakdown" });
    expect(loopsActionForKey("p", "normal")).toEqual({ type: "breakdown" });
  });
});

describe("todayActionForKey: filtro por contexto", () => {
  it("f + número elige el contexto; 0 los muestra todos", () => {
    expect(todayActionForKey("f", "normal")).toEqual({ type: "startFilter" });
    expect(todayActionForKey("2", "filter")).toEqual({ type: "filterContext", slot: 1 });
    expect(todayActionForKey("0", "filter")).toEqual({ type: "filterContext", slot: null });
    expect(todayActionForKey("q", "filter")).toEqual({ type: "cancel" });
  });
});

describe("editorActionForKey", () => {
  const key = (k: string, shiftKey = false) => ({ key: k, shiftKey });

  it("j/k mueven y Shift+J/K reordenan", () => {
    expect(editorActionForKey(key("j"), "normal")).toEqual({ type: "move", delta: 1 });
    expect(editorActionForKey(key("J", true), "normal")).toEqual({ type: "reorder", delta: 1 });
    expect(editorActionForKey(key("ArrowUp", true), "normal")).toEqual({ type: "reorder", delta: -1 });
  });

  it("con Bloq Mayús, J sin Shift sólo mueve", () => {
    expect(editorActionForKey(key("J"), "normal")).toEqual({ type: "move", delta: 1 });
  });

  it("i, o y Enter vuelven a escribir; Esc cierra", () => {
    for (const k of ["i", "o", "Enter"]) expect(editorActionForKey(key(k), "normal")).toEqual({ type: "insert" });
    expect(editorActionForKey(key("Escape"), "normal")).toEqual({ type: "close" });
  });

  it("x completa, d borra y c + número asigna contexto", () => {
    expect(editorActionForKey(key("x"), "normal")).toEqual({ type: "complete" });
    expect(editorActionForKey(key("d"), "normal")).toEqual({ type: "remove" });
    expect(editorActionForKey(key("c"), "normal")).toEqual({ type: "startContext" });
    expect(editorActionForKey(key("3"), "context")).toEqual({ type: "context", slot: 2 });
    expect(editorActionForKey(key("0"), "context")).toEqual({ type: "context", slot: null });
    expect(editorActionForKey(key("Escape"), "context")).toEqual({ type: "cancel" });
  });
});

describe("isUndoKey", () => {
  it("u deshace, también con Bloq Mayús", () => {
    expect(isUndoKey("u")).toBe(true);
    expect(isUndoKey("U")).toBe(true);
    expect(isUndoKey("x")).toBe(false);
  });
});
