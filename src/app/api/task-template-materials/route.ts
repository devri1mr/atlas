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

    const { data, error } = await supabase
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
        details,
        materials_catalog:material_id (
          id,
          name,
          default_unit,
          default_unit_cost,
          vendor,
          sku,
          is_active
        )
      `
      )
      .eq("task_catalog_id", task_catalog_id)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rows: data ?? [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
