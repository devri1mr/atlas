/**
 * Pay period utilities — compute paycheck dates from at_settings.
 *
 * Supports:
 *   weekly   — every `payday_day_of_week` (0=Sun … 6=Sat)
 *   biweekly — every 2 weeks, anchored on `pay_period_anchor_date`
 */

export type PayPeriodSettings = {
  pay_cycle: string;               // "weekly" | "biweekly"
  payday_day_of_week: number;      // 0–6
  pay_period_anchor_date: string | null; // ISO date, used for biweekly
};

/**
 * Returns the Nth next paycheck date from `fromDate`.
 *   skip=0 → the very next upcoming payday
 *   skip=1 → the one after that
 */
export function nextPaycheckDate(
  settings: PayPeriodSettings,
  fromDate: Date = new Date(),
  skip = 0,
): string {
  const { pay_cycle, payday_day_of_week, pay_period_anchor_date } = settings;

  if (pay_cycle === "biweekly" && pay_period_anchor_date) {
    const anchor = new Date(pay_period_anchor_date + "T12:00:00");
    const base   = new Date(fromDate);
    base.setHours(12, 0, 0, 0);

    // How many days from anchor to base?
    const diffMs   = base.getTime() - anchor.getTime();
    const diffDays = diffMs / 86_400_000;

    // Periods elapsed (ceiling so we land on or after base)
    const periodsElapsed = Math.ceil(diffDays / 14);

    const result = new Date(anchor);
    result.setDate(anchor.getDate() + (periodsElapsed + skip) * 14);
    return result.toISOString().slice(0, 10);
  }

  // Default: weekly
  const d = new Date(fromDate);
  d.setHours(12, 0, 0, 0);
  const day         = d.getDay();
  const daysUntil   = ((payday_day_of_week - day + 7) % 7) || 7; // never 0 — always forward
  d.setDate(d.getDate() + daysUntil + skip * 7);
  return d.toISOString().slice(0, 10);
}

/**
 * Returns an ordered list of all distinct paycheck dates from
 * `earliestDate` up to `weeksAhead` weeks into the future.
 * Useful for generating the tab list in Pay Adjustments.
 */
export function paycheckDateRange(
  settings: PayPeriodSettings,
  earliestDate: Date,
  weeksAhead = 4,
): string[] {
  const interval = settings.pay_cycle === "biweekly" ? 14 : 7;
  const totalPeriods = settings.pay_cycle === "biweekly"
    ? Math.ceil(weeksAhead / 2)
    : weeksAhead;

  // Find the first paycheck on or before earliestDate to anchor backwards
  const first = nextPaycheckDate(settings, earliestDate, 0);
  const dates: string[] = [first];
  for (let i = 1; i <= totalPeriods; i++) {
    const d = new Date(first + "T12:00:00");
    d.setDate(d.getDate() + interval * i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/** Human-readable label for a paycheck date, e.g. "Fri Apr 4" */
export function fmtPaycheckDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
