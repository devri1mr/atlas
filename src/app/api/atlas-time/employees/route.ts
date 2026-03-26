import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).single();
  return data?.id ?? null;
}

export async function GET() {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { data, error } = await sb
      .from("at_employees")
      .select(`
        id, first_name, last_name, middle_initial, preferred_name, hire_date, job_title,
        pay_type, default_pay_rate, status, department_id, division_id,
        t_shirt_size, date_of_birth, phone, work_email, kiosk_pin, photo_url,
        drivers_license_expiration, dot_card_expiration, fert_license_expiration,
        cpr_expiration, first_aid_expiration,
        at_departments(id, name),
        divisions(id, name)
      `)
      .eq("company_id", companyId)
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ employees: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));

    const firstName = String(body.first_name ?? "").trim();
    const lastName = String(body.last_name ?? "").trim();
    const hireDate = body.hire_date ? String(body.hire_date) : null;

    if (!firstName || !lastName) return NextResponse.json({ error: "First and last name are required" }, { status: 400 });
    if (!hireDate) return NextResponse.json({ error: "Hire date is required" }, { status: 400 });

    const { data: employee, error } = await sb
      .from("at_employees")
      .insert({
        company_id: companyId,
        first_name: firstName,
        last_name: lastName,
        preferred_name: body.preferred_name ? String(body.preferred_name).trim() : null,
        date_of_birth: body.date_of_birth || null,
        hire_date: hireDate,
        personal_email: body.personal_email || null,
        work_email: body.work_email || null,
        phone: body.phone || null,
        address_line1: body.address_line1 || null,
        address_line2: body.address_line2 || null,
        city: body.city || null,
        state: body.state || null,
        zip: body.zip || null,
        department_id: body.department_id || null,
        division_id: body.division_id || null,
        job_title: body.job_title || null,
        pay_type: body.pay_type ?? "hourly",
        default_pay_rate: body.default_pay_rate ? Number(body.default_pay_rate) : null,
        t_shirt_size: body.t_shirt_size || null,
        pants_size: body.pants_size || null,
        jacket_size: body.jacket_size || null,
        hat_size: body.hat_size || null,
        boot_size: body.boot_size || null,
        uniform_notes: body.uniform_notes || null,
        uniform_items: body.uniform_items ?? [],
        emergency_contact_name: body.emergency_contact_name || null,
        emergency_contact_phone: body.emergency_contact_phone || null,
        notes: body.notes || null,
        status: "active",
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Add default pay rate record if rate was provided
    if (body.default_pay_rate && employee?.id) {
      await sb.from("at_pay_rates").insert({
        employee_id: employee.id,
        company_id: companyId,
        label: "Base Rate",
        rate: Number(body.default_pay_rate),
        is_default: true,
      });
    }

    return NextResponse.json({ employee }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
