import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Date range resolution ─────────────────────────────────────────────────────

function isoWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function resolveDateRange(config: Record<string, any>): { start: string; end: string } {
  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  const range = config.date_range ?? "last_week";

  if (range === "last_week") {
    const mon = isoWeekStart(today);
    mon.setUTCDate(mon.getUTCDate() - 7);
    const sun = new Date(mon);
    sun.setUTCDate(sun.getUTCDate() + 6);
    return { start: mon.toISOString().slice(0, 10), end: sun.toISOString().slice(0, 10) };
  }
  if (range === "this_week") {
    const mon = isoWeekStart(today);
    const sun = new Date(mon);
    sun.setUTCDate(sun.getUTCDate() + 6);
    return { start: mon.toISOString().slice(0, 10), end: sun.toISOString().slice(0, 10) };
  }
  if (range === "this_month") {
    const y = today.getUTCFullYear(), m = today.getUTCMonth() + 1;
    const lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    return { start: `${y}-${String(m).padStart(2, "0")}-01`, end: lastDay };
  }
  if (range === "last_month") {
    const y = today.getUTCFullYear();
    const m = today.getUTCMonth(); // 0-indexed current month, so this is last month (1-indexed)
    const firstDay = `${m === 0 ? y - 1 : y}-${String(m === 0 ? 12 : m).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    return { start: firstDay, end: lastDay };
  }
  if (range === "ytd") {
    const y = today.getUTCFullYear();
    return { start: `${y}-01-01`, end: todayStr };
  }
  if (range === "custom") {
    return {
      start: config.custom_start ?? todayStr,
      end: config.custom_end ?? todayStr,
    };
  }
  // Default: last_week
  const mon = isoWeekStart(today);
  mon.setUTCDate(mon.getUTCDate() - 7);
  const sun = new Date(mon);
  sun.setUTCDate(sun.getUTCDate() + 6);
  return { start: mon.toISOString().slice(0, 10), end: sun.toISOString().slice(0, 10) };
}

// ── Pay rate resolution helpers ───────────────────────────────────────────────

type PayRateRow = {
  employee_id: string;
  rate: number;
  effective_date: string;
  end_date: string | null;
  is_default: boolean;
};

function resolvePayRate(
  empId: string,
  endDate: string,
  payRates: PayRateRow[],
  defaultRateMap: Map<string, number>
): number {
  const empRates = payRates
    .filter((r) => r.employee_id === empId && r.effective_date <= endDate)
    .sort((a, b) => {
      // Sort by effective_date desc, prefer is_default
      if (b.effective_date !== a.effective_date)
        return b.effective_date.localeCompare(a.effective_date);
      return (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0);
    });

  // Prefer is_default among those effective
  const defaultRate = empRates.find((r) => r.is_default);
  if (defaultRate) return defaultRate.rate;
  if (empRates.length > 0) return empRates[0].rate;

  // Fallback: at_employees.default_pay_rate
  return defaultRateMap.get(empId) ?? 0;
}

const PAYROLL_BURDEN = 1.15; // matches import logic

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { widget_type, config = {} } = await req.json();
    if (!widget_type) return NextResponse.json({ error: "widget_type required" }, { status: 400 });

    const { start, end } = resolveDateRange(config);

    // ── stat_card ─────────────────────────────────────────────────────────────
    if (widget_type === "stat_card") {
      const metric = config.metric ?? "total_revenue";
      let value: number | null = null;

      if (metric === "total_revenue") {
        const { data: reports } = await sb
          .from("lawn_production_reports")
          .select("lawn_production_jobs(lawn_production_members(earned_amount))")
          .eq("company_id", company.id)
          .eq("is_complete", true)
          .gte("report_date", start)
          .lte("report_date", end);

        let total = 0;
        for (const r of reports ?? []) {
          for (const j of (r as any).lawn_production_jobs ?? []) {
            for (const m of (j as any).lawn_production_members ?? []) {
              total += Number(m.earned_amount ?? 0);
            }
          }
        }
        value = total;
      }

      else if (metric === "ot_hours") {
        const { data: punches } = await sb
          .from("at_punches")
          .select("ot_hours")
          .eq("company_id", company.id)
          .gte("date_for_payroll", start)
          .lte("date_for_payroll", end)
          .not("clock_out_at", "is", null);

        value = (punches ?? []).reduce((s, p) => s + Number(p.ot_hours ?? 0), 0);
      }

      else if (metric === "ot_cost") {
        const { data: punches } = await sb
          .from("at_punches")
          .select("employee_id, ot_hours")
          .eq("company_id", company.id)
          .gte("date_for_payroll", start)
          .lte("date_for_payroll", end)
          .not("clock_out_at", "is", null);

        const empIds = [...new Set((punches ?? []).map((p) => p.employee_id).filter(Boolean))];
        const [{ data: payRates }, { data: employees }, { data: atSettings }] = await Promise.all([
          empIds.length > 0
            ? sb.from("at_pay_rates").select("employee_id, rate, effective_date, end_date, is_default").in("employee_id", empIds)
            : Promise.resolve({ data: [] }),
          empIds.length > 0
            ? sb.from("at_employees").select("id, default_pay_rate").in("id", empIds)
            : Promise.resolve({ data: [] }),
          sb.from("at_settings").select("ot_multiplier, dt_multiplier").eq("company_id", company.id).maybeSingle(),
        ]);

        const otMult = (atSettings as any)?.ot_multiplier ?? 1.5;
        const defaultRateMap = new Map<string, number>(
          (employees ?? []).map((e: any) => [e.id, Number(e.default_pay_rate ?? 0)])
        );

        let total = 0;
        for (const p of punches ?? []) {
          if (!p.employee_id) continue;
          const rate = resolvePayRate(p.employee_id, end, (payRates ?? []) as PayRateRow[], defaultRateMap);
          total += Number(p.ot_hours ?? 0) * rate * otMult * PAYROLL_BURDEN;
        }
        value = total;
      }

      else if (metric === "reg_hours") {
        const { data: punches } = await sb
          .from("at_punches")
          .select("regular_hours")
          .eq("company_id", company.id)
          .gte("date_for_payroll", start)
          .lte("date_for_payroll", end)
          .not("clock_out_at", "is", null);

        value = (punches ?? []).reduce((s, p) => s + Number((p as any).regular_hours ?? 0), 0);
      }

      else if (metric === "total_pay_hours") {
        const { data: punches } = await sb
          .from("at_punches")
          .select("regular_hours, ot_hours, dt_hours")
          .eq("company_id", company.id)
          .gte("date_for_payroll", start)
          .lte("date_for_payroll", end)
          .not("clock_out_at", "is", null);

        value = (punches ?? []).reduce(
          (s, p) =>
            s +
            Number((p as any).regular_hours ?? 0) +
            Number((p as any).ot_hours ?? 0) +
            Number((p as any).dt_hours ?? 0),
          0
        );
      }

      else if (metric === "total_payroll" || metric === "labor_pct") {
        const { data: punches } = await sb
          .from("at_punches")
          .select("employee_id, regular_hours, ot_hours, dt_hours")
          .eq("company_id", company.id)
          .gte("date_for_payroll", start)
          .lte("date_for_payroll", end)
          .not("clock_out_at", "is", null);

        const empIds = [...new Set((punches ?? []).map((p) => p.employee_id).filter(Boolean))];
        const [{ data: payRates }, { data: employees }, { data: atSettings }] = await Promise.all([
          empIds.length > 0
            ? sb.from("at_pay_rates").select("employee_id, rate, effective_date, end_date, is_default").in("employee_id", empIds)
            : Promise.resolve({ data: [] }),
          empIds.length > 0
            ? sb.from("at_employees").select("id, default_pay_rate").in("id", empIds)
            : Promise.resolve({ data: [] }),
          sb.from("at_settings").select("ot_multiplier, dt_multiplier").eq("company_id", company.id).maybeSingle(),
        ]);

        const otMult = (atSettings as any)?.ot_multiplier ?? 1.5;
        const dtMult = (atSettings as any)?.dt_multiplier ?? 2.0;
        const defaultRateMap = new Map<string, number>(
          (employees ?? []).map((e: any) => [e.id, Number(e.default_pay_rate ?? 0)])
        );

        let totalPayroll = 0;
        for (const p of punches ?? []) {
          if (!p.employee_id) continue;
          const rate = resolvePayRate(p.employee_id, end, (payRates ?? []) as PayRateRow[], defaultRateMap);
          const reg = Number((p as any).regular_hours ?? 0);
          const ot = Number((p as any).ot_hours ?? 0);
          const dt = Number((p as any).dt_hours ?? 0);
          totalPayroll += (reg * rate + ot * rate * otMult + dt * rate * dtMult) * PAYROLL_BURDEN;
        }

        if (metric === "total_payroll") {
          value = totalPayroll;
        } else {
          // labor_pct: need revenue too
          const { data: reports } = await sb
            .from("lawn_production_reports")
            .select("lawn_production_jobs(lawn_production_members(earned_amount))")
            .eq("company_id", company.id)
            .eq("is_complete", true)
            .gte("report_date", start)
            .lte("report_date", end);

          let totalRevenue = 0;
          for (const r of reports ?? []) {
            for (const j of (r as any).lawn_production_jobs ?? []) {
              for (const m of (j as any).lawn_production_members ?? []) {
                totalRevenue += Number(m.earned_amount ?? 0);
              }
            }
          }
          value = totalRevenue > 0 ? totalPayroll / totalRevenue : null;
        }
      }

      else if (metric === "efficiency_pct") {
        const { data: reports } = await sb
          .from("lawn_production_reports")
          .select("lawn_production_jobs(budgeted_hours, actual_hours)")
          .eq("company_id", company.id)
          .eq("is_complete", true)
          .gte("report_date", start)
          .lte("report_date", end);

        let totalBudgeted = 0;
        let totalActual = 0;
        for (const r of reports ?? []) {
          for (const j of (r as any).lawn_production_jobs ?? []) {
            totalBudgeted += Number(j.budgeted_hours ?? 0);
            totalActual += Number(j.actual_hours ?? 0);
          }
        }
        value = totalActual > 0 ? totalBudgeted / totalActual : null;
      }

      else if (metric === "job_count") {
        const { data: reports } = await sb
          .from("lawn_production_reports")
          .select("lawn_production_jobs(id)")
          .eq("company_id", company.id)
          .eq("is_complete", true)
          .gte("report_date", start)
          .lte("report_date", end);

        let count = 0;
        for (const r of reports ?? []) {
          count += ((r as any).lawn_production_jobs ?? []).length;
        }
        value = count;
      }

      else if (metric === "budgeted_hours") {
        const { data: reports } = await sb
          .from("lawn_production_reports")
          .select("lawn_production_jobs(budgeted_hours)")
          .eq("company_id", company.id)
          .eq("is_complete", true)
          .gte("report_date", start)
          .lte("report_date", end);

        let total = 0;
        for (const r of reports ?? []) {
          for (const j of (r as any).lawn_production_jobs ?? []) {
            total += Number(j.budgeted_hours ?? 0);
          }
        }
        value = total;
      }

      else if (metric === "actual_hours") {
        const { data: reports } = await sb
          .from("lawn_production_reports")
          .select("lawn_production_jobs(actual_hours)")
          .eq("company_id", company.id)
          .eq("is_complete", true)
          .gte("report_date", start)
          .lte("report_date", end);

        let total = 0;
        for (const r of reports ?? []) {
          for (const j of (r as any).lawn_production_jobs ?? []) {
            total += Number(j.actual_hours ?? 0);
          }
        }
        value = total;
      }

      else if (metric === "team_members") {
        const { data: punches } = await sb
          .from("at_punches")
          .select("employee_id")
          .eq("company_id", company.id)
          .gte("date_for_payroll", start)
          .lte("date_for_payroll", end)
          .not("clock_out_at", "is", null)
          .not("employee_id", "is", null);

        const distinct = new Set((punches ?? []).map((p) => p.employee_id));
        value = distinct.size;
      }

      return NextResponse.json({ value, start, end });
    }

    // ── job_table ─────────────────────────────────────────────────────────────
    if (widget_type === "job_table") {
      const serviceFilter: string[] = config.service_filter
        ? config.service_filter
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean)
        : [];

      const { data: reports } = await sb
        .from("lawn_production_reports")
        .select(`
          report_date,
          lawn_production_jobs (
            id, client_name, service, crew_code, budgeted_hours, actual_hours,
            lawn_production_members (
              employee_id, resource_name, earned_amount, payroll_cost
            )
          )
        `)
        .eq("company_id", company.id)
        .eq("is_complete", true)
        .gte("report_date", start)
        .lte("report_date", end)
        .order("report_date", { ascending: true });

      type JobRow = {
        date: string;
        client_name: string;
        service: string;
        crew_code: string;
        budgeted_hours: number;
        actual_hours: number;
        revenue: number;
        payroll_cost: number;
        labor_pct: number | null;
        efficiency_pct: number | null;
      };

      const rows: JobRow[] = [];

      for (const r of reports ?? []) {
        const date = r.report_date as string;
        for (const j of (r as any).lawn_production_jobs ?? []) {
          // Apply service filter
          if (serviceFilter.length > 0) {
            const svc = (j.service ?? "").toLowerCase();
            if (!serviceFilter.some((f) => svc.includes(f.toLowerCase()))) continue;
          }

          let revenue = 0;
          let payrollCost = 0;
          const seenPerson = new Set<string>();

          for (const m of (j as any).lawn_production_members ?? []) {
            revenue += Number(m.earned_amount ?? 0);
            const pk = m.employee_id ?? m.resource_name ?? "";
            if (pk && !seenPerson.has(pk)) {
              seenPerson.add(pk);
              payrollCost += Number(m.payroll_cost ?? 0);
            }
          }

          const budHrs = Number(j.budgeted_hours ?? 0);
          const actHrs = Number(j.actual_hours ?? 0);

          rows.push({
            date,
            client_name: j.client_name ?? "",
            service: j.service ?? "",
            crew_code: j.crew_code ?? "",
            budgeted_hours: budHrs,
            actual_hours: actHrs,
            revenue,
            payroll_cost: payrollCost,
            labor_pct: revenue > 0 ? payrollCost / revenue : null,
            efficiency_pct: actHrs > 0 ? budHrs / actHrs : null,
          });
        }
      }

      // Sort by date asc, then client_name
      rows.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.client_name.localeCompare(b.client_name);
      });

      const ALL_COLUMNS = ["date", "client_name", "service", "crew_code", "budgeted_hours", "actual_hours", "revenue", "payroll_cost", "labor_pct", "efficiency_pct"];
      const columns: string[] = Array.isArray(config.columns) && config.columns.length > 0
        ? config.columns
        : ALL_COLUMNS;

      return NextResponse.json({ rows, columns, start, end });
    }

    // ── member_table ──────────────────────────────────────────────────────────
    if (widget_type === "member_table") {
      const { data: punches } = await sb
        .from("at_punches")
        .select(`
          employee_id, regular_hours, ot_hours, dt_hours,
          at_employees!employee_id (first_name, last_name)
        `)
        .eq("company_id", company.id)
        .gte("date_for_payroll", start)
        .lte("date_for_payroll", end)
        .not("clock_out_at", "is", null)
        .not("employee_id", "is", null);

      const empIds = [...new Set((punches ?? []).map((p: any) => p.employee_id).filter(Boolean))];

      const [{ data: payRates }, { data: employees }, { data: atSettings }] = await Promise.all([
        empIds.length > 0
          ? sb.from("at_pay_rates").select("employee_id, rate, effective_date, end_date, is_default").in("employee_id", empIds)
          : Promise.resolve({ data: [] }),
        empIds.length > 0
          ? sb.from("at_employees").select("id, default_pay_rate").in("id", empIds)
          : Promise.resolve({ data: [] }),
        sb.from("at_settings").select("ot_multiplier, dt_multiplier").eq("company_id", company.id).maybeSingle(),
      ]);

      const otMult = (atSettings as any)?.ot_multiplier ?? 1.5;
      const dtMult = (atSettings as any)?.dt_multiplier ?? 2.0;
      const defaultRateMap = new Map<string, number>(
        (employees ?? []).map((e: any) => [e.id, Number(e.default_pay_rate ?? 0)])
      );

      type MemberAgg = {
        employee_id: string;
        name: string;
        reg_hours: number;
        ot_hours: number;
        dt_hours: number;
        total_pay_hours: number;
        ot_cost: number;
        total_payroll: number;
      };

      const memberMap = new Map<string, MemberAgg>();

      for (const p of punches ?? []) {
        const empId = (p as any).employee_id;
        if (!empId) continue;

        const emp = (p as any).at_employees;
        const name = emp
          ? `${emp.last_name ?? ""}, ${emp.first_name ?? ""}`.trim().replace(/^,\s*/, "")
          : empId;

        const reg = Number((p as any).regular_hours ?? 0);
        const ot = Number((p as any).ot_hours ?? 0);
        const dt = Number((p as any).dt_hours ?? 0);
        const rate = resolvePayRate(empId, end, (payRates ?? []) as PayRateRow[], defaultRateMap);
        const otCost = ot * rate * otMult * PAYROLL_BURDEN;
        const punchPayroll = (reg * rate + ot * rate * otMult + dt * rate * dtMult) * PAYROLL_BURDEN;

        const cur = memberMap.get(empId) ?? {
          employee_id: empId,
          name,
          reg_hours: 0,
          ot_hours: 0,
          dt_hours: 0,
          total_pay_hours: 0,
          ot_cost: 0,
          total_payroll: 0,
        };
        cur.reg_hours += reg;
        cur.ot_hours += ot;
        cur.dt_hours += dt;
        cur.total_pay_hours += reg + ot + dt;
        cur.ot_cost += otCost;
        cur.total_payroll += punchPayroll;
        memberMap.set(empId, cur);
      }

      const rows = [...memberMap.values()].sort((a, b) => a.name.localeCompare(b.name));

      const ALL_COLUMNS = ["name", "reg_hours", "ot_hours", "dt_hours", "total_pay_hours", "ot_cost", "total_payroll"];
      const columns: string[] = Array.isArray(config.columns) && config.columns.length > 0
        ? config.columns
        : ALL_COLUMNS;

      return NextResponse.json({ rows, columns, start, end });
    }

    // ── section_header — no data needed ──────────────────────────────────────
    if (widget_type === "section_header") {
      return NextResponse.json({ start, end });
    }

    return NextResponse.json({ error: `Unknown widget_type: ${widget_type}` }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
