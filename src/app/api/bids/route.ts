// src/app/api/bids/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// Accept number OR numeric string ("12") OR null/undefined/""
function coerceNullableInt(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n;
  }
  return NaN as any; // used to detect invalid
}

/* =========================
   GET ALL BIDS
========================= */
export async function GET() {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("bids")
    .select(
      `
      id,
      client_name,
      client_last_name,
      created_at,
      status_id,
      division_id,
      internal_notes,
      statuses:status_id (
        id,
        name,
        color
      )
      `
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

/* =========================
   CREATE NEW BID
========================= */
export async function POST(req: NextRequest) {
  const supabase = getSupabase();

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const client_name = body?.client_name;
  const client_last_name = body?.client_last_name;

  const internal_notes = body?.internal_notes ?? null;

  // Coerce these (because UI often sends strings from selects)
  const status_id_raw = body?.status_id ?? null;
  const division_id_raw = body?.division_id ?? null;

  const status_id = coerceNullableInt(status_id_raw);
  const division_id = coerceNullableInt(division_id_raw);

  if (!client_name || !client_last_name) {
    return NextResponse.json({ error: "Client name required" }, { status: 400 });
  }

  if (typeof client_name !== "string" || typeof client_last_name !== "string") {
    return NextResponse.json(
      { error: "client_name and client_last_name must be strings" },
      { status: 400 }
    );
  }

  if (internal_notes !== null && typeof internal_notes !== "string") {
    return NextResponse.json(
      { error: "internal_notes must be a string or null" },
      { status: 400 }
    );
  }

  // Validate status_id if present
  if (status_id !== null && !Number.isFinite(status_id as number)) {
    return NextResponse.json(
      { error: "status_id must be a number (or numeric string) or null" },
      { status: 400 }
    );
  }

  // Validate division_id if present
  if (division_id !== null && !Number.isFinite(division_id as number)) {
    return NextResponse.json(
      { error: "division_id must be a number (or numeric string) or null" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("bids")
    .insert({
      client_name,
      client_last_name,
      status_id,
      internal_notes,
      division_id,
    })
    .select(
      `
      id,
      client_name,
      client_last_name,
      status_id,
      division_id,
      internal_notes,
      created_at
      `
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
