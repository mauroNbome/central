/**
 * UUID v4 para un loop nuevo. `crypto.randomUUID` sólo existe en contextos
 * seguros (https o localhost): abriendo la app por IP de la red local, por
 * ejemplo desde el celular, no está y la captura fallaría.
 */
export function newLoopId(c: Pick<Crypto, "getRandomValues"> & Partial<Pick<Crypto, "randomUUID">> = crypto): string {
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40; // versión 4
  b[8] = (b[8]! & 0x3f) | 0x80; // variante RFC 4122
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
