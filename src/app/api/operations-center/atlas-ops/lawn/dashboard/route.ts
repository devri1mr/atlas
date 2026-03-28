import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
  if (dow === 0 || dow === 6) return 0; // weekend — no cost

  // Date-specific override takes priority
  if (overrideMap.has(dateStr)) {
    const ov = overrideMap.get(dateStr);
    return ov ?? 0;
  }

  if (!config) return 0;

  const monthIndex = d.getUTCMonth();
  const mk = MONTH_KEYS[monthIndex];
  const monthlyRate = config[`${mk}_daily`];

  // Explicit monthly daily rate
  if (monthlyRate != null) return Number(monthlyRate);

  // Auto-compute from annual salaries
  const annualTotal = Number(config.manager_1_annual ?? 0) + Number(config.manager_2_annual ?? 0);
  if (annualTotal <= 0) return 0;

  const wkdays = weekdaysInMonth(d.getUTCFullYear(), monthIndex + 1);
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
    const todayStr  = new Date().toISOString().slice(0, 10);

    // Fetch production reports + admin pay config in parallel
    const [
      { data: reports, error },
      { data: adminConfig },
      { data: adminOverrides },
    ] = await Promise.all([
      sb
        .from("lawn_production_reports")
        .select(`
          id, report_date,
          lawn_production_jobs (
            service,
            lawn_production_members (
              employee_id, resource_name,
              earned_amount, payroll_cost, ot_hours, actual_hours, total_payroll_hours
            )
          )
        `)
        .eq("company_id", company.id)
        .gte("report_date", yearStart)
        .lte("report_date", yearEnd)
        .order("report_date"),
      sb
        .from("lawn_admin_pay_config")
        .select("*")
        .eq("company_id", company.id)
        .eq("year", year)
        .maybeSingle(),
      sb
        .from("lawn_admin_pay_overrides")
        .select("date, payroll_cost")
        .eq("company_id", company.id)
        .gte("date", yearStart)
        .lte("date", yearEnd),
    ]);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Build admin pay override lookup
    const adminOverrideMap = new Map<string, number | null>();
    for (const ov of adminOverrides ?? []) {
      adminOverrideMap.set(ov.date as string, ov.payroll_cost != null ? Number(ov.payroll_cost) : null);
    }

    // ── Aggregate production report data ─────────────────────────────────────

    type DayMetrics = { revenue: number; payroll_cost: number; ot_hrs: number; total_hrs: number };
    const byDate = new Map<string, DayMetrics>();

    type ServiceWeekKey = string;
    type ServiceMetrics = { ot_hrs: number; ot_cost: number; total_hrs: number; total_payroll: number; total_revenue: number; week_label: string; service: string };
    const byServiceWeek = new Map<ServiceWeekKey, ServiceMetrics>();

    for (const r of reports ?? []) {
      const date = r.report_date as string;
      const day: DayMetrics = { revenue: 0, payroll_cost: 0, ot_hrs: 0, total_hrs: 0 };

      const d   = new Date(date + "T12:00:00Z");
      const mon = isoWeekStart(d);
      const sun = new Date(mon);
      sun.setUTCDate(sun.getUTCDate() + 6);
      const weekLabel = `${mon.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} – ${sun.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
      const weekKey   = mon.toISOString().slice(0, 10);

      const seenPerson = new Set<string>();

      for (const job of (r as any).lawn_production_jobs ?? []) {
        const service = (job.service as string) || "Other";
        const swKey: ServiceWeekKey = `${service}||${weekKey}`;

        if (!byServiceWeek.has(swKey)) {
          byServiceWeek.set(swKey, { ot_hrs: 0, ot_cost: 0, total_hrs: 0, total_payroll: 0, total_revenue: 0, week_label: weekLabel, service });
        }
        const sw = byServiceWeek.get(swKey)!;

        for (const m of (job as any).lawn_production_members ?? []) {
          const personKey    = m.employee_id ?? m.resource_name ?? "";
          const jobActualHrs = m.actual_hours ?? 0;
          const dayTotalHrs  = m.total_payroll_hours ?? 0;

          day.revenue      += m.earned_amount ?? 0;
          sw.total_revenue += m.earned_amount ?? 0;
          sw.total_hrs     += jobActualHrs;

          const ratio = dayTotalHrs > 0 && jobActualHrs > 0 ? jobActualHrs / dayTotalHrs : 0;
          sw.ot_hrs += (m.ot_hours ?? 0) * ratio;
          if (m.payroll_cost) {
            sw.total_payroll += m.payroll_cost * ratio;
            sw.ot_cost += (m.ot_hours ?? 0) > 0 ? m.payroll_cost * ratio * ((m.ot_hours ?? 0) / dayTotalHrs) : 0;
          }

          if (personKey && !seenPerson.has(personKey)) {
            seenPerson.add(personKey);
            day.payroll_cost += m.payroll_cost ?? 0;
            day.total_hrs    += dayTotalHrs;
            day.ot_hrs       += m.ot_hours ?? 0;
          }
        }
      }

      byDate.set(date, day);
    }

    // ── Fold admin pay into daily costs (past days only) ──────────────────────
    //
    // For days WITH a production report: add admin pay to that day's payroll_cost.
    // For past weekdays WITHOUT a report: track admin pay separately so it's still
    // counted in monthly / YTD totals even when crew didn't work that day.

    // Add admin pay to days that already have production data
    for (const [date, day] of byDate.entries()) {
      if (date <= todayStr) {
        day.payroll_cost += adminDailyRate(date, adminConfig, adminOverrideMap);
      }
    }

    // Collect admin pay for past weekdays that have NO production report
    // (managers are paid every weekday regardless of crew activity)
    const adminOnlyPayroll = new Map<string, number>(); // date -> admin cost

    const iterDate = new Date(Date.UTC(year, 0, 1));
    const stopDate = new Date(todayStr + "T12:00:00Z");
    while (iterDate <= stopDate) {
      const dateStr = iterDate.toISOString().slice(0, 10);
      const dow = iterDate.getUTCDay();
      if (dow !== 0 && dow !== 6 && !byDate.has(dateStr)) {
        const cost = adminDailyRate(dateStr, adminConfig, adminOverrideMap);
        if (cost > 0) adminOnlyPayroll.set(dateStr, cost);
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
        const m   = byDate.get(date);
        const isPast = date <= todayStr;
        // For week card: include admin pay on production days; show admin-only cost
        // on past weekdays so labor% is never shown without revenue context
        const adminCost = isPast ? (adminOnlyPayroll.get(date) ?? 0) : 0;
        const revenue   = m?.revenue ?? 0;
        const payCost   = (m?.payroll_cost ?? 0) + adminCost;
        return {
          date,
          day: DAY_NAMES[i],
          revenue,
          payroll_cost: payCost,
          // Only show labor% on days where crew actually worked (have revenue)
          labor_pct: (m && revenue > 0) ? payCost / revenue : null,
          has_data: !!m,
        };
      });
    }

    // ── Monthly Jan-Dec ───────────────────────────────────────────────────────

    const monthly = Array.from({ length: 12 }, (_, mi) => {
      const month  = mi + 1;
      const prefix = `${year}-${String(month).padStart(2, "0")}`;
      let revenue = 0, payroll = 0;

      // Days with production reports (already include admin pay for past days)
      for (const [date, m] of byDate.entries()) {
        if (date.startsWith(prefix)) {
          revenue += m.revenue;
          payroll += m.payroll_cost;
        }
      }

      // Admin pay for past weekdays WITHOUT a production report
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

    // ── Service breakdown ─────────────────────────────────────────────────────

    const serviceBreakdown = [...byServiceWeek.entries()]
      .map(([key, v]) => {
        const weekKey = key.split("||")[1];
        return { week_key: weekKey, ...v, labor_pct: v.total_revenue > 0 ? v.total_payroll / v.total_revenue : null };
      })
      .sort((a, b) => b.week_key.localeCompare(a.week_key) || a.service.localeCompare(b.service));

    return NextResponse.json({
      current_week:      buildWeekDays(curMon),
      last_week:         buildWeekDays(lastMon),
      monthly,
      service_breakdown: serviceBreakdown,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
