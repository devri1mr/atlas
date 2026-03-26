import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).single();
  return data?.id ?? null;
}

// GET — returns clock-in status + last active date per employee
// { status: { [employee_id]: { is_clocked_in: boolean; last_active: string | null } } }
export async function GET() {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    // Fetch recent punches (last 120 days) — enough to cover "last active"
    const since = new Date();
    since.setDate(since.getDate() - 120);
    const sinceStr = since.toISOString().slice(0, 10);

    const { data: punches, error } = await sb
      .from("at_punches")
      .select("employee_id, date_for_payroll, clock_out_at")
      .eq("company_id", companyId)
      .gte("date_for_payroll", sinceStr)
      .order("date_for_payroll", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Build per-employee status map
    const statusMap: Record<string, { is_clocked_in: boolean; last_active: string | null }> = {};

    for (const p of (punches ?? [])) {
      const empId = p.employee_id as string;
      if (!statusMap[empId]) {
        statusMap[empId] = { is_clocked_in: false, last_active: null };
      }
      // Open punch = currently clocked in
      if (!p.clock_out_at) {
        statusMap[empId].is_clocked_in = true;
      }
      // First entry per employee (already ordered DESC) = last active date
      if (!statusMap[empId].last_active) {
        statusMap[empId].last_active = p.date_for_payroll as string;
      }
    }

    return NextResponse.json({ status: statusMap });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
