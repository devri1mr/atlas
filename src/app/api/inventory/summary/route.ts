import { NextRequest, NextResponse } from "next/server";
import { getInventorySummary } from "@/lib/inventory/queries";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const division_id = (searchParams.get("division_id") || "").trim();
    const material_id = (searchParams.get("material_id") || "").trim();
    const location_id = (searchParams.get("location_id") || "").trim();

    const data = await getInventorySummary({
      division_id: division_id || undefined,
      material_id: material_id || undefined,
      location_id: location_id || undefined,
    });

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to load inventory summary." },
      { status: 400 }
    );
  }
}
