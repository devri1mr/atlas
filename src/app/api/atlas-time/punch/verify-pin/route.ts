import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).single();
  return data?.id ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const pin = String(body.pin ?? "").trim();
    if (!pin) return NextResponse.json({ error: "PIN required" }, { status: 400 });

    const { data: employee } = await sb
      .from("at_employees")
      .select(`
        id, first_name, last_name, preferred_name, job_title, department_id,
        at_departments(id, name)
      `)
      .eq("company_id", companyId)
      .eq("kiosk_pin", pin)
      .eq("status", "active")
      .maybeSingle();

    if (!employee) return NextResponse.json({ error: "PIN not found" }, { status: 404 });

    // Check if currently clocked in
    const { data: openPunch } = await sb
      .from("at_punches")
      .select("id, clock_in_at, division_id, at_divisions(id, name)")
      .eq("employee_id", employee.id)
      .is("clock_out_at", null)
      .maybeSingle();

    // Get divisions: company-wide + time-clock-only extras
    const [companyDivs, extraDivs] = await Promise.all([
      sb.from("divisions").select("id, name").eq("active", true).order("name"),
      sb.from("at_divisions").select("id, name").eq("company_id", companyId).eq("active", true).eq("time_clock_only", true).order("name"),
    ]);

    const divisions = [
      ...(companyDivs.data ?? []),
      ...(extraDivs.data ?? []),
    ];

    return NextResponse.json({
      employee,
      open_punch: openPunch ?? null,
      divisions,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
