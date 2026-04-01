import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Constants ──────────────────────────────────────────────────────────────────

const MONTH_KEYS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"] as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

function weekdaysInMonth(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

// Returns the total admin pay budget for a full calendar month (from config rates).
// Used for goal pro-ration — NOT for actual payroll computation.
function monthlyAdminBudget(year: number, month: number, config: Record<string, unknown> | null): number {
  if (!config) return 0;
  const mk = MONTH_KEYS[month - 1];
  const dailyRate = config[`${mk}_daily`];
  if (dailyRate != null) return Number(dailyRate) * weekdaysInMonth(year, month);
  const annualTotal = Number(config.manager_1_annual ?? 0) + Number(config.manager_2_annual ?? 0);
  return annualTotal > 0 ? annualTotal / 12 : 0;
}

function adminDailyRate(
  dateStr: string,
  config: Record<string, unknown> | null,
  overrideMap: Map<string, number | null>
): number {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return 0;

  if (overrideMap.has(dateStr)) {
    const ov = overrideMap.get(dateStr);
    return ov ?? 0;
  }

  if (!config) return 0;

  const monthIndex = d.getUTCMonth();
  const mk = MONTH_KEYS[monthIndex];
  const monthlyRate = config[`${mk}_daily`];

  if (monthlyRate != null) return Number(monthlyRate);

  const annualTotal = Number(config.manager_1_annual ?? 0) + Number(config.manager_2_annual ?? 0);
  if (annualTotal <= 0) return 0;

  const wkdays = weekdaysInMonth(d.getUTCFullYear(), monthIndex + 1);
  return wkdays > 0 ? annualTotal / 12 / wkdays : 0;
}

function safeDiv(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

function fmt1(n: number): string {
  return (n * 100).toFixed(1);
}

// ── Main handler ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const start = searchParams.get("start");
    const end   = searchParams.get("end");

    if (!start || !end) {
      return NextResponse.json({ error: "start and end query params required (YYYY-MM-DD)" }, { status: 400 });
    }

    const sb        = supabaseAdmin();
    const startYear = new Date(start + "T12:00:00Z").getUTCFullYear();
    const endYear   = new Date(end   + "T12:00:00Z").getUTCFullYear();
    const years     = [...new Set([startYear, endYear])];

    // ── Parallel DB fetches ──────────────────────────────────────────────────

    const [
      { data: reports, error: reportsErr },
      { data: adminConfig },
      { data: adminOverrides },
      { data: budgetRows },
    ] = await Promise.all([
      sb
        .from("lawn_production_reports")
        .select(`
          id, report_date,
          lawn_production_jobs (
            work_order, client_name, service, crew_code,
            budgeted_amount, actual_amount, budgeted_hours, actual_hours, variance_hours,
            lawn_production_members (
              resource_name,
              actual_hours, payroll_cost
            )
          )
        `)
        .eq("is_complete", true)
        .gte("report_date", start)
        .lte("report_date", end)
        .order("report_date"),
      sb
        .from("lawn_admin_pay_config")
        .select("*")
        .eq("year", startYear)
        .maybeSingle(),
      sb
        .from("lawn_admin_pay_overrides")
        .select("date, payroll_cost")
        .gte("date", start)
        .lte("date", end),
      sb
        .from("division_budgets")
        .select("year, month, revenue, labor")
        .eq("division", "lawn")
        .in("year", years)
        .order("year").order("month"),
    ]);

    if (reportsErr) {
      return NextResponse.json({ error: reportsErr.message }, { status: 500 });
    }

    const reportList = reports ?? [];

    // ── Punch data (keyed by report_id) ──────────────────────────────────────

    let punches: Array<{ report_id: string; resource_name: string; regular_hours: number; ot_hours: number }> = [];

    if (reportList.length > 0) {
      const reportIds = reportList.map((r: any) => r.id as string);
      const { data: punchData } = await sb
        .from("lawn_report_punches")
        .select("report_id, resource_name, regular_hours, ot_hours")
        .in("report_id", reportIds);

      punches = (punchData ?? []) as typeof punches;
    }

    // ── Build admin override map ──────────────────────────────────────────────

    const adminOverrideMap = new Map<string, number | null>();
    for (const ov of adminOverrides ?? []) {
      adminOverrideMap.set(ov.date as string, ov.payroll_cost != null ? Number(ov.payroll_cost) : null);
    }

    // ── Build budget map: "year-month" → { revenue, labor } ──────────────────

    const budgetMap = new Map<string, { revenue: number; labor: number }>();
    for (const row of budgetRows ?? []) {
      budgetMap.set(`${row.year}-${row.month}`, {
        revenue: Number(row.revenue),
        labor:   Number(row.labor),
      });
    }

    // ── Per-employee aggregation ──────────────────────────────────────────────

    const empOnJob = new Map<string, { hours: number; payroll: number }>();
    const seenPerReport = new Map<string, Set<string>>();

    let totalRevenue         = 0;
    let totalBudgetedRevenue = 0;
    let totalOnJobHours      = 0;
    let totalBudgetedHours   = 0;
    let totalOnJobPayroll    = 0;

    const crewMap = new Map<string, {
      jobs: number;
      budgeted_hours: number;
      actual_hours: number;
      actual_amount: number;
    }>();

    type JobRow = {
      work_order: string | null;
      client_name: string | null;
      service: string | null;
      crew_code: string | null;
      budgeted_hours: number;
      actual_hours: number;
      variance_hours: number;
      actual_amount: number;
      budgeted_amount: number;
    };
    const allJobs: JobRow[] = [];

    for (const report of reportList) {
      const rid = report.id as string;
      if (!seenPerReport.has(rid)) seenPerReport.set(rid, new Set());
      const seenNames = seenPerReport.get(rid)!;

      for (const job of (report as any).lawn_production_jobs ?? []) {
        const budH   = Number(job.budgeted_hours  ?? 0);
        const actH   = Number(job.actual_hours     ?? 0);
        const actAmt = Number(job.actual_amount    ?? 0);
        const budAmt = Number(job.budgeted_amount  ?? 0);
        const varH   = Number(job.variance_hours   ?? 0);
        const crew   = (job.crew_code as string) || "Unknown";

        totalRevenue         += actAmt;
        totalBudgetedRevenue += budAmt;
        totalOnJobHours      += actH;
        totalBudgetedHours   += budH;

        allJobs.push({
          work_order:     job.work_order    ?? null,
          client_name:    job.client_name   ?? null,
          service:        job.service       ?? null,
          crew_code:      job.crew_code     ?? null,
          budgeted_hours:  budH,
          actual_hours:    actH,
          variance_hours:  varH,
          actual_amount:   actAmt,
          budgeted_amount: budAmt,
        });

        if (!crewMap.has(crew)) {
          crewMap.set(crew, { jobs: 0, budgeted_hours: 0, actual_hours: 0, actual_amount: 0 });
        }
        const crewEntry = crewMap.get(crew)!;
        crewEntry.jobs           += 1;
        crewEntry.budgeted_hours += budH;
        crewEntry.actual_hours   += actH;
        crewEntry.actual_amount  += actAmt;

        for (const member of (job as any).lawn_production_members ?? []) {
          const name = (member.resource_name as string) || "Unknown";
          const mHrs = Number(member.actual_hours ?? 0);
          const mPay = Number(member.payroll_cost ?? 0);

          if (!empOnJob.has(name)) empOnJob.set(name, { hours: 0, payroll: 0 });
          empOnJob.get(name)!.hours += mHrs;

          if (!seenNames.has(name)) {
            seenNames.add(name);
            empOnJob.get(name)!.payroll += mPay;
            totalOnJobPayroll           += mPay;
          }
        }
      }
    }

    // ── Punch aggregation ─────────────────────────────────────────────────────

    const empPunches = new Map<string, { regular: number; ot: number }>();

    for (const punch of punches) {
      const name = punch.resource_name || "Unknown";
      if (!empPunches.has(name)) empPunches.set(name, { regular: 0, ot: 0 });
      empPunches.get(name)!.regular += Number(punch.regular_hours ?? 0);
      empPunches.get(name)!.ot     += Number(punch.ot_hours      ?? 0);
    }

    let totalClockedHours = 0;
    let totalOtHours      = 0;
    for (const [, v] of empPunches) {
      totalClockedHours += v.regular + v.ot;
      totalOtHours      += v.ot;
    }

    // ── Per-employee down time ────────────────────────────────────────────────

    let totalDownTimeHours   = 0;
    let totalDownTimePayroll = 0;

    const allEmployees = new Set<string>([...empOnJob.keys(), ...empPunches.keys()]);

    for (const name of allEmployees) {
      const onJob   = empOnJob.get(name)   ?? { hours: 0, payroll: 0 };
      const clocked = empPunches.get(name) ?? { regular: 0, ot: 0 };
      const clockedTotal = clocked.regular + clocked.ot;

      const downTime = Math.max(0, clockedTotal - onJob.hours);
      const avgRate  = onJob.hours > 0 ? onJob.payroll / onJob.hours : 0;
      const downPay  = downTime * avgRate;

      totalDownTimeHours   += downTime;
      totalDownTimePayroll += downPay;
    }

    // ── Admin payroll + pro-rated budget (one pass over days in range) ────────

    let adminPayroll          = 0;
    let proratedBudgetRevenue = 0;
    let proratedBudgetLabor   = 0;
    let proratedBudgetAdmin   = 0; // monthly admin budget pro-rated, for goal calc only
    let daysInRange           = 0;

    const iterDate = new Date(start + "T12:00:00Z");
    const endDate  = new Date(end   + "T12:00:00Z");
    const configData = adminConfig as Record<string, unknown> | null;

    while (iterDate <= endDate) {
      const dateStr   = iterDate.toISOString().slice(0, 10);
      const iterYear  = iterDate.getUTCFullYear();
      const iterMonth = iterDate.getUTCMonth() + 1; // 1-12
      const daysInMo  = new Date(iterYear, iterMonth, 0).getDate();

      daysInRange++;

      // Actual admin pay for this specific day (weekday check + overrides)
      adminPayroll += adminDailyRate(dateStr, configData, adminOverrideMap);

      // Pro-rate this month's budget figures uniformly across calendar days
      const budRow = budgetMap.get(`${iterYear}-${iterMonth}`);
      if (budRow) {
        proratedBudgetRevenue += budRow.revenue / daysInMo;
        proratedBudgetLabor   += budRow.labor   / daysInMo;
      }

      // Pro-rate the full monthly admin budget (not actual) so the goal
      // is consistent regardless of whether the range is 1 day or the full month.
      // e.g. April: $9,290.38 total / 30 days = $309.68/day
      proratedBudgetAdmin += monthlyAdminBudget(iterYear, iterMonth, configData) / daysInMo;

      iterDate.setUTCDate(iterDate.getUTCDate() + 1);
    }

    // ── Totals ────────────────────────────────────────────────────────────────

    const totalFieldPayroll = totalOnJobPayroll + totalDownTimePayroll;
    const totalPayroll      = totalFieldPayroll + adminPayroll;

    // ── Derived ratios ────────────────────────────────────────────────────────

    const fieldLaborPct   = safeDiv(totalFieldPayroll,  totalRevenue);
    const adminBurdenPct  = safeDiv(adminPayroll,        totalRevenue);
    const totalLaborPct   = safeDiv(totalPayroll,        totalRevenue);
    const onJobPct        = safeDiv(totalOnJobHours,    totalClockedHours);
    const downTimePct     = safeDiv(totalDownTimeHours, totalClockedHours);
    const otPct           = safeDiv(totalOtHours,       totalClockedHours);
    const hoursEfficiency = safeDiv(totalBudgetedHours, totalOnJobHours);
    const revenueVsBudget = safeDiv(totalRevenue,       totalBudgetedRevenue);

    // ── Dynamic labor % goals from budget ─────────────────────────────────────
    // total_labor_goal  = prorated_labor / prorated_revenue  (field + admin combined)
    // field_labor_goal  = (prorated_labor - admin_for_period) / prorated_revenue
    //                   = budget labor minus the actual admin cost, over budgeted revenue
    //                     matches how the ~39% baseline was originally derived

    const totalLaborGoal = proratedBudgetRevenue > 0
      ? proratedBudgetLabor / proratedBudgetRevenue
      : null;

    // field_labor_goal uses prorated monthly admin budget (not actual admin pay)
    // so a 1-day range and a full-month range both yield the same % goal
    const fieldLaborGoal = proratedBudgetRevenue > 0
      ? (proratedBudgetLabor - proratedBudgetAdmin) / proratedBudgetRevenue
      : null;

    // ── Crew performance ──────────────────────────────────────────────────────

    const crewPerformance = [...crewMap.entries()]
      .map(([crew_code, v]) => ({
        crew_code,
        jobs:           v.jobs,
        budgeted_hours: v.budgeted_hours,
        actual_hours:   v.actual_hours,
        actual_amount:  v.actual_amount,
        efficiency:     v.actual_hours > 0 ? v.budgeted_hours / v.actual_hours : null,
      }))
      .sort((a, b) => (b.efficiency ?? 0) - (a.efficiency ?? 0));

    // ── Job flags ─────────────────────────────────────────────────────────────
    // variance_pct: (actual − budget) / budget  →  positive = over budget (bad), negative = under (good)

    const jobFlags = allJobs
      .filter(j => j.budgeted_hours >= 0.5 && Math.abs(j.actual_hours - j.budgeted_hours) / j.budgeted_hours >= 0.30)
      .map(j => ({
        work_order:     j.work_order,
        client_name:    j.client_name,
        service:        j.service,
        crew_code:      j.crew_code,
        budgeted_hours: j.budgeted_hours,
        actual_hours:   j.actual_hours,
        variance_pct:   (j.actual_hours - j.budgeted_hours) / j.budgeted_hours,
      }))
      .sort((a, b) => b.variance_pct - a.variance_pct) // worst over-budget first
      .slice(0, 15);

    // ── Auto-findings ─────────────────────────────────────────────────────────

    type Severity = "good" | "watch" | "bad";
    type Finding  = { severity: Severity; category: string; message: string; detail?: string };
    const findings: Finding[] = [];

    // Fallback goals if no budget data
    const effectiveTotalGoal = totalLaborGoal ?? 0.45;
    const effectiveFieldGoal = fieldLaborGoal ?? 0.39;

    // 1. Hours over budget
    if (totalBudgetedHours > 0) {
      const overPct = (totalOnJobHours - totalBudgetedHours) / totalBudgetedHours;
      if (overPct > 0.25) {
        const extra     = totalOnJobHours - totalBudgetedHours;
        const avgRate   = totalOnJobHours > 0 ? totalOnJobPayroll / totalOnJobHours : 0;
        const extraCost = Math.round(extra * avgRate);
        findings.push({
          severity: "bad",
          category: "Hours",
          message: `Crews ran ${fmt1(overPct)}% over budgeted hours`,
          detail: `${extra.toFixed(0)} extra hours ≈ $${extraCost.toLocaleString()} in unrecovered payroll`,
        });
      } else if (overPct > 0.10) {
        findings.push({
          severity: "watch",
          category: "Hours",
          message: `Hours ran ${fmt1(overPct)}% over budget — monitor crew pacing`,
        });
      } else if (overPct <= 0.02) {
        findings.push({
          severity: "good",
          category: "Hours",
          message: "Hours on budget — crews matched estimates",
        });
      }
    }

    // 2. Field labor % vs dynamic goal
    if (fieldLaborPct !== null) {
      const goalPct = fmt1(effectiveFieldGoal);
      if (fieldLaborPct > effectiveFieldGoal * 1.12) {
        findings.push({
          severity: "bad",
          category: "Labor %",
          message: `Field labor at ${fmt1(fieldLaborPct)}% — critically above ${goalPct}% target`,
        });
      } else if (fieldLaborPct > effectiveFieldGoal * 1.05) {
        findings.push({
          severity: "watch",
          category: "Labor %",
          message: `Field labor at ${fmt1(fieldLaborPct)}% — above ${goalPct}% target`,
        });
      } else if (fieldLaborPct <= effectiveFieldGoal * 0.95) {
        findings.push({
          severity: "good",
          category: "Labor %",
          message: `Field labor strong at ${fmt1(fieldLaborPct)}% — under ${goalPct}% target`,
        });
      }
    }

    // 3. Down time
    if (downTimePct !== null) {
      if (downTimePct > 0.18) {
        const avgRate = totalClockedHours > 0 ? totalFieldPayroll / totalClockedHours : 0;
        findings.push({
          severity: "bad",
          category: "Down Time",
          message: `Down time at ${fmt1(downTimePct)}% of clock hours — review routing & scheduling`,
          detail: `${totalDownTimeHours.toFixed(0)} hrs @ ~$${avgRate.toFixed(2)}/hr ≈ $${Math.round(totalDownTimePayroll).toLocaleString()} burdened cost`,
        });
      } else if (downTimePct > 0.12) {
        findings.push({
          severity: "watch",
          category: "Down Time",
          message: `Down time at ${fmt1(downTimePct)}% — monitor for trends`,
        });
      } else if (downTimePct <= 0.10) {
        findings.push({
          severity: "good",
          category: "Down Time",
          message: `Down time at ${fmt1(downTimePct)}% — crews efficiently deployed`,
        });
      }
    }

    // 4. OT
    if (otPct !== null && otPct > 0.10) {
      if (otPct > 0.18) {
        findings.push({
          severity: "bad",
          category: "OT",
          message: `OT at ${fmt1(otPct)}% of hours — crew scheduling needs review`,
        });
      } else {
        findings.push({
          severity: "watch",
          category: "OT",
          message: `OT at ${fmt1(otPct)}% of hours — worth monitoring`,
        });
      }
    }

    // 5. Revenue vs budget
    if (revenueVsBudget !== null) {
      if (revenueVsBudget >= 0.98) {
        findings.push({
          severity: "good",
          category: "Revenue",
          message: `Revenue on target — actual matched budget within ${fmt1(1 - revenueVsBudget)}%`,
        });
      } else if (revenueVsBudget < 0.92) {
        findings.push({
          severity: "watch",
          category: "Revenue",
          message: `Revenue came in ${fmt1(1 - revenueVsBudget)}% below budget`,
        });
      }
    }

    // 6. Admin burden context (if high relative to total goal)
    if (adminBurdenPct !== null && totalLaborGoal !== null) {
      const adminShare = adminBurdenPct / totalLaborGoal;
      if (adminShare > 0.30) {
        findings.push({
          severity: "watch",
          category: "Admin",
          message: `Admin pay is ${fmt1(adminBurdenPct)}% of revenue — ${(adminShare * 100).toFixed(0)}% of your total labor budget`,
        });
      }
    }

    // ── Response ──────────────────────────────────────────────────────────────

    return NextResponse.json({
      scorecard: {
        revenue:               totalRevenue,
        budgeted_revenue:      totalBudgetedRevenue,
        total_payroll:         totalPayroll,
        field_payroll:         totalFieldPayroll,
        on_job_payroll:        totalOnJobPayroll,
        down_time_payroll:     totalDownTimePayroll,
        admin_payroll:         adminPayroll,
        field_labor_pct:       fieldLaborPct,
        admin_burden_pct:      adminBurdenPct,
        total_labor_pct:       totalLaborPct,
        on_job_pct:            onJobPct,
        down_time_pct:         downTimePct,
        ot_pct:                otPct,
        hours_efficiency:      hoursEfficiency,
        revenue_vs_budget:     revenueVsBudget,
        total_clocked_hours:   totalClockedHours,
        total_on_job_hours:    totalOnJobHours,
        total_down_time_hours: totalDownTimeHours,
        total_ot_hours:        totalOtHours,
        days_in_range:         daysInRange,
        reports_count:         reportList.length,
        // Dynamic goals derived from lawn budget for this period
        field_labor_goal:        fieldLaborGoal,
        total_labor_goal:        totalLaborGoal,
        prorated_budget_revenue: proratedBudgetRevenue,
        prorated_budget_labor:   proratedBudgetLabor,
        prorated_budget_admin:   proratedBudgetAdmin,
      },
      findings,
      crew_performance: crewPerformance,
      job_flags:        jobFlags,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
