import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** GET /api/task-catalog-materials?task_catalog_id=<uuid> */
export async function GET(req: NextRequest) {
  const taskCatalogId = new URL(req.url).searchParams.get("task_catalog_id") || "";
  if (!taskCatalogId) return NextResponse.json({ rows: [] });

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("task_catalog_materials")
    .select("id, task_catalog_id, material_id, material_name, qty_per_unit, unit")
    .eq("task_catalog_id", taskCatalogId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with names from materials_catalog
  const matIds = (data || []).map((r: any) => r.material_id).filter(Boolean);
  let nameMap: Record<string, string> = {};
  if (matIds.length > 0) {
    const { data: cats } = await supabase.from("materials_catalog").select("id, name").in("id", matIds);
    for (const c of cats ?? []) nameMap[c.id] = c.name;
  }
  const rows = (data || []).map((r: any) => ({
    ...r,
    materials: r.material_id ? { id: r.material_id, name: nameMap[r.material_id] || r.material_name || null, unit: null, unit_cost: null } : null,
  }));
  return NextResponse.json({ rows });
}

/** POST /api/task-catalog-materials */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const task_catalog_id = String(body?.task_catalog_id || "").trim();
    const material_id = String(body?.material_id || "").trim() || null;
    const material_name = String(body?.material_name || "").trim() || null;
    const qty_per_unit = Number(body?.qty_per_unit);
    const unit = String(body?.unit || "").trim() || null;

    if (!task_catalog_id || !isUuid(task_catalog_id)) {
      return NextResponse.json({ error: "task_catalog_id is required" }, { status: 400 });
    }
    if (!Number.isFinite(qty_per_unit) || qty_per_unit <= 0) {
      return NextResponse.json({ error: "qty_per_unit must be > 0" }, { status: 400 });
    }
    if (!material_id && !material_name) {
      return NextResponse.json({ error: "material_id or material_name is required" }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("task_catalog_materials")
      .insert({ task_catalog_id, material_id, material_name, qty_per_unit, unit })
      .select(`id, task_catalog_id, material_id, material_name, qty_per_unit, unit, materials ( id, name, unit, unit_cost )`)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ row: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
