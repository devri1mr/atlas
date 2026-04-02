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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const punchItemsParam = searchParams.get("punch_items"); // comma-separated at_division IDs
  const startDate       = searchParams.get("start");
  const endDate         = searchParams.get("end");
  const accrualDate     = searchParams.get("accrual_date") || endDate;
  const preview         = searchParams.get("preview") === "true";

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "start and end dates required" }, { status: 400 });
  }
  if (!punchItemsParam) {
    return NextResponse.json({ error: "punch_items required" }, { status: 400 });
  }

  const punchItemIds = punchItemsParam.split(",").map(s => s.trim()).filter(Boolean);
  if (!punchItemIds.length) {
    return NextResponse.json({ error: "at least one punch item required" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { data: punches, error } = await sb
    .from("at_punches")
    .select(`
      regular_hours, ot_hours, at_division_id,
      at_employees!inner(first_name, last_name, middle_initial),
      at_divisions!inner(id, name, qb_class_name, qb_payroll_item_reg, qb_payroll_item_ot)
    `)
    .eq("status", "approved")
    .gte("date_for_payroll", startDate)
    .lte("date_for_payroll", endDate)
    .in("at_division_id", punchItemIds);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aggregate by employee × punch item
  type AggKey = string;
  type AggRow = {
    employee_display: string;
    employee_qb: string;
    punch_item_name: string;
    at_division_id: string;
    qb_class: string;
    reg_item: string;
    ot_item: string;
    reg_hours: number;
    ot_hours: number;
    warning: string;
  };

  const agg = new Map<AggKey, AggRow>();

  for (const p of punches ?? []) {
    const emp   = p.at_employees as any;
    const atDiv = p.at_divisions as any;

    const mi               = emp.middle_initial ? ` ${emp.middle_initial}` : "";
    const employee_display = `${emp.first_name} ${emp.last_name}`;
    const employee_qb      = `${emp.last_name}, ${emp.first_name}${mi}`;
    const qb_class         = atDiv?.qb_class_name          || "";
    const reg_item         = atDiv?.qb_payroll_item_reg    || "";
    const ot_item          = atDiv?.qb_payroll_item_ot     || "";
    const punch_item_name  = atDiv?.name                   || "";
    const at_division_id   = (p as any).at_division_id     || "";

    const reg_hours = Number(p.regular_hours ?? 0);
    const ot_hours  = Number(p.ot_hours      ?? 0);

    const key = `${employee_display}||${at_division_id}`;
    if (!agg.has(key)) {
      const warnings: string[] = [];
      if (!reg_item) warnings.push("missing regular pay item");
      if (!ot_item)  warnings.push("missing OT pay item");
      if (!qb_class) warnings.push("missing QB class");
      agg.set(key, {
        employee_display, employee_qb, punch_item_name, at_division_id,
        qb_class, reg_item, ot_item, reg_hours: 0, ot_hours: 0,
        warning: warnings.join("; "),
      });
    }
    const row = agg.get(key)!;
    row.reg_hours += reg_hours;
    row.ot_hours  += ot_hours;
  }

  const rows = [...agg.values()]
    .filter(r => r.reg_hours > 0 || r.ot_hours > 0)
    .sort((a, b) => a.employee_display.localeCompare(b.employee_display) || a.punch_item_name.localeCompare(b.punch_item_name));

  // ── Preview ────────────────────────────────────────────────────────────────
  if (preview) {
    const total_reg = rows.reduce((s, r) => s + r.reg_hours, 0);
    const total_ot  = rows.reduce((s, r) => s + r.ot_hours,  0);
    const warnings  = rows.filter(r => r.warning).length;
    return NextResponse.json({ rows, total_reg, total_ot, warnings, punch_count: (punches ?? []).length });
  }

  // ── IIF export ─────────────────────────────────────────────────────────────
  const d = fmtDate(accrualDate!);
  const lines: string[] = [
    "!TIMEACT\tDATE\tJOB\tEMP\tITEM\tPITEM\tDURATION\tPROJ\tNOTE\tXFERTOPAYROLL\tBILLINGSTATUS",
  ];

  for (const r of rows) {
    if (r.reg_hours > 0 && r.reg_item) {
      lines.push(`TIMEACT\t${d}\t\t${r.employee_qb}\t\t${r.reg_item}\t${decimalToHHMM(r.reg_hours)}\t${r.qb_class}\t\tY\t0`);
    }
    if (r.ot_hours > 0 && r.ot_item) {
      lines.push(`TIMEACT\t${d}\t\t${r.employee_qb}\t\t${r.ot_item}\t${decimalToHHMM(r.ot_hours)}\t${r.qb_class}\t\tY\t0`);
    }
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
