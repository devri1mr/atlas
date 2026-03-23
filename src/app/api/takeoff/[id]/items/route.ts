import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("takeoff_items")
      .select("*")
      .eq("takeoff_id", params.id)
      .order("sort_order")
      .order("created_at");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = supabaseAdmin();
    const body = await req.json().catch(() => ({}));
    const common_name = String(body.common_name ?? "").trim();
    if (!common_name) return NextResponse.json({ error: "common_name is required" }, { status: 400 });

    // Get next sort order
    const { count } = await sb
      .from("takeoff_items")
      .select("id", { count: "exact", head: true })
      .eq("takeoff_id", params.id);

    const { data, error } = await sb
      .from("takeoff_items")
      .insert({
        takeoff_id: params.id,
        common_name,
        botanical_name: body.botanical_name ?? null,
        category: body.category ?? "other",
        size: body.size ?? null,
        container: body.container ?? null,
        spacing: body.spacing ?? null,
        designation: body.designation ?? null,
        remarks: body.remarks ?? null,
        color: body.color ?? CATEGORY_COLORS[body.category ?? "other"] ?? "#6b7280",
        symbol: body.symbol ?? "●",
        count: body.count ?? 0,
        unit: body.unit ?? "EA",
        unit_price: body.unit_price ?? null,
        sort_order: count ?? 0,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = supabaseAdmin();
    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const allowed = ["common_name","botanical_name","category","size","container",
                     "spacing","designation","remarks","color","symbol","count","unit","unit_price","sort_order"];
    const patch: Record<string, any> = {};
    for (const k of allowed) if (body[k] !== undefined) patch[k] = body[k];

    const { data, error } = await sb
      .from("takeoff_items")
      .update(patch)
      .eq("id", id)
      .eq("takeoff_id", params.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = supabaseAdmin();
    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get("id");
    if (!itemId) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { error } = await sb
      .from("takeoff_items")
      .delete()
      .eq("id", itemId)
      .eq("takeoff_id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

const CATEGORY_COLORS: Record<string, string> = {
  tree:        "#15803d",
  shrub:       "#7c3aed",
  perennial:   "#ea580c",
  grass:       "#ca8a04",
  groundcover: "#0891b2",
  area:        "#2563eb",
  length:      "#dc2626",
  other:       "#6b7280",
};
