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
  // accepts v4 and other UUID versions
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    v
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  if (!id || !isUuid(id)) {
    return NextResponse.json(
      { error: "Invalid bid id" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("bids")
    .select("id, client_name, client_last_name, status_id, internal_notes, created_at")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  if (!id || !isUuid(id)) {
    return NextResponse.json(
      { error: "Invalid bid id" },
      { status: 400 }
    );
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const updates: Record<string, any> = {};

  if (body.client_name !== undefined) updates.client_name = body.client_name;
  if (body.client_last_name !== undefined)
    updates.client_last_name = body.client_last_name;

  // status_id can be null to clear
  if (body.status_id !== undefined) updates.status_id = body.status_id;

  if (body.internal_notes !== undefined)
    updates.internal_notes = body.internal_notes;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No fields provided to update" },
      { status: 400 }
    );
  }

  // Basic validation (keep it permissive)
  if (updates.client_name !== undefined && typeof updates.client_name !== "string") {
    return NextResponse.json({ error: "client_name must be a string" }, { status: 400 });
  }
  if (
    updates.client_last_name !== undefined &&
    typeof updates.client_last_name !== "string"
  ) {
    return NextResponse.json({ error: "client_last_name must be a string" }, { status: 400 });
  }
  if (
    updates.internal_notes !== undefined &&
    updates.internal_notes !== null &&
    typeof updates.internal_notes !== "string"
  ) {
    return NextResponse.json({ error: "internal_notes must be a string or null" }, { status: 400 });
  }
  if (updates.status_id !== undefined && updates.status_id !== null) {
    if (typeof updates.status_id !== "number") {
      return NextResponse.json({ error: "status_id must be a number or null" }, { status: 400 });
    }
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("bids")
    .update(updates)
    .eq("id", id)
    .select("id, client_name, client_last_name, status_id, internal_notes, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
