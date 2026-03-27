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

type RawMember = Omit<ParsedMember, "employee_id" | "employee_name" | "punch_status">;
type RawJob = Omit<ParsedJob, "members"> & { members: RawMember[] };

// ── XLS parser ────────────────────────────────────────────────────────────────

function parseXLS(buffer: Buffer): RawJob[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sh = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sh, { header: 1, defval: "" });

  const jobs: RawJob[] = [];
  let cur: { summary: unknown[]; members: unknown[][] } | null = null;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const col0 = String(row[0] ?? "").trim();
    const col17 = String(row[17] ?? "").trim();

    if (col0 === "Total") continue;

    const isSummary = col0 === "" && /^LC-\d+$/.test(col17);

    if (isSummary) {
      if (cur) jobs.push(buildJob(cur.summary, cur.members));
      cur = { summary: row, members: [] };
    } else if (col0 !== "" && cur) {
      cur.members.push(row);
    }
  }
  if (cur) jobs.push(buildJob(cur.summary, cur.members));
  return jobs;
}

function buildJob(summary: unknown[], members: unknown[][]): RawJob {
  const first = members[0] ?? [];
  const serialDate = parseNum((first as unknown[])[6]);
  const serviceDate = serialDate ? excelSerialToISO(serialDate) : "";

  const budgetedAmount = parseNum(summary[12]);
  const totalActHrs = members.reduce((s, m) => s + parseNum((m as unknown[])[10]), 0);

  return {
    work_order:      String((first as unknown[])[3] ?? ""),
    client_name:     String((first as unknown[])[0] ?? ""),
    client_address:  String((first as unknown[])[1] ?? ""),
    service:         String((first as unknown[])[4] ?? ""),
    service_date:    serviceDate,
    crew_code:       String(summary[17] ?? ""),
    budgeted_hours:  parseNum(summary[8]),
    actual_hours:    parseNum(summary[10]),
    variance_hours:  parseNum(summary[11]),
    budgeted_amount: budgetedAmount,
    actual_amount:   parseNum(summary[13]),
    members: (() => {
      const parsed = members.map(m => {
        const { name, code } = parseResource(String((m as unknown[])[17] ?? ""));
        const memberHrs = parseNum((m as unknown[])[10]);
        const exact = totalActHrs > 0 ? (memberHrs / totalActHrs) * budgetedAmount : 0;
        return { resource_name: name, resource_code: code, actual_hours: memberHrs, _exact: exact };
      });
      // Distribute rounding remainder to the member with the largest fractional part
      const floored = parsed.map(p => Math.floor(p._exact * 100) / 100);
      const remainder = Math.round((budgetedAmount - floored.reduce((s, v) => s + v, 0)) * 100);
      const indices = parsed
        .map((p, i) => ({ i, frac: (p._exact * 100) % 1 }))
        .sort((a, b) => b.frac - a.frac);
      const adjustments = new Array(parsed.length).fill(0);
      for (let k = 0; k < remainder; k++) adjustments[indices[k].i] = 0.01;
      return parsed.map((p, i) => ({
        resource_name: p.resource_name,
        resource_code: p.resource_code,
        actual_hours: p.actual_hours,
        earned_amount: Math.round((floored[i] + adjustments[i]) * 100) / 100,
      }));
    })(),
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
    const rawJobs = parseXLS(buffer);
    if (!rawJobs.length) return NextResponse.json({ error: "No jobs found in file" }, { status: 400 });

    const reportDate = rawJobs[0]?.service_date;

    // ── Employee matching ────────────────────────────────────────────────────
    const { data: employees } = await sb
      .from("at_employees")
      .select("id, first_name, last_name")
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

    // ── Punch checking (employee + date + Lawn division) ─────────────────────
    // Find Lawn at_divisions
    const { data: lawnDivs } = await sb
      .from("at_divisions")
      .select("id")
      .ilike("name", "%lawn%")
      .eq("active", true);
    const lawnDivIds = (lawnDivs ?? []).map(d => d.id);

    let punchedEmpIds = new Set<string>();
    if (reportDate) {
      let punchQuery = sb
        .from("at_punches")
        .select("employee_id")
        .eq("company_id", companyId)
        .eq("date_for_payroll", reportDate);

      if (lawnDivIds.length > 0) {
        punchQuery = punchQuery.in("at_division_id", lawnDivIds);
      }

      const { data: punches } = await punchQuery;
      punchedEmpIds = new Set((punches ?? []).map((p: any) => p.employee_id));
    }

    function getPunchStatus(empId: string | null): PunchStatus {
      if (!empId) return "unrecognized";
      return punchedEmpIds.has(empId) ? "matched" : "no_punch";
    }

    // ── Attach employee + punch status ────────────────────────────────────────
    const resolvedJobs: ParsedJob[] = rawJobs.map(j => ({
      ...j,
      members: j.members.map(m => {
        const match = matchEmp(m.resource_name);
        const empId = match?.id ?? null;
        return {
          ...m,
          employee_id:   empId,
          employee_name: match?.name ?? null,
          punch_status:  getPunchStatus(empId),
        };
      }),
    }));

    if (dryRun) {
      return NextResponse.json({ jobs: resolvedJobs, file_name: file.name });
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
            job_id:        job.id,
            resource_name: m.resource_name,
            resource_code: m.resource_code || null,
            employee_id:   m.employee_id ?? null,
            actual_hours:  m.actual_hours,
            earned_amount: m.earned_amount,
            punch_status:  m.punch_status,
          }))
        );
      }
    }

    return NextResponse.json({ ok: true, report_id: report.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
