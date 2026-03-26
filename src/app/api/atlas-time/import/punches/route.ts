import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { recalcDayLunch } from "@/lib/atDayRecalc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).single();
  return data?.id ?? null;
}

function normalize(s: string): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

type ParsedRow = {
  csv_name: string;
  date: string;
  clock_in_at: string;
  clock_out_at: string;
  punch_item: string;
};

type PreviewRow = ParsedRow & {
  status: "ready" | "no_employee" | "no_punch_item" | "duplicate";
  employee_id: string | null;
  employee_name: string | null;
  division_id: string | null;
  at_division_id: string | null;
  matched_item_name: string | null;
  raw_hours: number | null;
};

export async function POST(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body.dry_run ?? true;
    const rows: ParsedRow[] = body.rows ?? [];

    if (!rows.length) return NextResponse.json({ error: "No rows provided" }, { status: 400 });

    // Load all employees
    const { data: employees, error: empErr } = await sb
      .from("at_employees")
      .select("id, first_name, last_name")
      .eq("company_id", companyId);
    if (empErr) return NextResponse.json({ error: empErr.message }, { status: 500 });

    // Load active divisions
    const { data: divisions, error: divErr } = await sb
      .from("divisions")
      .select("id, name, source")
      .eq("active", true);
    if (divErr) return NextResponse.json({ error: divErr.message }, { status: 500 });

    // Load active at_divisions
    const { data: atDivisions, error: atDivErr } = await sb
      .from("at_divisions")
      .select("id, name, division_id, active")
      .eq("active", true);
    if (atDivErr) return NextResponse.json({ error: atDivErr.message }, { status: 500 });

    const empList = employees ?? [];
    const divList = divisions ?? [];
    const atDivList = atDivisions ?? [];

    function matchEmployee(csvName: string): { id: string; name: string } | null {
      // "Last, First" format
      const parts = csvName.split(",");
      if (parts.length < 2) return null;
      const last = normalize(parts[0].trim());
      const first = normalize(parts.slice(1).join(",").trim());
      const found = empList.find(
        e => normalize(e.last_name) === last && normalize(e.first_name) === first
      );
      if (found) return { id: found.id, name: `${found.first_name} ${found.last_name}` };
      return null;
    }

    function matchPunchItem(punchItem: string): {
      division_id: string | null;
      at_division_id: string | null;
      matched_item_name: string | null;
    } | null {
      const n = normalize(punchItem);

      // Check at_divisions first (exact)
      let atDiv = atDivList.find(d => normalize(d.name) === n);
      if (atDiv) {
        return {
          division_id: atDiv.division_id ?? null,
          at_division_id: atDiv.id,
          matched_item_name: atDiv.name,
        };
      }

      // Check divisions (exact)
      let div = divList.find(d => normalize(d.name) === n);
      if (div) {
        return { division_id: div.id, at_division_id: null, matched_item_name: div.name };
      }

      // Fuzzy starts-with for at_divisions
      atDiv = atDivList.find(d => normalize(d.name).startsWith(n) || n.startsWith(normalize(d.name)));
      if (atDiv) {
        return {
          division_id: atDiv.division_id ?? null,
          at_division_id: atDiv.id,
          matched_item_name: atDiv.name,
        };
      }

      // Fuzzy starts-with for divisions
      div = divList.find(d => normalize(d.name).startsWith(n) || n.startsWith(normalize(d.name)));
      if (div) {
        return { division_id: div.id, at_division_id: null, matched_item_name: div.name };
      }

      return null;
    }

    async function checkDuplicate(employeeId: string, date: string, clockInAt: string): Promise<boolean> {
      const clockInMs = new Date(clockInAt).getTime();
      const windowMs = 5 * 60 * 1000; // 5 minutes
      const windowStart = new Date(clockInMs - windowMs).toISOString();
      const windowEnd = new Date(clockInMs + windowMs).toISOString();

      const { data } = await sb
        .from("at_punches")
        .select("id")
        .eq("employee_id", employeeId)
        .eq("date_for_payroll", date)
        .gte("clock_in_at", windowStart)
        .lte("clock_in_at", windowEnd)
        .limit(1);

      return (data ?? []).length > 0;
    }

    function calcRawHours(clockInAt: string, clockOutAt: string): number | null {
      try {
        const inMs = new Date(clockInAt).getTime();
        const outMs = new Date(clockOutAt).getTime();
        if (isNaN(inMs) || isNaN(outMs)) return null;
        return Math.round(((outMs - inMs) / 3_600_000) * 100) / 100;
      } catch {
        return null;
      }
    }

    // Process each row
    const preview: PreviewRow[] = [];

    for (const row of rows) {
      const empMatch = matchEmployee(row.csv_name);
      if (!empMatch) {
        preview.push({
          ...row,
          status: "no_employee",
          employee_id: null,
          employee_name: null,
          division_id: null,
          at_division_id: null,
          matched_item_name: null,
          raw_hours: calcRawHours(row.clock_in_at, row.clock_out_at),
        });
        continue;
      }

      const itemMatch = matchPunchItem(row.punch_item);
      if (!itemMatch) {
        preview.push({
          ...row,
          status: "no_punch_item",
          employee_id: empMatch.id,
          employee_name: empMatch.name,
          division_id: null,
          at_division_id: null,
          matched_item_name: null,
          raw_hours: calcRawHours(row.clock_in_at, row.clock_out_at),
        });
        continue;
      }

      const isDuplicate = await checkDuplicate(empMatch.id, row.date, row.clock_in_at);
      if (isDuplicate) {
        preview.push({
          ...row,
          status: "duplicate",
          employee_id: empMatch.id,
          employee_name: empMatch.name,
          division_id: itemMatch.division_id,
          at_division_id: itemMatch.at_division_id,
          matched_item_name: itemMatch.matched_item_name,
          raw_hours: calcRawHours(row.clock_in_at, row.clock_out_at),
        });
        continue;
      }

      preview.push({
        ...row,
        status: "ready",
        employee_id: empMatch.id,
        employee_name: empMatch.name,
        division_id: itemMatch.division_id,
        at_division_id: itemMatch.at_division_id,
        matched_item_name: itemMatch.matched_item_name,
        raw_hours: calcRawHours(row.clock_in_at, row.clock_out_at),
      });
    }

    if (dryRun) {
      return NextResponse.json({ rows: preview });
    }

    // Insert all ready rows
    const readyRows = preview.filter(r => r.status === "ready");
    const skippedRows = preview.filter(r => r.status !== "ready");

    const skippedReasons: Record<string, number> = {};
    for (const r of skippedRows) {
      skippedReasons[r.status] = (skippedReasons[r.status] ?? 0) + 1;
    }

    if (readyRows.length === 0) {
      return NextResponse.json({ imported: 0, skipped: skippedRows.length, skipped_reasons: skippedReasons });
    }

    const toInsert = readyRows.map(row => ({
      company_id: companyId,
      employee_id: row.employee_id!,
      clock_in_at: row.clock_in_at,
      clock_out_at: row.clock_out_at,
      date_for_payroll: row.date,
      punch_method: "import",
      is_manual: true,
      division_id: row.division_id ?? null,
      at_division_id: row.at_division_id ?? null,
      status: "pending",
    }));

    const { error: insertErr } = await sb.from("at_punches").insert(toInsert);
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

    // Recalc for each unique employee_id + date pair
    const pairs = new Set(readyRows.map(r => `${r.employee_id}|${r.date}`));
    await Promise.all(
      [...pairs].map(pair => {
        const [empId, date] = pair.split("|");
        return recalcDayLunch(sb, companyId, empId, date);
      })
    );

    return NextResponse.json({
      imported: readyRows.length,
      skipped: skippedRows.length,
      skipped_reasons: skippedReasons,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
