import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

/* =========================
   GET ALL COMPLEXITY LEVELS
========================= */
export async function GET() {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("complexity_levels")
    .select("*")
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

/* =========================
   UPDATE COMPLEXITY LEVEL
========================= */
export async function PATCH(req: NextRequest) {
  const supabase = getSupabase();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, name, multiplier, display_order, is_active } = body;

  if (!id) {
    return NextResponse.json(
      { error: "ID is required" },
      { status: 400 }
    );
  }

  const updates: any = {};

  if (name !== undefined) updates.name = name;
  if (multiplier !== undefined) updates.multiplier = multiplier;
  if (display_order !== undefined) updates.display_order = display_order;
  if (is_active !== undefined) updates.is_active = is_active;

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("complexity_levels")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
