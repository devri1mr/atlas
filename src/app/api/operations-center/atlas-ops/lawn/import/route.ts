import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAYROLL_BURDEN = 1.15; // 15% burden on all payroll costs, always

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
  clock_in_at: string | null;
  clock_out_at: string | null;
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

type RawMember = Omit<ParsedMember, "employee_id" | "employee_name" | "punch_status" | "reg_hours" | "ot_hours" | "total_payroll_hours" | "pay_rate" | "payroll_cost" | "clock_in_at" | "clock_out_at">;
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

// ── Dispatch board parser (Report 2: SchedulingViewExport) ───────────────────

type DispatchJob = {
  work_order: string | null;
  client_name: string;
  address: string;
  city: string;
  zip: string;
  service: string;
  crew_code: string;
  personnel_count: number | null;
  report_date: string;
  start_time: string | null;  // ISO string or null
  end_time: string | null;
  time_varies: boolean;
};

// tzOffsetMins: from client's new Date().getTimezoneOffset() — positive = behind UTC (e.g. EDT = 240)
function parseTimeString(timeVal: unknown, dateISO: string, tzOffsetMins: number): string | null {
  const s = String(timeVal ?? "").trim();
  if (!s || s.toLowerCase() === "varies") return null;

  let h: number, m: number;

  if (typeof timeVal === "number") {
    const totalMins = Math.round(timeVal * 24 * 60);
    h = Math.floor(totalMins / 60); m = totalMins % 60;
  } else {
    const match = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!match) return null;
    h = parseInt(match[1]); m = parseInt(match[2]);
    const ampm = match[3]?.toUpperCase();
    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
  }

  // Treat parsed time as local, convert to UTC using client's offset
  const [y, mo, d] = dateISO.split("-").map(Number);
  const localMs = Date.UTC(y, mo - 1, d, h, m, 0);
  const utcMs   = localMs + tzOffsetMins * 60 * 1000;
  return new Date(utcMs).toISOString();
}

function parseDispatchXLS(buffer: Buffer, tzOffsetMins: number): DispatchJob[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sh = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sh, { header: 1, defval: "" });

  // Row 0 is header, data starts at row 1
  const jobs: DispatchJob[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const clientName = String(row[0] ?? "").trim();
    if (!clientName) continue;

    // ScheduleDate: col N (index 13) — may be Excel serial or string like "3/25/2026"
    let reportDate = "";
    const dateVal = row[13];
    if (typeof dateVal === "number" && dateVal > 40000) {
      reportDate = excelSerialToISO(dateVal);
    } else if (typeof dateVal === "string" && dateVal.includes("/")) {
      const parts = dateVal.split("/");
      if (parts.length === 3) {
        const [m, d, y] = parts;
        reportDate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }
    }

    const timeVaries = String(row[14] ?? "").toLowerCase().includes("varies")
      || String(row[15] ?? "").toLowerCase().includes("varies");

    jobs.push({
      work_order:       String(row[10] ?? "").trim() || null,
      client_name:      clientName,
      address:          String(row[3] ?? "").trim(),
      city:             String(row[4] ?? "").trim(),
      zip:              String(row[5] ?? "").trim(),
      service:          String(row[12] ?? "").trim(),
      crew_code:        String(row[28] ?? "").trim(),
      personnel_count:  parseInt(String(row[16] ?? "")) || null,
      report_date:      reportDate,
      start_time:       timeVaries ? null : parseTimeString(row[14], reportDate, tzOffsetMins),
      end_time:         timeVaries ? null : parseTimeString(row[15], reportDate, tzOffsetMins),
      time_varies:      timeVaries,
    });
  }

  return jobs;
}

// ── Dispatch import handler ───────────────────────────────────────────────────

