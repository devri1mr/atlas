// src/app/api/bids/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function GET(_req: NextRequest, context: { params: { id: string } }) {
  const { id } = context.params;
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("bids")
    .select("id, client_name, client_last_name, status_id, created_by_email, created_at, bid_statuses(name)")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest, context: { params: { id: string } }) {
  const { id } = context.params;
  const supabase = getSupabase();

  const body = await req.json().catch(() => ({}));
  const client_name = body?.client_name ?? null;
  const client_last_name = body?.client_last_name ?? null;
  const status_id = body?.status_id ?? null;

  const { data, error } = await supabase
    .from("bids")
    .update({
      client_name,
      client_last_name,
      status_id,
    })
    .eq("id", id)
    .select("id, client_name, client_last_name, status_id, created_by_email, created_at, bid_statuses(name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
