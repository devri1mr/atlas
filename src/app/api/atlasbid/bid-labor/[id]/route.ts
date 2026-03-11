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

  const rowId = String(id || "").trim();
  if (!rowId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, any> = {};

  if ("task" in body) updates.task = String(body.task ?? "").trim();
  if ("item" in body) updates.item = String(body.item ?? "").trim();
  if ("quantity" in body) updates.quantity = Number(body.quantity ?? 0);
  if ("unit" in body) updates.unit = String(body.unit ?? "").trim();
  if ("man_hours" in body) updates.man_hours = Number(body.man_hours ?? 0);
  if ("hourly_rate" in body) updates.hourly_rate = Number(body.hourly_rate ?? 0);
  if ("show_as_line_item" in body) {
    updates.show_as_line_item = body.show_as_line_item;
  }

  const { data, error } = await supabase
    .from("bid_labor")
    .update(updates)
    .eq("id", rowId)
    .select(
      `
      id,
      bid_id,
      task,
      item,
      quantity,
      unit,
      man_hours,
      hourly_rate,
      show_as_line_item,
      bundle_run_id,
      created_at
      `
    )
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

  const rowId = String(id || "").trim();
  if (!rowId) {
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
