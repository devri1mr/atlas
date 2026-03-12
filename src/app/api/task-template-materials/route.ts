import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const url = new URL(req.url);

    const task_catalog_id = url.searchParams.get("task_catalog_id") || "";

    if (!task_catalog_id) {
      return NextResponse.json(
        { error: "Missing task_catalog_id" },
        { status: 400 }
      );
    }

    const { data: templateRows, error: templateError } = await supabase
      .from("task_template_materials")
      .select(
        `
        id,
        division_id,
        task_catalog_id,
        material_id,
        qty_per_task_unit,
        unit,
        unit_cost,
        details
      `
      )
      .eq("task_catalog_id", task_catalog_id);

    if (templateError) {
      return NextResponse.json(
        { error: templateError.message },
        { status: 500 }
      );
    }

    if (!templateRows || templateRows.length === 0) {
      return NextResponse.json({ rows: [] });
    }

    const materialIds = templateRows
      .map((r) => r.material_id)
      .filter(Boolean);

    const { data: materialsRows, error: materialsError } = await supabase
      .from("materials_catalog")
      .select(
        `
        id,
        name,
        default_unit,
        default_unit_cost,
        vendor,
        sku,
        is_active
      `
      )
      .in("id", materialIds);

    if (materialsError) {
      return NextResponse.json(
        { error: materialsError.message },
        { status: 500 }
      );
    }

    const materialsMap = new Map(
      (materialsRows || []).map((m) => [m.id, m])
    );

    const rows = templateRows.map((row) => ({
      ...row,
      materials_catalog: materialsMap.get(row.material_id) || null,
    }));

    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
