import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { month, projection } — build Apps Script URL for browser to open
export async function POST(req: NextRequest) {
  const webhookUrl = process.env.SHEETS_WEBHOOK_URL?.replace(/\s+/g, "");
  if (!webhookUrl) {
    return NextResponse.json({ error: "SHEETS_WEBHOOK_URL not configured" }, { status: 503 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { month, projection } = body as { month?: string; projection?: number };
    if (!month) return NextResponse.json({ error: "month required" }, { status: 400 });
    if (projection == null) return NextResponse.json({ error: "projection required" }, { status: 400 });

    const url = new URL(webhookUrl);
    url.searchParams.set("month",      month);
    url.searchParams.set("projection", String(projection));

    return NextResponse.json({ ok: true, month, projection, scriptUrl: url.toString() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
