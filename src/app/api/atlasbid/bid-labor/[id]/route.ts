import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabase();
  const { id } = await ctx.params;

  const rowId = Number(id);
  if (!rowId || Number.isNaN(rowId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await req.json();
  const updates: Record<string, any> = {};

  if ("task" in body) updates.task = body.task;
  if ("item" in body) updates.item = body.item;
  if ("quantity" in body) updates.quantity = body.quantity;
  if ("unit" in body) updates.unit = body.unit;
  if ("man_hours" in body) updates.man_hours = body.man_hours;
  if ("hourly_rate" in body) updates.hourly_rate = body.hourly_rate;
  if ("show_as_line_item" in body) {
    updates.show_as_line_item = body.show_as_line_item;
  }

  const { data, error } = await supabase
    .from("bid_labor")
    .update(updates)
    .eq("id", rowId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ row: data });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabase();
  const { id } = await ctx.params;

  const rowId = Number(id);
  if (!rowId || Number.isNaN(rowId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("bid_labor")
    .delete()
    .eq("id", rowId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
