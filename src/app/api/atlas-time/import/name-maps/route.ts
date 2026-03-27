import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).single();
  return data?.id ?? null;
}

// POST — save a csv_name → employee_id mapping (upsert)
export async function POST(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const csv_name   = String(body.csv_name ?? "").trim();
    const employee_id = String(body.employee_id ?? "").trim();
    if (!csv_name || !employee_id) return NextResponse.json({ error: "csv_name and employee_id required" }, { status: 400 });

    const { error } = await sb.from("at_import_name_maps").upsert(
      { company_id: companyId, csv_name, employee_id },
      { onConflict: "company_id,csv_name" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
