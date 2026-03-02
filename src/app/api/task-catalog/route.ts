import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// GET /api/task-catalog?divisionId=1&active=1&q=mulch
export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const { searchParams } = new URL(req.url);

  const divisionId = searchParams.get("divisionId");
  const active = searchParams.get("active");
  const q = searchParams.get("q");

  let query = supabase.from("task_catalog").select("*").order("name", { ascending: true });

  if (divisionId) query = query.eq("division_id", Number(divisionId));
  if (active === "1") query = query.eq("active", true);
  if (active === "0") query = query.eq("active", false);

  if (q && q.trim().length > 0) {
    // simple search: name ilike OR any keyword matches (best-effort)
    const term = `%${q.trim()}%`;
    query = query.or(`name.ilike.${term},category.ilike.${term},internal_situation.ilike.${term},default_material_name.ilike.${term}`);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// POST /api/task-catalog
export async function POST(req: NextRequest) {
  const supabase = getSupabase();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const division_id = Number(body?.division_id);
  const name = body?.name;
  const unit = body?.unit;
  const hours_per_unit = Number(body?.hours_per_unit ?? 0);

  if (!division_id || !Number.isFinite(division_id)) {
    return NextResponse.json({ error: "division_id is required" }, { status: 400 });
  }
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!unit || typeof unit !== "string") {
    return NextResponse.json({ error: "unit is required" }, { status: 400 });
  }
  if (!Number.isFinite(hours_per_unit)) {
    return NextResponse.json({ error: "hours_per_unit must be a number" }, { status: 400 });
  }

  const payload = {
    division_id,
    name: name.trim(),
    category: typeof body?.category === "string" ? body.category.trim() : null,
    internal_situation: typeof body?.internal_situation === "string" ? body.internal_situation.trim() : null,
    unit: unit.trim(),
    hours_per_unit,
    min_qty: body?.min_qty ?? null,
    round_qty_to: body?.round_qty_to ?? null,
    default_material_name: typeof body?.default_material_name === "string" ? body.default_material_name.trim() : null,
    default_material_unit: typeof body?.default_material_unit === "string" ? body.default_material_unit.trim() : null,
    default_material_qty_multiplier: Number(body?.default_material_qty_multiplier ?? 1),
    client_facing_template: typeof body?.client_facing_template === "string" ? body.client_facing_template.trim() : null,
    keywords: Array.isArray(body?.keywords) ? body.keywords.filter((x: any) => typeof x === "string").map((x: string) => x.trim()).filter(Boolean) : [],
    seasonal_multiplier: body?.seasonal_multiplier ?? null,
    difficulty_multiplier: body?.difficulty_multiplier ?? null,
    notes: typeof body?.notes === "string" ? body.notes.trim() : null,
    active: body?.active === false ? false : true,
  };

  const { data, error } = await supabase
    .from("task_catalog")
    .insert(payload)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
