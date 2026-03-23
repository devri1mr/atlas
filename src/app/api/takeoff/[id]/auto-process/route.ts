import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — runs 4 AI passes

const anthropic = new Anthropic();
const BUCKET = "takeoff-plans";

const CATEGORY_COLORS: Record<string, string> = {
  tree: "#15803d", shrub: "#7c3aed", perennial: "#ea580c",
  grass: "#ca8a04", groundcover: "#0891b2", other: "#6b7280", scope: "#64748b",
};
const AREA_CATEGORIES = new Set(["groundcover", "other", "scope"]);
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  tree: ["tree","birch","maple","oak","pine","elm","ash","poplar","willow","locust",
    "magnolia","redbud","crabapple","cherry","ginkgo","tulip","linden","zelkova",
    "hackberry","beech","sweetgum","serviceberry","catalpa","buckeye","honeylocust",
    "bald cypress","spruce","fir","cedar"],
  shrub: ["shrub","viburnum","spirea","ninebark","dogwood","rose","lilac","forsythia",
    "boxwood","holly","arborvitae","yew","juniper","barberry","potentilla","azalea",
    "rhododendron","hydrangea","weigela","euonymus","ilex","leucothoe","chokeberry",
    "buttonbush","itea","sweetspire"],
  perennial: ["perennial","hosta","daylily","coneflower","salvia","rudbeckia","phlox",
    "sedum","astilbe","echinacea","lavender","penstemon","black-eyed","hellenium",
    "yarrow","agastache","allium","nepeta"],
  grass: ["grass","miscanthus","panicum","pennisetum","festuca","carex","juncus",
    "muhlenbergia","hakonechloa","bouteloua","switchgrass","fountain grass",
    "ornamental grass","feather reed"],
  groundcover: ["groundcover","mulch","rock","stone","gravel","sod","seed","paver",
    "cover","ivy","vinca","pachysandra","ajuga","creeping","river rock",
    "decomposed granite","bark","wood chip","riprap"],
  other: ["edging","boulder","planting mix","soil","compost","fertilizer","stakes",
    "wire","fabric","weed barrier","erosion","blanket"],
};

function normalize(s: string | null | undefined) {
  return (s ?? "").toLowerCase().trim();
}
function filterCatalogForCategories(catalog: any[], categories: Set<string>): any[] {
  const result = new Map<string, any>();
  for (const cat of categories) {
    const keywords = CATEGORY_KEYWORDS[cat] ?? [];
    for (const c of catalog) {
      if (result.size >= 200) break;
      if (c.landscape_category === cat) { result.set(c.id, c); continue; }
      const haystack = normalize(c.name + " " + (c.botanical_name ?? ""));
      if (keywords.some(k => haystack.includes(k))) result.set(c.id, c);
    }
  }
  if (result.size < 200) {
    for (const c of catalog) {
      if (result.size >= 200) break;
      if (!result.has(c.id)) result.set(c.id, c);
    }
  }
  return Array.from(result.values());
}

