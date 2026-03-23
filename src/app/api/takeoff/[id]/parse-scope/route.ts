import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

const anthropic = new Anthropic();
const BUCKET = "takeoff-plans";

// ── POST /api/takeoff/[id]/parse-scope ───────────────────────
// Second AI pass: scans the full blueprint for scope/spec items
// that aren't in the plant schedule — notes, protection measures,
// site work, erosion control, etc. Adds them as category "scope".
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();

    const { data: takeoff, error: te } = await sb
      .from("takeoffs")
      .select("plan_image_path, plan_storage_path")
      .eq("id", id)
      .single();
    if (te || !takeoff) return NextResponse.json({ error: "Takeoff not found" }, { status: 404 });

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
    const mediaType = isPdf ? "application/pdf"
      : parsePath.endsWith(".png") ? "image/png" : "image/jpeg";

    const contentBlock: any = isPdf
      ? { type: "document", source: { type: "base64", media_type: mediaType, data: base64 } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } };

    // Load existing items to get max sort_order
    const { data: existing } = await sb
      .from("takeoff_items")
      .select("id, sort_order")
      .eq("takeoff_id", id)
      .order("sort_order", { ascending: false })
      .limit(1);
    const maxSortOrder = existing?.[0]?.sort_order ?? 0;

    const message = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: [
          contentBlock,
          {
            type: "text",
            text: `This is a landscape architecture plan. I have already extracted the plant schedule. Now scan the ENTIRE drawing for scope items that are NOT in the plant schedule table — including:

- General notes (e.g. "Provide tree protection fence", "Install erosion control blanket", "Remove existing shrubs")
- Keynotes or callout numbers with descriptions
- Specification notes (e.g. "All planting beds to receive 3" shredded bark mulch", "Wrap tree trunks with burlap")
- Site work items (e.g. "Install concrete edging", "Provide 6" depth river rock at base of wall")
- Temporary measures (e.g. "Silt fence at property line", "Construction entrance pad")
- Quantities for area materials that may be noted on the drawing (e.g. "±2,400 SF sod area", "River Rock — 850 SF")

For each scope item return:
- common_name: short description of the work or material (required)
- category: "scope"
- scope_type: "protection" | "specification" | "site-work" | "removal" | "area-material" | "temporary" | "other"
- qty: numeric quantity if shown (or 0 if not)
- unit: unit if shown (SF, LF, EA, CY, etc.) or "EA"
- size: any size/depth spec (e.g. "3\" depth", "6' height") or null
- remarks: full note text as written on the plan

IMPORTANT:
- Do NOT include plants that are in the plant schedule
- Do NOT invent items — only extract what is explicitly written on the drawing
- Area quantities (river rock 850 SF, sod 2400 SF) are very valuable — include them with qty and unit

Return ONLY valid JSON:
{
  "items": [
    { "common_name": "Tree Protection Fence", "category": "scope", "scope_type": "protection", "qty": 0, "unit": "LF", "size": null, "remarks": "Provide tree protection fence per detail 3/L3.0 around all trees to remain" }
  ]
}

If no scope items found outside the plant schedule, return { "items": [] }.`,
          },
        ],
      }],
    });

    const raw = (message.content[0] as any).text ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ items: [], count: 0 });

    let parsed: { items: any[] };
    try { parsed = JSON.parse(jsonMatch[0]); }
    catch { return NextResponse.json({ items: [], count: 0 }); }

    if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
      return NextResponse.json({ items: [], count: 0 });
    }

    const inserts = parsed.items
      .filter((i: any) => i.common_name)
      .map((i: any, idx: number) => ({
        takeoff_id: id,
        common_name: String(i.common_name).trim(),
        botanical_name: null,
        category: "scope",
        size: i.size ?? null,
        container: null,
        spacing: null,
        designation: null,
        remarks: i.remarks ?? null,
        color: "#64748b",
        symbol: "◆",
        count: typeof i.qty === "number" && i.qty > 0 ? i.qty : 0,
        unit: i.unit ?? "EA",
        unit_price: null,
        sort_order: maxSortOrder + 1 + idx,
      }));

    if (inserts.length === 0) return NextResponse.json({ items: [], count: 0 });

    const { data: inserted, error: insertErr } = await sb
      .from("takeoff_items")
      .insert(inserts)
      .select();
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

    return NextResponse.json({ items: inserted ?? [], count: inserted?.length ?? 0 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
