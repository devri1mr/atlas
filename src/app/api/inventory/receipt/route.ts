import { NextRequest, NextResponse } from "next/server";
import { createReceiptTransaction } from "@/lib/inventory/receipts";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const data = await createReceiptTransaction(body);

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
