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

// Word-prefix fuzzy match: "Holiday Lighting" ↔ "Holiday Lights"
// Each word in A must share a 4-char prefix with the corresponding word in B
function wordPrefixMatch(a: string, b: string): boolean {
  const wordsA = a.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  const wordsB = b.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  if (wordsA.length !== wordsB.length) return false;
  return wordsA.every((wa, i) => {
    const wb = wordsB[i];
    const len = Math.min(wa.length, wb.length, 4);
    return wa.slice(0, len) === wb.slice(0, len);
  });
}

type ParsedRow = {
  csv_name: string;
  date: string;
  clock_in_at: string;
  clock_out_at: string;
  punch_item: string;
};

type ResolvedRow = {
  employee_id: string;
  date: string;
  clock_in_at: string;
  clock_out_at: string;
  division_id: string | null;
  at_division_id: string | null;
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

    // ── Actual import (pre-resolved rows from client) ──────────────────────
    if (!dryRun) {
      const resolvedRows: ResolvedRow[] = body.resolved_rows ?? [];
      if (!resolvedRows.length) return NextResponse.json({ imported: 0, skipped: 0, skipped_reasons: {} });

      const toInsert = resolvedRows.map(r => ({
        company_id:       companyId,
        employee_id:      r.employee_id,
        clock_in_at:      r.clock_in_at,
        clock_out_at:     r.clock_out_at,
        date_for_payroll: r.date,
        punch_method:     "manual",
        is_manual:        true,
        division_id:      r.division_id ?? null,
        at_division_id:   r.at_division_id ?? null,
        status:           "pending",
      }));

      const { error: insertErr } = await sb.from("at_punches").insert(toInsert);
      if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

      // Recalc lunch/OT for each unique employee+date pair
      const pairs = new Set(resolvedRows.map(r => `${r.employee_id}|${r.date}`));
      await Promise.all([...pairs].map(pair => {
        const [empId, date] = pair.split("|");
        return recalcDayLunch(sb, companyId, empId, date);
      }));

      return NextResponse.json({ imported: resolvedRows.length, skipped: 0, skipped_reasons: {} });
    }

    // ── Dry run (preview + matching) ───────────────────────────────────────
    const rows: ParsedRow[] = body.rows ?? [];
    if (!rows.length) return NextResponse.json({ error: "No rows provided" }, { status: 400 });

    const [empRes, divRes, atDivRes] = await Promise.all([
      sb.from("at_employees").select("id, first_name, last_name").eq("company_id", companyId),
      sb.from("divisions").select("id, name").eq("active", true),
      sb.from("at_divisions").select("id, name, division_id").eq("active", true),
    ]);

    if (empRes.error)   return NextResponse.json({ error: empRes.error.message }, { status: 500 });
    if (divRes.error)   return NextResponse.json({ error: divRes.error.message }, { status: 500 });
    if (atDivRes.error) return NextResponse.json({ error: atDivRes.error.message }, { status: 500 });

    const empList   = empRes.data   ?? [];
    const divList   = divRes.data   ?? [];
    const atDivList = atDivRes.data ?? [];

    function matchEmployee(csvName: string) {
      const parts = csvName.split(",");
      if (parts.length < 2) return null;
      const last  = normalize(parts[0].trim());
      const first = normalize(parts.slice(1).join(",").trim());
      const found = empList.find(e => normalize(e.last_name) === last && normalize(e.first_name) === first);
      if (found) return { id: found.id, name: `${found.last_name}, ${found.first_name}` };
      return null;
    }

    function matchPunchItem(punchItem: string) {
      const n = normalize(punchItem);

      // 1. Exact match — at_divisions first
      let atDiv = atDivList.find(d => normalize(d.name) === n);
      if (atDiv) return { division_id: atDiv.division_id ?? null, at_division_id: atDiv.id, matched_item_name: atDiv.name };

      let div = divList.find(d => normalize(d.name) === n);
      if (div) return { division_id: div.id, at_division_id: null, matched_item_name: div.name };

      // 2. Starts-with either direction
      atDiv = atDivList.find(d => normalize(d.name).startsWith(n) || n.startsWith(normalize(d.name)));
      if (atDiv) return { division_id: atDiv.division_id ?? null, at_division_id: atDiv.id, matched_item_name: atDiv.name };

      div = divList.find(d => normalize(d.name).startsWith(n) || n.startsWith(normalize(d.name)));
      if (div) return { division_id: div.id, at_division_id: null, matched_item_name: div.name };

      // 3. Word-prefix fuzzy ("Holiday Lighting" → "Holiday Lights")
      atDiv = atDivList.find(d => wordPrefixMatch(d.name, punchItem));
      if (atDiv) return { division_id: atDiv.division_id ?? null, at_division_id: atDiv.id, matched_item_name: atDiv.name };

      div = divList.find(d => wordPrefixMatch(d.name, punchItem));
      if (div) return { division_id: div.id, at_division_id: null, matched_item_name: div.name };

      return null;
    }

    async function checkDuplicate(employeeId: string, date: string, clockInAt: string): Promise<boolean> {
      const clockInMs  = new Date(clockInAt).getTime();
      const windowMs   = 5 * 60 * 1000;
      const windowStart = new Date(clockInMs - windowMs).toISOString();
      const windowEnd   = new Date(clockInMs + windowMs).toISOString();
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
        const inMs  = new Date(clockInAt).getTime();
        const outMs = new Date(clockOutAt).getTime();
        if (isNaN(inMs) || isNaN(outMs)) return null;
        return Math.round(((outMs - inMs) / 3_600_000) * 100) / 100;
      } catch { return null; }
    }

    const preview: PreviewRow[] = [];

    for (const row of rows) {
      const empMatch  = matchEmployee(row.csv_name);
      const itemMatch = matchPunchItem(row.punch_item);

      if (!empMatch) {
        preview.push({ ...row, status: "no_employee", employee_id: null, employee_name: null, division_id: null, at_division_id: null, matched_item_name: itemMatch?.matched_item_name ?? null, raw_hours: calcRawHours(row.clock_in_at, row.clock_out_at) });
        continue;
      }

      if (!itemMatch) {
        preview.push({ ...row, status: "no_punch_item", employee_id: empMatch.id, employee_name: empMatch.name, division_id: null, at_division_id: null, matched_item_name: null, raw_hours: calcRawHours(row.clock_in_at, row.clock_out_at) });
        continue;
      }

      const isDup = await checkDuplicate(empMatch.id, row.date, row.clock_in_at);
      if (isDup) {
        preview.push({ ...row, status: "duplicate", employee_id: empMatch.id, employee_name: empMatch.name, ...itemMatch, raw_hours: calcRawHours(row.clock_in_at, row.clock_out_at) });
        continue;
      }

      preview.push({ ...row, status: "ready", employee_id: empMatch.id, employee_name: empMatch.name, ...itemMatch, raw_hours: calcRawHours(row.clock_in_at, row.clock_out_at) });
    }

    // Build available lists for the client's edit dropdowns
    const available_items = [
      ...atDivList.map(d => ({ label: d.name, division_id: d.division_id ?? null, at_division_id: d.id })),
      ...divList.map(d => ({ label: d.name, division_id: d.id, at_division_id: null as string | null })),
    ].sort((a, b) => a.label.localeCompare(b.label));

    const available_employees = empList
      .map(e => ({ id: e.id, name: `${e.last_name}, ${e.first_name}` }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ rows: preview, available_items, available_employees });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
