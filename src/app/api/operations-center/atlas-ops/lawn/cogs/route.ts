import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Admin pay helpers (mirrors dashboard logic) ───────────────────────────────

const MONTH_KEYS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"] as const;

function weekdaysInMonth(year: number, month: number): number {
  const days = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

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

function adminMonthTotal(year: number, month: number, config: any, overrideMap: Map<string, number | null>, cutoff?: string): number {
  const days = new Date(year, month, 0).getDate();
  let total = 0;
  for (let d = 1; d <= days; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (cutoff && dateStr > cutoff) break;
    total += adminDailyRate(dateStr, config, overrideMap);
  }
  return total;
}

// ── GET ?year=2026&division=lawn ──────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const year     = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
    const division = searchParams.get("division") ?? "lawn";

    const yearStart = `${year}-01-01`;
    const yearEnd   = `${year}-12-31`;

    const [
      { data: reports },
      { data: budgets },
      { data: actuals },
      { data: adminConfig },
      { data: adminOverrides },
    ] = await Promise.all([
      sb.from("lawn_production_reports")
        .select("report_date, lawn_production_jobs(lawn_production_members(employee_id, resource_name, earned_amount, payroll_cost))")
        .eq("company_id", company.id)
        .eq("is_complete", true)
        .gte("report_date", yearStart)
        .lte("report_date", yearEnd),
      sb.from("division_budgets")
        .select("month, revenue, labor, job_materials, fuel, equipment")
        .eq("company_id", company.id)
        .eq("division", division)
        .eq("year", year),
      sb.from("division_cogs_actuals")
        .select("month, revenue_override, labor_override, job_materials, fuel_override, equipment")
        .eq("company_id", company.id)
        .eq("division", division)
        .eq("year", year),
      sb.from("lawn_admin_pay_config").select("*").eq("company_id", company.id).eq("year", year).maybeSingle(),
      sb.from("lawn_admin_pay_overrides").select("date, payroll_cost").eq("company_id", company.id)
        .gte("date", yearStart).lte("date", yearEnd),
    ]);

    // Build admin override map
    const adminOverrideMap = new Map<string, number | null>();
    for (const ov of adminOverrides ?? []) {
      adminOverrideMap.set(ov.date as string, ov.payroll_cost != null ? Number(ov.payroll_cost) : null);
    }

    // Aggregate production by month
    const prodByMonth = new Map<number, { revenue: number; labor: number }>();
    for (const r of reports ?? []) {
      const month = parseInt((r.report_date as string).split("-")[1]);
      const entry = prodByMonth.get(month) ?? { revenue: 0, labor: 0 };
      const seenPerson = new Set<string>();
      for (const job of (r as any).lawn_production_jobs ?? []) {
        for (const m of (job as any).lawn_production_members ?? []) {
          entry.revenue += Number(m.earned_amount ?? 0);
          const pk = m.employee_id ?? m.resource_name ?? "";
          if (pk && !seenPerson.has(pk)) {
            seenPerson.add(pk);
            entry.labor += Number(m.payroll_cost ?? 0);
          }
        }
      }
      prodByMonth.set(month, entry);
    }

    // Lookup maps
    const budgetMap  = new Map((budgets  ?? []).map((b: any) => [b.month, b]));
    const actualMap  = new Map((actuals  ?? []).map((a: any) => [a.month, a]));

    // Yesterday's date string (UTC) — admin pay for current month only sums through yesterday
    const todayUTC = new Date();
    const yesterday = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), todayUTC.getUTCDate() - 1));
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    // Build 12-month result
    const result = Array.from({ length: 12 }, (_, i) => {
      const month  = i + 1;
      const prod   = prodByMonth.get(month) ?? { revenue: 0, labor: 0 };
      const budget = budgetMap.get(month)   ?? { revenue: 0, labor: 0, job_materials: 0, fuel: 0, equipment: 0 };
      const ov     = actualMap.get(month)   ?? {};

      // Admin pay: cap at yesterday for current month, full month for past months
      const isCurrentMonth = year === todayUTC.getUTCFullYear() && month === todayUTC.getUTCMonth() + 1;
      const adminPay = adminMonthTotal(year, month, adminConfig, adminOverrideMap, isCurrentMonth ? yesterdayStr : undefined);

      // Actuals — override takes precedence
      const revenue_auto = prod.revenue;
      const labor_auto   = prod.labor + adminPay;
      const revenue      = ov.revenue_override != null ? Number(ov.revenue_override) : revenue_auto;
      const labor        = ov.labor_override   != null ? Number(ov.labor_override)   : labor_auto;

      // Fuel formula: (actual_labor / budget_labor) * budget_fuel
      const bLaborNum  = Number(budget.labor ?? 0);
      const bFuelNum   = Number(budget.fuel  ?? 0);
      const fuel_auto  = bLaborNum > 0 ? (labor / bLaborNum) * bFuelNum : 0;
      const fuel        = ov.fuel_override != null ? Number(ov.fuel_override) : fuel_auto;

      const job_materials = ov.job_materials != null ? Number(ov.job_materials) : 0;
      const equipment     = ov.equipment     != null ? Number(ov.equipment)     : 0;

      const gross_profit = revenue - labor - job_materials - fuel - equipment;
      const margin_pct   = revenue > 0 ? gross_profit / revenue : null;

      return {
        month,
        // Actuals
        revenue, labor, job_materials, fuel, equipment,
        gross_profit, margin_pct,
        // Auto values (for display purposes)
        revenue_auto, labor_auto, fuel_auto,
        // Override flags
        revenue_overridden:  ov.revenue_override != null,
        labor_overridden:    ov.labor_override   != null,
        fuel_overridden:     ov.fuel_override    != null,
        // Budgets
        budget_revenue:       Number(budget.revenue       ?? 0),
        budget_labor:         Number(budget.labor         ?? 0),
        budget_job_materials: Number(budget.job_materials ?? 0),
        budget_fuel:          Number(budget.fuel          ?? 0),
        budget_equipment:     Number(budget.equipment     ?? 0),
      };
    });

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// ── PUT { division, year, month, field, value } ───────────────────────────────
// value = null clears the override (reverts to auto)

export async function PUT(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { division = "lawn", year, month, field, value } = await req.json();
    if (!year || !month || !field) return NextResponse.json({ error: "year, month, field required" }, { status: 400 });

    const ALLOWED = ["revenue_override","labor_override","job_materials","fuel_override","equipment"];
    if (!ALLOWED.includes(field)) return NextResponse.json({ error: "Invalid field" }, { status: 400 });

    // Upsert — only update the specific field
    const { error } = await sb.from("division_cogs_actuals").upsert(
      { company_id: company.id, division, year: Number(year), month: Number(month), [field]: value, updated_at: new Date().toISOString() },
      { onConflict: "company_id,division,year,month" }
    );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
