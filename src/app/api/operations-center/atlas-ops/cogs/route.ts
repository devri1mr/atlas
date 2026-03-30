import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Admin pay helpers (mirrors lawn/cogs route) ────────────────────────────────

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

// ── GET ?year=2026 — aggregated COGS for all show_in_ops divisions ────────────

export async function GET(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
    const yearStart = `${year}-01-01`;
    const yearEnd   = `${year}-12-31`;

    // All active show_in_ops divisions
    const { data: divisions } = await sb
      .from("divisions")
      .select("id, name")
      .eq("active", true)
      .eq("show_in_ops", true);

    if (!divisions?.length) {
      return NextResponse.json(Array.from({ length: 12 }, (_, i) => ({
        month: i + 1, revenue: 0, labor: 0, job_materials: 0, fuel: 0, equipment: 0,
        gross_profit: 0, margin_pct: null,
        revenue_auto: 0, labor_auto: 0, fuel_auto: 0,
        revenue_overridden: false, labor_overridden: false, fuel_overridden: false,
        budget_revenue: 0, budget_labor: 0, budget_job_materials: 0, budget_fuel: 0, budget_equipment: 0,
      })));
    }

    const divisionKeys = divisions.map(d => d.name.toLowerCase());

    const [
      { data: allBudgets },
      { data: allActuals },
      { data: lawnReports },
      { data: adminConfig },
      { data: adminOverrides },
    ] = await Promise.all([
      sb.from("division_budgets")
        .select("division, month, revenue, labor, job_materials, fuel, equipment, subcontractors")
        .eq("company_id", company.id)
        .eq("year", year)
        .in("division", divisionKeys),
      sb.from("division_cogs_actuals")
        .select("division, month, revenue_override, labor_override, job_materials, fuel_override, equipment, subcontractors")
        .eq("company_id", company.id)
        .eq("year", year)
        .in("division", divisionKeys),
      sb.from("lawn_production_reports")
        .select("report_date, lawn_production_jobs(lawn_production_members(employee_id, resource_name, earned_amount, payroll_cost))")
        .eq("company_id", company.id)
        .eq("is_complete", true)
        .gte("report_date", yearStart)
        .lte("report_date", yearEnd),
      sb.from("lawn_admin_pay_config").select("*").eq("company_id", company.id).eq("year", year).maybeSingle(),
      sb.from("lawn_admin_pay_overrides").select("date, payroll_cost")
        .eq("company_id", company.id)
        .gte("date", yearStart).lte("date", yearEnd),
    ]);

    // Per-division budget map: divKey → month → row
    const budgetMap = new Map<string, Map<number, any>>();
    for (const b of allBudgets ?? []) {
      if (!budgetMap.has(b.division)) budgetMap.set(b.division, new Map());
      budgetMap.get(b.division)!.set(b.month, b);
    }

    // Per-division actuals map: divKey → month → row
    const actualsMap = new Map<string, Map<number, any>>();
    for (const a of allActuals ?? []) {
      if (!actualsMap.has(a.division)) actualsMap.set(a.division, new Map());
      actualsMap.get(a.division)!.set(a.month, a);
    }

    // Admin override map
    const adminOverrideMap = new Map<string, number | null>();
    for (const ov of adminOverrides ?? []) {
      adminOverrideMap.set(ov.date as string, ov.payroll_cost != null ? Number(ov.payroll_cost) : null);
    }

    // Lawn production aggregated by month
    const lawnProdByMonth = new Map<number, { revenue: number; labor: number }>();
    for (const r of lawnReports ?? []) {
      const month = parseInt((r.report_date as string).split("-")[1]);
      const entry = lawnProdByMonth.get(month) ?? { revenue: 0, labor: 0 };
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
      lawnProdByMonth.set(month, entry);
    }

    const todayUTC = new Date();
    const yesterday = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), todayUTC.getUTCDate() - 1));
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const hasLawn = divisionKeys.includes("lawn");

    // Build 12-month aggregated result
    const result = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;

      let totalRevenue = 0, totalLabor = 0, totalJobMaterials = 0, totalFuel = 0, totalEquipment = 0, totalSubs = 0;
      let totalBRevenue = 0, totalBLabor = 0, totalBMat = 0, totalBFuel = 0, totalBEquip = 0, totalBSubs = 0;

      for (const div of divisions) {
        const divKey  = div.name.toLowerCase();
        const budget  = budgetMap.get(divKey)?.get(month) ?? {};
        const actuals = actualsMap.get(divKey)?.get(month) ?? {};

        // Budgets — sum all divisions regardless of type
        totalBRevenue += Number(budget.revenue       ?? 0);
        totalBLabor   += Number(budget.labor         ?? 0);
        totalBMat     += Number(budget.job_materials ?? 0);
        totalBFuel    += Number(budget.fuel          ?? 0);
        totalBEquip   += Number(budget.equipment     ?? 0);
        totalBSubs    += Number(budget.subcontractors ?? 0);

        // Actuals
        if (divKey === "lawn" && hasLawn) {
          // Production data + admin pay (same logic as lawn/cogs route)
          const prod = lawnProdByMonth.get(month) ?? { revenue: 0, labor: 0 };
          const isCurrentMonth = year === todayUTC.getUTCFullYear() && month === todayUTC.getUTCMonth() + 1;
          const adminPay = adminMonthTotal(year, month, adminConfig, adminOverrideMap, isCurrentMonth ? yesterdayStr : undefined);

          const revenue_auto = prod.revenue;
          const labor_auto   = prod.labor + adminPay;
          const revenue      = actuals.revenue_override != null ? Number(actuals.revenue_override) : revenue_auto;
          const labor        = actuals.labor_override   != null ? Number(actuals.labor_override)   : labor_auto;

          const bLaborNum  = Number(budget.labor ?? 0);
          const bFuelNum   = Number(budget.fuel  ?? 0);
          const fuel_auto  = bLaborNum > 0 ? (labor / bLaborNum) * bFuelNum : 0;
          const fuel        = actuals.fuel_override != null ? Number(actuals.fuel_override) : fuel_auto;

          totalRevenue       += revenue;
          totalLabor         += labor;
          totalJobMaterials  += actuals.job_materials    != null ? Number(actuals.job_materials)    : 0;
          totalFuel          += fuel;
          totalEquipment     += actuals.equipment        != null ? Number(actuals.equipment)        : 0;
          totalSubs          += actuals.subcontractors   != null ? Number(actuals.subcontractors)   : 0;
        } else {
          // Manual actuals (all non-lawn divisions)
          const revenue = actuals.revenue_override != null ? Number(actuals.revenue_override) : 0;
          const labor   = actuals.labor_override   != null ? Number(actuals.labor_override)   : 0;

          const bLaborNum = Number(budget.labor ?? 0);
          const bFuelNum  = Number(budget.fuel  ?? 0);
          const fuel_auto = bLaborNum > 0 ? (labor / bLaborNum) * bFuelNum : 0;
          const fuel      = actuals.fuel_override != null ? Number(actuals.fuel_override) : fuel_auto;

          totalRevenue      += revenue;
          totalLabor        += labor;
          totalJobMaterials += actuals.job_materials    != null ? Number(actuals.job_materials)    : 0;
          totalFuel         += fuel;
          totalEquipment    += actuals.equipment        != null ? Number(actuals.equipment)        : 0;
          totalSubs         += actuals.subcontractors   != null ? Number(actuals.subcontractors)   : 0;
        }
      }

      const gross_profit = totalRevenue - totalLabor - totalJobMaterials - totalFuel - totalEquipment - totalSubs;
      const margin_pct   = totalRevenue > 0 ? gross_profit / totalRevenue : null;

      return {
        month,
        revenue: totalRevenue, labor: totalLabor, job_materials: totalJobMaterials, fuel: totalFuel, equipment: totalEquipment,
        subcontractors: totalSubs,
        gross_profit, margin_pct,
        revenue_auto: 0, labor_auto: 0, fuel_auto: 0,
        revenue_overridden: false, labor_overridden: false, fuel_overridden: false,
        budget_revenue: totalBRevenue, budget_labor: totalBLabor,
        budget_job_materials: totalBMat, budget_fuel: totalBFuel, budget_equipment: totalBEquip,
        budget_subcontractors: totalBSubs,
      };
    });

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
