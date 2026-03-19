import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * GET /api/task-template-materials?task_catalog_id=<uuid>
 * Returns material formulas for a task in the format the scope page expects.
 */
export async function GET(req: Request) {
  try {
    const task_catalog_id = new URL(req.url).searchParams.get("task_catalog_id") || "";
    if (!task_catalog_id) return NextResponse.json({ rows: [] });

    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("task_catalog_materials")
      .select(`
        id,
        task_catalog_id,
        material_id,
        material_name,
        qty_per_unit,
        unit,
        materials (
          id,
          name,
          unit,
          unit_cost
        )
      `)
      .eq("task_catalog_id", task_catalog_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data || []).map((row: any) => {
      const mat = row.materials;
      return {
        id: row.id,
        qty_per_task_unit: row.qty_per_unit,
        unit: row.unit || mat?.unit || null,
        unit_cost: null,
        details: null,
        materials_catalog: mat
          ? { id: mat.id, name: mat.name, default_unit: mat.unit, default_unit_cost: mat.unit_cost ?? 0 }
          : { id: row.material_id || row.id, name: row.material_name || "Unknown", default_unit: row.unit, default_unit_cost: 0 },
      };
    });

    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
