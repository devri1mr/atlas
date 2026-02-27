import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// Accept both possible Next typings for params (object OR Promise<object>)
async function getIdFromContext(context: any): Promise<string | null> {
  if (!context) return null;

  const p = context.params;

  // common case: params is an object
  if (p && typeof p === "object" && typeof p.id === "string") return p.id;

  // other case: params is a Promise
  try {
    const awaited = await p;
    if (awaited && typeof awaited.id === "string") return awaited.id;
  } catch {
    // ignore
  }

  return null;
}

export async function GET(req: Request, context: any) {
  const id = await getIdFromContext(context);

  if (!id) {
    return NextResponse.json({ error: "Missing id param" }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("bids")
    .select("id, client_name, client_last_name, status_id, created_at")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
