import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { computeWeekPunches, weekStart, HRSettings } from "@/lib/atHours";

function r2(n: number) { return Math.round(n * 100) / 100; }

/**
 * After any punch with a clock_out is saved, recalculate hours for every
 * completed punch that employee has in the same calendar week so that:
 *  - Lunch deduction is based on TOTAL raw hours across all punches that day
 *  - Daily OT thresholds are applied per-day
 *  - Weekly OT threshold is accumulated correctly across the full week
 *  - Results are written back to regular_hours, ot_hours, dt_hours, lunch_deducted_mins
 */
export async function recalcDayLunch(
  sb: ReturnType<typeof supabaseAdmin>,
  companyId: string,
  employeeId: string,
  dateForPayroll: string
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
    lunch_auto_deduct:       emp?.lunch_auto_deduct       ?? gs?.lunch_auto_deduct       ?? false,
    lunch_deduct_after_hours: emp?.lunch_deduct_after_hours ?? gs?.lunch_deduct_after_hours ?? 6,
    lunch_deduct_minutes:    emp?.lunch_deduct_minutes    ?? gs?.lunch_deduct_minutes    ?? 30,
    punch_rounding_minutes:  gs?.punch_rounding_minutes  ?? 0,
  };

  // Determine the calendar week containing this date
  const ws = weekStart(new Date(dateForPayroll + "T12:00:00"), settings.pay_period_start_day);
  const we = new Date(ws);
  we.setDate(ws.getDate() + 6);
  const weekStartStr = ws.toISOString().slice(0, 10);
  const weekEndStr   = we.toISOString().slice(0, 10);

  // All completed punches for this employee in this week
  // Also fetch lunch_deducted_mins and regular_hours so we can detect manual "no lunch" overrides.
  const { data: weekPunches } = await sb
    .from("at_punches")
    .select("id, clock_in_at, clock_out_at, date_for_payroll, lunch_deducted_mins, regular_hours")
    .eq("employee_id", employeeId)
    .eq("company_id", companyId)
    .not("clock_out_at", "is", null)
    .gte("date_for_payroll", weekStartStr)
    .lte("date_for_payroll", weekEndStr);

  if (!weekPunches?.length) return;

  // lunch_deducted_mins === 0 AND regular_hours is already set means a manager explicitly
  // removed the lunch deduction after a prior recalculation — preserve that override.
  // If regular_hours is null the punch is brand-new (DB default = 0) and is NOT an override.
  const punchesWithOverride = weekPunches.map(p => ({
    ...p,
    no_lunch: p.lunch_deducted_mins === 0 && p.regular_hours !== null,
  }));

  // computeWeekPunches handles lunch deduction, daily OT, and weekly OT accumulation
  const results   = computeWeekPunches(punchesWithOverride, settings);
  const resultMap = new Map(results.map(r => [r.id, r]));

  // Write all results back in parallel, preserving manual lunch overrides
  await Promise.all(weekPunches.map(p => {
    const r = resultMap.get(p.id);
    if (!r) return Promise.resolve();
    const isOverride = p.lunch_deducted_mins === 0;
    return sb.from("at_punches").update({
      regular_hours:       r2(r.regular_hours),
      ot_hours:            r2(r.ot_hours),
      dt_hours:            r2(r.dt_hours),
      // Explicit 0 = manual override: always write 0 back so it survives future recalcs
      lunch_deducted_mins: isOverride ? 0 : (r.lunch_deducted_mins || null),
    }).eq("id", p.id);
  }));
}
