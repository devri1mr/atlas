import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || "").trim());
}

// PATCH /api/materials-catalog/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = supabaseAdmin();
  const body = await req.json().catch(() => ({}));

  const allowed = ["name", "default_unit", "default_unit_cost", "vendor", "sku", "is_active", "category_id", "source_pricing_book_id", "source_page"];
  const patch: Record<string, any> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  if (patch.category_id && !isUuid(patch.category_id)) patch.category_id = null;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  const { data, error } = await supabase
    .from("materials_catalog")
    .update(patch)
    .eq("id", id)
    .select("id, name, default_unit, default_unit_cost, vendor, sku, is_active, category_id, created_at, source_pricing_book_id, source_page")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// DELETE /api/materials-catalog/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  // Clear any materials rows still pointing at this catalog entry
  await supabase.from("materials").update({ catalog_material_id: null }).eq("catalog_material_id", id);

  const { error } = await supabase.from("materials_catalog").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
