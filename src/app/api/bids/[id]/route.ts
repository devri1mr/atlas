import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const supabase = getSupabase();
  const id = ctx.params.id;

  const { data, error } = await supabase
    .from("bids")
    .select("id, client_name, client_last_name, division_id, bid_code, created_at, status_id, internal_notes")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
