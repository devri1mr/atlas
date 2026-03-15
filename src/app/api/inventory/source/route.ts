import { NextRequest, NextResponse } from "next/server";
import { computePosition, getInventoryLedger } from "@/lib/inventory/queries";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const material_id = searchParams.get("material_id");

    if (!material_id) {
      return NextResponse.json(
        { ok: false, error: "material_id required" },
        { status: 400 }
      );
    }

    const rows = await getInventoryLedger({ material_id });

    const pos = computePosition(rows);

    const data = [
      {
        source_type: "inventory",
        source_label: "Inventory",
        qty_on_hand: pos.qty_on_hand,
        avg_unit_cost: pos.avg_unit_cost,
        inventory_value: pos.inventory_value,
        negative_flag: pos.negative_flag,
      },
    ];

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
