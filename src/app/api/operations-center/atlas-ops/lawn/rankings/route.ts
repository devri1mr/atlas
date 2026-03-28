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

const MIN_HOURS = 8;

export async function GET(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") ?? "ytd";
    const { start, end } = dateRange(period);

    // Fetch production reports in range with jobs + members
    const { data: reports, error } = await sb
      .from("lawn_production_reports")
      .select(`
        id, report_date,
        lawn_production_jobs (
          lawn_production_members (
            employee_id, resource_name,
            earned_amount, payroll_cost, total_payroll_hours
          )
        )
      `)
      .eq("company_id", company.id)
      .gte("report_date", start)
      .lte("report_date", end);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Fetch employees for photos + formatted names
    const { data: employees } = await sb
      .from("at_employees")
      .select("id, first_name, last_name, photo_url")
      .eq("company_id", company.id)
      .eq("status", "active");

    const empMap = new Map<string, { first_name: string; last_name: string; photo_url: string | null }>();
    for (const e of employees ?? []) {
      empMap.set(String(e.id), e);
    }

    // Aggregate per person
    // payroll_cost is a per-day total for the person — deduplicate per (report_date, person)
    type PersonAgg = {
      employee_id: string | null;
      resource_name: string;
      total_earned: number;
      payroll_cost: number;
      total_payroll_hours: number;
    };
    const personMap = new Map<string, PersonAgg>();

    for (const r of reports ?? []) {
      const date = r.report_date as string;
      const seenThisReport = new Set<string>();

      for (const job of (r as any).lawn_production_jobs ?? []) {
        for (const m of (job as any).lawn_production_members ?? []) {
          const personKey = m.employee_id ? String(m.employee_id) : (m.resource_name ?? "");
          if (!personKey) continue;

          if (!personMap.has(personKey)) {
            personMap.set(personKey, {
              employee_id: m.employee_id ?? null,
              resource_name: m.resource_name ?? "",
              total_earned: 0,
              payroll_cost: 0,
              total_payroll_hours: 0,
            });
          }

          const p = personMap.get(personKey)!;
          p.total_earned += m.earned_amount ?? 0;

          const dedupeKey = `${date}|${personKey}`;
          if (!seenThisReport.has(dedupeKey)) {
            seenThisReport.add(dedupeKey);
            p.payroll_cost += m.payroll_cost ?? 0;
            p.total_payroll_hours += m.total_payroll_hours ?? 0;
          }
        }
      }
    }

    // Build result, filtering min hours
    const persons = [...personMap.values()]
      .filter(p => p.total_payroll_hours >= MIN_HOURS)
      .map(p => {
        const emp = p.employee_id ? empMap.get(p.employee_id) : null;
        const display_name = emp
          ? `${emp.last_name}, ${emp.first_name}`
          : formatResourceName(p.resource_name);
        const efficiency_pct = p.payroll_cost > 0 ? (p.total_earned * 0.39) / p.payroll_cost : 0;
        const labor_pct = p.total_earned > 0 ? p.payroll_cost / p.total_earned : 0;
        return {
          employee_id: p.employee_id,
          resource_name: p.resource_name,
          display_name,
          photo_url: emp?.photo_url ?? null,
          total_earned: p.total_earned,
          payroll_cost: p.payroll_cost,
          total_payroll_hours: p.total_payroll_hours,
          efficiency_pct,
          labor_pct,
        };
      });

    // Sort: top producers by total_earned desc, most efficient by efficiency_pct desc
    const topProducers = [...persons].sort((a, b) => b.total_earned - a.total_earned);
    const mostEfficient = [...persons]
      .filter(p => p.payroll_cost > 0)
      .sort((a, b) => b.efficiency_pct - a.efficiency_pct);

    return NextResponse.json({ top_producers: topProducers, most_efficient: mostEfficient, period, start, end });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

const NAME_SUFFIX = /^(I{1,3}|IV|VI{0,3}|IX|Jr\.?|Sr\.?)$/i;
function formatResourceName(raw: string): string {
  const parts = raw.trim().split(/\s+/);
  if (parts.length < 2) return raw;
  const hasSuffix = parts.length >= 3 && NAME_SUFFIX.test(parts[parts.length - 1]);
  if (hasSuffix) {
    const suffix = parts[parts.length - 1];
    const last   = parts[parts.length - 2];
    const first  = parts.slice(0, -2).join(" ");
    return `${last}, ${first} ${suffix}`;
  }
  return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(" ")}`;
}
