import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabase() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "";

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    v
  );
}

/**
 * GET /api/task-catalog?division_id=<uuid>
 * Returns tasks for a division (or all tasks if no division_id provided).
 */
export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      {
        error:
          "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY).",
      },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const division_id = (searchParams.get("division_id") || "").trim();

  let query = supabase
    .from("task_catalog")
    .select(
      `
      id,
      division_id,
      name,
      unit,
      minutes_per_unit,
      default_qty,
      notes,
      min_qty,
      round_qty_to,
      seasonal_multiplier,
      difficulty_multiplier,
      created_at,
      updated_at
      `
    )
    .order("name", { ascending: true });

  if (division_id) {
    if (!isUuid(division_id)) {
      return NextResponse.json(
        { error: "division_id must be a uuid" },
        { status: 400 }
      );
    }
    query = query.eq("division_id", division_id);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}

/**
 * POST /api/task-catalog
 * Body:
 * {
 *   division_id: uuid (required),
 *   name: string (required),
 *   unit?: string|null,
 *   minutes_per_unit?: number|null,
 *   default_qty?: number|null,
 *   notes?: string|null,
 *   min_qty?: number|null,
 *   round_qty_to?: number|null,
 *   seasonal_multiplier?: number|null,
 *   difficulty_multiplier?: number|null
 * }
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      {
        error:
          "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY).",
      },
      { status: 500 }
    );
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const division_id = (body?.division_id || "").trim();
  const name = (body?.name || "").trim();

  if (!division_id || !isUuid(division_id)) {
    return NextResponse.json(
      { error: "division_id is required and must be a uuid" },
      { status: 400 }
    );
  }

  if (!name) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }

  // optional fields (allow null)
  const unit = body?.unit ?? null;
  const minutes_per_unit = body?.minutes_per_unit ?? null;
  const default_qty = body?.default_qty ?? null;
  const notes = body?.notes ?? null;

  const min_qty = body?.min_qty ?? null;
  const round_qty_to = body?.round_qty_to ?? null;
  const seasonal_multiplier = body?.seasonal_multiplier ?? null;
  const difficulty_multiplier = body?.difficulty_multiplier ?? null;

  const { data, error } = await supabase
    .from("task_catalog")
    .insert({
      division_id,
      name,
      unit,
      minutes_per_unit,
      default_qty,
      notes,
      min_qty,
      round_qty_to,
      seasonal_multiplier,
      difficulty_multiplier,
    })
    .select(
      `
      id,
      division_id,
      name,
      unit,
      minutes_per_unit,
      default_qty,
      notes,
      min_qty,
      round_qty_to,
      seasonal_multiplier,
      difficulty_multiplier,
      created_at,
      updated_at
      `
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
