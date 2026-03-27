import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v.replace(/[$,\s]/g, "")) || 0;
  return 0;
}

function excelSerialToISO(serial: number): string {
  return new Date((serial - 25569) * 86400 * 1000).toISOString().slice(0, 10);
}

function parseResource(s: string): { name: string; code: string } {
  const m = String(s ?? "").match(/^(.+?)\s*\(([^)]*)\)\s*$/);
  if (m) return { name: m[1].trim(), code: m[2].trim() };
  return { name: String(s ?? "").trim(), code: "" };
}

// ── Types ─────────────────────────────────────────────────────────────────────

type PunchStatus = "matched" | "no_punch" | "unrecognized";

type ParsedMember = {
  resource_name: string;
  resource_code: string;
  actual_hours: number;
  earned_amount: number;
  employee_id: string | null;
  employee_name: string | null;
  punch_status: PunchStatus;
  reg_hours: number | null;
  ot_hours: number | null;
  total_payroll_hours: number | null;
  pay_rate: number | null;
  payroll_cost: number | null;
};

type ParsedJob = {
  work_order: string;
  client_name: string;
  client_address: string;
  service: string;
  service_date: string;
  crew_code: string;
  budgeted_hours: number;
  actual_hours: number;
  variance_hours: number;
  budgeted_amount: number;
  actual_amount: number;
  members: ParsedMember[];
};

type RawMember = Omit<ParsedMember, "employee_id" | "employee_name" | "punch_status" | "reg_hours" | "ot_hours" | "total_payroll_hours" | "pay_rate" | "payroll_cost">;
type RawJob = Omit<ParsedJob, "members"> & { members: RawMember[] };

// ── XLS parser ────────────────────────────────────────────────────────────────

function parseXLS(buffer: Buffer): { jobs: RawJob[]; debug: Record<string, unknown> } {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sh = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sh, { header: 1, defval: "" });

  const jobs: RawJob[] = [];
  let cur: { summary: unknown[]; members: unknown[][] } | null = null;
  let grandTotalHrs: number | null = null;
  let totalRowRaw: unknown[] | null = null;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const col0 = String(row[0] ?? "").trim();
    const col17 = String(row[17] ?? "").trim();

    if (col0 === "Total") {
      totalRowRaw = row;
      grandTotalHrs = parseNum(row[10]);
      continue;
    }

    const isSummary = col0 === "" && /^LC-\d+$/.test(col17);

    if (isSummary) {
      if (cur) jobs.push(buildJob(cur.summary, cur.members));
      cur = { summary: row, members: [] };
    } else if (col0 !== "" && cur) {
      cur.members.push(row);
    }
  }
  if (cur) jobs.push(buildJob(cur.summary, cur.members));

  const sumJobHrs = jobs.reduce((s, j) => s + j.actual_hours, 0);

  if (grandTotalHrs !== null && jobs.length > 0) {
    const jobHrs = lrm(jobs.map(j => j.actual_hours), grandTotalHrs, 4);
    jobs.forEach((j, i) => {
      j.actual_hours = jobHrs[i];
      if (j.members.length > 0) {
        const mHrs = lrm(j.members.map(m => m.actual_hours), jobHrs[i], 4);
        const mRev = lrm(mHrs, j.budgeted_amount, 2);
        j.members.forEach((m, k) => {
          m.actual_hours = mHrs[k];
          m.earned_amount = mRev[k];
        });
      }
      j.variance_hours = Math.round((j.budgeted_hours - j.actual_hours) * 10000) / 10000;
    });
  }

  return {
    jobs,
    debug: {
      grandTotalHrs,
      sumJobHrs,
      totalRowCols: totalRowRaw ? totalRowRaw.slice(0, 20) : null,
      totalRowFound: totalRowRaw !== null,
    },
  };
}

// Largest-remainder distribution
function lrm(weights: number[], total: number, decimals: number): number[] {
  const factor = Math.pow(10, decimals);
  const weightSum = weights.reduce((s, w) => s + w, 0);
  if (weightSum === 0) return weights.map(() => 0);
  const exact = weights.map(w => (w / weightSum) * total);
  const floored = exact.map(v => Math.floor(v * factor) / factor);
  const remainder = Math.round((total - floored.reduce((s, v) => s + v, 0)) * factor);
  const order = exact
    .map((v, i) => ({ i, frac: (v * factor) % 1 }))
    .sort((a, b) => b.frac - a.frac);
  const unit = 1 / factor;
  order.slice(0, remainder).forEach(({ i }) => { floored[i] = Math.round((floored[i] + unit) * factor) / factor; });
  return floored;
}

