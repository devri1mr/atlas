import { NextRequest, NextResponse } from "next/server";
import { createUsageTransaction } from "@/lib/inventory/usage";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const data = await createUsageTransaction(body);

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
