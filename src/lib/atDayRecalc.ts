import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { computeWeekPunches, weekStart, HRSettings } from "@/lib/atHours";

function r2(n: number) { return Math.round(n * 100) / 100; }

type LunchOverrides = {
  lunch_auto_deduct:        boolean;
  lunch_deduct_minutes:     number;
  lunch_deduct_after_hours: number;
};

/**
 * After any punch with a clock_out is saved, recalculate hours for every
 * completed punch that employee has in the same calendar week so that:
 *  - Lunch deduction is based on TOTAL raw hours across all punches that day
 *  - Daily OT thresholds are applied per-day
 *  - Weekly OT threshold is accumulated correctly across the full week
 *  - Results are written back to regular_hours, ot_hours, dt_hours, lunch_deducted_mins
 *
 * Optional `lunchOverrides` bypasses the DB lunch settings (used by backfill
 * when the caller has already confirmed the correct values from the frontend).
 */
export async function recalcDayLunch(
  sb: ReturnType<typeof supabaseAdmin>,
  companyId: string,
  employeeId: string,
  dateForPayroll: string,
  lunchOverrides?: LunchOverrides,
) {
  // Fetch employee-level overrides and global settings in parallel
  const [{ data: emp }, { data: gs }] = await Promise.all([
    sb.from("at_employees")
      .select("lunch_auto_deduct, lunch_deduct_after_hours, lunch_deduct_minutes")
      .eq("id", employeeId)
      .single(),
    sb.from("at_settings")
      .select("lunch_auto_deduct, lunch_deduct_after_hours, lunch_deduct_minutes, ot_daily_threshold, dt_daily_threshold, ot_weekly_threshold, ot_multiplier, dt_multiplier, pay_period_start_day, punch_rounding_minutes")
      .eq("company_id", companyId)
      .maybeSingle(),
  ]);

  const settings: HRSettings = {
    pay_cycle:               "weekly",
    pay_period_start_day:    gs?.pay_period_start_day    ?? 0,
    pay_period_anchor_date:  null,
    ot_weekly_threshold:     gs?.ot_weekly_threshold     ?? 40,
    ot_daily_threshold:      gs?.ot_daily_threshold      ?? null,
    ot_multiplier:           gs?.ot_multiplier           ?? 1.5,
    dt_daily_threshold:      gs?.dt_daily_threshold      ?? null,
    dt_multiplier:           gs?.dt_multiplier           ?? 2,
    // lunchOverrides wins > employee override > global setting > default false
    lunch_auto_deduct:       lunchOverrides?.lunch_auto_deduct        ?? emp?.lunch_auto_deduct        ?? gs?.lunch_auto_deduct        ?? false,
    lunch_deduct_after_hours: lunchOverrides?.lunch_deduct_after_hours ?? emp?.lunch_deduct_after_hours ?? gs?.lunch_deduct_after_hours ?? 6,
    lunch_deduct_minutes:    lunchOverrides?.lunch_deduct_minutes     ?? emp?.lunch_deduct_minutes     ?? gs?.lunch_deduct_minutes     ?? 30,
    punch_rounding_minutes:  gs?.punch_rounding_minutes  ?? 0,
  };

  // Determine the calendar week containing this date
  const ws = weekStart(new Date(dateForPayroll + "T12:00:00"), settings.pay_period_start_day);
  const we = new Date(ws);
  we.setDate(ws.getDate() + 6);
  const weekStartStr = ws.toISOString().slice(0, 10);
  const weekEndStr   = we.toISOString().slice(0, 10);

  // All completed punches for this employee in this week
  const { data: weekPunches } = await sb
    .from("at_punches")
    .select("id, clock_in_at, clock_out_at, date_for_payroll, lunch_deducted_mins, regular_hours")
    .eq("employee_id", employeeId)
    .eq("company_id", companyId)
    .not("clock_out_at", "is", null)
    .gte("date_for_payroll", weekStartStr)
    .lte("date_for_payroll", weekEndStr);

  if (!weekPunches?.length) return;

  // Classify each punch:
  //   • brand-new (regular_hours=null): treat as fresh, no overrides apply
  //   • manager removed lunch: lunch_deducted_mins=0, regular_hours set → no_lunch=true
  //   • manager forced lunch: lunch_deducted_mins>0, regular_hours set → forced_lunch_mins=N
  //   • backfill mode (lunchOverrides set): ignore all manual overrides, recompute from scratch
  const alreadyCalced = (p: typeof weekPunches[0]) => p.regular_hours !== null;
  const punchesWithOverride = weekPunches.map(p => ({
    ...p,
    no_lunch: !lunchOverrides && alreadyCalced(p) && p.lunch_deducted_mins === 0,
    forced_lunch_mins: (!lunchOverrides && alreadyCalced(p) && (p.lunch_deducted_mins ?? 0) > 0)
      ? (p.lunch_deducted_mins ?? undefined)
      : undefined,
  }));

  // computeWeekPunches handles lunch deduction, daily OT, and weekly OT accumulation
  const results   = computeWeekPunches(punchesWithOverride, settings);
  const resultMap = new Map(results.map(r => [r.id, r]));

  // Apply r2 rounding to each punch individually, then correct any overshoot so
  // the stored weekly reg total never exceeds the threshold (e.g. 40.01 → 40.00).
  const storedMap = new Map<string, { regular_hours: number; ot_hours: number; dt_hours: number; lunch_deducted_mins: number }>();
  for (const [id, r] of resultMap) {
    storedMap.set(id, {
      regular_hours:       r2(r.regular_hours),
      ot_hours:            r2(r.ot_hours),
      dt_hours:            r2(r.dt_hours),
      lunch_deducted_mins: r.lunch_deducted_mins,
    });
  }

  // If per-punch r2 rounding caused the weekly reg total to exceed the threshold,
  // move the excess into OT on the last-in-time punch that still has reg hours.
  const threshold   = settings.ot_weekly_threshold;
  const weekRegSum  = [...storedMap.values()].reduce((s, r) => s + r.regular_hours, 0);
  const overshoot   = r2(weekRegSum - threshold); // how many hundredths over the limit
  if (overshoot > 0) {
    const lastWithReg = weekPunches
      .slice()
      .sort((a, b) => b.clock_in_at.localeCompare(a.clock_in_at))
      .find(p => (storedMap.get(p.id)?.regular_hours ?? 0) > 0);
    if (lastWithReg) {
      const s = storedMap.get(lastWithReg.id)!;
      storedMap.set(lastWithReg.id, {
        ...s,
        regular_hours: r2(s.regular_hours - overshoot),
        ot_hours:      r2(s.ot_hours      + overshoot),
      });
    }
  }

  // Write all results back in parallel
  await Promise.all(weekPunches.map(p => {
    const stored = storedMap.get(p.id);
    if (!stored) return Promise.resolve();
    const isManualOverride = !lunchOverrides && p.regular_hours !== null && p.lunch_deducted_mins === 0;
    return sb.from("at_punches").update({
      regular_hours:       stored.regular_hours,
      ot_hours:            stored.ot_hours,
      dt_hours:            stored.dt_hours,
      lunch_deducted_mins: isManualOverride ? 0 : (stored.lunch_deducted_mins || null),
    }).eq("id", p.id);
  }));
}
