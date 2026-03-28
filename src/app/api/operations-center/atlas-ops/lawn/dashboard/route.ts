import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ISO week helpers (Mon = day 1)
function isoWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day);
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

export async function GET() {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const year = new Date().getUTCFullYear();
    const yearStart = `${year}-01-01`;
    const yearEnd   = `${year}-12-31`;

    // Fetch all production reports for this year with jobs + members
    // actual_hours = per-job hours for this member (correct for service breakdown)
    // total_payroll_hours = member's total for the day (only count once per person per day)
    const { data: reports, error } = await sb
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
      .order("report_date");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Per-report aggregates
    type DayMetrics = { revenue: number; payroll_cost: number; ot_hrs: number; total_hrs: number };
    const byDate = new Map<string, DayMetrics>();
    // Per-service-per-week aggregates
    type ServiceWeekKey = string; // `${service}||${isoWeek}`
    type ServiceMetrics = { ot_hrs: number; ot_cost: number; total_hrs: number; total_payroll: number; total_revenue: number; week_label: string; service: string };
    const byServiceWeek = new Map<ServiceWeekKey, ServiceMetrics>();

    for (const r of reports ?? []) {
      const date = r.report_date as string;
      const day: DayMetrics = { revenue: 0, payroll_cost: 0, ot_hrs: 0, total_hrs: 0 };

      // Compute ISO week label for this date
      const d = new Date(date + "T12:00:00Z");
      const mon = isoWeekStart(d);
      const sun = new Date(mon);
      sun.setUTCDate(sun.getUTCDate() + 6);
      const weekLabel = `${mon.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} – ${sun.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
      const weekKey = mon.toISOString().slice(0, 10); // YYYY-MM-DD of Monday

      // Track per-person deduplication for day-level totals
      const seenPerson = new Set<string>();

      for (const job of (r as any).lawn_production_jobs ?? []) {
        const service = (job.service as string) || "Other";
        const swKey: ServiceWeekKey = `${service}||${weekKey}`;

        if (!byServiceWeek.has(swKey)) {
          byServiceWeek.set(swKey, { ot_hrs: 0, ot_cost: 0, total_hrs: 0, total_payroll: 0, total_revenue: 0, week_label: weekLabel, service });
        }
        const sw = byServiceWeek.get(swKey)!;

        for (const m of (job as any).lawn_production_members ?? []) {
          const personKey = m.employee_id ?? m.resource_name ?? "";

          // Revenue: correctly attributed per job-member row
          day.revenue += m.earned_amount ?? 0;
          sw.total_revenue += m.earned_amount ?? 0;

          // Hours for this service: use actual_hours (per-job), NOT total_payroll_hours (day total)
          const jobActualHrs = m.actual_hours ?? 0;
          const dayTotalHrs  = m.total_payroll_hours ?? 0;
          sw.total_hrs += jobActualHrs;

          // Prorate OT and payroll cost by fraction of day this job represents
          const ratio = (dayTotalHrs > 0 && jobActualHrs > 0) ? jobActualHrs / dayTotalHrs : 0;
          sw.ot_hrs   += (m.ot_hours ?? 0) * ratio;
          if (m.payroll_cost) {
            sw.total_payroll += m.payroll_cost * ratio;
            sw.ot_cost       += (m.ot_hours ?? 0) > 0 ? m.payroll_cost * ratio * ((m.ot_hours ?? 0) / dayTotalHrs) : 0;
          }

          // Day-level totals: deduplicate per person so each person's daily totals count once
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

    // Current & last week
    const today = new Date();
    today.setUTCHours(12, 0, 0, 0);
    const curMon  = isoWeekStart(today);
    const lastMon = addWeeks(curMon, -1);

    const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    function buildWeekDays(mon: Date) {
      return weekDays(mon).map((date, i) => {
        const m = byDate.get(date);
        return {
          date,
          day: DAY_NAMES[i],
          revenue: m?.revenue ?? 0,
          payroll_cost: m?.payroll_cost ?? 0,
          labor_pct: (m && m.revenue > 0) ? m.payroll_cost / m.revenue : null,
          has_data: !!m,
        };
      });
    }

    // Monthly Jan-Dec
    const monthly = Array.from({ length: 12 }, (_, mi) => {
      const month = mi + 1;
      const prefix = `${year}-${String(month).padStart(2, "0")}`;
      let revenue = 0, payroll = 0;
      for (const [date, m] of byDate.entries()) {
        if (date.startsWith(prefix)) {
          revenue += m.revenue;
          payroll += m.payroll_cost;
        }
      }
      return {
        month,
        revenue,
        payroll_cost: payroll,
        efficiency_pct: (payroll > 0 && revenue > 0) ? (revenue * 0.39) / payroll : null,
        labor_pct: (payroll > 0 && revenue > 0) ? payroll / revenue : null,
      };
    });

    // Service breakdown — sorted by week_key desc then service
    const serviceBreakdown = [...byServiceWeek.entries()]
      .map(([key, v]) => {
        const weekKey = key.split("||")[1];
        return { week_key: weekKey, ...v, labor_pct: v.total_revenue > 0 ? v.total_payroll / v.total_revenue : null };
      })
      .sort((a, b) => b.week_key.localeCompare(a.week_key) || a.service.localeCompare(b.service));

    return NextResponse.json({
      current_week: buildWeekDays(curMon),
      last_week:    buildWeekDays(lastMon),
      monthly,
      service_breakdown: serviceBreakdown,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
