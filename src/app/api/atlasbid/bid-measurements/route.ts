import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// GET /api/atlasbid/bid-measurements?bid_id=<uuid>
export async function GET(req: NextRequest) {
  const bid_id = req.nextUrl.searchParams.get("bid_id");
  if (!bid_id) return NextResponse.json({ error: "bid_id is required" }, { status: 400 });

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("bid_measurements")
    .select("id, bid_id, label, shape_type, path, computed_value, unit, created_at")
    .eq("bid_id", bid_id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

// POST /api/atlasbid/bid-measurements
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { bid_id, label, shape_type, path, computed_value, unit } = body ?? {};
  if (!bid_id || !label || !shape_type || !path || computed_value == null || !unit) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!["polygon", "polyline"].includes(shape_type)) {
    return NextResponse.json({ error: "shape_type must be polygon or polyline" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data: bid, error: bidErr } = await supabase
    .from("bids")
    .select("id, company_id")
    .eq("id", bid_id)
    .single();

  if (bidErr || !bid) return NextResponse.json({ error: "Bid not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("bid_measurements")
    .insert({ bid_id, company_id: bid.company_id, label, shape_type, path, computed_value, unit })
    .select("id, bid_id, label, shape_type, path, computed_value, unit, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data });
}
