import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const runtime = "nodejs";

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

// GET /api/atlasbid/bid-share?bid_id=xxx
export async function GET(req: NextRequest) {
  const bidId = req.nextUrl.searchParams.get("bid_id");
  if (!bidId) return NextResponse.json({ error: "Missing bid_id" }, { status: 400 });

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("bid_share_links")
    .select("id, token, created_at")
    .eq("bid_id", bidId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// POST /api/atlasbid/bid-share
// Body: { bid_id }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.bid_id) return NextResponse.json({ error: "bid_id required" }, { status: 400 });

  const supabase = getSupabase();

  // Check if one already exists
  const { data: existing } = await supabase
    .from("bid_share_links")
    .select("id, token")
    .eq("bid_id", body.bid_id)
    .limit(1)
    .maybeSingle();

  if (existing) return NextResponse.json({ data: existing });

  // Generate URL-safe token in Node.js (postgres 'base64url' encoding not supported)
  const token = crypto.randomBytes(32).toString("base64url");

  const { data, error } = await supabase
    .from("bid_share_links")
    .insert({ bid_id: body.bid_id, token })
    .select("id, token")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

// DELETE /api/atlasbid/bid-share?bid_id=xxx — revoke share link
export async function DELETE(req: NextRequest) {
  const bidId = req.nextUrl.searchParams.get("bid_id");
  if (!bidId) return NextResponse.json({ error: "Missing bid_id" }, { status: 400 });

  const supabase = getSupabase();
  const { error } = await supabase.from("bid_share_links").delete().eq("bid_id", bidId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
