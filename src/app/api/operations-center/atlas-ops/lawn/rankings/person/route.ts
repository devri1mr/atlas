import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isoWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function dateRange(period: string): { start: string; end: string } {
  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);

  if (period === "today") {
    const d = today.toISOString().slice(0, 10);
    return { start: d, end: d };
  }
  if (period === "this_week") {
    const mon = isoWeekStart(today);
    const sun = new Date(mon);
    sun.setUTCDate(sun.getUTCDate() + 6);
    return { start: mon.toISOString().slice(0, 10), end: sun.toISOString().slice(0, 10) };
  }
  if (period === "last_week") {
    const mon = isoWeekStart(today);
    mon.setUTCDate(mon.getUTCDate() - 7);
    const sun = new Date(mon);
    sun.setUTCDate(sun.getUTCDate() + 6);
    return { start: mon.toISOString().slice(0, 10), end: sun.toISOString().slice(0, 10) };
  }
  if (period === "this_month") {
    const y = today.getUTCFullYear(), m = today.getUTCMonth() + 1;
    const lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    return { start: `${y}-${String(m).padStart(2, "0")}-01`, end: lastDay };
  }
  // YTD (default)
  const y = today.getUTCFullYear();
  return { start: `${y}-01-01`, end: today.toISOString().slice(0, 10) };
}

export async function GET(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const period       = searchParams.get("period") ?? "ytd";
    const employeeId   = searchParams.get("employee_id");
    const resourceName = searchParams.get("resource_name");

    if (!employeeId && !resourceName) {
      return NextResponse.json({ error: "employee_id or resource_name required" }, { status: 400 });
    }

    const { start, end } = dateRange(period);

    const { data: reports, error } = await sb
      .from("lawn_production_reports")
      .select(`
        id, report_date,
        lawn_production_jobs (
          id, work_order, client_name, service, budgeted_amount,
          lawn_production_members (
            employee_id, resource_name,
            earned_amount, actual_hours, payroll_cost, total_payroll_hours
          )
        )
      `)
      .eq("company_id", company.id)
      .gte("report_date", start)
      .lte("report_date", end);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    type DayRow = {
      date: string;
      jobs: { work_order: string; client_name: string; service: string; earned_amount: number; actual_hours: number }[];
      total_earned: number;
      payroll_cost: number;
      payroll_hours: number;
    };

    const daysMap = new Map<string, DayRow>();

    for (const r of reports ?? []) {
      const date = r.report_date as string;
      let dayPayrollAdded = false;

      for (const job of (r as any).lawn_production_jobs ?? []) {
        for (const m of (job as any).lawn_production_members ?? []) {
          const matchesEmpId = employeeId && String(m.employee_id) === employeeId;
          const matchesName  = !employeeId && resourceName && m.resource_name === resourceName;
          if (!matchesEmpId && !matchesName) continue;

          if (!daysMap.has(date)) {
            daysMap.set(date, { date, jobs: [], total_earned: 0, payroll_cost: 0, payroll_hours: 0 });
          }
          const day = daysMap.get(date)!;

          day.jobs.push({
            work_order:   (job as any).work_order   ?? "—",
            client_name:  (job as any).client_name  ?? "—",
            service:      (job as any).service       ?? "—",
            earned_amount: Number(m.earned_amount ?? 0),
            actual_hours:  Number(m.actual_hours  ?? 0),
          });
          day.total_earned += Number(m.earned_amount ?? 0);

          // payroll_cost and payroll_hours are day-level totals duplicated per job — add once per day
          if (!dayPayrollAdded) {
            day.payroll_cost  += Number(m.payroll_cost         ?? 0);
            day.payroll_hours += Number(m.total_payroll_hours  ?? 0);
            dayPayrollAdded = true;
          }
        }
      }
    }

    const days = [...daysMap.values()].sort((a, b) => b.date.localeCompare(a.date));

    // Totals
    const totals = days.reduce(
      (acc, d) => ({ earned: acc.earned + d.total_earned, cost: acc.cost + d.payroll_cost, hours: acc.hours + d.payroll_hours }),
      { earned: 0, cost: 0, hours: 0 }
    );

    return NextResponse.json({ days, totals, start, end, period });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
