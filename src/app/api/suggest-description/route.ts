import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const task: string = String(body?.task || "").trim();
    const qty: number = Number(body?.qty) || 0;
    const unit: string = String(body?.unit || "").trim();
    const materials: string[] = Array.isArray(body?.materials) ? body.materials : [];

    if (!task) {
      return NextResponse.json({ error: "task is required" }, { status: 400 });
    }

    const materialContext =
      materials.length > 0
        ? ` Materials involved: ${materials.join(", ")}.`
        : "";

    const qtyContext =
      qty > 0 && unit ? ` Quantity: ${qty} ${unit}.` : "";

    const prompt = `You are writing a short, professional proposal description for a landscaping service line item.

Task: "${task}"${qtyContext}${materialContext}

Write a single concise sentence (max 15 words) describing this service in client-friendly language. No quotes, no punctuation at end, no fluff. Start with a verb or noun phrase. Examples:
- "Installation of 15 yd of brown mulch to designated planting beds"
- "Removal and disposal of existing mulch and debris"
- "Installation of French drain system with perforated pipe"

Description:`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 80,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ error: err?.error?.message || "AI request failed" }, { status: 500 });
    }

    const json = await res.json();
    const suggestion = (json?.content?.[0]?.text || "").trim().replace(/^["']|["']$/g, "");

    return NextResponse.json({ suggestion });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
