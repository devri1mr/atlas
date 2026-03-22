import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/**
 * GET /api/atlasbid/bid-labor?bid_id=<uuid>
 */
export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const { searchParams } = new URL(req.url);
  const bid_id = searchParams.get("bid_id");

  if (!bid_id) {
    return NextResponse.json({ error: "bid_id is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("bid_labor")
    .select(`
      id,
      bid_id,
      task_catalog_id,
      task,
      item,
      proposal_text,
      proposal_section,
      quantity,
      unit,
      man_hours,
      hourly_rate,
      show_as_line_item,
      hidden_from_proposal,
      bundle_run_id,
      difficulty_level,
      created_at,
      task_catalog:task_catalog_id (
        minutes_per_unit,
        spring_multiplier,
        summer_multiplier,
        fall_multiplier,
        winter_multiplier
      )
    `)
    .eq("bid_id", bid_id)
    .order("id", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data ?? [] });
}

/**
 * POST /api/atlasbid/bid-labor
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabase();

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const bid_id = body?.bid_id;
  if (!bid_id || typeof bid_id !== "string") {
    return NextResponse.json(
      { error: "bid_id (uuid string) is required" },
      { status: 400 }
    );
  }

  const task_catalog_id =
    typeof body?.task_catalog_id === "string"
      ? body.task_catalog_id
      : null;

  const task = String(body?.task ?? "").trim();
  const item = String(body?.item ?? "").trim();
  const proposal_text = String(body?.proposal_text ?? body?.task ?? "").trim();
  const proposal_section = body?.proposal_section ? String(body.proposal_section).trim() : null;
  const quantity = Number(body?.quantity ?? 0);
  const unit = String(body?.unit ?? "").trim();
  const man_hours = Number(body?.man_hours ?? 0);
  const hourly_rate = Number(body?.hourly_rate ?? 0);

  if (!task) {
    return NextResponse.json({ error: "task is required" }, { status: 400 });
  }

  if (!unit) {
    return NextResponse.json({ error: "unit is required" }, { status: 400 });
  }

  const { data: bidRow, error: bidError } = await supabase
    .from("bids")
    .select("id, company_id, division_id")
    .eq("id", bid_id)
    .single();

  if (bidError || !bidRow?.id) {
    return NextResponse.json(
      { error: bidError?.message || "Bid not found" },
      { status: 404 }
    );
  }

  if (!bidRow.company_id) {
    return NextResponse.json(
      { error: "Bid is missing company_id" },
      { status: 400 }
    );
  }

  const insertPayload = {
    bid_id,
    company_id: bidRow.company_id,
    task_catalog_id,
    task,
    item,
    proposal_text,
    proposal_section,
    quantity,
    unit,
    man_hours,
    hourly_rate,
  };

  const { data, error } = await supabase
    .from("bid_labor")
    .insert(insertPayload)
    .select(`
      id,
      bid_id,
      task_catalog_id,
      task,
      item,
      proposal_text,
      proposal_section,
      quantity,
      unit,
      man_hours,
      hourly_rate,
      show_as_line_item,
      hidden_from_proposal,
      bundle_run_id,
      difficulty_level,
      created_at,
      task_catalog:task_catalog_id (
        minutes_per_unit,
        spring_multiplier,
        summer_multiplier,
        fall_multiplier,
        winter_multiplier
      )
    `)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ row: data });
}
