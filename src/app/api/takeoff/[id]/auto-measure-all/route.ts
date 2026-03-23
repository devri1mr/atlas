import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 90;

const anthropic = new Anthropic();
const BUCKET = "takeoff-plans";

// Area-based categories that need measurement rather than counting
const AREA_CATEGORIES = new Set(["groundcover", "other", "scope"]);

// ── POST /api/takeoff/[id]/auto-measure-all ──────────────────
// Sends the blueprint to Claude once, asks it to read the scale
// and estimate area/length for all qty-0 items in one pass.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: takeoffId } = await params;
    const sb = supabaseAdmin();

    // Load takeoff
    const { data: takeoff, error: te } = await sb
      .from("takeoffs")
      .select("plan_image_path, plan_storage_path, scale_ft_per_inch")
      .eq("id", takeoffId)
      .single();
    if (te || !takeoff) return NextResponse.json({ error: "Takeoff not found" }, { status: 404 });

    const pdfPath = takeoff.plan_storage_path?.toLowerCase().endsWith(".pdf")
      ? takeoff.plan_storage_path : null;
    const imgPath = takeoff.plan_image_path || takeoff.plan_storage_path;
    const parsePath = pdfPath ?? imgPath;
    if (!parsePath) return NextResponse.json({ error: "No plan uploaded yet." }, { status: 400 });

    // Load all qty-0 area items
    const { data: allItems, error: ie } = await sb
      .from("takeoff_items")
      .select("id, common_name, category, unit, remarks, count")
      .eq("takeoff_id", takeoffId);
    if (ie) return NextResponse.json({ error: ie.message }, { status: 500 });

    // Measure all count-0 items — seed mixes and grasses may not be in AREA_CATEGORIES
    const areaItems = (allItems ?? []).filter(i => Number(i.count ?? 0) === 0);

    if (areaItems.length === 0) {
      return NextResponse.json({ message: "No unmeasured area items found.", updated: [] });
    }

    // Download plan file
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
      ? `\n\nNOTE: This drawing's scale is known to be ${takeoff.scale_ft_per_inch} ft per inch. Use this if you cannot find a scale bar.`
      : "";

    const prompt = `You are measuring areas and lengths on a landscape architecture plan to generate material quantities.${scaleHint}

ITEMS TO MEASURE:
${JSON.stringify(areaItems.map(i => ({
  id: i.id,
  name: i.common_name,
  category: i.category,
  unit: i.unit,
  remarks: i.remarks,
})), null, 2)}

INSTRUCTIONS:
1. First, find the scale bar or scale notation on this drawing (e.g. "1\" = 20'", "1\" = 10'", "Scale: 1:240"). Read it carefully.
2. For each item, scan the entire plan for where that material is shown — look for:
   - Hatching or fill patterns labeled with the material name
   - Callout notes or keynotes referencing the material
   - Shaded regions, stippling, or texture patterns
   - Area quantities already noted on the drawing (e.g. "River Rock ±850 SF")
3. Estimate the real-world area (SF or SY), length (LF), or count (EA) using the scale.
4. For items with multiple separate areas/beds, sum them all.
5. If a quantity is already written on the plan, use that exact number.
6. Round to the nearest 10 SF for areas, nearest 5 LF for lengths.

Confidence levels:
- "high": quantity explicitly stated on drawing, or very clear hatched region
- "medium": estimated from approximate boundary tracing with scale
- "low": material referenced but boundaries are unclear or overlapping

Return ONLY valid JSON:
{
  "scale_found": "1\\" = 20'",
  "measurements": [
    {
      "item_id": "<uuid>",
      "estimated_qty": 850,
      "unit": "SF",
      "confidence": "high|medium|low",
      "note": "<brief explanation of where/how measured>"
    }
  ]
}

If you cannot find an item on the plan at all, return estimated_qty: 0 and confidence: "low".`;

    const message = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: [contentBlock, { type: "text", text: prompt }],
      }],
    });

    const raw = (message.content[0] as any).text ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Atlas could not read measurements from this plan." }, { status: 422 });
    }

    let parsed: { scale_found?: string; measurements: any[] };
    try { parsed = JSON.parse(jsonMatch[0]); }
    catch { return NextResponse.json({ error: "Atlas returned an unreadable response — please try again." }, { status: 422 }); }

    // Update items with AI estimates
    const updated: { id: string; name: string; qty: number; unit: string; confidence: string; note: string }[] = [];

    for (const m of parsed.measurements ?? []) {
      const qty = Number(m.estimated_qty ?? 0);
      if (qty <= 0) continue;

      const item = areaItems.find(i => i.id === m.item_id);
      if (!item) continue;

      const unit = m.unit || item.unit || "SF";
      const note = `Atlas estimate (${m.confidence ?? "medium"}): ${m.note ?? ""}`.trim();

      const { error: ue } = await sb
        .from("takeoff_items")
        .update({
          count: qty,
          unit,
          remarks: note,
        })
        .eq("id", m.item_id);

      if (!ue) {
        updated.push({ id: m.item_id, name: item.common_name, qty, unit, confidence: m.confidence ?? "medium", note });
      }
    }

    return NextResponse.json({
      scale_found: parsed.scale_found ?? null,
      updated,
      skipped: areaItems.length - updated.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Unknown error" }, { status: 500 });
  }
}
