import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { estToday } from "@/lib/estTime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Date helpers ───────────────────────────────────────────────────────────────

function isoWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function weekDays(monday: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function addWeeks(monday: Date, n: number): Date {
  const d = new Date(monday);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d;
}

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

// ── Admin pay helpers ──────────────────────────────────────────────────────────

function adminDailyRate(dateStr: string, config: any, overrideMap: Map<string, number | null>): number {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return 0;
  if (overrideMap.has(dateStr)) { const ov = overrideMap.get(dateStr); return ov ?? 0; }
  if (!config) return 0;
  const mk = MONTH_KEYS[d.getUTCMonth()];
  const monthlyRate = config[`${mk}_daily`];
  if (monthlyRate != null) return Number(monthlyRate);
  const annualTotal = Number(config.manager_1_annual ?? 0) + Number(config.manager_2_annual ?? 0);
  if (annualTotal <= 0) return 0;
  const wkdays = weekdaysInMonth(d.getUTCFullYear(), d.getUTCMonth() + 1);
  return wkdays > 0 ? (annualTotal / 12) / wkdays : 0;
}

// ── Main handler ───────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const year      = new Date().getUTCFullYear();
    const yearStart = `${year}-01-01`;
    const yearEnd   = `${year}-12-31`;
    const todayStr  = estToday();

    const [
      { data: reports, error },
      { data: adminConfig },
      { data: adminOverrides },
    ] = await Promise.all([
      sb.from("fert_production_reports")
        .select(`
          id, report_date, total_budgeted_amount,
          fert_production_jobs (
            fert_production_members (
              employee_id, resource_name,
              payroll_cost, ot_hours, actual_hours, total_payroll_hours
            )
          )
        `)
        .eq("company_id", company.id)
        .eq("is_complete", true)
        .gte("report_date", yearStart)
        .lte("report_date", yearEnd)
        .order("report_date"),
      sb.from("fert_admin_pay_config")
        .select("*")
        .eq("company_id", company.id)
        .eq("year", year)
        .maybeSingle(),
      sb.from("fert_admin_pay_overrides")
        .select("date, payroll_cost")
        .eq("company_id", company.id)
        .gte("date", yearStart)
        .lte("date", yearEnd),
    ]);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Fetch non-production payroll costs for all completed reports
    const reportIds = (reports ?? []).map((r: any) => r.id as string);
    const { data: nonProdRows } = reportIds.length > 0
      ? await sb.from("fert_non_production_days")
          .select("report_id, payroll_cost")
          .in("report_id", reportIds)
      : { data: [] };

    const nonProdByReport = new Map<string, number>();
    for (const r of nonProdRows ?? []) {
      nonProdByReport.set(r.report_id, (nonProdByReport.get(r.report_id) ?? 0) + Number(r.payroll_cost ?? 0));
    }

    // Build admin pay override lookup
    const adminOverrideMap = new Map<string, number | null>();
    for (const ov of adminOverrides ?? []) {
      adminOverrideMap.set(ov.date as string, ov.payroll_cost != null ? Number(ov.payroll_cost) : null);
    }

    // ── Aggregate production report data ─────────────────────────────────────

    type DayMetrics = { revenue: number; payroll_cost: number; ot_hrs: number; total_hrs: number };
    const byDate = new Map<string, DayMetrics>();
    const byWeekFullPayroll = new Map<string, number>();

    for (const r of reports ?? []) {
      const date = r.report_date as string;
      const nonProdCost = nonProdByReport.get((r as any).id) ?? 0;
      const day: DayMetrics = {
        revenue:      Number(r.total_budgeted_amount ?? 0),
        payroll_cost: nonProdCost,   // start with non-prod; prod added below
        ot_hrs:       0,
        total_hrs:    0,
      };

      const d      = new Date(date + "T12:00:00Z");
      const mon    = isoWeekStart(d);
      const weekKey = mon.toISOString().slice(0, 10);

      const seenPerson = new Set<string>();

      for (const job of (r as any).fert_production_jobs ?? []) {
        for (const m of (job as any).fert_production_members ?? []) {
          const personKey    = m.employee_id ?? m.resource_name ?? "";
          const dayTotalHrs  = m.total_payroll_hours ?? 0;

          if (personKey && !seenPerson.has(personKey)) {
            seenPerson.add(personKey);
            day.payroll_cost += m.payroll_cost ?? 0;
            day.total_hrs    += dayTotalHrs;
            day.ot_hrs       += m.ot_hours ?? 0;
            if (m.payroll_cost) {
              byWeekFullPayroll.set(weekKey, (byWeekFullPayroll.get(weekKey) ?? 0) + Number(m.payroll_cost));
            }
          }
        }
      }

      // Include non-prod in weekly full payroll too
      if (nonProdCost > 0) {
        byWeekFullPayroll.set(weekKey, (byWeekFullPayroll.get(weekKey) ?? 0) + nonProdCost);
      }

      byDate.set(date, day);
    }

    // ── Fold admin pay into daily costs (past days only) ──────────────────────

    for (const [date, day] of byDate.entries()) {
      if (date <= todayStr) {
        const adminCost = adminDailyRate(date, adminConfig, adminOverrideMap);
        day.payroll_cost += adminCost;
        // Add admin to weekly full payroll
        if (adminCost > 0) {
          const weekKey = isoWeekStart(new Date(date + "T12:00:00Z")).toISOString().slice(0, 10);
          byWeekFullPayroll.set(weekKey, (byWeekFullPayroll.get(weekKey) ?? 0) + adminCost);
        }
      }
    }

    // Admin pay for past weekdays with NO production report
    const adminOnlyPayroll = new Map<string, number>();
    const iterDate = new Date(Date.UTC(year, 0, 1));
    const stopDate = new Date(todayStr + "T12:00:00Z");
    while (iterDate <= stopDate) {
      const dateStr = iterDate.toISOString().slice(0, 10);
      const dow = iterDate.getUTCDay();
      if (dow !== 0 && dow !== 6 && !byDate.has(dateStr)) {
        const cost = adminDailyRate(dateStr, adminConfig, adminOverrideMap);
        if (cost > 0) {
          adminOnlyPayroll.set(dateStr, cost);
          const weekKey = isoWeekStart(new Date(dateStr + "T12:00:00Z")).toISOString().slice(0, 10);
          byWeekFullPayroll.set(weekKey, (byWeekFullPayroll.get(weekKey) ?? 0) + cost);
        }
      }
      iterDate.setUTCDate(iterDate.getUTCDate() + 1);
    }

    // ── Current & last week ───────────────────────────────────────────────────

    const today  = new Date();
    today.setUTCHours(12, 0, 0, 0);
    const curMon  = isoWeekStart(today);
    const lastMon = addWeeks(curMon, -1);

    const DAY_NAMES = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    function buildWeekDays(mon: Date) {
      return weekDays(mon).map((date, i) => {
        const m         = byDate.get(date);
        const isPast    = date <= todayStr;
        const adminCost = isPast ? (adminOnlyPayroll.get(date) ?? 0) : 0;
        const revenue   = m?.revenue ?? 0;
        const payCost   = (m?.payroll_cost ?? 0) + adminCost;
        return {
          date,
          day:          DAY_NAMES[i],
          revenue,
          payroll_cost: payCost,
          labor_pct:    (m && revenue > 0) ? payCost / revenue : null,
          has_data:     !!m,
        };
      });
    }

    // ── Monthly Jan-Dec ───────────────────────────────────────────────────────

    const monthly = Array.from({ length: 12 }, (_, mi) => {
      const month  = mi + 1;
      const prefix = `${year}-${String(month).padStart(2, "0")}`;
      let revenue = 0, payroll = 0;

      for (const [date, m] of byDate.entries()) {
        if (date.startsWith(prefix)) {
          revenue += m.revenue;
          payroll += m.payroll_cost;
        }
      }
      for (const [date, cost] of adminOnlyPayroll.entries()) {
        if (date.startsWith(prefix)) payroll += cost;
      }

      return {
        month,
        revenue,
        payroll_cost: payroll,
        efficiency_pct: (payroll > 0 && revenue > 0) ? (revenue * 0.39) / payroll : null,
        labor_pct:      (payroll > 0 && revenue > 0) ? payroll / revenue : null,
      };
    });

    return NextResponse.json({
      current_week: buildWeekDays(curMon),
      last_week:    buildWeekDays(lastMon),
      monthly,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
