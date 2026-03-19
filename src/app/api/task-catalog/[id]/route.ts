import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, any> = {};
  const allowed = [
    "division_id",
    "name",
    "unit",
    "minutes_per_unit",
    "default_qty",
    "client_facing_template",
    "notes",
    "active",
    "difficulty_multiplier",
    "spring_multiplier",
    "summer_multiplier",
    "fall_multiplier",
    "winter_multiplier",
  ];

  for (const k of allowed) {
    if (body[k] !== undefined) updates[k] = body[k];
  }

  if (updates.keywords !== undefined) {
    updates.keywords = Array.isArray(updates.keywords)
      ? updates.keywords.filter((x: any) => typeof x === "string").map((x: string) => x.trim()).filter(Boolean)
      : [];
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("task_catalog")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = getSupabase();
  // Soft delete — mark inactive
  const { error } = await supabase
    .from("task_catalog")
    .update({ active: false })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
