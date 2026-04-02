import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { estToday } from "@/lib/estTime";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bidId } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { error: deleteError } = await supabase
      .from("bid_materials")
      .delete()
      .eq("bid_id", bidId)
      .eq("source_type", "labor");

    if (deleteError) throw deleteError;

    const { data: laborRows, error: laborError } = await supabase
      .from("bid_labor")
      .select("*")
      .eq("bid_id", bidId);

    if (laborError) throw laborError;

    if (!laborRows || laborRows.length === 0) {
      return NextResponse.json({ rows: [] });
    }

    const { data: taskMaterials, error: tmError } = await supabase
      .from("labor_task_materials")
      .select("*");

    if (tmError) throw tmError;

    const { data: tasks, error: tasksError } = await supabase
      .from("labor_tasks")
      .select("*");

    if (tasksError) throw tasksError;

    const { data: materials, error: materialsError } = await supabase
      .from("materials")
      .select("*");

    if (materialsError) throw materialsError;

    const { data: vendors, error: vendorsError } = await supabase
      .from("vendors")
      .select("*");

    if (vendorsError) throw vendorsError;

    const materialMap = new Map((materials ?? []).map((m) => [m.id, m]));
    const vendorMap = new Map((vendors ?? []).map((v) => [v.id, v]));

    const rowsToInsert: any[] = [];

    for (const bl of laborRows) {
      const task = (tasks ?? []).find((t) => t.name === bl.task);
      if (!task) continue;

      const mappings = (taskMaterials ?? []).filter(
        (m) => m.labor_task_id === task.id
      );

      for (const map of mappings) {
        const material = materialMap.get(map.material_id);
        if (!material) continue;

        const vendor = material.vendor_id
          ? vendorMap.get(material.vendor_id)
          : null;

        const baseQty =
          Number(bl.quantity ?? 0) > 0
            ? Number(bl.quantity ?? 0)
            : Number(bl.man_hours ?? 0) > 0
            ? Number(bl.man_hours ?? 0)
            : 0;

        const qty = baseQty * Number(map.default_quantity ?? 1);
        const unitCost = Number(material.unit_cost ?? 0);

        rowsToInsert.push({
          id: crypto.randomUUID(),
          bid_id: bidId,
          name: material.display_name || material.name || "",
          vendor: vendor?.name || "",
          unit: material.unit || "",
          qty,
          unit_cost: unitCost,
          line_cost: qty * unitCost,
          is_autofill: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          company_id: bl.company_id,
          source_type: "labor",
          source_task_id: bl.task_catalog_id,
          details: null,
          material_id: material.id,
          source_label: bl.task || "",
          source_reference_id: bl.bundle_run_id,
          unit_cost_snapshot: unitCost,
          pricing_date_used: estToday(),
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
      { error: err?.message || "Sync failed" },
      { status: 500 }
    );
  }
}
