import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function makeBidCode(len = 8) {
  // short readable-ish code
  return Math.random().toString(36).slice(2, 2 + len).toUpperCase();
}

export async function GET() {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("bids")
    .select(
      `
      id,
      bid_code,
      client_name,
      client_last_name,
      created_by_email,
      created_at,
      status_id,
      bid_statuses(name)
    `
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const supabase = getSupabase();
  const body = await req.json();

  const { client_name, client_last_name, status_id, created_by_email } = body;

  if (!client_name || !client_last_name) {
    return NextResponse.json({ error: "Client name required" }, { status: 400 });
  }

  // generate unique bid_code (retry a few times)
  let bidCode = makeBidCode();
  for (let i = 0; i < 5; i++) {
    const { data: existing } = await supabase
      .from("bids")
      .select("id")
      .eq("bid_code", bidCode)
      .maybeSingle();

    if (!existing) break;
    bidCode = makeBidCode();
  }

  const { data, error } = await supabase
    .from("bids")
    .insert({
      bid_code: bidCode,
      client_name,
      client_last_name,
      status_id: status_id ?? null,
      created_by_email: created_by_email ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
