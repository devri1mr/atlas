import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

const anthropic = new Anthropic();

function normalize(s: string | null | undefined) {
  return (s ?? "").toLowerCase().trim();
}

// ── GET /api/takeoff/[id]/handoff/match ─────────────────────
// Returns all match records for this takeoff
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("takeoff_item_matches")
    .select("*")
    .eq("takeoff_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// ── POST /api/takeoff/[id]/handoff/match ────────────────────
// Triggers AI matching for all takeoff items
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: takeoffId } = await params;
    const sb = supabaseAdmin();

    // Load takeoff + company
    const { data: takeoff, error: te } = await sb
      .from("takeoffs")
      .select("id, company_id, client_name, address, name")
      .eq("id", takeoffId)
      .single();
    if (te || !takeoff) return NextResponse.json({ error: "Takeoff not found" }, { status: 404 });

    const companyId = takeoff.company_id;

    // Load all takeoff items
    const { data: items, error: ie } = await sb
      .from("takeoff_items")
      .select("id, common_name, botanical_name, category, size, container, count, unit")
      .eq("takeoff_id", takeoffId)
      .order("sort_order", { ascending: true });
    if (ie || !items?.length) {
      return NextResponse.json({ error: "No takeoff items found" }, { status: 400 });
    }

    // Load company match rules
    const { data: rules } = await sb
      .from("takeoff_match_rules")
      .select("match_common_name, match_botanical_name, match_category, match_size, catalog_material_id, task_catalog_id")
      .eq("company_id", companyId);
    const ruleMap = new Map<string, { catalog_material_id: string | null; task_catalog_id: string | null }>();
    for (const r of rules ?? []) {
      const key = `${r.match_common_name}|${r.match_botanical_name}|${r.match_category}|${r.match_size}`;
      ruleMap.set(key, { catalog_material_id: r.catalog_material_id, task_catalog_id: r.task_catalog_id });
    }

    // Load active materials catalog (no company_id filter — catalog is shared)
    const { data: catalog } = await sb
      .from("materials_catalog")
      .select("id, name, botanical_name, landscape_category, default_unit, default_unit_cost, vendor, sku")
      .eq("is_active", true)
      .limit(400);

    // Load active task catalog
    const { data: tasks } = await sb
      .from("task_catalog")
      .select("id, name, unit, minutes_per_unit, landscape_category, notes, division_id")
      .eq("active", true)
      .limit(200);

    // ── Rule-based matching ──────────────────────────────────
    const matchResults: Record<string, {
      catalog_material_id: string | null;
      material_match_conf: string;
      material_match_note: string | null;
      task_catalog_id: string | null;
      labor_match_conf: string;
      labor_match_note: string | null;
      from_rule: boolean;
    }> = {};

    const needsAI: typeof items = [];

    for (const item of items) {
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

    // ── AI matching for remaining items ──────────────────────
    if (needsAI.length > 0 && (catalog?.length || tasks?.length)) {
      const catalogCompact = (catalog ?? []).map(c => ({
        id: c.id,
        name: c.name,
        botanical_name: c.botanical_name ?? null,
        landscape_category: c.landscape_category ?? null,
        unit: c.default_unit,
      }));

      const tasksCompact = (tasks ?? []).map(t => ({
        id: t.id,
        name: t.name,
        landscape_category: t.landscape_category ?? null,
        unit: t.unit,
        minutes_per_unit: t.minutes_per_unit,
      }));

      const prompt = `You are a landscape estimating assistant. Match each takeoff item to the best catalog material and labor task.

TAKEOFF ITEMS (need matching):
${JSON.stringify(needsAI.map(i => ({
  id: i.id,
  common_name: i.common_name,
  botanical_name: i.botanical_name,
  category: i.category,
  size: i.size,
  container: i.container,
})), null, 2)}

MATERIALS CATALOG:
${JSON.stringify(catalogCompact, null, 2)}

LABOR TASKS:
${JSON.stringify(tasksCompact, null, 2)}

For each takeoff item, find the best matching catalog material and labor task.
- For materials: match by botanical name first, then common name, then category + size
- For labor: match by category (tree→install tree, shrub→install shrub, etc.) and size if relevant
- Confidence: "high" = strong name/botanical match, "medium" = category/size match only, "none" = no reasonable match

Return ONLY valid JSON:
{
  "matches": [
    {
      "takeoff_item_id": "<uuid>",
      "catalog_material_id": "<uuid or null>",
      "material_match_conf": "high|medium|none",
      "material_match_note": "<brief reason>",
      "task_catalog_id": "<uuid or null>",
      "labor_match_conf": "high|medium|none",
      "labor_match_note": "<brief reason>"
    }
  ]
}`;

      const message = await anthropic.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });

      const raw = (message.content[0] as any).text ?? "";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          for (const m of parsed.matches ?? []) {
            matchResults[m.takeoff_item_id] = {
              catalog_material_id: m.catalog_material_id ?? null,
              material_match_conf: m.material_match_conf ?? "none",
              material_match_note: m.material_match_note ?? null,
              task_catalog_id: m.task_catalog_id ?? null,
              labor_match_conf: m.labor_match_conf ?? "none",
              labor_match_note: m.labor_match_note ?? null,
              from_rule: false,
            };
          }
        } catch {
          // AI parse failed — items remain unmatched, that's OK
        }
      }
    }

    // ── Upsert session ───────────────────────────────────────
    const matchedCount = Object.values(matchResults).filter(
      m => m.catalog_material_id || m.task_catalog_id
    ).length;
    const pctMatched = items.length > 0 ? Math.round((matchedCount / items.length) * 100) : 0;

    const { data: existingSession } = await sb
      .from("handoff_sessions")
      .select("id")
      .eq("takeoff_id", takeoffId)
      .eq("status", "in_review")
      .maybeSingle();

    let sessionId: string;
    if (existingSession?.id) {
      await sb
        .from("handoff_sessions")
        .update({ pct_matched: pctMatched })
        .eq("id", existingSession.id);
      sessionId = existingSession.id;
    } else {
      const { data: newSession, error: se } = await sb
        .from("handoff_sessions")
        .insert({ company_id: companyId, takeoff_id: takeoffId, pct_matched: pctMatched })
        .select("id")
        .single();
      if (se || !newSession) return NextResponse.json({ error: se?.message ?? "Could not create session" }, { status: 500 });
      sessionId = newSession.id;
    }

    // ── Upsert match records ─────────────────────────────────
    const now = new Date().toISOString();
    const upserts = items.map(item => {
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

    const { error: ue } = await sb
      .from("takeoff_item_matches")
      .upsert(upserts, { onConflict: "takeoff_item_id" });

    if (ue) return NextResponse.json({ error: ue.message }, { status: 500 });

    return NextResponse.json({
      session_id: sessionId,
      total: items.length,
      matched: matchedCount,
      pct_matched: pctMatched,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
