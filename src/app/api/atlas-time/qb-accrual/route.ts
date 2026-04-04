import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function decimalToHHMM(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).single();
  return data?.id ?? null;
}

// Parse "at:uuid,div:uuid" format; unprefixed treated as "at" for backward compat
function parsePunchItemIds(param: string) {
  const parts = param.split(",").map(s => s.trim()).filter(Boolean);
  const atIds: string[] = [];
  const divIds: string[] = [];
  for (const p of parts) {
    if (p.startsWith("div:")) divIds.push(p.slice(4));
    else if (p.startsWith("at:")) atIds.push(p.slice(3));
    else atIds.push(p); // legacy unprefixed = at_division
  }
  return { atIds, divIds };
}

type AggRow = {
  employee_display: string;
  employee_qb: string;
  punch_item_name: string;
  punch_item_id: string;
  qb_class: string;
  reg_item: string;
  ot_item: string;
  reg_hours: number;
  ot_hours: number;
  warning: string;
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const history = searchParams.get("history") === "true";

  // ── History mode ────────────────────────────────────────────────────────────
  if (history) {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("at_payroll_accruals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ accruals: data ?? [] });
  }

  const punchItemsParam = searchParams.get("punch_items");
  const startDate       = searchParams.get("start");
  const endDate         = searchParams.get("end");
  const accrualDate     = searchParams.get("accrual_date") || endDate;
  const preview         = searchParams.get("preview") === "true";

  if (!startDate || !endDate)
    return NextResponse.json({ error: "start and end dates required" }, { status: 400 });
  if (!punchItemsParam)
    return NextResponse.json({ error: "punch_items required" }, { status: 400 });

  const { atIds, divIds } = parsePunchItemIds(punchItemsParam);
  if (!atIds.length && !divIds.length)
    return NextResponse.json({ error: "at least one punch item required" }, { status: 400 });

  const sb = supabaseAdmin();

  // For at_division entries that link to a division (via division_id),
  // also pull punches recorded under division_id (e.g. Tree Farm ↔ Admin:DRDG).
  if (atIds.length) {
    const { data: atDivRows } = await sb
      .from("at_divisions")
      .select("division_id")
      .in("id", atIds)
      .not("division_id", "is", null);
    for (const row of atDivRows ?? []) {
      if (row.division_id && !divIds.includes(row.division_id)) {
        divIds.push(row.division_id);
      }
    }
  }

  // ── Fetch punches from both sources in parallel ──────────────────────────
  const [atResult, divResult] = await Promise.all([
    atIds.length
      ? sb.from("at_punches")
          .select(`
            regular_hours, ot_hours, at_division_id,
            at_employees!inner(first_name, last_name, middle_initial),
            at_divisions!inner(id, name, qb_class_name, qb_payroll_item_reg, qb_payroll_item_ot)
          `)
          .neq("status", "rejected")
          .gte("date_for_payroll", startDate)
          .lte("date_for_payroll", endDate)
          .in("at_division_id", atIds)
      : Promise.resolve({ data: [] as any[], error: null }),

    divIds.length
      ? sb.from("at_punches")
          .select(`
            regular_hours, ot_hours, division_id,
            at_employees!inner(first_name, last_name, middle_initial),
            divisions!inner(id, name, qb_class_name, qb_payroll_item_reg, qb_payroll_item_ot)
          `)
          .neq("status", "rejected")
          .gte("date_for_payroll", startDate)
          .lte("date_for_payroll", endDate)
          .in("division_id", divIds)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  if (atResult.error) return NextResponse.json({ error: atResult.error.message }, { status: 500 });
  if (divResult.error) return NextResponse.json({ error: divResult.error.message }, { status: 500 });

  // ── Aggregate by employee × punch item ──────────────────────────────────
  const agg = new Map<string, AggRow>();

  function addPunch(
    emp: any,
    punchItemId: string,
    divRow: any,
    reg_hours: number,
    ot_hours: number,
  ) {
    const mi               = emp.middle_initial ? ` ${emp.middle_initial}` : "";
    const employee_display = `${emp.last_name}, ${emp.first_name}`;
    const employee_qb      = `${emp.last_name}, ${emp.first_name}${mi}`;
    const qb_class         = divRow?.qb_class_name       || "";
    const reg_item         = divRow?.qb_payroll_item_reg || "";
    const ot_item          = divRow?.qb_payroll_item_ot  || "";
    const punch_item_name  = divRow?.name                || "";

    const key = `${employee_display}||${punchItemId}`;
    if (!agg.has(key)) {
      const warnings: string[] = [];
      if (!reg_item) warnings.push("missing regular pay item");
      if (!ot_item)  warnings.push("missing OT pay item");
      if (!qb_class) warnings.push("missing QB class");
      agg.set(key, {
        employee_display, employee_qb, punch_item_name, punch_item_id: punchItemId,
        qb_class, reg_item, ot_item, reg_hours: 0, ot_hours: 0,
        warning: warnings.join("; "),
      });
    }
    const row = agg.get(key)!;
    row.reg_hours += reg_hours;
    row.ot_hours  += ot_hours;
  }

  for (const p of atResult.data ?? []) {
    addPunch(p.at_employees, (p as any).at_division_id, p.at_divisions, Number(p.regular_hours ?? 0), Number(p.ot_hours ?? 0));
  }
  for (const p of divResult.data ?? []) {
    addPunch(p.at_employees, (p as any).division_id, p.divisions, Number(p.regular_hours ?? 0), Number(p.ot_hours ?? 0));
  }

  const rows = [...agg.values()]
    .filter(r => r.reg_hours > 0 || r.ot_hours > 0)
    .sort((a, b) => a.employee_display.localeCompare(b.employee_display) || a.punch_item_name.localeCompare(b.punch_item_name));

  const allPunches = [...(atResult.data ?? []), ...(divResult.data ?? [])];

  // ── Preview ────────────────────────────────────────────────────────────────
  if (preview) {
    const total_reg = rows.reduce((s, r) => s + r.reg_hours, 0);
    const total_ot  = rows.reduce((s, r) => s + r.ot_hours,  0);
    const warnings  = rows.filter(r => r.warning).length;

    return NextResponse.json({
      rows, total_reg, total_ot, warnings,
      punch_count: allPunches.length,
    });
  }

  // ── IIF export ─────────────────────────────────────────────────────────────
  const d = fmtDate(accrualDate!);
  const lines: string[] = [
    "!TIMEACT\tDATE\tJOB\tEMP\tITEM\tPITEM\tDURATION\tPROJ\tNOTE\tXFERTOPAYROLL\tBILLINGSTATUS",
  ];

  for (const r of rows) {
    if (r.reg_hours > 0 && r.reg_item)
      lines.push(`TIMEACT\t${d}\t\t${r.employee_qb}\t\t${r.reg_item}\t${decimalToHHMM(r.reg_hours)}\t${r.qb_class}\t\tY\t0`);
    if (r.ot_hours > 0 && r.ot_item)
      lines.push(`TIMEACT\t${d}\t\t${r.employee_qb}\t\t${r.ot_item}\t${decimalToHHMM(r.ot_hours)}\t${r.qb_class}\t\tY\t0`);
  }

  const iif      = lines.join("\r\n");
  const filename = `garpiel_accrual_${startDate}_${endDate}.iif`;

  return new NextResponse(iif, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

// ── Log a completed accrual download ────────────────────────────────────────
export async function POST(req: NextRequest) {
  const sb        = supabaseAdmin();
  const companyId = await getCompanyId(sb);
  if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  const { data, error } = await sb
    .from("at_payroll_accruals")
    .insert({
      company_id:       companyId,
      start_date:       body.start_date,
      end_date:         body.end_date,
      accrual_date:     body.accrual_date,
      reversal_date:    body.reversal_date || null,
      punch_item_ids:   body.punch_item_ids   ?? [],
      punch_item_names: body.punch_item_names ?? [],
      total_reg_hours:  body.total_reg_hours  ?? 0,
      total_ot_hours:   body.total_ot_hours   ?? 0,
      row_count:        body.row_count        ?? 0,
      notes:            body.notes            || null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
