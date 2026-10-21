const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto", style: "short" });

const units = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
] as const;

/** "hace 2 días", "ayer", "ahora". */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = (new Date(iso).getTime() - now) / 1000;
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.trunc(seconds / size), unit);
  }
  return "ahora";
}

const clock = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" });

/** "09:40", en la hora local. */
export function clockTime(iso: string): string {
  return clock.format(new Date(iso));
}

/** Medianoche local de `now`: "hoy" empieza ahí. */
export function startOfDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
