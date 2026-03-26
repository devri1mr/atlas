// Atlas HR — shared OT, lunch deduction, and pay period utilities

export type HRSettings = {
  pay_cycle: string;
  pay_period_start_day: number;
  pay_period_anchor_date: string | null;
  ot_weekly_threshold: number;
  ot_daily_threshold: number | null;
  ot_multiplier: number;
  dt_daily_threshold: number | null;
  dt_multiplier: number;
  lunch_auto_deduct: boolean;
  lunch_deduct_after_hours: number;
  lunch_deduct_minutes: number;
  punch_rounding_minutes: number;
};

export type PunchIn = {
  id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  date_for_payroll: string;
};

export type PunchOut = {
  id: string;
  gross_hours: number;    // net after lunch, before OT split
  regular_hours: number;
  ot_hours: number;
  dt_hours: number;
  lunch_deducted_mins: number;
};

function r4(n: number): number { return Math.round(n * 10000) / 10000; }

export function roundTime(dt: Date, intervalMins: number): Date {
  if (!intervalMins) return new Date(dt);
  const ms = intervalMins * 60 * 1000;
  return new Date(Math.round(dt.getTime() / ms) * ms);
}

export function weekStart(date: Date, startDay: number): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = (d.getDay() - startDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

// Compute OT/lunch for all closed punches within a single calendar week.
// Weeks are processed day-by-day in ascending order; daily OT is checked
// per-day, then weekly OT is applied on top.
export function computeWeekPunches(punches: PunchIn[], s: HRSettings): PunchOut[] {
  const closed = punches.filter(p => p.clock_out_at);

  const withGross = closed.map(p => {
    const rIn  = roundTime(new Date(p.clock_in_at),   s.punch_rounding_minutes);
    const rOut = roundTime(new Date(p.clock_out_at!),  s.punch_rounding_minutes);
    const rawH = r4(Math.max(0, (rOut.getTime() - rIn.getTime()) / 3_600_000));
    const lunchMins = (s.lunch_auto_deduct && rawH >= s.lunch_deduct_after_hours)
      ? s.lunch_deduct_minutes : 0;
    const grossH = r4(Math.max(0, rawH - lunchMins / 60));
    return { ...p, grossH, lunchMins };
  });

  // Group by date, sort within each day by clock_in
  const byDate = new Map<string, typeof withGross>();
  for (const p of withGross) {
    if (!byDate.has(p.date_for_payroll)) byDate.set(p.date_for_payroll, []);
    byDate.get(p.date_for_payroll)!.push(p);
  }
  for (const arr of byDate.values()) arr.sort((a, b) => a.clock_in_at.localeCompare(b.clock_in_at));

  const results = new Map<string, PunchOut>();
  let weeklyRegSoFar = 0;

  for (const date of [...byDate.keys()].sort()) {
    const dayPunches = byDate.get(date)!;
    const dayGross = r4(dayPunches.reduce((sum, p) => sum + p.grossH, 0));

    // Daily thresholds (treat 0 as disabled, same as null)
    let dayReg = dayGross, dayOT = 0, dayDT = 0;
    if (s.ot_daily_threshold !== null && s.ot_daily_threshold > 0 && dayGross > s.ot_daily_threshold) {
      dayReg = s.ot_daily_threshold;
      if (s.dt_daily_threshold !== null && s.dt_daily_threshold > 0 && dayGross > s.dt_daily_threshold) {
        dayOT = r4(s.dt_daily_threshold - s.ot_daily_threshold);
        dayDT = r4(dayGross - s.dt_daily_threshold);
      } else {
        dayOT = r4(dayGross - s.ot_daily_threshold);
      }
    }

    // Weekly threshold applies to the daily-regular bucket
    const remWeekly  = Math.max(0, s.ot_weekly_threshold - weeklyRegSoFar);
    const actualReg  = Math.min(dayReg, remWeekly);
    const weekSpill  = r4(dayReg - actualReg);
    weeklyRegSoFar   = r4(weeklyRegSoFar + actualReg);

    const totalOT = r4(dayOT + weekSpill);
    const totalDT = dayDT;

    for (const p of dayPunches) {
      const ratio = dayGross > 0 ? p.grossH / dayGross : 0;
      results.set(p.id, {
        id: p.id,
        gross_hours:        p.grossH,
        regular_hours:      r4(actualReg * ratio),
        ot_hours:           r4(totalOT   * ratio),
        dt_hours:           r4(totalDT   * ratio),
        lunch_deducted_mins: p.lunchMins,
      });
    }
  }

  return closed.map(p => results.get(p.id)!).filter(Boolean);
}

// Compute OT for punches spanning a full pay period (may cross multiple weeks).
// Each week is computed independently so weekly OT resets correctly.
export function computePeriodPunches(punches: PunchIn[], s: HRSettings): PunchOut[] {
  const byWeek = new Map<string, PunchIn[]>();
  for (const p of punches) {
    if (!p.clock_out_at) continue;
    const ws  = weekStart(new Date(p.date_for_payroll), s.pay_period_start_day);
    const key = ws.toISOString().slice(0, 10);
    if (!byWeek.has(key)) byWeek.set(key, []);
    byWeek.get(key)!.push(p);
  }
  const out: PunchOut[] = [];
  for (const wp of byWeek.values()) out.push(...computeWeekPunches(wp, s));
  return out;
}

// ── Pay period helpers ────────────────────────────────────────────────────────

export type PayPeriod = { start: Date; end: Date; label: string };

function fmt(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function getPayPeriodContaining(date: Date, s: HRSettings): PayPeriod {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);

  switch (s.pay_cycle) {
    case "biweekly": {
      const anchor = s.pay_period_anchor_date
        ? new Date(s.pay_period_anchor_date + "T12:00:00")
        : weekStart(new Date(), s.pay_period_start_day);
      const diffDays = Math.floor((d.getTime() - anchor.getTime()) / 86_400_000);
      const num      = Math.floor(diffDays / 14);
      const start    = new Date(anchor);
      start.setDate(anchor.getDate() + num * 14);
      const end = new Date(start);
      end.setDate(start.getDate() + 13);
      return { start, end, label: `${fmt(start)} – ${fmt(end)}` };
    }
    case "semimonthly": {
      const y = d.getFullYear(), m = d.getMonth();
      if (d.getDate() <= 15) {
        const start = new Date(y, m, 1), end = new Date(y, m, 15);
        return { start, end, label: `${fmt(start)} – ${fmt(end)}` };
      }
      const start = new Date(y, m, 16), end = new Date(y, m + 1, 0);
      return { start, end, label: `${fmt(start)} – ${fmt(end)}` };
    }
    case "monthly": {
      const y = d.getFullYear(), m = d.getMonth();
      const start = new Date(y, m, 1), end = new Date(y, m + 1, 0);
      return { start, end, label: `${fmt(start)} – ${fmt(end)}` };
    }
    default: { // weekly
      const start = weekStart(d, s.pay_period_start_day);
      const end   = new Date(start);
      end.setDate(start.getDate() + 6);
      return { start, end, label: `${fmt(start)} – ${fmt(end)}` };
    }
  }
}

export function shiftPayPeriod(period: PayPeriod, delta: number, s: HRSettings): PayPeriod {
  const days  = Math.round((period.end.getTime() - period.start.getTime()) / 86_400_000) + 1;
  const probe = new Date(period.start);
  probe.setDate(probe.getDate() + days * delta + Math.floor(days / 2));
  return getPayPeriodContaining(probe, s);
}
