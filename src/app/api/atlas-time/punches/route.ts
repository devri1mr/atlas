import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).single();
  return data?.id ?? null;
}

// GET — returns all open punches (currently clocked in) + today's completed punches
export async function GET(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await sb
      .from("at_punches")
      .select(`
        id, employee_id, clock_in_at, clock_out_at, date_for_payroll,
        punch_method, status, employee_note, manager_note,
        at_employees(id, first_name, last_name, preferred_name, job_title, department_id,
          at_departments(name))
      `)
      .eq("company_id", companyId)
      .eq("date_for_payroll", today)
      .order("clock_in_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ punches: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// POST — clock in
export async function POST(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const employeeId = String(body.employee_id ?? "").trim();
    if (!employeeId) return NextResponse.json({ error: "employee_id required" }, { status: 400 });

    // Check not already clocked in
    const { data: open } = await sb
      .from("at_punches")
      .select("id")
      .eq("employee_id", employeeId)
      .is("clock_out_at", null)
      .maybeSingle();

    if (open) return NextResponse.json({ error: "Already clocked in" }, { status: 409 });

    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    const { data, error } = await sb
      .from("at_punches")
      .insert({
        company_id: companyId,
        employee_id: employeeId,
        clock_in_at: now.toISOString(),
        date_for_payroll: today,
        punch_method: body.punch_method ?? "admin",
        clock_in_lat: body.lat ?? null,
        clock_in_lng: body.lng ?? null,
        employee_note: body.note ?? null,
        status: "open",
      })
      .select("id, employee_id, clock_in_at, clock_out_at, date_for_payroll, punch_method, status")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ punch: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
