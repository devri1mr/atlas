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
    const itemOptionId = searchParams.get("item_option_id");

    let query = sb
      .from("at_uniform_variants")
      .select("id, item_option_id, variant_type, label, cost, sort_order, active")
      .eq("company_id", companyId)
      .order("variant_type", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true });

    if (itemOptionId) query = query.eq("item_option_id", itemOptionId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ variants: data ?? [] });
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
    const { item_option_id, variant_type, label, cost } = body;
    if (!item_option_id || !variant_type || !label?.trim()) {
      return NextResponse.json({ error: "item_option_id, variant_type, and label are required" }, { status: 400 });
    }

    const { data: existing } = await sb
      .from("at_uniform_variants")
      .select("sort_order")
      .eq("company_id", companyId)
      .eq("item_option_id", item_option_id)
      .eq("variant_type", variant_type)
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextSort = ((existing?.[0]?.sort_order ?? 0) as number) + 1;

    const { data, error } = await sb
      .from("at_uniform_variants")
      .insert({ company_id: companyId, item_option_id, variant_type, label: label.trim(), cost: cost != null ? Number(cost) : null, sort_order: nextSort, active: true })
      .select("id, item_option_id, variant_type, label, cost, sort_order, active")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
