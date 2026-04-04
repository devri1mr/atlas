import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const reportId = searchParams.get("id");

    if (reportId) {
      // Full report with jobs + members
      const { data: report, error } = await sb
        .from("lawn_production_reports")
        .select(`
          id, report_date, file_name, imported_at, is_complete,
          total_budgeted_hours, total_actual_hours, total_budgeted_amount, total_actual_amount,
          lawn_production_jobs (
            id, work_order, client_name, client_address, service, service_date, status,
            crew_code, budgeted_hours, real_budgeted_hours, actual_hours, variance_hours, budgeted_amount, actual_amount,
            lawn_production_members (
              id, resource_name, resource_code, employee_id, actual_hours, earned_amount, punch_status,
              reg_hours, ot_hours, total_payroll_hours, pay_rate, payroll_cost
            )
          )
        `)
        .eq("id", reportId)
        .eq("company_id", company.id)
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Fetch punch records for this report (clock in/out times per employee)
      const { data: punches } = await sb
        .from("lawn_report_punches")
        .select("employee_id, resource_name, clock_in_at, clock_out_at, regular_hours, ot_hours, dt_hours")
        .eq("report_id", reportId)
        .order("clock_in_at", { ascending: true });

      return NextResponse.json({ data: report, punches: punches ?? [] });
    }

    // List of reports with payroll cost + earned revenue summed from members
    const { data, error } = await sb
      .from("lawn_production_reports")
      .select(`
        id, report_date, file_name, imported_at, is_complete,
        total_budgeted_hours, total_actual_hours, total_budgeted_amount, total_actual_amount,
        lawn_production_jobs ( lawn_production_members ( employee_id, resource_name, payroll_cost, earned_amount ) )
      `)
      .eq("company_id", company.id)
      .order("report_date", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const reports = (data ?? []).map((r: any) => {
      // payroll_cost is per-person per-day, stored on every job-member row — deduplicate
      // earned_amount is per job-member (each row is unique) — sum all without dedup
      const seen = new Set<string>();
      let totalPayrollCost = 0;
      let totalEarnedAmount = 0;
      for (const job of r.lawn_production_jobs ?? []) {
        for (const m of job.lawn_production_members ?? []) {
          totalEarnedAmount += m.earned_amount ?? 0;
          const key = m.employee_id ?? m.resource_name ?? "";
          if (key && !seen.has(key)) {
            seen.add(key);
            totalPayrollCost += m.payroll_cost ?? 0;
          }
        }
      }
      const { lawn_production_jobs: _, ...rest } = r;
      return { ...rest, total_payroll_cost: totalPayrollCost, total_earned_amount: totalEarnedAmount };
    });

    return NextResponse.json({ data: reports });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { error } = await sb
      .from("lawn_production_reports")
      .delete()
      .eq("id", id)
      .eq("company_id", company.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// PATCH — toggle is_complete on a report
// body: { id, is_complete }
export async function PATCH(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { id, is_complete } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { error } = await sb
      .from("lawn_production_reports")
      .update({ is_complete: !!is_complete })
      .eq("id", id)
      .eq("company_id", company.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
