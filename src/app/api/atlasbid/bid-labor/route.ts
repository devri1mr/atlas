import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/**
 * GET /api/atlasbid/bid-labor?bid_id=<uuid>
 * Returns rows for a bid
 */
export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const { searchParams } = new URL(req.url);
  const bid_id = searchParams.get("bid_id");

  if (!bid_id) {
    return NextResponse.json({ error: "bid_id is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("bid_labor")
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
    .eq("bid_id", bid_id)
    .order("id", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data ?? [] });
}

/**
 * POST /api/atlasbid/bid-labor
 * Body:
 * {
 *   bid_id: uuid,
 *   task, item, quantity, unit, man_hours, hourly_rate
 * }
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabase();

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const bid_id = body?.bid_id;
  if (!bid_id || typeof bid_id !== "string") {
    return NextResponse.json({ error: "bid_id (uuid string) is required" }, { status: 400 });
  }

  const task = String(body?.task ?? "");
  const item = String(body?.item ?? "");
  const quantity = Number(body?.quantity ?? 0);
  const unit = String(body?.unit ?? "");
  const man_hours = Number(body?.man_hours ?? 0);
  const hourly_rate = Number(body?.hourly_rate ?? 0);

  const { data, error } = await supabase
    .from("bid_labor")
    .insert({
      bid_id,
      task,
      item,
      quantity,
      unit,
      man_hours,
      hourly_rate,
    })
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
