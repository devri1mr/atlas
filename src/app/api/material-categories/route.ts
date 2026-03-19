import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
}

export async function GET() {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("material_categories")
    .select("id, name, slug, parent_id, sort_order, is_active, color, icon, created_at")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  // Get company_id from bids table
  const { data: co } = await supabase.from("bids").select("company_id").not("company_id", "is", null).limit(1).maybeSingle();
  const company_id = co?.company_id ?? null;

  const slug = slugify(name);
  const { data, error } = await supabase
    .from("material_categories")
    .insert({
      name,
      slug,
      parent_id: body.parent_id || null,
      sort_order: Number(body.sort_order) || 0,
      color: body.color || null,
      icon: body.icon || null,
      is_active: true,
      company_id,
    })
    .select("id, name, slug, parent_id, sort_order, is_active, color, icon, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
