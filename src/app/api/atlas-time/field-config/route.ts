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
      .from("at_field_config")
      .select("id, field_key, label, section, sort_order, visible")
      .eq("company_id", companyId)
      .order("sort_order", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ sections: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body = await req.json();
    const { label, section } = body;
    if (!label?.trim() || !section?.trim()) {
      return NextResponse.json({ error: "label and section are required" }, { status: 400 });
    }

    const { data: existing } = await sb
      .from("at_field_config")
      .select("id")
      .eq("company_id", companyId)
      .eq("section", section.trim())
      .maybeSingle();
    if (existing) return NextResponse.json({ error: "Section already exists" }, { status: 409 });

    const { data: maxOrder } = await sb
      .from("at_field_config")
      .select("sort_order")
      .eq("company_id", companyId)
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextSort = ((maxOrder?.[0]?.sort_order ?? 0) as number) + 1;

    const { data, error } = await sb
      .from("at_field_config")
      .insert({ company_id: companyId, field_key: section.trim(), label: label.trim(), section: section.trim(), sort_order: nextSort, visible: true })
      .select("id, field_key, label, section, sort_order, visible")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body = await req.json();
    // Expects: { updates: [{ id, sort_order, visible }] }
    const updates: { id: string; sort_order: number; visible: boolean }[] = body.updates ?? [];

    for (const u of updates) {
      const { error } = await sb
        .from("at_field_config")
        .update({ sort_order: u.sort_order, visible: u.visible })
        .eq("id", u.id)
        .eq("company_id", companyId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
