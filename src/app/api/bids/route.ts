import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

export async function GET() {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("bids")
    .select(`
      id,
      client_name,
      client_last_name,
      created_at,
      status_id,
      bid_statuses(name)
    `)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const supabase = getSupabase();
  const body = await req.json();

  const { client_name, client_last_name, status_id } = body;

  if (!client_name || !client_last_name) {
    return NextResponse.json(
      { error: "Client name required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("bids")
    .insert({
      client_name,
      client_last_name,
      status_id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