async function handleDispatchImport(
  sb: ReturnType<typeof supabaseAdmin>,
  companyId: string,
  buffer: Buffer,
  fileName: string,
  dryRun: boolean,
  tzOffsetMins: number,
): Promise<NextResponse> {
  const jobs = parseDispatchXLS(buffer, tzOffsetMins);
  if (!jobs.length) return NextResponse.json({ error: "No jobs found in dispatch file" }, { status: 400 });

  const reportDate = jobs.find(j => j.report_date)?.report_date ?? null;
  const variesCount = jobs.filter(j => j.time_varies).length;

  if (dryRun) {
    return NextResponse.json({
      report_type: "dispatch",
      file_name: fileName,
      report_date: reportDate,
      jobs,
      varies_count: variesCount,
    });
  }

  // Delete any existing dispatch jobs for this date (re-import replaces)
  if (reportDate) {
    await sb.from("lawn_dispatch_jobs")
      .delete()
      .eq("company_id", companyId)
      .eq("report_date", reportDate);
  }

  const { error } = await sb.from("lawn_dispatch_jobs").insert(
    jobs.map(j => ({
      company_id:      companyId,
      report_date:     j.report_date || reportDate,
      work_order:      j.work_order,
      client_name:     j.client_name,
      address:         j.address || null,
      city:            j.city || null,
      zip:             j.zip || null,
      service:         j.service || null,
      crew_code:       j.crew_code || null,
      personnel_count: j.personnel_count,
      start_time:      j.start_time,
      end_time:        j.end_time,
      time_varies:     j.time_varies,
    }))
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, report_type: "dispatch", jobs_saved: jobs.length, varies_count: variesCount });
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
    const tzOffsetMins = parseInt(String(formData.get("tz_offset") ?? "0")) || 0;

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());

    // ── Detect report type by sheet name ────────────────────────────────────
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    const isDispatch = sheetName === "SchedulingViewExport";

    if (isDispatch) {
      return handleDispatchImport(sb, companyId, buffer, file.name, dryRun, tzOffsetMins);
    }

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

    // Pre-match all resource names upfront to get employee IDs
    const matchCache = new Map<string, { id: string; name: string } | null>();
    for (const j of rawJobs) {
      for (const m of j.members) {
        if (!matchCache.has(m.resource_name)) matchCache.set(m.resource_name, matchEmp(m.resource_name));
      }
    }
    const matchedEmpIds = [...new Set(
      [...matchCache.values()].filter(Boolean).map(v => v!.id)
    )];

    // ── Lawn divisions ───────────────────────────────────────────────────────
    const { data: lawnDivs } = await sb
      .from("at_divisions")
      .select("id")
      .ilike("name", "%lawn%")
      .eq("active", true);
    const lawnDivIds = (lawnDivs ?? []).map(d => d.id);

    // ── Punch data: query by employee ID for the day ─────────────────────────
    // (more reliable than at_division_id filter; these employees are in the SAP lawn report)
    type PunchRow = {
      employee_id: string;
      clock_in_at: string | null;
      clock_out_at: string | null;
      regular_hours: number | null;
      ot_hours: number | null;
      dt_hours: number | null;
    };
    let punchRows: PunchRow[] = [];
    if (reportDate && matchedEmpIds.length > 0) {
      const { data, error: punchErr } = await sb
        .from("at_punches")
        .select("employee_id, clock_in_at, clock_out_at, regular_hours, ot_hours, dt_hours")
        .eq("company_id", companyId)
        .eq("date_for_payroll", reportDate)
        .in("employee_id", matchedEmpIds)
        .order("clock_in_at", { ascending: true });
      if (!punchErr) punchRows = (data ?? []) as PunchRow[];
    }

    // Sum punch hours per employee; keep all individual punch records for times
    const punchMap = new Map<string, { reg: number; ot: number; dt: number }>();
    for (const p of punchRows) {
      const cur = punchMap.get(p.employee_id) ?? { reg: 0, ot: 0, dt: 0 };
      cur.reg += p.regular_hours ?? 0;
      cur.ot  += p.ot_hours      ?? 0;
      cur.dt  += p.dt_hours      ?? 0;
      punchMap.set(p.employee_id, cur);
    }

    // Punch status: matched = has a Lawn-division punch on the report date
    let punchedEmpIds = new Set<string>();
    if (reportDate && matchedEmpIds.length > 0) {
      let q = sb
        .from("at_punches")
        .select("employee_id")
        .eq("company_id", companyId)
        .eq("date_for_payroll", reportDate)
        .in("employee_id", matchedEmpIds);
      if (lawnDivIds.length > 0) q = q.in("at_division_id", lawnDivIds);
      const { data } = await q;
      punchedEmpIds = new Set((data ?? []).map((p: any) => p.employee_id));
    }

    // ── Pay rates (Lawn division preferred, fallback to default) ─────────────
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
      const lawnRate = rates.find(r => r.division_id && lawnDivIds.includes(r.division_id));
      if (lawnRate) return lawnRate.rate;
      const defRate = rates.find(r => r.is_default);
      if (defRate) return defRate.rate;
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
        const match = matchCache.get(m.resource_name) ?? null;
        const empId = match?.id ?? null;
        const hrs   = empId ? punchMap.get(empId) ?? null : null;
        const rate  = empId ? getPayRate(empId) : null;

        const reg_hours           = hrs ? Math.round(hrs.reg * 10000) / 10000 : null;
        const ot_hours            = hrs ? Math.round(hrs.ot * 10000) / 10000 : null;
        const total_payroll_hours = hrs ? Math.round((hrs.reg + hrs.ot + hrs.dt) * 10000) / 10000 : null;
        const baseCost            = (hrs && rate)
          ? hrs.reg * rate + hrs.ot * rate * otMult + hrs.dt * rate * dtMult
          : null;
        const payroll_cost        = baseCost !== null
          ? Math.round(baseCost * PAYROLL_BURDEN * 100) / 100
          : null;

        // Clock in = earliest punch, clock out = latest punch for this employee
        const empPunches = empId ? punchRows.filter(p => p.employee_id === empId) : [];
        const clock_in_at  = empPunches.length ? empPunches[0].clock_in_at : null;
        const clock_out_at = empPunches.length ? empPunches[empPunches.length - 1].clock_out_at : null;

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
          clock_in_at,
          clock_out_at,
        };
      }),
    }));

    if (dryRun) {
      // Build name map for punch records
      const empNameMapDry = new Map<string, string>();
      for (const j of resolvedJobs) {
        for (const m of j.members) {
          if (m.employee_id) empNameMapDry.set(m.employee_id, m.resource_name);
        }
      }
      return NextResponse.json({
        jobs: resolvedJobs,
        file_name: file.name,
        punches: punchRows.map(p => ({
          employee_id:   p.employee_id,
          resource_name: empNameMapDry.get(p.employee_id) ?? "",
          clock_in_at:   p.clock_in_at,
          clock_out_at:  p.clock_out_at,
          regular_hours: p.regular_hours,
          ot_hours:      p.ot_hours,
        })),
        debug: { ...parseDebug, punchRowsFound: punchRows.length, matchedEmpIds: matchedEmpIds.length },
      });
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
          dt_hours:      null,
        }))
      );
    }

    return NextResponse.json({ ok: true, report_id: report.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
