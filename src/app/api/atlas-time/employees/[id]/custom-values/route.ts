import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).single();
  return data?.id ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();

    const { data, error } = await sb
      .from("at_custom_field_values")
      .select("field_def_id, value")
      .eq("employee_id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const map: Record<string, string> = {};
    for (const row of data ?? []) map[row.field_def_id] = row.value ?? "";
    return NextResponse.json({ values: map });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// POST — upsert all values for an employee at once
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body = await req.json();
    // values: { [field_def_id]: string }
    const values: Record<string, string> = body.values ?? {};

    const upserts = Object.entries(values).map(([field_def_id, value]) => ({
      employee_id: id,
      company_id: companyId,
      field_def_id,
      value: value ?? "",
      updated_at: new Date().toISOString(),
    }));

    if (upserts.length === 0) return NextResponse.json({ ok: true });

    const { error } = await sb
      .from("at_custom_field_values")
      .upsert(upserts, { onConflict: "employee_id,field_def_id" });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
