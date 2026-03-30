import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).single();
  return data?.id ?? null;
}

// GET /api/atlas-time/pay-rates?employee_ids=uuid1,uuid2,...
// Returns all at_pay_rates rows for the given employees, ordered by employee + effective_date DESC.
export async function GET(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const empIds = req.nextUrl.searchParams.get("employee_ids")?.split(",").filter(Boolean) ?? [];
    if (!empIds.length) return NextResponse.json({ pay_rates: [] });

    const { data, error } = await sb
      .from("at_pay_rates")
      .select("id, employee_id, division_id, rate, effective_date, end_date, is_default")
      .eq("company_id", companyId)
      .in("employee_id", empIds)
      .order("effective_date", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ pay_rates: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
