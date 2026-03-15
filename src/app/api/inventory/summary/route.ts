import { NextResponse } from "next/server";
import { getInventorySummary } from "@/lib/inventory/queries";

export async function GET() {
  try {
    const data = await getInventorySummary();
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
