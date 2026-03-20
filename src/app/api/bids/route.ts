// src/app/api/bids/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
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
      customer_name,
      created_at,
      status_id,
      internal_notes,
      division_id,
      address,
      city,
      state,
      sell_rounded,
      total_cost,
      labor_cost,
      material_cost,
      trucking_cost,
      target_gp_pct,
      prepay_enabled,
      statuses:status_id (
        id,
        name,
        color
      ),
      divisions:division_id (
        id,
        name
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

  const status_id = body?.status_id ?? null;
  const internal_notes = body?.internal_notes ?? null;

  // ✅ UUID string now
  const division_id = body?.division_id ?? null;

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

  if (status_id !== null && typeof status_id !== "number") {
    return NextResponse.json(
      { error: "status_id must be a number or null" },
      { status: 400 }
    );
  }

  // ✅ IMPORTANT: block NaN/number mistakes and enforce UUID string
  if (division_id !== null && typeof division_id !== "string") {
    return NextResponse.json(
      { error: "division_id must be a UUID string or null" },
      { status: 400 }
    );
  }
const { data: companyRow, error: companyError } = await supabase
  .from("companies")
  .select("id")
  .limit(1)
  .single();

if (companyError || !companyRow?.id) {
  return NextResponse.json(
    { error: companyError?.message || "No company found." },
    { status: 500 }
  );
}
  const { data, error } = await supabase
    .from("bids")
    .insert({
      company_id: companyRow.id,
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
      internal_notes,
      division_id,
      created_at
      `
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
