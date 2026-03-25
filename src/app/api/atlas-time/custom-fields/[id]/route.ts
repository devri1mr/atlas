import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).single();
  return data?.id ?? null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body = await req.json();
    const patch: Record<string, any> = {};
    if (body.label !== undefined) patch.label = body.label;
    if (body.field_type !== undefined) patch.field_type = body.field_type;
    if (body.section !== undefined) patch.section = body.section;
    if (body.sort_order !== undefined) patch.sort_order = body.sort_order;
    if (body.active !== undefined) patch.active = body.active;
    if (body.options !== undefined) patch.options = body.options;

    const { data, error } = await sb
      .from("at_custom_field_defs")
      .update(patch)
      .eq("id", id)
      .eq("company_id", companyId)
      .select("id, label, field_key, field_type, section, sort_order, active, options")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { error } = await sb
      .from("at_custom_field_defs")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
