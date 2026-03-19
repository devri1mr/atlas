import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/inventory-locations
export async function GET() {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("inventory_locations")
    .select("id, name, is_active, created_at")
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// POST /api/inventory-locations
export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const { data, error } = await supabase
    .from("inventory_locations")
    .insert({ name, is_active: true })
    .select("id, name, is_active, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
