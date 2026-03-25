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
    if (body.visible !== undefined) patch.visible = body.visible;
    if (body.sort_order !== undefined) patch.sort_order = body.sort_order;

    const { data, error } = await sb
      .from("at_field_config")
      .update(patch)
      .eq("id", id)
      .eq("company_id", companyId)
      .select("id, field_key, label, section, sort_order, visible")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
