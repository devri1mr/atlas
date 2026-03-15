import { NextRequest, NextResponse } from "next/server";
import { getInventoryLedger } from "@/lib/inventory/queries";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const material_id = searchParams.get("material_id");

    const data = await getInventoryLedger({
      material_id,
    });

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