// ── POST /api/takeoff/[id]/auto-process ──────────────────────
// Runs all 4 AI passes in sequence and returns a progress summary.
// Step 1: Parse plant schedule
// Step 2: Scan scope/notes
// Step 3: Auto-measure area items
// Step 4: Match everything to catalog + labor
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: takeoffId } = await params;
    const sb = supabaseAdmin();

    const { data: takeoff, error: te } = await sb
      .from("takeoffs")
      .select("id, company_id, client_name, address, name, plan_image_path, plan_storage_path, scale_ft_per_inch")
      .eq("id", takeoffId)
      .single();
    if (te || !takeoff) return NextResponse.json({ error: "Takeoff not found" }, { status: 404 });
    if (!takeoff.plan_storage_path && !takeoff.plan_image_path) {
      return NextResponse.json({ error: "No plan uploaded yet." }, { status: 400 });
    }

    const companyId = takeoff.company_id;
    const steps: { step: string; status: "ok" | "skipped" | "error"; detail: string }[] = [];

    // ── Download plan once, reuse across all steps ───────────
    const pdfPath = takeoff.plan_storage_path?.toLowerCase().endsWith(".pdf")
      ? takeoff.plan_storage_path : null;
    const imgPath = takeoff.plan_image_path || takeoff.plan_storage_path;
    const parsePath = pdfPath ?? imgPath;

    const { data: fileData, error: fe } = await sb.storage.from(BUCKET).download(parsePath!);
    if (fe || !fileData) return NextResponse.json({ error: "Could not load plan file" }, { status: 500 });

    const buf = Buffer.from(await fileData.arrayBuffer());
    const base64 = buf.toString("base64");
    const isPdf = parsePath!.toLowerCase().endsWith(".pdf");
    const mediaType: string = isPdf ? "application/pdf"
      : parsePath!.endsWith(".png") ? "image/png" : "image/jpeg";
    const contentBlock: any = isPdf
      ? { type: "document", source: { type: "base64", media_type: mediaType, data: base64 } }
      : { type: "image",    source: { type: "base64", media_type: mediaType, data: base64 } };

    // ── STEP 1: Parse plant schedule ─────────────────────────
    let plantItems: any[] = [];
    try {
      // Clear any existing items first so re-runs are idempotent
      await sb.from("takeoff_items").delete().eq("takeoff_id", takeoffId);

      const msg1 = await anthropic.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: [
            contentBlock,
            {
              type: "text",
              text: `This is a landscape architecture plan. Find the plant schedule or plant legend table and extract every plant/material listed.

For each item return:
- common_name (required)
- botanical_name (or null)
- category: "tree"|"shrub"|"perennial"|"grass"|"groundcover"|"other"
- qty: integer from the QTY column only (0 if not shown) — do NOT use plant code digits
- size (or null)
- container (or null)
- spacing (or null)
- designation: "Native"|"Non-Native" if shown (or null)
- remarks (or null)

SKIP subtotal/total rows. Each plant appears exactly once.
Also include area surface materials (mulch, sod, rock, pavers) as "groundcover" or "other".

Return ONLY valid JSON: { "items": [...] }
If no schedule found: { "items": [] }`,
            },
          ],
        }],
      });

      const raw1 = (msg1.content[0] as any).text ?? "";
      const m1 = raw1.match(/\{[\s\S]*\}/);
      if (m1) {
        const parsed1 = JSON.parse(m1[0]);
        if (Array.isArray(parsed1.items) && parsed1.items.length > 0) {
          const inserts1 = parsed1.items
            .filter((i: any) => i.common_name)
            .map((i: any, idx: number) => ({
              takeoff_id: takeoffId,
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
              count: typeof i.qty === "number" && i.qty > 0 ? i.qty : 0,
              unit: "EA",
              unit_price: null,
              sort_order: idx,
            }));

          const { data: inserted1 } = await sb.from("takeoff_items").insert(inserts1).select("id, common_name, botanical_name, category, size, container, count, unit");
          plantItems = inserted1 ?? [];
          steps.push({ step: "Plant schedule", status: "ok", detail: `${plantItems.length} plants extracted` });
        } else {
          steps.push({ step: "Plant schedule", status: "skipped", detail: "No plant schedule found on this plan" });
        }
      }
    } catch (e: any) {
      steps.push({ step: "Plant schedule", status: "error", detail: e.message });
    }

    // ── STEP 2: Scan scope/notes ─────────────────────────────
    let scopeItems: any[] = [];
    try {
      const maxSortOrder = plantItems.length;
      const msg2 = await anthropic.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 2048,
        messages: [{
          role: "user",
          content: [
            contentBlock,
            {
              type: "text",
              text: `This is a landscape architecture plan. I already have the plant schedule. Now find scope/specification items NOT in the plant schedule:
- General notes (tree protection, erosion control, etc.)
- Keynote descriptions
- Area quantities written on drawing (e.g. "River Rock ±850 SF")
- Site work, removals, temporary measures

For each item return:
- common_name (short description, required)
- category: "scope"
- qty: number if stated (0 if not)
- unit: SF/LF/EA etc.
- size (or null)
- remarks: full note text

Do NOT include plants from the schedule. Only what's explicitly written.

Return ONLY valid JSON: { "items": [...] }
If nothing found: { "items": [] }`,
            },
          ],
        }],
      });

      const raw2 = (msg2.content[0] as any).text ?? "";
      const m2 = raw2.match(/\{[\s\S]*\}/);
      if (m2) {
        const parsed2 = JSON.parse(m2[0]);
        if (Array.isArray(parsed2.items) && parsed2.items.length > 0) {
          const inserts2 = parsed2.items
            .filter((i: any) => i.common_name)
            .map((i: any, idx: number) => ({
              takeoff_id: takeoffId,
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
              sort_order: maxSortOrder + idx,
            }));

          const { data: inserted2 } = await sb.from("takeoff_items").insert(inserts2).select("id, common_name, category, count");
          scopeItems = inserted2 ?? [];
          steps.push({ step: "Scope scan", status: "ok", detail: `${scopeItems.length} scope items found` });
        } else {
          steps.push({ step: "Scope scan", status: "skipped", detail: "No scope items found outside plant schedule" });
        }
      }
    } catch (e: any) {
      steps.push({ step: "Scope scan", status: "error", detail: e.message });
    }

    // ── STEP 3: Auto-measure area items ──────────────────────
    const allItems: any[] = [...plantItems, ...scopeItems];
    const areaItems = allItems.filter(i => Number(i.count ?? 0) === 0 && AREA_CATEGORIES.has(i.category));
    let measuredCount = 0;
    let scaleFound: string | null = null;

    if (areaItems.length > 0) {
      try {
        const scaleHint = takeoff.scale_ft_per_inch
          ? `\nKnown scale: ${takeoff.scale_ft_per_inch} ft per inch.` : "";

        const msg3 = await anthropic.messages.create({
          model: "claude-opus-4-6",
          max_tokens: 2048,
          messages: [{
            role: "user",
            content: [
              contentBlock,
              {
                type: "text",
                text: `Measure area/length quantities on this landscape plan.${scaleHint}

ITEMS TO MEASURE:
${JSON.stringify(areaItems.map(i => ({ id: i.id, name: i.common_name, category: i.category })))}

Steps:
1. Find the scale bar or scale notation (e.g. "1\\" = 20'").
2. For each item, find all areas/regions showing that material.
3. If quantity is written on the plan, use it exactly.
4. Otherwise estimate real-world area (SF), length (LF), or count using scale.
5. Sum all separate instances.

Confidence: "high" = stated on plan; "medium" = estimated from boundary; "low" = unclear.

Return ONLY valid JSON:
{"scale_found":"1\\" = 20'","measurements":[{"item_id":"<uuid>","estimated_qty":850,"unit":"SF","confidence":"high|medium|low","note":"<brief>"}]}`,
              },
            ],
          }],
        });

        const raw3 = (msg3.content[0] as any).text ?? "";
        const m3 = raw3.match(/\{[\s\S]*\}/);
        if (m3) {
          const parsed3 = JSON.parse(m3[0]);
          scaleFound = parsed3.scale_found ?? null;
          for (const m of parsed3.measurements ?? []) {
            const qty = Number(m.estimated_qty ?? 0);
            if (qty <= 0) continue;
            const unit = m.unit ?? "SF";
            const note = `AI estimate (${m.confidence ?? "medium"}): ${m.note ?? ""}`.trim();
            const { error: ue } = await sb.from("takeoff_items")
              .update({ count: qty, unit, remarks: note })
              .eq("id", m.item_id);
            if (!ue) measuredCount++;
          }
        }
        steps.push({
          step: "Auto-measure",
          status: "ok",
          detail: `${measuredCount}/${areaItems.length} area items measured${scaleFound ? ` · scale ${scaleFound}` : ""}`,
        });
      } catch (e: any) {
        steps.push({ step: "Auto-measure", status: "error", detail: e.message });
      }
    } else {
      steps.push({ step: "Auto-measure", status: "skipped", detail: "No unmeasured area items" });
    }

    // ── STEP 4: AI matching ───────────────────────────────────
    try {
      // Reload all items after measurements
      const { data: finalItems } = await sb
        .from("takeoff_items")
        .select("id, common_name, botanical_name, category, size, container, count, unit")
        .eq("takeoff_id", takeoffId);

      if (finalItems?.length) {
        // Load match rules
        const { data: rules } = await sb
          .from("takeoff_match_rules")
          .select("match_common_name, match_botanical_name, match_category, match_size, catalog_material_id, task_catalog_id")
          .eq("company_id", companyId);
        const ruleMap = new Map<string, { catalog_material_id: string | null; task_catalog_id: string | null }>();
        for (const r of rules ?? []) {
          const key = `${normalize(r.match_common_name)}|${normalize(r.match_botanical_name)}|${normalize(r.match_category)}|${normalize(r.match_size)}`;
          ruleMap.set(key, { catalog_material_id: r.catalog_material_id, task_catalog_id: r.task_catalog_id });
        }

        const { data: fullCatalog } = await sb
          .from("materials_catalog")
          .select("id, name, botanical_name, landscape_category, default_unit, default_unit_cost, vendor")
          .eq("is_active", true)
          .order("name", { ascending: true })
          .limit(500);

        const { data: tasks } = await sb
          .from("task_catalog")
          .select("id, name, unit, minutes_per_unit, landscape_category, division_id")
          .eq("active", true)
          .limit(200);

        const matchResults: Record<string, any> = {};
        const needsAI: typeof finalItems = [];

        for (const item of finalItems) {
          const key = `${normalize(item.common_name)}|${normalize(item.botanical_name)}|${normalize(item.category)}|${normalize(item.size)}`;
          const rule = ruleMap.get(key);
          if (rule && (rule.catalog_material_id || rule.task_catalog_id)) {
            matchResults[item.id] = {
              catalog_material_id: rule.catalog_material_id,
              material_match_conf: rule.catalog_material_id ? "high" : "none",
              material_match_note: "Matched via saved rule",
              task_catalog_id: rule.task_catalog_id,
              labor_match_conf: rule.task_catalog_id ? "high" : "none",
              labor_match_note: rule.task_catalog_id ? "Matched via saved rule" : null,
              from_rule: true,
            };
          } else {
            needsAI.push(item);
          }
        }

        if (needsAI.length > 0) {
          const categories = new Set(needsAI.map(i => i.category ?? "other"));
          const filteredCatalog = filterCatalogForCategories(fullCatalog ?? [], categories);
          const validCatalogIds = new Set(filteredCatalog.map((c: any) => c.id));
          const validTaskIds = new Set((tasks ?? []).map((t: any) => t.id));

          const msg4 = await anthropic.messages.create({
            model: "claude-opus-4-6",
            max_tokens: 4096,
            messages: [{
              role: "user",
              content: `Match each takeoff item to the best catalog material and labor task.

TAKEOFF ITEMS:
${JSON.stringify(needsAI.map(i => ({ id: i.id, common_name: i.common_name, botanical_name: i.botanical_name, category: i.category, size: i.size, container: i.container })))}

MATERIALS CATALOG (${filteredCatalog.length} items):
${JSON.stringify(filteredCatalog.map((c: any) => ({ id: c.id, name: c.name, botanical_name: c.botanical_name, landscape_category: c.landscape_category, unit: c.default_unit })))}

LABOR TASKS (${(tasks ?? []).length} tasks):
${JSON.stringify((tasks ?? []).map(t => ({ id: t.id, name: t.name, landscape_category: t.landscape_category, unit: t.unit, minutes_per_unit: t.minutes_per_unit })))}

Rules:
- Match materials by botanical name first, then common name, then category+size
- Match labor by install type and category
- Scope items → labor only, not materials
- Confidence: "high" = strong name match; "medium" = category match; "none" = no match
- Only use IDs from the provided lists

Return ONLY valid JSON:
{"matches":[{"takeoff_item_id":"<uuid>","catalog_material_id":"<uuid or null>","material_match_conf":"high|medium|none","material_match_note":"<reason>","task_catalog_id":"<uuid or null>","labor_match_conf":"high|medium|none","labor_match_note":"<reason>"}]}`,
            }],
          });

          const raw4 = (msg4.content[0] as any).text ?? "";
          const m4 = raw4.match(/\{[\s\S]*\}/);
          if (m4) {
            try {
              const parsed4 = JSON.parse(m4[0]);
              for (const m of parsed4.matches ?? []) {
                matchResults[m.takeoff_item_id] = {
                  catalog_material_id: m.catalog_material_id && validCatalogIds.has(m.catalog_material_id) ? m.catalog_material_id : null,
                  material_match_conf: m.material_match_conf ?? "none",
                  material_match_note: m.material_match_note ?? null,
                  task_catalog_id: m.task_catalog_id && validTaskIds.has(m.task_catalog_id) ? m.task_catalog_id : null,
                  labor_match_conf: m.labor_match_conf ?? "none",
                  labor_match_note: m.labor_match_note ?? null,
                  from_rule: false,
                };
              }
            } catch { /* AI parse failed — items unmatched */ }
          }
        }

        // Upsert/update session
        const matchedCount = Object.values(matchResults).filter(
          m => m.catalog_material_id || m.task_catalog_id
        ).length;
        const pctMatched = finalItems.length > 0 ? Math.round((matchedCount / finalItems.length) * 100) : 0;

        const { data: existingSession } = await sb
          .from("handoff_sessions")
          .select("id")
          .eq("takeoff_id", takeoffId)
          .eq("status", "in_review")
          .maybeSingle();

        let sessionId: string;
        if (existingSession?.id) {
          await sb.from("handoff_sessions").update({ pct_matched: pctMatched }).eq("id", existingSession.id);
          sessionId = existingSession.id;
        } else {
          const { data: newSession } = await sb
            .from("handoff_sessions")
            .insert({ company_id: companyId, takeoff_id: takeoffId, pct_matched: pctMatched })
            .select("id")
            .single();
          sessionId = newSession!.id;
        }

        const now = new Date().toISOString();
        const upserts = finalItems.map(item => {
          const m = matchResults[item.id];
          return {
            company_id: companyId,
            takeoff_id: takeoffId,
            takeoff_item_id: item.id,
            handoff_session_id: sessionId,
            catalog_material_id: m?.catalog_material_id ?? null,
            material_match_conf: m?.material_match_conf ?? "none",
            material_match_note: m?.material_match_note ?? null,
            task_catalog_id: m?.task_catalog_id ?? null,
            labor_match_conf: m?.labor_match_conf ?? "none",
            labor_match_note: m?.labor_match_note ?? null,
            reviewed: m?.from_rule ? true : false,
            ai_matched_at: m?.from_rule ? null : now,
            updated_at: now,
          };
        });

        await sb.from("takeoff_item_matches").upsert(upserts, { onConflict: "takeoff_item_id" });

        steps.push({
          step: "Catalog matching",
          status: "ok",
          detail: `${matchedCount}/${finalItems.length} items matched (${pctMatched}%)`,
        });
      }
    } catch (e: any) {
      steps.push({ step: "Catalog matching", status: "error", detail: e.message });
    }

    const totalItems = plantItems.length + scopeItems.length;
    const allOk = steps.every(s => s.status !== "error");

    return NextResponse.json({
      success: allOk,
      total_items: totalItems,
      steps,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Unknown error" }, { status: 500 });
  }
}
