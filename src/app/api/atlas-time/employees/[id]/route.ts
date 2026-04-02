import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();

    const { data: employee, error } = await sb
      .from("at_employees")
      .select(`
        *,
        at_departments(id, name),
        divisions(id, name)
      `)
      .eq("id", id)
      .single();

    if (error || !employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

    const payRatesRes = await sb.from("at_pay_rates")
      .select("id, division_id, division_name, qb_class, rate, effective_date, end_date, is_default")
      .eq("employee_id", id)
      .order("effective_date", { ascending: false });

    return NextResponse.json({
      employee,
      pay_rates: payRatesRes.data ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();
    const body = await req.json().catch(() => ({}));

    const allowed = [
      "first_name","last_name","middle_initial","preferred_name","date_of_birth","hire_date","first_working_day",
      "personal_email","work_email","phone",
      "address_line1","address_line2","city","state","zip",
      "department_id","division_id","default_at_division_id","job_title","kiosk_pin",
      "pay_type","default_pay_rate",
      "t_shirt_size","pants_size","jacket_size","hat_size","boot_size",
      "uniform_issued_date","uniform_notes","uniform_items","uniform_repayment_deadline",
      "emergency_contact_name","emergency_contact_phone","notes",
      "status","termination_date","termination_reason","termination_notes",
      "eligible_for_rehire",
      "final_check_issued","final_check_date","equipment_returned",
      "access_revoked_at","anniversary_note",
      "i9_on_file","is_driver","license_type","drivers_license_number",
      "drivers_license_expiration","dot_card_expiration","fert_license_expiration",
      "cpr_expiration","first_aid_expiration",
      "health_care_plan","electronic_devices","pto_plan",
      "lunch_auto_deduct","lunch_deduct_after_hours","lunch_deduct_minutes",
    ];

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (key in body) patch[key] = body[key] === "" ? null : body[key];
    }

    const { data, error } = await sb
      .from("at_employees")
      .update(patch)
      .eq("id", id)
      .select("id, first_name, last_name, status, updated_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ employee: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
