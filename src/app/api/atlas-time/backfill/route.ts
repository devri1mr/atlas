import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { recalcDayLunch } from "@/lib/atDayRecalc";
import { weekStart } from "@/lib/atHours";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Long-running — allow up to 5 minutes
export const maxDuration = 300;

/**
 * POST /api/atlas-time/backfill
 * Recalculates regular_hours, ot_hours, dt_hours, and lunch_deducted_mins
 * for every completed punch in the system, using the current HR settings.
 * Returns counts of weeks processed and any errors.
 */
export async function POST() {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });
    const companyId = company.id;

    // Fetch settings just to get pay_period_start_day for week bucketing
    const { data: gs } = await sb
      .from("at_settings")
      .select("pay_period_start_day")
      .eq("company_id", companyId)
      .maybeSingle();
    const startDay: number = gs?.pay_period_start_day ?? 0;

    // Get every distinct employee_id + date_for_payroll that has a closed punch
    const { data: pairs, error } = await sb
      .from("at_punches")
      .select("employee_id, date_for_payroll")
      .eq("company_id", companyId)
      .not("clock_out_at", "is", null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!pairs?.length) return NextResponse.json({ weeks_processed: 0, errors: 0 });

    // Deduplicate to one call per employee × calendar-week
    const seen  = new Set<string>();
    const tasks: Array<{ employeeId: string; date: string }> = [];

    for (const { employee_id, date_for_payroll } of pairs) {
      const ws  = weekStart(new Date(date_for_payroll + "T12:00:00"), startDay);
      const key = `${employee_id}|${ws.toISOString().slice(0, 10)}`;
      if (!seen.has(key)) {
        seen.add(key);
        tasks.push({ employeeId: employee_id, date: date_for_payroll });
      }
    }

    let processed = 0;
    let errors    = 0;

    // Process sequentially to avoid hammering Supabase with concurrent writes
    for (const { employeeId, date } of tasks) {
      try {
        await recalcDayLunch(sb, companyId, employeeId, date);
        processed++;
      } catch {
        errors++;
      }
    }

    return NextResponse.json({ weeks_processed: processed, errors });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
