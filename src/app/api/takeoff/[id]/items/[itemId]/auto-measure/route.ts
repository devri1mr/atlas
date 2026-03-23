import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

const anthropic = new Anthropic();
const BUCKET = "takeoff-plans";

// ── POST /api/takeoff/[id]/items/[itemId]/auto-measure ───────
// Measures a single area item on the blueprint.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id: takeoffId, itemId } = await params;
    const sb = supabaseAdmin();

    const { data: takeoff, error: te } = await sb
      .from("takeoffs")
      .select("plan_image_path, plan_storage_path, scale_ft_per_inch")
      .eq("id", takeoffId)
      .single();
    if (te || !takeoff) return NextResponse.json({ error: "Takeoff not found" }, { status: 404 });

    const { data: item, error: ie } = await sb
      .from("takeoff_items")
      .select("id, common_name, category, unit, remarks, botanical_name, size")
      .eq("id", itemId)
      .single();
    if (ie || !item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    const pdfPath = takeoff.plan_storage_path?.toLowerCase().endsWith(".pdf")
      ? takeoff.plan_storage_path : null;
    const imgPath = takeoff.plan_image_path || takeoff.plan_storage_path;
    const parsePath = pdfPath ?? imgPath;
    if (!parsePath) return NextResponse.json({ error: "No plan uploaded." }, { status: 400 });

    const { data: fileData, error: fe } = await sb.storage.from(BUCKET).download(parsePath);
    if (fe || !fileData) return NextResponse.json({ error: "Could not load plan file" }, { status: 500 });

    const buf = Buffer.from(await fileData.arrayBuffer());
    const base64 = buf.toString("base64");
    const isPdf = parsePath.toLowerCase().endsWith(".pdf");
    const mediaType = isPdf ? "application/pdf"
      : parsePath.endsWith(".png") ? "image/png" : "image/jpeg";

    const contentBlock: any = isPdf
      ? { type: "document", source: { type: "base64", media_type: mediaType, data: base64 } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } };

    const scaleHint = takeoff.scale_ft_per_inch
      ? `\nKnown scale: ${takeoff.scale_ft_per_inch} ft per inch.`
      : "";

    const prompt = `Measure the area or quantity of "${item.common_name}" on this landscape plan.${scaleHint}

Steps:
1. Find the scale bar or scale notation on the drawing and read it.
2. Find all areas/regions on the plan showing "${item.common_name}" — look for hatching, fill patterns, labels, callouts, or keynotes.
3. If a quantity is already written on the plan (e.g. "River Rock ±850 SF"), use that exact number.
4. Otherwise estimate the total real-world area (SF), length (LF), or count (EA) using the scale.
5. Sum all separate instances of this material across the entire plan.

Return ONLY valid JSON:
{
  "scale_found": "1\\" = 20'",
  "estimated_qty": 850,
  "unit": "SF",
  "confidence": "high|medium|low",
  "note": "<brief explanation>"
}`;

    const message = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 512,
      messages: [{
        role: "user",
        content: [contentBlock, { type: "text", text: prompt }],
      }],
    });

    const raw = (message.content[0] as any).text ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: "Could not measure this item." }, { status: 422 });

    let result: any;
    try { result = JSON.parse(jsonMatch[0]); }
    catch { return NextResponse.json({ error: "AI returned invalid JSON" }, { status: 422 }); }

    const qty = Number(result.estimated_qty ?? 0);
    if (qty <= 0) {
      return NextResponse.json({ error: "Could not find this material on the plan.", scale_found: result.scale_found });
    }

    const unit = result.unit || item.unit || "SF";
    const note = `AI estimate (${result.confidence ?? "medium"}): ${result.note ?? ""}`.trim();

    const { error: ue } = await sb
      .from("takeoff_items")
      .update({ count: qty, unit, remarks: note })
      .eq("id", itemId);

    if (ue) return NextResponse.json({ error: ue.message }, { status: 500 });

    return NextResponse.json({
      id: itemId,
      qty,
      unit,
      confidence: result.confidence ?? "medium",
      note,
      scale_found: result.scale_found ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Unknown error" }, { status: 500 });
  }
}
