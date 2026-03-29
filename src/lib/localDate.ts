/**
 * localDate.ts — All date helpers in Atlas use LOCAL time, never UTC.
 *
 * Rule: never call new Date().toISOString().slice(0,10) for "today" —
 * that returns the UTC date which can be wrong by one day for US timezones.
 * Use localISO() / localToday() instead.
 *
 * Timestamps stored in the database (created_at, updated_at, clock-in/out)
 * remain as full ISO strings via new Date().toISOString() — that is correct.
 * This file is only for date-only values (YYYY-MM-DD).
 */

/** Returns YYYY-MM-DD in the user's local timezone. */
export function localISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today's date as YYYY-MM-DD in local time. */
export function localToday(): string {
  return localISO(new Date());
}

/** Monday of the ISO week containing d (local time). */
export function localWeekMon(d: Date): Date {
  const dt = new Date(d);
  const dow = dt.getDay(); // 0 = Sun
  dt.setDate(dt.getDate() - (dow === 0 ? 6 : dow - 1));
  dt.setHours(0, 0, 0, 0);
  return dt;
}

/** Add n days to d (local time). */
export function addDays(d: Date, n: number): Date {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt;
}

/** Add n weeks to d (local time). */
export function addWeeks(d: Date, n: number): Date {
  return addDays(d, n * 7);
}

/** Array of 7 YYYY-MM-DD strings Mon → Sun for the week starting at mon. */
export function weekDates(mon: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => localISO(addDays(mon, i)));
}

/** "Mar 29" style label from a YYYY-MM-DD string (local time). */
export function shortDateLabel(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Sat" style label from a YYYY-MM-DD string (local time). */
export function weekdayLabel(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
}

/** Day of week 0–6 (0 = Sun) from a YYYY-MM-DD string (local time). */
export function localDow(dateStr: string): number {
  return new Date(dateStr + "T12:00:00").getDay();
}

/** True if the date string falls on a Saturday or Sunday (local). */
export function isWeekend(dateStr: string): boolean {
  const dow = localDow(dateStr);
  return dow === 0 || dow === 6;
}

/** Number of weekdays (Mon–Fri) in a given local year + month (1-based). */
export function weekdaysInMonth(year: number, month: number): number {
  const days = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}