function buildJob(summary: unknown[], members: unknown[][]): RawJob {
  const first = members[0] ?? [];
  const serialDate = parseNum((first as unknown[])[6]);
  const serviceDate = serialDate ? excelSerialToISO(serialDate) : "";

  const budgetedAmount = parseNum(summary[12]);
  const jobActualHrs   = parseNum(summary[10]);
  const rawHrs = members.map(m => parseNum((m as unknown[])[10]));

  const memberHrs     = lrm(rawHrs, jobActualHrs, 4);
  const memberRevenue = lrm(memberHrs, budgetedAmount, 2);

  return {
    work_order:      String((first as unknown[])[3] ?? ""),
    client_name:     String((first as unknown[])[0] ?? ""),
    client_address:  String((first as unknown[])[1] ?? ""),
    service:         String((first as unknown[])[4] ?? ""),
    service_date:    serviceDate,
    crew_code:       String(summary[17] ?? ""),
    budgeted_hours:  parseNum(summary[8]),
    actual_hours:    jobActualHrs,
    variance_hours:  parseNum(summary[11]),
    budgeted_amount: budgetedAmount,
    actual_amount:   parseNum(summary[13]),
    members: members.map((m, i) => {
      const { name, code } = parseResource(String((m as unknown[])[17] ?? ""));
      return { resource_name: name, resource_code: code, actual_hours: memberHrs[i], earned_amount: memberRevenue[i] };
    }),
  };
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });
    const companyId = company.id;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const dryRun = formData.get("dry_run") !== "false";

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const { jobs: rawJobs, debug: parseDebug } = parseXLS(buffer);
    if (!rawJobs.length) return NextResponse.json({ error: "No jobs found in file" }, { status: 400 });

    const reportDate = rawJobs[0]?.service_date;

    // ── Employee matching ────────────────────────────────────────────────────
    const { data: employees } = await sb
      .from("at_employees")
      .select("id, first_name, last_name, default_pay_rate")
      .eq("company_id", companyId);

    const empList = employees ?? [];
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

    function matchEmp(name: string): { id: string; name: string } | null {
      const parts = name.trim().split(/\s+/);
      if (parts.length < 2) return null;
      const first = parts[0], last = parts.slice(1).join(" ");
      const found = empList.find(e => norm(e.first_name) === norm(first) && norm(e.last_name) === norm(last));
      return found ? { id: found.id, name: `${found.first_name} ${found.last_name}` } : null;
    }

    // ── Lawn divisions ───────────────────────────────────────────────────────
    const { data: lawnDivs } = await sb
      .from("at_divisions")
      .select("id")
      .ilike("name", "%lawn%")
      .eq("active", true);
    const lawnDivIds = (lawnDivs ?? []).map(d => d.id);

    // ── Punch data (hours + times + match check) ─────────────────────────────
    type PunchRow = {
      employee_id: string;
      clock_in_at: string | null;
      clock_out_at: string | null;
      regular_hours: number | null;
      ot_hours: number | null;
      dt_hours: number | null;
    };
    let punchRows: PunchRow[] = [];
    if (reportDate) {
      let q = sb
        .from("at_punches")
        .select("employee_id, clock_in_at, clock_out_at, regular_hours, ot_hours, dt_hours")
        .eq("company_id", companyId)
        .eq("date_for_payroll", reportDate);
      if (lawnDivIds.length > 0) q = q.in("at_division_id", lawnDivIds);
      const { data } = await q;
      punchRows = (data ?? []) as PunchRow[];
    }

    // Sum punch hours per employee; keep all individual punch records
    const punchMap = new Map<string, { reg: number; ot: number; dt: number }>();
    for (const p of punchRows) {
      const cur = punchMap.get(p.employee_id) ?? { reg: 0, ot: 0, dt: 0 };
      cur.reg += p.regular_hours ?? 0;
      cur.ot  += p.ot_hours      ?? 0;
      cur.dt  += p.dt_hours      ?? 0;
      punchMap.set(p.employee_id, cur);
    }
    const punchedEmpIds = new Set(punchMap.keys());

    // ── Pay rates (Lawn division preferred, fallback to default) ─────────────
    const matchedEmpIds = [...new Set(
      rawJobs.flatMap(j => j.members.map(m => matchEmp(m.resource_name)?.id).filter(Boolean) as string[])
    )];

    let payRateRows: { employee_id: string; division_id: string | null; rate: number; is_default: boolean }[] = [];
    if (matchedEmpIds.length > 0) {
      const { data } = await sb
        .from("at_pay_rates")
        .select("employee_id, division_id, rate, is_default")
        .in("employee_id", matchedEmpIds);
      payRateRows = (data ?? []) as typeof payRateRows;
    }

    function getPayRate(empId: string): number | null {
      const rates = payRateRows.filter(r => r.employee_id === empId);
      // Prefer Lawn division-specific rate
      const lawnRate = rates.find(r => r.division_id && lawnDivIds.includes(r.division_id));
      if (lawnRate) return lawnRate.rate;
      // Fall back to marked-default rate
      const defRate = rates.find(r => r.is_default);
      if (defRate) return defRate.rate;
      // Fall back to at_employees.default_pay_rate
      return empList.find(e => e.id === empId)?.default_pay_rate ?? null;
    }

    // ── OT settings ─────────────────────────────────────────────────────────
    const { data: atSettings } = await sb
      .from("at_settings")
      .select("ot_multiplier, dt_multiplier")
      .eq("company_id", companyId)
      .maybeSingle();
    const otMult = atSettings?.ot_multiplier ?? 1.5;
    const dtMult = atSettings?.dt_multiplier ?? 2.0;

    function getPunchStatus(empId: string | null): PunchStatus {
      if (!empId) return "unrecognized";
      return punchedEmpIds.has(empId) ? "matched" : "no_punch";
    }

    // ── Attach payroll data ──────────────────────────────────────────────────
    const resolvedJobs: ParsedJob[] = rawJobs.map(j => ({
      ...j,
      members: j.members.map(m => {
        const match = matchEmp(m.resource_name);
        const empId = match?.id ?? null;
        const hrs   = empId ? punchMap.get(empId) ?? null : null;
        const rate  = empId ? getPayRate(empId) : null;

        const reg_hours           = hrs ? Math.round(hrs.reg * 10000) / 10000 : null;
        const ot_hours            = hrs ? Math.round(hrs.ot * 10000) / 10000 : null;
        const total_payroll_hours = hrs ? Math.round((hrs.reg + hrs.ot + hrs.dt) * 10000) / 10000 : null;
        const payroll_cost        = (hrs && rate)
          ? Math.round((hrs.reg * rate + hrs.ot * rate * otMult + hrs.dt * rate * dtMult) * 100) / 100
          : null;

        return {
          ...m,
          employee_id:         empId,
          employee_name:       match?.name ?? null,
          punch_status:        getPunchStatus(empId),
          reg_hours,
          ot_hours,
          total_payroll_hours,
          pay_rate:            rate,
          payroll_cost,
        };
      }),
    }));

    if (dryRun) {
      return NextResponse.json({ jobs: resolvedJobs, file_name: file.name, debug: parseDebug });
    }

    // ── Save to DB ────────────────────────────────────────────────────────────
    const totalBudgHrs  = resolvedJobs.reduce((s, j) => s + j.budgeted_hours,  0);
    const totalActHrs   = resolvedJobs.reduce((s, j) => s + j.actual_hours,    0);
    const totalBudgAmt  = resolvedJobs.reduce((s, j) => s + j.budgeted_amount, 0);
    const totalActAmt   = resolvedJobs.reduce((s, j) => s + j.actual_amount,   0);

    const { data: report, error: repErr } = await sb
      .from("lawn_production_reports")
      .insert({
        company_id:            companyId,
        report_date:           reportDate ?? new Date().toISOString().slice(0, 10),
        file_name:             file.name,
        total_budgeted_hours:  totalBudgHrs,
        total_actual_hours:    totalActHrs,
        total_budgeted_amount: totalBudgAmt,
        total_actual_amount:   totalActAmt,
      })
      .select("id")
      .single();

    if (repErr) return NextResponse.json({ error: repErr.message }, { status: 500 });

    for (const j of resolvedJobs) {
      const { data: job, error: jobErr } = await sb
        .from("lawn_production_jobs")
        .insert({
          report_id:       report.id,
          work_order:      j.work_order || null,
          client_name:     j.client_name,
          client_address:  j.client_address || null,
          service:         j.service || null,
          service_date:    j.service_date || null,
          crew_code:       j.crew_code || null,
          budgeted_hours:  j.budgeted_hours,
          actual_hours:    j.actual_hours,
          variance_hours:  j.variance_hours,
          budgeted_amount: j.budgeted_amount,
          actual_amount:   j.actual_amount,
        })
        .select("id")
        .single();

      if (jobErr) continue;

      if (j.members.length) {
        await sb.from("lawn_production_members").insert(
          j.members.map(m => ({
            job_id:              job.id,
            resource_name:       m.resource_name,
            resource_code:       m.resource_code || null,
            employee_id:         m.employee_id ?? null,
            actual_hours:        m.actual_hours,
            earned_amount:       m.earned_amount,
            punch_status:        m.punch_status,
            reg_hours:           m.reg_hours,
            ot_hours:            m.ot_hours,
            total_payroll_hours: m.total_payroll_hours,
            pay_rate:            m.pay_rate,
            payroll_cost:        m.payroll_cost,
          }))
        );
      }
    }

    // ── Save individual punch records (clock in/out times per employee) ──────
    if (punchRows.length > 0) {
      // Build a map of employee_id → resource_name for labeling
      const empNameMap = new Map<string, string>();
      for (const j of resolvedJobs) {
        for (const m of j.members) {
          if (m.employee_id) empNameMap.set(m.employee_id, m.resource_name);
        }
      }
      await sb.from("lawn_report_punches").insert(
        punchRows.map(p => ({
          report_id:     report.id,
          employee_id:   p.employee_id,
          resource_name: empNameMap.get(p.employee_id) ?? "",
          clock_in_at:   p.clock_in_at,
          clock_out_at:  p.clock_out_at,
          regular_hours: p.regular_hours,
          ot_hours:      p.ot_hours,
          dt_hours:      p.dt_hours,
        }))
      );
    }

    return NextResponse.json({ ok: true, report_id: report.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
