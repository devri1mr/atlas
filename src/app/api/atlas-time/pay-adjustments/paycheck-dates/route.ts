import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { nextPaycheckDate, paycheckDateRange } from "@/lib/atPayPeriod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).single();
  return data?.id ?? null;
}

/**
 * Returns an ordered list of paycheck dates relevant to the Pay Adjustments UI:
 *   - All distinct dates that already have adjustment records (past + future)
 *   - Plus the next 4 upcoming paycheck dates from today (so empty periods are visible)
 * Sorted ascending; deduped.
 */
export async function GET(_req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const [settingsRes, existingRes] = await Promise.all([
      sb.from("at_settings")
        .select("pay_cycle, payday_day_of_week, pay_period_start_day, pay_period_anchor_date")
        .eq("company_id", companyId)
        .maybeSingle(),
      sb.from("at_pay_adjustments")
        .select("paycheck_date")
        .eq("company_id", companyId)
        .neq("status", "cancelled"),
    ]);

    const settings = {
      pay_cycle:               settingsRes.data?.pay_cycle               ?? "weekly",
      payday_day_of_week:      settingsRes.data?.payday_day_of_week      ?? 5,
      pay_period_start_day:    settingsRes.data?.pay_period_start_day    ?? 1,
      pay_period_anchor_date:  settingsRes.data?.pay_period_anchor_date  ?? null,
    };

    // Dates already in the DB
    const existing = new Set<string>(
      (existingRes.data ?? []).map(r => r.paycheck_date)
    );

    // Next 4 upcoming paycheck dates (so managers always see future tabs)
    const upcoming = paycheckDateRange(settings, new Date(), 4);
    upcoming.forEach(d => existing.add(d));

    // Sort ascending
    const sorted = Array.from(existing).sort();

    return NextResponse.json({ dates: sorted, settings });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
