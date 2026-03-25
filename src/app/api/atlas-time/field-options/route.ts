import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).single();
  return data?.id ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const fieldKey = searchParams.get("field_key");

    let query = sb
      .from("at_field_options")
      .select("id, field_key, label, cost, sort_order, active, is_default, default_qty, subsection, requires_size")
      .eq("company_id", companyId)
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true });

    if (fieldKey) query = query.eq("field_key", fieldKey);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ options: data ?? [] });
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
    const { field_key, label, cost, is_default, default_qty, subsection } = body;
    if (!field_key || !label?.trim()) {
      return NextResponse.json({ error: "field_key and label are required" }, { status: 400 });
    }

    // Get max sort_order for this field
    const { data: existing } = await sb
      .from("at_field_options")
      .select("sort_order")
      .eq("company_id", companyId)
      .eq("field_key", field_key)
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextSort = ((existing?.[0]?.sort_order ?? 0) as number) + 1;

    const { data, error } = await sb
      .from("at_field_options")
      .insert({
        company_id: companyId, field_key, label: label.trim(),
        cost: cost != null ? Number(cost) : null,
        sort_order: nextSort, active: true,
        is_default: is_default ?? false,
        default_qty: default_qty != null ? Number(default_qty) : 1,
        subsection: subsection || null,
        requires_size: body.requires_size !== false,
      })
      .select("id, field_key, label, cost, sort_order, active, is_default, default_qty, subsection, requires_size")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
