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
          id, report_date, file_name, imported_at,
          total_budgeted_hours, total_actual_hours, total_budgeted_amount, total_actual_amount,
          lawn_production_jobs (
            id, work_order, client_name, client_address, service, service_date,
            crew_code, budgeted_hours, actual_hours, variance_hours, budgeted_amount, actual_amount,
            lawn_production_members (
              id, resource_name, resource_code, employee_id, actual_hours, earned_amount
            )
          )
        `)
        .eq("id", reportId)
        .eq("company_id", company.id)
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data: report });
    }

    // List of reports (summary only)
    const { data, error } = await sb
      .from("lawn_production_reports")
      .select("id, report_date, file_name, imported_at, total_budgeted_hours, total_actual_hours, total_budgeted_amount, total_actual_amount")
      .eq("company_id", company.id)
      .order("report_date", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
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
