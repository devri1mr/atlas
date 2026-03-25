import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = supabaseAdmin();

    const { data: employee, error } = await sb
      .from("at_employees")
      .select(`
        *,
        at_departments(id, name),
        at_divisions(id, name)
      `)
      .eq("id", params.id)
      .single();

    if (error || !employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

    // Load pay rates
    const { data: payRates } = await sb
      .from("at_pay_rates")
      .select("id, label, rate, effective_date, end_date, is_default")
      .eq("employee_id", params.id)
      .order("effective_date", { ascending: false });

    return NextResponse.json({ employee, pay_rates: payRates ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = supabaseAdmin();
    const body = await req.json().catch(() => ({}));

    const allowed = [
      "first_name","last_name","preferred_name","date_of_birth","hire_date",
      "personal_email","work_email","phone",
      "address_line1","address_line2","city","state","zip",
      "department_id","division_id","job_title",
      "pay_type","default_pay_rate",
      "t_shirt_size","uniform_issued_date",
      "emergency_contact_name","emergency_contact_phone","notes",
      "status","termination_date","termination_reason","termination_notes",
      "final_check_issued","final_check_date","equipment_returned",
      "anniversary_note",
    ];

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (key in body) patch[key] = body[key] === "" ? null : body[key];
    }

    const { data, error } = await sb
      .from("at_employees")
      .update(patch)
      .eq("id", params.id)
      .select("id, first_name, last_name, status, updated_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ employee: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
