import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FERT_DIVISION_ID = "e710c6f9-d290-4004-8e55-303392eeb826";
const PAYROLL_BURDEN   = 1.15;

// GET ?report_id=xxx
// Returns { non_production: [...], unmatched: [...] }
// unmatched = fert punches on the report date not already in production members or non-prod days
export async function GET(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const reportId = new URL(req.url).searchParams.get("report_id");
    if (!reportId) return NextResponse.json({ error: "report_id required" }, { status: 400 });

    // Get report date
    const { data: report } = await sb
      .from("fert_production_reports")
      .select("report_date, company_id")
      .eq("id", reportId)
      .single();

    if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    // Get existing non-production days for this report
    const { data: nonProd } = await sb
      .from("fert_non_production_days")
      .select("*")
      .eq("report_id", reportId)
      .order("created_at");

    // Collect already-accounted employee IDs
    // 1. Production members
    const { data: prodMembers } = await sb
      .from("fert_production_jobs")
      .select("fert_production_members(employee_id)")
      .eq("report_id", reportId);

    const prodEmpIds = new Set<string>();
    for (const job of prodMembers ?? []) {
      for (const m of (job as any).fert_production_members ?? []) {
        if (m.employee_id) prodEmpIds.add(m.employee_id);
      }
    }

    // 2. Non-production days
    const nonProdEmpIds = new Set<string>(
      (nonProd ?? []).map((r: any) => r.employee_id).filter(Boolean)
    );

    // All accounted-for IDs
    const accountedIds = new Set([...prodEmpIds, ...nonProdEmpIds]);

    // Fetch all fert punches on the report date
    const { data: punches } = await sb
      .from("at_punches")
      .select("employee_id, clock_in_at, clock_out_at, regular_hours, ot_hours, dt_hours, date_for_payroll")
      .eq("division_id", FERT_DIVISION_ID)
      .eq("date_for_payroll", report.report_date)
      .not("clock_out_at", "is", null);

    const unmatchedPunches = (punches ?? []).filter((p: any) => p.employee_id && !accountedIds.has(p.employee_id));

    if (unmatchedPunches.length === 0) {
      return NextResponse.json({ non_production: nonProd ?? [], unmatched: [] });
    }

    // Enrich unmatched with employee names and pay rates
    const unmatchedIds = unmatchedPunches.map((p: any) => p.employee_id);

    const [{ data: employees }, { data: payRates }] = await Promise.all([
      sb.from("at_employees")
        .select("id, first_name, last_name, default_pay_rate")
        .in("id", unmatchedIds),
      sb.from("at_pay_rates")
        .select("employee_id, rate, is_default")
        .in("employee_id", unmatchedIds),
    ]);

    const empMap = new Map((employees ?? []).map((e: any) => [e.id, e]));
    const rateMap = new Map<string, number>();
    for (const emp of employees ?? []) {
      rateMap.set(emp.id, Number(emp.default_pay_rate ?? 0));
    }
    for (const r of payRates ?? []) {
      if (r.is_default) rateMap.set(r.employee_id, Number(r.rate));
    }

    const unmatched = unmatchedPunches.map((p: any) => {
      const emp       = empMap.get(p.employee_id) as any;
      const firstName = emp?.first_name ?? "";
      const lastName  = emp?.last_name  ?? "";
      const name      = firstName || lastName ? `${firstName} ${lastName}`.trim() : p.employee_id;
      const payRate   = rateMap.get(p.employee_id) ?? 0;
      const totalHrs  = Number(p.regular_hours ?? 0) + Number(p.ot_hours ?? 0) + Number(p.dt_hours ?? 0);
      const payrollCost = Math.round(totalHrs * payRate * PAYROLL_BURDEN * 100) / 100;

      return {
        employee_id:   p.employee_id,
        resource_name: name,
        clock_in_at:   p.clock_in_at,
        clock_out_at:  p.clock_out_at,
        reg_hours:     Number(p.regular_hours ?? 0),
        ot_hours:      Number(p.ot_hours ?? 0),
        total_hours:   totalHrs,
        pay_rate:      payRate,
        payroll_cost:  payrollCost,
      };
    });

    return NextResponse.json({ non_production: nonProd ?? [], unmatched });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// POST — sign off a non-production day
// body: { report_id, report_date, employee_id, resource_name, reason, notes,
//         clock_in_at, clock_out_at, reg_hours, ot_hours, total_hours, pay_rate }
export async function POST(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const {
      report_id, report_date, employee_id, resource_name,
      reason, notes, clock_in_at, clock_out_at,
      reg_hours, ot_hours, total_hours, pay_rate,
    } = body;

    if (!report_id || !resource_name) {
      return NextResponse.json({ error: "report_id and resource_name required" }, { status: 400 });
    }

    const totalHrs    = Number(total_hours ?? 0);
    const rate        = Number(pay_rate ?? 0);
    const payrollCost = Math.round(totalHrs * rate * PAYROLL_BURDEN * 100) / 100;

    const { data, error } = await sb
      .from("fert_non_production_days")
      .insert({
        company_id:    company.id,
        report_id,
        report_date,
        employee_id:   employee_id || null,
        resource_name,
        reason:        reason || null,
        notes:         notes  || null,
        clock_in_at:   clock_in_at  || null,
        clock_out_at:  clock_out_at || null,
        reg_hours:     Number(reg_hours ?? 0),
        ot_hours:      Number(ot_hours  ?? 0),
        total_hours:   totalHrs,
        pay_rate:      rate,
        payroll_cost:  payrollCost,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// PATCH ?id= — update reason/notes on a signed-off day
export async function PATCH(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const body = await req.json().catch(() => ({}));
    const { id, reason, notes } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { error } = await sb
      .from("fert_non_production_days")
      .update({ reason: reason || null, notes: notes || null })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// DELETE ?id= — remove a sign-off
export async function DELETE(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { error } = await sb.from("fert_non_production_days").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
