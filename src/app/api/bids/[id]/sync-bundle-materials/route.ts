import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const bidId = params.id;

  try {
    // 1. Delete existing labor-derived materials
    await supabase
      .from("bid_materials")
      .delete()
      .eq("bid_id", bidId)
      .eq("source_type", "labor");

    // 2. Fetch labor rows
    const { data: laborRows, error: laborError } = await supabase
      .from("bid_labor")
      .select("*")
      .eq("bid_id", bidId);

    if (laborError) throw laborError;

    if (!laborRows || laborRows.length === 0) {
      return NextResponse.json({ rows: [] });
    }

    // 3. Fetch all task mappings
    const { data: taskMaterials, error: tmError } = await supabase
      .from("labor_task_materials")
      .select("*");

    if (tmError) throw tmError;

    const { data: tasks } = await supabase.from("labor_tasks").select("*");
    const { data: materials } = await supabase.from("materials").select("*");
    const { data: vendors } = await supabase.from("vendors").select("*");

    // Build lookup maps
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const materialMap = new Map(materials.map((m) => [m.id, m]));
    const vendorMap = new Map(vendors.map((v) => [v.id, v]));

    const rowsToInsert: any[] = [];

    for (const bl of laborRows) {
      const task = tasks.find((t) => t.name === bl.task);
      if (!task) continue;

      const mappings = taskMaterials.filter(
        (m) => m.labor_task_id === task.id
      );

      for (const map of mappings) {
        const material = materialMap.get(map.material_id);
        if (!material) continue;

        const vendor = vendorMap.get(material.vendor_id);

        const baseQty =
          bl.quantity > 0
            ? bl.quantity
            : bl.man_hours > 0
            ? bl.man_hours
            : 0;

        const qty = baseQty * (map.default_quantity || 1);

        rowsToInsert.push({
          id: crypto.randomUUID(),
          bid_id: bidId,
          name: material.display_name || material.name,
          vendor: vendor?.name || "",
          unit: material.unit,
          qty,
          unit_cost: material.unit_cost || 0,
          line_cost: qty * (material.unit_cost || 0),
          is_autofill: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          company_id: bl.company_id,
          source_type: "labor",
          source_task_id: bl.task_catalog_id,
          material_id: material.id,
          source_label: bl.task,
          source_reference_id: bl.bundle_run_id,
          unit_cost_snapshot: material.unit_cost || 0,
          pricing_date_used: new Date().toISOString().slice(0, 10),
        });
      }
    }

    if (rowsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("bid_materials")
        .insert(rowsToInsert);

      if (insertError) throw insertError;
    }

    return NextResponse.json({ rows: rowsToInsert });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Sync failed" },
      { status: 500 }
    );
  }
}
