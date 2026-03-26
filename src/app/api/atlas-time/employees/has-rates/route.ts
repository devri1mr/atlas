import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ employee_ids: [] });

    const { data } = await sb
      .from("at_pay_rates")
      .select("employee_id")
      .eq("company_id", company.id);

    const ids = [...new Set((data ?? []).map((r: { employee_id: string }) => r.employee_id))];
    return NextResponse.json({ employee_ids: ids });
  } catch (e: any) {
    return NextResponse.json({ employee_ids: [] });
  }
}
