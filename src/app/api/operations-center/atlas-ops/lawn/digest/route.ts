import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONTH_KEYS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"] as const;

function weekdaysInMonth(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

function monthlyAdminBudget(year: number, month: number, config: Record<string, unknown> | null): number {
  if (!config) return 0;
  const mk = MONTH_KEYS[month - 1];
  const dailyRate = config[`${mk}_daily`];
  if (dailyRate != null) return Number(dailyRate) * weekdaysInMonth(year, month);
  const annualTotal = Number(config.manager_1_annual ?? 0) + Number(config.manager_2_annual ?? 0);
  return annualTotal > 0 ? annualTotal / 12 : 0;
}

function adminDailyRate(dateStr: string, config: Record<string, unknown> | null, overrideMap: Map<string, number | null>): number {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return 0;
  if (overrideMap.has(dateStr)) { const ov = overrideMap.get(dateStr); return ov ?? 0; }
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

function safeDiv(a: number, b: number): number | null { return b > 0 ? a / b : null; }
function fmt1(n: number): string { return (n * 100).toFixed(1); }

// ── OT-attributed per-job cost ────────────────────────────────────────────────
// Given a job's time window and the person's OT threshold (clock_in + reg_hours),
// compute exact cost split between regular and OT rates.
function otAttributedCost(
  jobStartMs: number,
  jobEndMs: number,
  otThresholdMs: number,
  regRate: number,  // pay_rate × burden
  otRate: number,   // pay_rate × 1.5 × burden
): number {
  if (jobEndMs <= jobStartMs) return 0;
  if (otThresholdMs <= jobStartMs) {
    // Entire window is OT
    return ((jobEndMs - jobStartMs) / 3600000) * otRate;
  }
  if (otThresholdMs >= jobEndMs) {
    // Entire window is regular
    return ((jobEndMs - jobStartMs) / 3600000) * regRate;
  }
  // Window spans the threshold
  const regHrs = (otThresholdMs - jobStartMs) / 3600000;
  const otHrs  = (jobEndMs - otThresholdMs) / 3600000;
  return regHrs * regRate + otHrs * otRate;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const start = searchParams.get("start");
    const end   = searchParams.get("end");
    if (!start || !end) return NextResponse.json({ error: "start and end required" }, { status: 400 });

    const sb        = supabaseAdmin();
    const startYear = new Date(start + "T12:00:00Z").getUTCFullYear();
    const endYear   = new Date(end   + "T12:00:00Z").getUTCFullYear();
    const years     = [...new Set([startYear, endYear])];

    const [
      { data: reports, error: reportsErr },
      { data: adminConfig },
      { data: adminOverrides },
      { data: budgetRows },
      { data: dispatchJobsRaw },
    ] = await Promise.all([
      sb.from("lawn_production_reports")
        .select(`id, report_date,
          lawn_production_jobs (
            id, work_order, client_name, service, crew_code,
            budgeted_hours, actual_hours, variance_hours,
            budgeted_amount,
            lawn_production_members (
              resource_name, actual_hours, earned_amount,
              total_payroll_hours, payroll_cost,
              pay_rate, reg_hours, ot_hours
            )
          )`)
        .eq("is_complete", true)
        .gte("report_date", start).lte("report_date", end)
        .order("report_date"),
      sb.from("lawn_admin_pay_config").select("*").eq("year", startYear).maybeSingle(),
      sb.from("lawn_admin_pay_overrides").select("date, payroll_cost").gte("date", start).lte("date", end),
      sb.from("division_budgets").select("year, month, revenue, labor")
        .eq("division", "lawn").in("year", years).order("year").order("month"),
      sb.from("lawn_dispatch_jobs")
        .select("id, work_order, report_date, start_time, end_time, time_varies")
        .gte("report_date", start).lte("report_date", end),
    ]);

    if (reportsErr) return NextResponse.json({ error: reportsErr.message }, { status: 500 });

    const reportList  = reports ?? [];
    const configData  = adminConfig as Record<string, unknown> | null;
    const dispatchJobs = (dispatchJobsRaw ?? []) as Array<{
      id: string; work_order: string; report_date: string;
      start_time: string | null; end_time: string | null; time_varies: boolean;
    }>;

    // Fetch punches + dispatch job times in parallel
    const reportIds      = reportList.map((r: any) => r.id as string);
    const dispatchJobIds = dispatchJobs.map(dj => dj.id);

    type PunchRow = { report_id: string; resource_name: string; clock_in_at: string; regular_hours: number; ot_hours: number };
    type DjtRow   = { dispatch_job_id: string; resource_name: string; start_time: string; end_time: string };

    let punches: PunchRow[]  = [];
    let djtRows: DjtRow[]    = [];

    await Promise.all([
      reportIds.length > 0
        ? sb.from("lawn_report_punches")
            .select("report_id, resource_name, clock_in_at, regular_hours, ot_hours")
            .in("report_id", reportIds)
            .then(({ data }) => { punches = (data ?? []) as PunchRow[]; })
        : Promise.resolve(),
      dispatchJobIds.length > 0
        ? sb.from("lawn_dispatch_job_times")
            .select("dispatch_job_id, resource_name, start_time, end_time")
            .in("dispatch_job_id", dispatchJobIds)
            .then(({ data }) => { djtRows = (data ?? []) as DjtRow[]; })
        : Promise.resolve(),
    ]);

    // ── Admin override map ────────────────────────────────────────────────────
    const adminOverrideMap = new Map<string, number | null>();
    for (const ov of adminOverrides ?? []) {
      adminOverrideMap.set(ov.date as string, ov.payroll_cost != null ? Number(ov.payroll_cost) : null);
    }

    // ── Budget map ────────────────────────────────────────────────────────────
    const budgetMap = new Map<string, { revenue: number; labor: number }>();
    for (const row of budgetRows ?? []) {
      budgetMap.set(`${row.year}-${row.month}`, { revenue: Number(row.revenue), labor: Number(row.labor) });
    }

    // ── Report date map ───────────────────────────────────────────────────────
    const reportDateMap = new Map<string, string>(); // report_id → report_date
    for (const r of reportList) {
      reportDateMap.set(r.id as string, r.report_date as string);
    }

    // ── Punch lookup: report_id::name → { clock_in_ms, ot_threshold_ms } ─────
    type PunchInfo = { clock_in_ms: number; ot_threshold_ms: number };
    const punchLookup = new Map<string, PunchInfo>();
    for (const p of punches) {
      const key       = `${p.report_id}::${p.resource_name}`;
      const clockInMs = new Date(p.clock_in_at).getTime();
      punchLookup.set(key, {
        clock_in_ms:     clockInMs,
        ot_threshold_ms: clockInMs + Number(p.regular_hours) * 3600000,
      });
    }

    // ── Dispatch job map: work_order::report_date → job-level time window ─────
    type DispatchWindow = { start_ms: number; end_ms: number };
    const dispatchJobMap   = new Map<string, { window: DispatchWindow | null; time_varies: boolean }>();
    const dispatchIdToKey  = new Map<string, string>(); // dispatch_job_id → work_order::report_date

    for (const dj of dispatchJobs) {
      const key = `${dj.work_order}::${dj.report_date}`;
      if (!dispatchJobMap.has(key)) {
        const window = (dj.start_time && dj.end_time)
          ? { start_ms: new Date(dj.start_time).getTime(), end_ms: new Date(dj.end_time).getTime() }
          : null;
        dispatchJobMap.set(key, { window, time_varies: Boolean(dj.time_varies) });
      }
      dispatchIdToKey.set(dj.id, key);
    }

    // ── Member dispatch time map: work_order::report_date::name → window ──────
    const memberDispatchMap = new Map<string, DispatchWindow>();
    const seenDjt           = new Set<string>(); // dedup duplicate rows

    for (const djt of djtRows) {
      const dupeKey = `${djt.dispatch_job_id}::${djt.resource_name}`;
      if (seenDjt.has(dupeKey)) continue;
      seenDjt.add(dupeKey);

      const baseKey = dispatchIdToKey.get(djt.dispatch_job_id);
      if (!baseKey) continue;
      const memberKey = `${baseKey}::${djt.resource_name}`;
      if (!memberDispatchMap.has(memberKey)) {
        memberDispatchMap.set(memberKey, {
          start_ms: new Date(djt.start_time).getTime(),
          end_ms:   new Date(djt.end_time).getTime(),
        });
      }
    }

    // Helper: get dispatch time window for a member on a specific job
    function getDispatchWindow(workOrder: string, reportDate: string, name: string): DispatchWindow | null {
      // Member-specific time (time_varies = true)
      const memberKey = `${workOrder}::${reportDate}::${name}`;
      if (memberDispatchMap.has(memberKey)) return memberDispatchMap.get(memberKey)!;
      // Job-level time (time_varies = false)
      const djEntry = dispatchJobMap.get(`${workOrder}::${reportDate}`);
      if (djEntry && !djEntry.time_varies && djEntry.window) return djEntry.window;
      return null;
    }

    // ── Per-employee aggregation ──────────────────────────────────────────────
    type EmpEntry = {
      onJobHours: number; revenue: number; totalPay: number;
      laborCost: number;  // sum of OT-attributed per-job costs
      jobs: number; reports: Set<string>;
    };
    const empData       = new Map<string, EmpEntry>();
    const seenPerReport = new Map<string, Set<string>>(); // de-dupe payroll per report

    // Job-level aggregation
    type JobRow = {
      job_id: string; work_order: string | null; client_name: string | null;
      service: string | null; crew_code: string | null;
      budgeted_hours: number; actual_hours: number; revenue: number; labor_cost: number;
    };
    const allJobs: JobRow[] = [];

    // Crew aggregation
    const crewMap = new Map<string, { jobs: number; budgeted_hours: number; actual_hours: number; revenue: number }>();

    let totalRevenue       = 0;
    let totalOnJobHours    = 0;
    let totalBudgetedHours = 0;

    for (const report of reportList) {
      const rid         = report.id as string;
      const reportDate  = report.report_date as string;
      if (!seenPerReport.has(rid)) seenPerReport.set(rid, new Set());
      const seenNames = seenPerReport.get(rid)!;

      for (const job of (report as any).lawn_production_jobs ?? []) {
        const budH   = Number(job.budgeted_hours  ?? 0);
        const actH   = Number(job.actual_hours     ?? 0);
        const budAmt = Number(job.budgeted_amount  ?? 0);
        const crew   = (job.crew_code as string) || "Unknown";
        const wo     = (job.work_order as string) ?? "";

        totalRevenue       += budAmt;
        totalOnJobHours    += actH;
        totalBudgetedHours += budH;

        // Crew aggregation
        if (!crewMap.has(crew)) crewMap.set(crew, { jobs: 0, budgeted_hours: 0, actual_hours: 0, revenue: 0 });
        const crewEntry = crewMap.get(crew)!;
        crewEntry.jobs++; crewEntry.budgeted_hours += budH; crewEntry.actual_hours += actH; crewEntry.revenue += budAmt;

        let jobLaborCost = 0;

        for (const member of (job as any).lawn_production_members ?? []) {
          const name         = (member.resource_name as string) || "Unknown";
          const mActHrs      = Number(member.actual_hours       ?? 0);
          const mEarned      = Number(member.earned_amount      ?? 0);
          const mTotalPayHrs = Number(member.total_payroll_hours ?? mActHrs);
          const mPay         = Number(member.payroll_cost        ?? 0);
          const mPayRate     = Number(member.pay_rate            ?? 0);
          const mRegHrs      = Number(member.reg_hours           ?? 0);
          const mOtHrs       = Number(member.ot_hours            ?? 0);

          // ── Per-job labor cost: OT-attributed if data available, else proportional ──
          let memberJobCost: number;

          const punchInfo     = punchLookup.get(`${rid}::${name}`);
          const dispatchWindow = getDispatchWindow(wo, reportDate, name);

          if (punchInfo && dispatchWindow && mPayRate > 0) {
            // Compute burdened reg + OT rates
            const rawWages = mRegHrs * mPayRate + mOtHrs * mPayRate * 1.5;
            const burden   = rawWages > 0 ? mPay / rawWages : 1.0;
            memberJobCost  = otAttributedCost(
              dispatchWindow.start_ms,
              dispatchWindow.end_ms,
              punchInfo.ot_threshold_ms,
              mPayRate * burden,
              mPayRate * 1.5 * burden,
            );
          } else {
            // Fallback: proportional share of full-day pay
            const fraction = mTotalPayHrs > 0 ? mActHrs / mTotalPayHrs : 0;
            memberJobCost  = mPay * fraction;
          }

          jobLaborCost += memberJobCost;

          // Employee aggregation
          if (!empData.has(name)) {
            empData.set(name, { onJobHours: 0, revenue: 0, totalPay: 0, laborCost: 0, jobs: 0, reports: new Set() });
          }
          const emp = empData.get(name)!;
          emp.onJobHours += mActHrs;
          emp.revenue    += mEarned;
          emp.laborCost  += memberJobCost;
          emp.jobs++;
          emp.reports.add(rid);

          // De-dupe payroll (payroll_cost = full-day burdened pay stored on every job)
          if (!seenNames.has(name)) {
            seenNames.add(name);
            emp.totalPay += mPay;
          }
        }

        allJobs.push({
          job_id:         job.id as string,
          work_order:     job.work_order    ?? null,
          client_name:    job.client_name   ?? null,
          service:        job.service       ?? null,
          crew_code:      job.crew_code     ?? null,
          budgeted_hours: budH,
          actual_hours:   actH,
          revenue:        budAmt,
          labor_cost:     jobLaborCost,
        });
      }
    }

    // ── Punch aggregation (for OT/clocked hours totals) ───────────────────────
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

    // ── Payroll totals ────────────────────────────────────────────────────────
    // Field payroll = sum of deduped payroll_cost (authoritative)
    // On-job payroll = sum of OT-attributed per-job costs (more accurate than proportional)
    // Down-time payroll = field payroll - on-job payroll
    let totalFieldPayroll = 0;
    for (const [, emp] of empData) totalFieldPayroll += emp.totalPay;

    let totalOnJobPayroll = 0;
    for (const j of allJobs) totalOnJobPayroll += j.labor_cost;

    const totalDownTimePayroll = Math.max(0, totalFieldPayroll - totalOnJobPayroll);

    // Down-time hours (from clocked vs on-job)
    let totalDownTimeHours = 0;
    for (const [name, clocked] of empPunches) {
      const emp = empData.get(name);
      const onJobHrs = emp?.onJobHours ?? 0;
      totalDownTimeHours += Math.max(0, (clocked.regular + clocked.ot) - onJobHrs);
    }

    // ── Admin payroll + pro-rated budget ─────────────────────────────────────
    let adminPayroll          = 0;
    let proratedBudgetRevenue = 0;
    let proratedBudgetLabor   = 0;
    let proratedBudgetAdmin   = 0;
    let daysInRange           = 0;

    const iterDate = new Date(start + "T12:00:00Z");
    const endDate  = new Date(end   + "T12:00:00Z");

    while (iterDate <= endDate) {
      const dateStr   = iterDate.toISOString().slice(0, 10);
      const iterYear  = iterDate.getUTCFullYear();
      const iterMonth = iterDate.getUTCMonth() + 1;
      const daysInMo  = new Date(iterYear, iterMonth, 0).getDate();
      daysInRange++;
      adminPayroll += adminDailyRate(dateStr, configData, adminOverrideMap);
      const budRow = budgetMap.get(`${iterYear}-${iterMonth}`);
      if (budRow) {
        proratedBudgetRevenue += budRow.revenue / daysInMo;
        proratedBudgetLabor   += budRow.labor   / daysInMo;
      }
      proratedBudgetAdmin += monthlyAdminBudget(iterYear, iterMonth, configData) / daysInMo;
      iterDate.setUTCDate(iterDate.getUTCDate() + 1);
    }

    // ── Totals ────────────────────────────────────────────────────────────────
    const totalPayroll = totalFieldPayroll + adminPayroll;

    // ── Derived ratios ────────────────────────────────────────────────────────
    const fieldLaborPct   = safeDiv(totalFieldPayroll,  totalRevenue);
    const adminBurdenPct  = safeDiv(adminPayroll,        totalRevenue);
    const totalLaborPct   = safeDiv(totalPayroll,        totalRevenue);
    const onJobPct        = safeDiv(totalOnJobHours,    totalClockedHours);
    const downTimePct     = safeDiv(totalDownTimeHours, totalClockedHours);
    const otPct           = safeDiv(totalOtHours,       totalClockedHours);
    const hoursEfficiency = safeDiv(totalBudgetedHours, totalOnJobHours);
    const revenueVsBudget = safeDiv(totalRevenue,       proratedBudgetRevenue);

    const totalLaborGoal = proratedBudgetRevenue > 0 ? proratedBudgetLabor / proratedBudgetRevenue : null;
    const fieldLaborGoal = proratedBudgetRevenue > 0 ? (proratedBudgetLabor - proratedBudgetAdmin) / proratedBudgetRevenue : null;

    // ── Team member leaderboard ───────────────────────────────────────────────
    const memberLeaderboard = [...empData.entries()]
      .filter(([, emp]) => emp.revenue > 0 || emp.onJobHours > 0)
      .map(([name, emp]) => {
        const clocked       = empPunches.get(name) ?? { regular: 0, ot: 0 };
        const clockedTotal  = clocked.regular + clocked.ot;
        const downTimeHours = Math.max(0, clockedTotal - emp.onJobHours);
        return {
          name,
          total_payroll_hours: clockedTotal,
          ot_hours:            clocked.ot,
          down_time_hours:     downTimeHours,
          down_time_pct:       clockedTotal > 0 ? downTimeHours / clockedTotal : null,
          revenue:             emp.revenue,
          labor_cost:          emp.totalPay,
          labor_pct:           emp.revenue > 0 ? emp.totalPay / emp.revenue : null,
        };
      })
      .sort((a, b) => {
        // Nulls last, then ascending (lowest labor % = best, shown first)
        if (a.labor_pct === null && b.labor_pct === null) return 0;
        if (a.labor_pct === null) return 1;
        if (b.labor_pct === null) return -1;
        return a.labor_pct - b.labor_pct;
      });

    // ── Job flags ─────────────────────────────────────────────────────────────
    const jobFlags = allJobs
      .filter(j => j.budgeted_hours >= 0.5 && Math.abs(j.actual_hours - j.budgeted_hours) / j.budgeted_hours >= 0.30)
      .map(j => ({
        job_id:         j.job_id,
        client_name:    j.client_name,
        service:        j.service,
        crew_code:      j.crew_code,
        budgeted_hours: j.budgeted_hours,
        actual_hours:   j.actual_hours,
        variance_pct:   (j.actual_hours - j.budgeted_hours) / j.budgeted_hours,
        revenue:        j.revenue,
        labor_pct:      j.revenue > 0 ? j.labor_cost / j.revenue : null,
      }))
      .sort((a, b) => b.variance_pct - a.variance_pct)
      .slice(0, 15);

    // ── Crew performance ─────────────────────────────────────────────────────
    const crewPerformance = [...crewMap.entries()]
      .map(([crew_code, v]) => ({
        crew_code,
        jobs:           v.jobs,
        budgeted_hours: v.budgeted_hours,
        actual_hours:   v.actual_hours,
        actual_amount:  v.revenue,
        efficiency:     v.actual_hours > 0 ? v.budgeted_hours / v.actual_hours : null,
      }))
      .sort((a, b) => (b.efficiency ?? 0) - (a.efficiency ?? 0));

    // ── Auto-findings ─────────────────────────────────────────────────────────
    type Severity = "good" | "watch" | "bad";
    type Finding  = { severity: Severity; category: string; message: string; detail?: string };
    const findings: Finding[] = [];

    const effectiveFieldGoal = fieldLaborGoal ?? 0.39;

    if (totalBudgetedHours > 0) {
      const overPct = (totalOnJobHours - totalBudgetedHours) / totalBudgetedHours;
      if (overPct > 0.25) {
        const extra   = totalOnJobHours - totalBudgetedHours;
        const avgRate = totalOnJobHours > 0 ? totalOnJobPayroll / totalOnJobHours : 0;
        findings.push({ severity: "bad", category: "Hours", message: `Crews ran ${fmt1(overPct)}% over budgeted hours`, detail: `${extra.toFixed(0)} extra hours ≈ $${Math.round(extra * avgRate).toLocaleString()} unrecovered` });
      } else if (overPct > 0.10) {
        findings.push({ severity: "watch", category: "Hours", message: `Hours ran ${fmt1(overPct)}% over budget — monitor crew pacing` });
      } else if (overPct <= 0.02) {
        findings.push({ severity: "good", category: "Hours", message: "Hours on budget — crews matched estimates" });
      }
    }

    if (fieldLaborPct !== null) {
      const goalPct = fmt1(effectiveFieldGoal);
      if (fieldLaborPct > effectiveFieldGoal * 1.12) {
        findings.push({ severity: "bad", category: "Labor %", message: `Field labor at ${fmt1(fieldLaborPct)}% — critically above ${goalPct}% target` });
      } else if (fieldLaborPct > effectiveFieldGoal * 1.05) {
        findings.push({ severity: "watch", category: "Labor %", message: `Field labor at ${fmt1(fieldLaborPct)}% — above ${goalPct}% target` });
      } else if (fieldLaborPct <= effectiveFieldGoal * 0.95) {
        findings.push({ severity: "good", category: "Labor %", message: `Field labor strong at ${fmt1(fieldLaborPct)}% — under ${goalPct}% target` });
      }
    }

    if (downTimePct !== null) {
      if (downTimePct > 0.18) {
        const avgRate = totalClockedHours > 0 ? totalFieldPayroll / totalClockedHours : 0;
        findings.push({ severity: "bad", category: "Down Time", message: `Down time at ${fmt1(downTimePct)}% of clock hours — review routing & scheduling`, detail: `${totalDownTimeHours.toFixed(0)} hrs @ ~$${avgRate.toFixed(2)}/hr ≈ $${Math.round(totalDownTimePayroll).toLocaleString()} burdened cost` });
      } else if (downTimePct > 0.12) {
        findings.push({ severity: "watch", category: "Down Time", message: `Down time at ${fmt1(downTimePct)}% — monitor for trends` });
      } else if (downTimePct <= 0.10) {
        findings.push({ severity: "good", category: "Down Time", message: `Down time at ${fmt1(downTimePct)}% — crews efficiently deployed` });
      }
    }

    if (otPct !== null && otPct > 0.10) {
      findings.push({ severity: otPct > 0.18 ? "bad" : "watch", category: "OT", message: `OT at ${fmt1(otPct)}% of hours — ${otPct > 0.18 ? "crew scheduling needs review" : "worth monitoring"}` });
    }

    if (revenueVsBudget !== null) {
      if (revenueVsBudget >= 0.98) {
        findings.push({ severity: "good", category: "Revenue", message: `Revenue on target — within ${fmt1(1 - revenueVsBudget)}% of budget` });
      } else if (revenueVsBudget < 0.92) {
        findings.push({ severity: "watch", category: "Revenue", message: `Revenue came in ${fmt1(1 - revenueVsBudget)}% below budget` });
      }
    }

    // ── Response ──────────────────────────────────────────────────────────────
    return NextResponse.json({
      scorecard: {
        revenue:               totalRevenue,
        budgeted_revenue:      proratedBudgetRevenue,
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
        field_labor_goal:      fieldLaborGoal,
        total_labor_goal:      totalLaborGoal,
        prorated_budget_revenue: proratedBudgetRevenue,
        prorated_budget_labor:   proratedBudgetLabor,
        prorated_budget_admin:   proratedBudgetAdmin,
      },
      findings,
      member_leaderboard: memberLeaderboard,
      crew_performance:   crewPerformance,
      job_flags:          jobFlags,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
