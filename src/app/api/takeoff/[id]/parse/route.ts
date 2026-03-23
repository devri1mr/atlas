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

    const imgPath = (takeoff.plan_image_path || takeoff.plan_storage_path) as string | null;
    if (!imgPath) return NextResponse.json({ error: "No plan image available. Upload and render a plan first." }, { status: 400 });

    // Download image from storage
    const { data: fileData, error: fe } = await sb.storage.from(BUCKET).download(imgPath);
    if (fe || !fileData) return NextResponse.json({ error: "Could not load plan image" }, { status: 500 });

    const buf = Buffer.from(await fileData.arrayBuffer());
    const base64 = buf.toString("base64");
    const mediaType = imgPath.endsWith(".png") ? "image/png" : "image/jpeg";

    const message = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            {
              type: "text",
              text: `This is a landscape architecture plan. Find the plant schedule or plant legend table and extract every plant/material listed.

For each item return a JSON object with:
- common_name: common name (required)
- botanical_name: botanical/scientific name if shown (or null)
- category: one of "tree", "shrub", "perennial", "grass", "groundcover", "other"
- size: size spec e.g. "2.5\\" CAL.", "8' HT.", "1 GAL." (or null)
- container: e.g. "B&B", "CONT.", "POT" (or null)
- spacing: spacing e.g. "4' O.C.", "PER PLAN" (or null)
- designation: "Native" or "Non-Native" if shown (or null)
- remarks: any remarks column text (or null)

Also extract area surface materials (mulch, sod, pavers, seed mixes, rock) using category "groundcover" or "other".

Return ONLY valid JSON:
{
  "items": [
    { "common_name": "...", "botanical_name": null, "category": "tree", "size": "2.5\\" CAL.", "container": "B&B", "spacing": "PER PLAN", "designation": "Native", "remarks": null }
  ]
}

If no plant schedule found, return { "items": [] }.`,
            },
          ],
        },
      ],
    });

    const raw = (message.content[0] as any).text ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: "AI could not parse a plant schedule from this plan." }, { status: 422 });

    let parsed: { items: any[] };
    try { parsed = JSON.parse(match[0]); }
    catch { return NextResponse.json({ error: "AI returned invalid JSON" }, { status: 422 }); }

    if (!Array.isArray(parsed.items)) return NextResponse.json({ error: "No items found" }, { status: 422 });

    const { count: existing } = await sb
      .from("takeoff_items")
      .select("id", { count: "exact", head: true })
      .eq("takeoff_id", id);

    const inserts = parsed.items
      .filter((i: any) => i.common_name)
      .map((i: any, idx: number) => ({
        takeoff_id: id,
        common_name: String(i.common_name).trim(),
        botanical_name: i.botanical_name ?? null,
        category: i.category ?? "other",
        size: i.size ?? null,
        container: i.container ?? null,
        spacing: i.spacing ?? null,
        designation: i.designation ?? null,
        remarks: i.remarks ?? null,
        color: CATEGORY_COLORS[i.category ?? "other"] ?? "#6b7280",
        symbol: "●",
        count: 0,
        unit: "EA",
        unit_price: null,
        sort_order: (existing ?? 0) + idx,
      }));

    if (inserts.length === 0)
      return NextResponse.json({ error: "No plants found in the plan schedule." }, { status: 422 });

    const { data: inserted, error: ie } = await sb
      .from("takeoff_items")
      .insert(inserts)
      .select();
    if (ie) return NextResponse.json({ error: ie.message }, { status: 500 });

    return NextResponse.json({ data: inserted, count: inserted?.length ?? 0 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
