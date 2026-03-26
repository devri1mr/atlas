import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * After any punch with a clock_out is saved, recalculate hours for every
 * completed punch that employee has on that date so that:
 *  - Lunch deduction is based on TOTAL raw hours across all punches that day
 *  - Deduction is applied only to the last punch (by clock_out time)
 *  - All other punches on that day have their lunch_deducted_mins cleared
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
      .select("lunch_auto_deduct, lunch_deduct_after_hours, lunch_deduct_minutes, ot_daily_threshold, dt_daily_threshold")
      .eq("company_id", companyId)
      .maybeSingle(),
  ]);

  // Employee values take priority; fall back to global
  const autoDeduct: boolean = emp?.lunch_auto_deduct   ?? gs?.lunch_auto_deduct   ?? false;
  const afterHours: number  = emp?.lunch_deduct_after_hours ?? gs?.lunch_deduct_after_hours ?? 6;
  const deductMins: number  = emp?.lunch_deduct_minutes ?? gs?.lunch_deduct_minutes ?? 30;
  const otThresh: number    = gs?.ot_daily_threshold ?? 8;
  const dtThresh: number    = gs?.dt_daily_threshold ?? 0;

  // All completed punches for this employee on this date, oldest clock_out first
  const { data: dayPunches } = await sb
    .from("at_punches")
    .select("id, clock_in_at, clock_out_at")
    .eq("employee_id", employeeId)
    .eq("date_for_payroll", dateForPayroll)
    .eq("company_id", companyId)
    .not("clock_out_at", "is", null)
    .order("clock_out_at", { ascending: true });

  if (!dayPunches?.length) return;

  // Total raw minutes across all punches (ignoring any stored deductions)
  const totalRawMins = dayPunches.reduce((sum, p) => {
    return sum + (new Date(p.clock_out_at!).getTime() - new Date(p.clock_in_at).getTime()) / 60_000;
  }, 0);

  const shouldDeduct = autoDeduct && totalRawMins / 60 >= afterHours;
  const lastPunch    = dayPunches[dayPunches.length - 1];

  for (const p of dayPunches) {
    const rawMins  = (new Date(p.clock_out_at!).getTime() - new Date(p.clock_in_at).getTime()) / 60_000;
    const lunchMins = shouldDeduct && p.id === lastPunch.id ? deductMins : 0;
    const netHrs   = Math.max(0, rawMins - lunchMins) / 60;

    // Per-punch OT/DT breakdown
    let reg = netHrs, ot = 0, dt = 0;
    if (dtThresh > 0 && netHrs > dtThresh) {
      dt  = Math.round((netHrs - dtThresh) * 100) / 100;
      ot  = otThresh > 0 && otThresh < dtThresh ? Math.round((dtThresh - otThresh) * 100) / 100 : 0;
      reg = otThresh > 0 && otThresh < dtThresh ? otThresh : dtThresh;
    } else if (otThresh > 0 && netHrs > otThresh) {
      ot  = Math.round((netHrs - otThresh) * 100) / 100;
      reg = otThresh;
    }

    await sb.from("at_punches").update({
      regular_hours:       Math.round(reg * 100) / 100,
      ot_hours:            Math.round(ot * 100) / 100,
      dt_hours:            Math.round(dt * 100) / 100,
      lunch_deducted_mins: lunchMins || null,
    }).eq("id", p.id);
  }
}
