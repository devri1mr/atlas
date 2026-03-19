import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = supabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const allowed = ["name", "slug", "parent_id", "sort_order", "color", "icon", "is_active"];
  const patch: Record<string, any> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  if (patch.name && !patch.slug) patch.slug = patch.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  const { data, error } = await supabase
    .from("material_categories")
    .update(patch)
    .eq("id", id)
    .select("id, name, slug, parent_id, sort_order, is_active, color, icon")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = supabaseAdmin();
  // Reassign children to parent before deleting
  const { data: cat } = await supabase.from("material_categories").select("parent_id").eq("id", id).maybeSingle();
  await supabase.from("material_categories").update({ parent_id: cat?.parent_id ?? null }).eq("parent_id", id);
  const { error } = await supabase.from("material_categories").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
