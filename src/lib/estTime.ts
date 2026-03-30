/**
 * estTime.ts — All time display and input conversion in Atlas uses Eastern Time.
 *
 * The company (Garpiel Group) operates exclusively in the Eastern timezone.
 * Timestamps in the database are stored as UTC ISO strings. This file provides
 * the canonical helpers to convert between UTC and Eastern for display/input.
 *
 * Rules:
 *  - DISPLAY:  always call fmtEstTime(iso) — never raw toLocaleTimeString()
 *  - INPUT:    seed <input type="datetime-local"> with toEasternLocal(iso)
 *  - SAVE:     convert input value back with fromEasternLocal(str)
 *  - DATE:     use estToday() for today's YYYY-MM-DD in Eastern
 */

export const EST_TZ = "America/New_York";

/** Format a UTC ISO string as a time string in Eastern Time ("1:43 PM"). */
export function fmtEstTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: EST_TZ,
  });
}

/**
 * Convert a UTC ISO string to a "YYYY-MM-DDTHH:MM" string in Eastern Time,
 * suitable for use as the `value` of an <input type="datetime-local">.
 */
export function toEasternLocal(iso: string): string {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: EST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const h = get("hour") === "24" ? "00" : get("hour"); // midnight edge case
  return `${get("year")}-${get("month")}-${get("day")}T${h}:${get("minute")}`;
}

/**
 * Convert a datetime-local value ("YYYY-MM-DDTHH:MM", interpreted as Eastern Time)
 * back to a UTC ISO string for storing in the database.
 */
export function fromEasternLocal(str: string): string {
  // Parse naive string as if it were UTC
  const naive = new Date(str + ":00Z");

  // Find what Eastern time the naive-UTC moment maps to
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: EST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(naive);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const h = get("hour") === "24" ? "00" : get("hour");
  const estAsUtc = new Date(
    `${get("year")}-${get("month")}-${get("day")}T${h}:${get("minute")}:00Z`
  );

  // The UTC offset = naive - estAsUtc (e.g., +4h for EDT, +5h for EST)
  // Actual UTC for the Eastern input = naive + offset
  const offsetMs = naive.getTime() - estAsUtc.getTime();
  return new Date(naive.getTime() + offsetMs).toISOString();
}

/** Extract YYYY-MM-DD in Eastern Time from a UTC ISO string. */
export function estDate(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: EST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Today's date as YYYY-MM-DD in Eastern Time. */
export function estToday(): string {
  return estDate(new Date().toISOString());
}
