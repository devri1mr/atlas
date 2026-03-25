import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).single();
  return data?.id ?? null;
}

function toFieldKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export async function GET() {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { data, error } = await sb
      .from("at_custom_field_defs")
      .select("id, label, field_key, field_type, section, sort_order, active, options")
      .eq("company_id", companyId)
      .order("section")
      .order("sort_order");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ fields: data ?? [] });
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
    const { label, field_type, section, options, new_section_label } = body;

    if (!label?.trim()) return NextResponse.json({ error: "Label is required" }, { status: 400 });
    if (!field_type) return NextResponse.json({ error: "Field type is required" }, { status: 400 });

    const field_key = toFieldKey(label.trim()) + "_" + Date.now().toString(36);

    // If creating a new section, insert it into at_field_config first
    const sectionKey = section?.trim();
    if (new_section_label?.trim() && sectionKey) {
      const { data: existing } = await sb
        .from("at_field_config")
        .select("id")
        .eq("company_id", companyId)
        .eq("section", sectionKey)
        .maybeSingle();

      if (!existing) {
        const { data: maxOrder } = await sb
          .from("at_field_config")
          .select("sort_order")
          .eq("company_id", companyId)
          .order("sort_order", { ascending: false })
          .limit(1);

        const nextSort = ((maxOrder?.[0]?.sort_order ?? 0) as number) + 1;
        await sb.from("at_field_config").insert({
          company_id: companyId,
          field_key: sectionKey,
          label: new_section_label.trim(),
          section: sectionKey,
          sort_order: nextSort,
          visible: true,
        });
      }
    }

    // Get sort_order for this section
    const { data: existing } = await sb
      .from("at_custom_field_defs")
      .select("sort_order")
      .eq("company_id", companyId)
      .eq("section", sectionKey)
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextSort = ((existing?.[0]?.sort_order ?? 0) as number) + 1;

    const { data, error } = await sb
      .from("at_custom_field_defs")
      .insert({
        company_id: companyId,
        label: label.trim(),
        field_key,
        field_type,
        section: sectionKey,
        sort_order: nextSort,
        active: true,
        options: options ?? [],
      })
      .select("id, label, field_key, field_type, section, sort_order, active, options")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
