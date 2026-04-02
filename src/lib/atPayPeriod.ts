/**
 * Pay period utilities — compute paycheck dates from at_settings.
 *
 * Supports:
 *   weekly   — every `payday_day_of_week` (0=Sun … 6=Sat)
 *   biweekly — every 2 weeks, anchored on `pay_period_anchor_date`
 */

export type PayPeriodSettings = {
  pay_cycle: string;                   // "weekly" | "biweekly"
  payday_day_of_week: number;          // 0–6 (0=Sun, 5=Fri, etc.)
  pay_period_start_day?: number;       // 0–6, day the pay period starts (default 1 = Mon)
  pay_period_anchor_date: string | null; // ISO date of a known pay period START, used for biweekly
};

/**
 * Returns the Nth next paycheck date from `fromDate`.
 *   skip=0 → the very next upcoming payday (on or after fromDate)
 *   skip=1 → the one after that
 *
 * For biweekly: pay_period_anchor_date is the START of a known pay period.
 * The actual payday = period_start + (payday_day_of_week - pay_period_start_day) days.
 */
export function nextPaycheckDate(
  settings: PayPeriodSettings,
  fromDate: Date = new Date(),
  skip = 0,
): string {
  const {
    pay_cycle,
    payday_day_of_week,
    pay_period_start_day = 1,
    pay_period_anchor_date,
  } = settings;

  if (pay_cycle === "biweekly" && pay_period_anchor_date) {
    const anchor = new Date(pay_period_anchor_date + "T12:00:00");
    const base   = new Date(fromDate);
    base.setHours(12, 0, 0, 0);

    // Days from period start → payday within the same period
    const paydayOffset = ((payday_day_of_week - pay_period_start_day) + 7) % 7;

    // How many 14-day cycles from anchor to base, accounting for where the
    // payday falls within the cycle
    const diffDays     = (base.getTime() - anchor.getTime()) / 86_400_000;
    const periodsElapsed = Math.ceil((diffDays - paydayOffset) / 14);

    // Period start for the Nth cycle
    const periodStart = new Date(anchor);
    periodStart.setDate(anchor.getDate() + (periodsElapsed + skip) * 14);

    // Payday = period start + offset
    const payday = new Date(periodStart);
    payday.setDate(periodStart.getDate() + paydayOffset);
    return payday.toISOString().slice(0, 10);
  }

  // Weekly (or biweekly with no anchor set): next occurrence of payday_day_of_week
  const interval = pay_cycle === "biweekly" ? 14 : 7;
  const d = new Date(fromDate);
  d.setHours(12, 0, 0, 0);
  const day       = d.getDay();
  const daysUntil = ((payday_day_of_week - day + 7) % 7) || interval;
  d.setDate(d.getDate() + daysUntil + skip * interval);
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

/**
 * Given a paycheck date, returns the pay period start and end dates.
 * Convention: payday falls one period after the work period ends.
 *   period_start = paycheckDate - paydayOffset - interval
 *   period_end   = period_start + interval - 1
 */
export function payPeriodBounds(
  paycheckDate: string,
  settings: PayPeriodSettings,
): { start: string; end: string } {
  const { payday_day_of_week, pay_period_start_day = 1 } = settings;
  const interval = settings.pay_cycle === "biweekly" ? 14 : 7;
  const paydayOffset = ((payday_day_of_week - pay_period_start_day) + 7) % 7;

  const payday = new Date(paycheckDate + "T12:00:00");
  const start = new Date(payday);
  start.setDate(payday.getDate() - paydayOffset - interval);
  const end = new Date(start);
  end.setDate(start.getDate() + interval - 1);

  return {
    start: start.toISOString().slice(0, 10),
    end:   end.toISOString().slice(0, 10),
  };
}
