import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 120;

const anthropic = new Anthropic();
const BUCKET = "takeoff-plans";

// ── POST /api/takeoff/[id]/verify ────────────────────────────
// Re-reads the blueprint and cross-checks the extracted item list
// for accuracy — flags qty mismatches, missing items, and OCR errors.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: takeoffId } = await params;
    const sb = supabaseAdmin();

    const { data: takeoff, error: te } = await sb
      .from("takeoffs")
      .select("plan_image_path, plan_storage_path, scale_ft_per_inch")
      .eq("id", takeoffId)
      .single();
    if (te || !takeoff) return NextResponse.json({ error: "Takeoff not found" }, { status: 404 });

    const { data: items, error: ie } = await sb
      .from("takeoff_items")
      .select("id, common_name, botanical_name, category, size, count, unit")
      .eq("takeoff_id", takeoffId)
      .order("sort_order", { ascending: true });
    if (ie || !items?.length) return NextResponse.json({ error: "No items to verify" }, { status: 400 });

    const pdfPath = takeoff.plan_storage_path?.toLowerCase().endsWith(".pdf")
      ? takeoff.plan_storage_path : null;
    const imgPath = takeoff.plan_image_path || takeoff.plan_storage_path;
    const parsePath = pdfPath ?? imgPath;
    if (!parsePath) return NextResponse.json({ error: "No plan uploaded yet." }, { status: 400 });

    const { data: fileData, error: fe } = await sb.storage.from(BUCKET).download(parsePath);
    if (fe || !fileData) return NextResponse.json({ error: "Could not load plan file" }, { status: 500 });

    const buf = Buffer.from(await fileData.arrayBuffer());
    const base64 = buf.toString("base64");
    const isPdf = parsePath.toLowerCase().endsWith(".pdf");
    const mediaType: string = isPdf ? "application/pdf"
      : parsePath.endsWith(".png") ? "image/png" : "image/jpeg";
    const contentBlock: any = isPdf
      ? { type: "document", source: { type: "base64", media_type: mediaType, data: base64 } }
      : { type: "image",    source: { type: "base64", media_type: mediaType, data: base64 } };

    const prompt = `You are a landscape estimating QA reviewer. Cross-check this extracted item list against the blueprint and identify any inaccuracies.

EXTRACTED ITEMS (what the system read):
${JSON.stringify(items.map(i => ({
  id: i.id,
  name: i.common_name,
  botanical_name: i.botanical_name,
  category: i.category,
  size: i.size,
  qty: i.count,
  unit: i.unit,
})), null, 2)}

YOUR TASK:
1. Read the entire plan — notes, legends, plant schedule, bed areas, hardscape, seed zones.
2. Write a concise plan_overview (3-6 sentences) describing the full scope: site context, plant categories and counts, any hardscape or seeding areas, and notable design intent.
3. For each extracted item, check:
   - Is the name correct? (flag OCR errors like "Shale" instead of "Shade" — provide corrected_name)
   - Is the quantity correct? (compare to QTY column in plant schedule)
   - Is the size/spec correct?
4. Note any items visible in the plant schedule that are MISSING from the extracted list.
5. Note any extracted items you CANNOT find on the plan.

Return ONLY valid JSON:
{
  "overall_accuracy": "high|medium|low",
  "summary": "<1-2 sentence summary of accuracy>",
  "plan_overview": "<3-6 sentence description of the full plan scope — what the plan is calling for>",
  "items": [
    {
      "id": "<item id from list>",
      "name": "<extracted name>",
      "status": "confirmed|qty_mismatch|name_error|not_found_on_plan",
      "plan_qty": <number or null>,
      "extracted_qty": <number>,
      "corrected_name": "<corrected name if status is name_error, otherwise null>",
      "note": "<brief explanation if not confirmed>"
    }
  ],
  "missing_from_extraction": [
    {
      "name": "<name as shown on plan>",
      "botanical_name": "<or null>",
      "qty": <number>,
      "unit": "EA",
      "category": "tree|shrub|perennial|grass|groundcover|other",
      "size": "<or null>",
      "note": "<where found on plan>"
    }
  ]
}`;

    const message = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 8192,
      messages: [{
        role: "user",
        content: [contentBlock, { type: "text", text: prompt }],
      }],
    });

    const raw = (message.content[0] as any).text ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: "Could not verify — please try again." }, { status: 422 });

    let result: any;
    try { result = JSON.parse(jsonMatch[0]); }
    catch { return NextResponse.json({ error: "Verification returned unreadable response." }, { status: 422 }); }

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Unknown error" }, { status: 500 });
  }
}
