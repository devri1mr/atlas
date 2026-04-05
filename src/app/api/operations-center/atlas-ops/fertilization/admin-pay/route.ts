import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function weekdaysInMonth(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

const MONTH_KEYS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"] as const;

function computeDailyRate(config: any, year: number, monthIndex: number): number {
  const key = `${MONTH_KEYS[monthIndex]}_daily` as string;
  if (config[key] != null) return Number(config[key]);
  const annualTotal = (Number(config.manager_1_annual ?? 0) + Number(config.manager_2_annual ?? 0));
  if (annualTotal <= 0) return 0;
  const monthlyBudget = annualTotal / 12;
  const weekdays = weekdaysInMonth(year, monthIndex + 1);
  return weekdays > 0 ? monthlyBudget / weekdays : 0;
}

export async function GET(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));

    const { data: config } = await sb
      .from("fert_admin_pay_config")
      .select("*")
      .eq("company_id", company.id)
      .eq("year", year)
      .maybeSingle();

    const { data: overrides } = await sb
      .from("fert_admin_pay_overrides")
      .select("date, payroll_cost, notes")
      .eq("company_id", company.id)
      .gte("date", `${year}-01-01`)
      .lte("date", `${year}-12-31`);

    const overrideMap: Record<string, { payroll_cost: number | null; notes: string | null }> = {};
    for (const o of overrides ?? []) {
      overrideMap[o.date] = { payroll_cost: o.payroll_cost, notes: o.notes };
    }

    const days: Array<{
      date: string;
      day_of_week: string;
      is_weekday: boolean;
      computed_cost: number;
      override_cost: number | null;
      notes: string | null;
    }> = [];

    const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

    for (let m = 0; m < 12; m++) {
      const daysInMonth = new Date(year, m + 1, 0).getDate();
      const dailyRate = config ? computeDailyRate(config, year, m) : 0;

      for (let d = 1; d <= daysInMonth; d++) {
        const dateObj = new Date(year, m, d);
        const dow = dateObj.getDay();
        const isWeekday = dow !== 0 && dow !== 6;
        const dateStr = `${year}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const ov = overrideMap[dateStr];

        days.push({
          date: dateStr,
          day_of_week: DOW[dow],
          is_weekday: isWeekday,
          computed_cost: isWeekday ? dailyRate : 0,
          override_cost: ov != null ? (ov.payroll_cost != null ? Number(ov.payroll_cost) : null) : undefined as any,
          notes: ov?.notes ?? null,
        });
      }
    }

    return NextResponse.json({ config: config ?? null, days, year });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body = await req.json();
    const year = parseInt(body.year ?? new Date().getFullYear());

    const upsertData = {
      company_id: company.id,
      year,
      manager_1_name:   body.manager_1_name   ?? "",
      manager_2_name:   body.manager_2_name   ?? "",
      manager_1_annual: body.manager_1_annual != null ? Number(body.manager_1_annual) : null,
      manager_2_annual: body.manager_2_annual != null ? Number(body.manager_2_annual) : null,
      jan_daily: body.jan_daily != null ? Number(body.jan_daily) : null,
      feb_daily: body.feb_daily != null ? Number(body.feb_daily) : null,
      mar_daily: body.mar_daily != null ? Number(body.mar_daily) : null,
      apr_daily: body.apr_daily != null ? Number(body.apr_daily) : null,
      may_daily: body.may_daily != null ? Number(body.may_daily) : null,
      jun_daily: body.jun_daily != null ? Number(body.jun_daily) : null,
      jul_daily: body.jul_daily != null ? Number(body.jul_daily) : null,
      aug_daily: body.aug_daily != null ? Number(body.aug_daily) : null,
      sep_daily: body.sep_daily != null ? Number(body.sep_daily) : null,
      oct_daily: body.oct_daily != null ? Number(body.oct_daily) : null,
      nov_daily: body.nov_daily != null ? Number(body.nov_daily) : null,
      dec_daily: body.dec_daily != null ? Number(body.dec_daily) : null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await sb
      .from("fert_admin_pay_config")
      .upsert(upsertData, { onConflict: "company_id,year" });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
