import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    v
  );
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid bid id" }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("bids")
    .select(
      `
      id,
      client_name,
      client_last_name,
      status_id,
      internal_notes,
      created_at,
      statuses:status_id (
        id,
        name,
        color
      )
      `
    )
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid bid id" }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, any> = {};

  if (body.client_name !== undefined) updates.client_name = body.client_name;
  if (body.client_last_name !== undefined)
    updates.client_last_name = body.client_last_name;
  if (body.status_id !== undefined) updates.status_id = body.status_id;
  if (body.internal_notes !== undefined)
    updates.internal_notes = body.internal_notes;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No fields provided to update" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("bids")
    .update(updates)
    .eq("id", id)
    .select(
      `
      id,
      client_name,
      client_last_name,
      status_id,
      internal_notes,
      created_at,
      statuses:status_id (
        id,
        name,
        color
      )
      `
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
