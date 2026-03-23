import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// ── PATCH /api/takeoff/[id]/handoff/match/[matchId] ──────────
// Manual override: salesperson picks a different catalog material or task.
// Auto-saves a match rule for future takeoffs.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  try {
    const { id: takeoffId, matchId } = await params;
    const sb = supabaseAdmin();
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    // Load the existing match + takeoff item
    const { data: existingMatch, error: me } = await sb
      .from("takeoff_item_matches")
      .select("id, company_id, takeoff_item_id")
      .eq("id", matchId)
      .eq("takeoff_id", takeoffId)
      .single();
    if (me || !existingMatch) return NextResponse.json({ error: "Match not found" }, { status: 404 });

    const { data: item, error: ie } = await sb
      .from("takeoff_items")
      .select("common_name, botanical_name, category, size")
      .eq("id", existingMatch.takeoff_item_id)
      .single();
    if (ie || !item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    // Build update payload — only update provided fields
    const update: Record<string, any> = {
      reviewed: true,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const allowed = [
      "catalog_material_id", "material_match_conf", "material_match_note",
      "task_catalog_id", "labor_match_conf", "labor_match_note",
      "excluded",
    ];
    for (const field of allowed) {
      if (field in body) update[field] = body[field] ?? null;
    }

    // Mark as user override if material or task changed
    if ("catalog_material_id" in body || "task_catalog_id" in body) {
      update.override_by_user = true;
    }

    const { data: updated, error: ue } = await sb
      .from("takeoff_item_matches")
      .update(update)
      .eq("id", matchId)
      .select("*")
      .single();
    if (ue) return NextResponse.json({ error: ue.message }, { status: 500 });

    // Save/update match rule for future auto-matching
    if ("catalog_material_id" in body || "task_catalog_id" in body) {
      const ruleKey = {
        company_id: existingMatch.company_id,
        match_common_name: (item.common_name ?? "").toLowerCase().trim(),
        match_botanical_name: (item.botanical_name ?? "").toLowerCase().trim(),
        match_category: (item.category ?? "").toLowerCase().trim(),
        match_size: (item.size ?? "").toLowerCase().trim(),
      };

      const { data: existingRule } = await sb
        .from("takeoff_match_rules")
        .select("id, usage_count")
        .eq("company_id", ruleKey.company_id)
        .eq("match_common_name", ruleKey.match_common_name)
        .eq("match_botanical_name", ruleKey.match_botanical_name)
        .eq("match_category", ruleKey.match_category)
        .eq("match_size", ruleKey.match_size)
        .maybeSingle();

      if (existingRule?.id) {
        await sb
          .from("takeoff_match_rules")
          .update({
            catalog_material_id: body.catalog_material_id ?? null,
            task_catalog_id: body.task_catalog_id ?? null,
            usage_count: (existingRule.usage_count ?? 1) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingRule.id);
      } else {
        await sb.from("takeoff_match_rules").insert({
          ...ruleKey,
          catalog_material_id: body.catalog_material_id ?? null,
          task_catalog_id: body.task_catalog_id ?? null,
        });
      }
    }

    return NextResponse.json({ data: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
