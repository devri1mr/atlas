import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

const anthropic = new Anthropic();
const BUCKET = "takeoff-plans";

const CATEGORY_COLORS: Record<string, string> = {
  tree: "#15803d", shrub: "#7c3aed", perennial: "#ea580c",
  grass: "#ca8a04", groundcover: "#0891b2", other: "#6b7280",
};

const UNMATCHED_COLOR = "#f59e0b"; // amber — needs review
const MISMATCH_COLOR  = "#ef4444"; // red — qty discrepancy

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();

    const { data: takeoff, error: te } = await sb
      .from("takeoffs")
      .select("plan_image_path, plan_storage_path")
      .eq("id", id)
      .single();
    if (te || !takeoff) return NextResponse.json({ error: "Takeoff not found" }, { status: 404 });

    const pdfPath = (takeoff.plan_storage_path?.toLowerCase().endsWith(".pdf")
      ? takeoff.plan_storage_path : null) as string | null;
    const imgPath = (takeoff.plan_image_path || takeoff.plan_storage_path) as string | null;
    const parsePath = pdfPath ?? imgPath;
    if (!parsePath) return NextResponse.json({ error: "No plan uploaded yet." }, { status: 400 });

    const { data: fileData, error: fe } = await sb.storage.from(BUCKET).download(parsePath);
    if (fe || !fileData) return NextResponse.json({ error: "Could not load plan file" }, { status: 500 });

    const buf = Buffer.from(await fileData.arrayBuffer());
    const base64 = buf.toString("base64");
    const isPdf = parsePath.toLowerCase().endsWith(".pdf");
    const mediaType = isPdf ? "application/pdf"
      : parsePath.endsWith(".png") ? "image/png" : "image/jpeg";

    const contentBlock: any = isPdf
      ? { type: "document", source: { type: "base64", media_type: mediaType, data: base64 } }
      : { type: "image",    source: { type: "base64", media_type: mediaType, data: base64 } };

    const message = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: [
            contentBlock,
            {
              type: "text",
              text: `This is a landscape architecture plan. Perform a comprehensive scan of the ENTIRE plan — both the plant schedule table AND the drawing/site plan itself — and return everything in a single JSON response.

TASK 1 — PLANT SCHEDULE TABLE:
Find the plant schedule or plant legend table and extract every plant/material listed.

For each item return:
- common_name: common name (required)
- botanical_name: botanical/scientific name if shown (or null)
- category: one of "tree", "shrub", "perennial", "grass", "groundcover", "other"
- qty: integer quantity from the dedicated QTY column only. Do NOT read numbers embedded in plant codes — codes like "CA30" or "JSG30" contain letters AND numbers, those numbers are NOT qty.
- drawing_qty: independently count how many times this plant's code appears in the drawing/site plan itself (not the schedule). Return null if the drawing is too dense to count reliably.
- size: size spec e.g. "2.5\\" CAL.", "8' HT.", "1 GAL." (or null)
- container: e.g. "B&B", "CONT.", "POT" (or null)
- spacing: e.g. "4' O.C.", "PER PLAN" (or null)
- designation: "Native" or "Non-Native" if shown (or null)
- remarks: any remarks column text (or null)
- area_sf: for area materials (seed mixes, sod, lawn, mulch, groundcover, pavers, rock) — scan the drawing for a square footage callout labeled for this material and return the number as an integer (e.g. 4582). Return null if not labeled in the drawing.
- drawing_note: any specific instruction or note visible in the drawing that applies to this item (or null)

CRITICAL RULES for TASK 1:
- The QTY column is a standalone integer column, completely separate from the plant code column.
- SKIP any SUBTOTAL, TOTAL, or grand total rows — they are summary rows, not plants.
- Each plant/material appears exactly once in the output.
- For drawing_qty: count carefully — this is used to verify the schedule quantity. If schedule qty and drawing qty differ, that is a discrepancy the user needs to review.

TASK 2 — DRAWING SCAN FOR UNMATCHED ITEMS:
Read the drawing/site plan and identify any plant codes, symbols, or material labels visible in the drawing that do NOT appear in the plant schedule table.

For each unmatched item return:
- code: the code or label as it appears in the drawing
- estimated_qty: your best count of how many times this code/symbol appears, or 0 if uncountable
- description: what you can determine from context — location, symbol shape, nearby text, likely plant type
- category_guess: one of "tree", "shrub", "perennial", "grass", "groundcover", "other"

Return ONLY valid JSON with this exact structure (no markdown, no extra text):
{
  "items": [
    { "common_name": "...", "botanical_name": null, "category": "tree", "qty": 3, "drawing_qty": 3, "size": "2.5\\" CAL.", "container": "B&B", "spacing": "PER PLAN", "designation": "Native", "remarks": null, "area_sf": null, "drawing_note": null }
  ],
  "unmatched": [
    { "code": "...", "estimated_qty": 0, "description": "...", "category_guess": "other" }
  ]
}

If no plant schedule is found, return { "items": [], "unmatched": [] }.
If nothing unmatched is found in the drawing, return "unmatched": [].`,
            },
          ],
        },
      ],
    });

    const raw = (message.content[0] as any).text ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: "AI could not parse this plan." }, { status: 422 });

    let parsed: { items: any[]; unmatched?: any[] };
    try { parsed = JSON.parse(match[0]); }
    catch { return NextResponse.json({ error: "AI returned invalid JSON" }, { status: 422 }); }

    if (!Array.isArray(parsed.items)) return NextResponse.json({ error: "No items found" }, { status: 422 });

    const { count: existing } = await sb
      .from("takeoff_items")
      .select("id", { count: "exact", head: true })
      .eq("takeoff_id", id);

    const sortBase = existing ?? 0;

    // Detect quantity mismatches (schedule qty vs independent drawing count)
    const discrepancies: { name: string; schedule_qty: number; drawing_qty: number }[] = [];

    // Build schedule items
    const scheduleInserts = parsed.items
      .filter((i: any) => i.common_name)
      .map((i: any, idx: number) => {
        const schedQty = typeof i.qty === "number" ? i.qty : 0;
        const drawQty  = typeof i.drawing_qty === "number" ? i.drawing_qty : null;
        const hasMismatch = drawQty !== null && drawQty !== schedQty;

        if (hasMismatch) {
          discrepancies.push({ name: i.common_name, schedule_qty: schedQty, drawing_qty: drawQty! });
        }

        const parts: string[] = [];
        if (i.remarks) parts.push(i.remarks);
        if (i.area_sf) parts.push(`${Number(i.area_sf).toLocaleString()} SF`);
        if (i.drawing_note) parts.push(i.drawing_note);
        if (hasMismatch) parts.push(`⚠ Schedule qty ${schedQty} vs drawing count ${drawQty} — verify`);

        return {
          takeoff_id: id,
          common_name: String(i.common_name).trim(),
          botanical_name: i.botanical_name ?? null,
          category: i.category ?? "other",
          size: i.size ?? null,
          container: i.container ?? null,
          spacing: i.spacing ?? null,
          designation: i.designation ?? null,
          remarks: parts.length > 0 ? parts.join(" · ") : null,
          color: hasMismatch ? MISMATCH_COLOR : (CATEGORY_COLORS[i.category ?? "other"] ?? "#6b7280"),
          symbol: hasMismatch ? "⚠" : "●",
          count: schedQty,
          unit: "EA",
          unit_price: null,
          sort_order: sortBase + idx,
        };
      });

    // Build unmatched items (flagged for review)
    const unmatched: any[] = Array.isArray(parsed.unmatched) ? parsed.unmatched : [];
    const unmatchedInserts = unmatched
      .filter((u: any) => u.code || u.description)
      .map((u: any, idx: number) => ({
        takeoff_id: id,
        common_name: u.code ? `${u.code} (needs review)` : "Unknown item (needs review)",
        botanical_name: null,
        category: u.category_guess ?? "other",
        size: null,
        container: null,
        spacing: null,
        designation: null,
        remarks: `⚠ Not found in plant schedule${u.description ? " — " + u.description : ""}. Please verify.`,
        color: UNMATCHED_COLOR,
        symbol: "⚠",
        count: typeof u.estimated_qty === "number" && u.estimated_qty > 0 ? u.estimated_qty : 0,
        unit: "EA",
        unit_price: null,
        sort_order: sortBase + scheduleInserts.length + idx,
      }));

    const allInserts = [...scheduleInserts, ...unmatchedInserts];

    if (allInserts.length === 0)
      return NextResponse.json({ error: "No items found in this plan." }, { status: 422 });

    const { data: inserted, error: ie } = await sb
      .from("takeoff_items")
      .insert(allInserts)
      .select();
    if (ie) return NextResponse.json({ error: ie.message }, { status: 500 });

    return NextResponse.json({
      data: inserted,
      count: scheduleInserts.length,
      unmatched_count: unmatchedInserts.length,
      discrepancies,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
