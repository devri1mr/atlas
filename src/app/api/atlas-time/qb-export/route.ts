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
  const startDate = searchParams.get("start");
  const endDate   = searchParams.get("end");
  const preview   = searchParams.get("preview") === "true";

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "start and end dates required" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { data: punches, error } = await sb
    .from("at_punches")
    .select(`
      id, date_for_payroll, regular_hours, ot_hours, division_id, at_division_id,
      at_employees!inner(first_name, last_name, middle_initial),
      divisions(qb_class_name, qb_payroll_item_reg, qb_payroll_item_ot),
      at_divisions(qb_class_name, qb_payroll_item_reg, qb_payroll_item_ot)
    `)
    .eq("status", "approved")
    .gte("date_for_payroll", startDate)
    .lte("date_for_payroll", endDate)
    .order("date_for_payroll", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = {
    date: string;
    employee_display: string; // "First Last" — for preview
    employee_qb: string;      // "Last, First" — for IIF NAME field
    at_division_id: string | null;
    division_id: string | null;
    qb_class: string;
    reg_item: string;
    ot_item: string;
    reg_hours: number;
    ot_hours: number;
    warning: string;
  };

  const rows: Row[] = [];

  for (const p of punches ?? []) {
    const emp   = p.at_employees as any;
    const div   = p.divisions   as any;
    const atDiv = p.at_divisions as any;

    const employee_display = `${emp.first_name} ${emp.last_name}`;
    const mi = emp.middle_initial ? ` ${emp.middle_initial}` : "";
    const employee_qb      = `${emp.last_name}, ${emp.first_name}${mi}`;
    const qb_class  = atDiv?.qb_class_name || div?.qb_class_name || "";
    const reg_item  = atDiv?.qb_payroll_item_reg || div?.qb_payroll_item_reg || "";
    const ot_item   = atDiv?.qb_payroll_item_ot  || div?.qb_payroll_item_ot  || "";
    const reg_hours = Number(p.regular_hours ?? 0);
    const ot_hours  = Number(p.ot_hours  ?? 0);

    const warnings: string[] = [];
    if (!reg_item && reg_hours > 0) warnings.push("missing regular pay item");
    if (!ot_item  && ot_hours  > 0) warnings.push("missing OT pay item");

    rows.push({
      date: p.date_for_payroll,
      employee_display,
      employee_qb,
      at_division_id: (p as any).at_division_id ?? null,
      division_id:    (p as any).division_id    ?? null,
      qb_class,
      reg_item,
      ot_item,
      reg_hours,
      ot_hours,
      warning: warnings.join("; "),
    });
  }

  // ── Preview mode — return JSON summary ────────────────────────────────────
  if (preview) {
    const agg = new Map<string, {
      employee: string; qb_class: string; reg_item: string; ot_item: string;
      reg_hours: number; ot_hours: number; warning: string;
      at_division_id: string | null; division_id: string | null;
    }>();

    for (const r of rows) {
      const key = `${r.employee_display}||${r.qb_class}||${r.reg_item}||${r.ot_item}`;
      if (!agg.has(key)) {
        agg.set(key, {
          employee: r.employee_display, qb_class: r.qb_class,
          reg_item: r.reg_item, ot_item: r.ot_item,
          reg_hours: 0, ot_hours: 0, warning: r.warning,
          at_division_id: r.at_division_id, division_id: r.division_id,
        });
      }
      const entry = agg.get(key)!;
      entry.reg_hours += r.reg_hours;
      entry.ot_hours  += r.ot_hours;
      if (r.warning) entry.warning = r.warning;
    }

    const summary = [...agg.values()].sort((a, b) => a.employee.localeCompare(b.employee) || a.qb_class.localeCompare(b.qb_class));
    const totalReg = summary.reduce((s, r) => s + r.reg_hours, 0);
    const totalOt  = summary.reduce((s, r) => s + r.ot_hours,  0);
    const warnings = summary.filter(r => r.warning).length;

    return NextResponse.json({ summary, total_reg: totalReg, total_ot: totalOt, warnings, punch_count: rows.length });
  }

  // ── IIF generation (TIMEACT format) ──────────────────────────────────────
  // Import via: File → Utilities → Import → IIF Files
  // Only include columns QB Enterprise 23 recognises for TIMEACT
  const lines: string[] = [
    "!TIMEACT\tDATE\tJOB\tEMP\tITEM\tPITEM\tDURATION\tPROJ\tNOTE\tXFERTOPAYROLL\tBILLINGSTATUS",
  ];

  for (const r of rows) {
    const d = fmtDate(r.date);
    if (r.reg_hours > 0 && r.reg_item) {
      // JOB(blank), EMP, ITEM(blank), PITEM, DURATION, PROJ(class), NOTE(blank), XFERTOPAYROLL, BILLINGSTATUS
      lines.push(`TIMEACT\t${d}\t\t${r.employee_qb}\t\t${r.reg_item}\t${decimalToHHMM(r.reg_hours)}\t${r.qb_class}\t\tY\t0`);
    }
    if (r.ot_hours > 0 && r.ot_item) {
      lines.push(`TIMEACT\t${d}\t\t${r.employee_qb}\t\t${r.ot_item}\t${decimalToHHMM(r.ot_hours)}\t${r.qb_class}\t\tY\t0`);
    }
  }

  const iif      = lines.join("\r\n");
  const filename = `garpiel_payroll_${startDate}_${endDate}.iif`;

  return new NextResponse(iif, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
