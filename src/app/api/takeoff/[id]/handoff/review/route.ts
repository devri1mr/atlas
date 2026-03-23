import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── GET /api/takeoff/[id]/handoff/review ─────────────────────
// Returns the full handoff review payload: items + matches + pricing + flags
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: takeoffId } = await params;
    const sb = supabaseAdmin();

    // Load takeoff
    const { data: takeoff, error: te } = await sb
      .from("takeoffs")
      .select("id, company_id, client_name, address, name")
      .eq("id", takeoffId)
      .single();
    if (te || !takeoff) return NextResponse.json({ error: "Takeoff not found" }, { status: 404 });

    const companyId = takeoff.company_id;

    // Load takeoff items + their matches in one query
    const { data: items, error: ie } = await sb
      .from("takeoff_items")
      .select(`
        id, common_name, botanical_name, category, size, container,
        spacing, designation, remarks, count, unit, unit_price, color, sort_order
      `)
      .eq("takeoff_id", takeoffId)
      .order("sort_order", { ascending: true });
    if (ie) return NextResponse.json({ error: ie.message }, { status: 500 });

    const { data: matches, error: me } = await sb
      .from("takeoff_item_matches")
      .select(`
        id, takeoff_item_id, handoff_session_id,
        catalog_material_id, material_match_conf, material_match_note,
        task_catalog_id, labor_match_conf, labor_match_note,
        reviewed, override_by_user, excluded,
        inventory_qty_on_hand, inventory_flagged,
        ai_matched_at, updated_at
      `)
      .eq("takeoff_id", takeoffId);
    if (me) return NextResponse.json({ error: me.message }, { status: 500 });

    // Index matches by item id
    const matchByItemId = new Map<string, any>();
    for (const m of matches ?? []) matchByItemId.set(m.takeoff_item_id, m);

    // Collect unique catalog material + task ids to fetch details
    const catalogIds = new Set<string>();
    const taskIds = new Set<string>();
    for (const m of matches ?? []) {
      if (m.catalog_material_id) catalogIds.add(m.catalog_material_id);
      if (m.task_catalog_id) taskIds.add(m.task_catalog_id);
    }

    // Fetch catalog material details
    const catalogMap = new Map<string, any>();
    if (catalogIds.size > 0) {
      const { data: catalogItems } = await sb
        .from("materials_catalog")
        .select("id, name, botanical_name, default_unit, default_unit_cost, vendor, sku, landscape_category, created_at")
        .in("id", Array.from(catalogIds));
      for (const c of catalogItems ?? []) catalogMap.set(c.id, c);
    }

    // Fetch all active catalog materials for dropdown options (no company_id filter — catalog is shared)
    const { data: allCatalog } = await sb
      .from("materials_catalog")
      .select("id, name, botanical_name, default_unit, default_unit_cost, vendor, landscape_category")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(500);

    // Fetch task catalog details
    const taskMap = new Map<string, any>();
    if (taskIds.size > 0) {
      const { data: taskItems } = await sb
        .from("task_catalog")
        .select("id, name, unit, minutes_per_unit, landscape_category, division_id")
        .in("id", Array.from(taskIds));
      for (const t of taskItems ?? []) taskMap.set(t.id, t);
    }

    // Fetch all active tasks for dropdown options
    const { data: allTasks } = await sb
      .from("task_catalog")
      .select("id, name, unit, minutes_per_unit, landscape_category, division_id")
      .eq("active", true)
      .order("name", { ascending: true })
      .limit(300);

    // Pricing book freshness — flag catalog items with stale pricing books (>6 months)
    const staleCatalogIds = new Set<string>();
    if (catalogIds.size > 0) {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const { data: pricingBooks } = await sb
        .from("pricing_books")
        .select("id, vendor, created_at")
        .eq("company_id", companyId)
        .lt("created_at", sixMonthsAgo.toISOString());
      const staleVendors = new Set((pricingBooks ?? []).map((pb: any) => pb.vendor?.toLowerCase()));
      for (const [cid, c] of catalogMap) {
        if (staleVendors.has(c.vendor?.toLowerCase())) staleCatalogIds.add(cid);
      }
    }

    // Inventory check
    const inventoryMap = new Map<string, number>();
    if (catalogIds.size > 0) {
      const { data: invItems } = await sb
        .from("materials")
        .select("catalog_material_id, id")
        .in("catalog_material_id", Array.from(catalogIds))
        .eq("inventory_enabled", true);
      if (invItems?.length) {
        const materialIds = invItems.map((i: any) => i.id);
        const { data: invSummary } = await sb
          .from("inventory_summary")
          .select("material_id, qty_on_hand")
          .in("material_id", materialIds);
        const materialToCatalog = new Map<string, string>();
        for (const inv of invItems) materialToCatalog.set(inv.id, inv.catalog_material_id!);
        for (const s of invSummary ?? []) {
          const cid = materialToCatalog.get(s.material_id);
          if (cid) inventoryMap.set(cid, (inventoryMap.get(cid) ?? 0) + Number(s.qty_on_hand ?? 0));
        }
      }
    }

    // Get active handoff session
    const { data: session } = await sb
      .from("handoff_sessions")
      .select("id, status, pct_matched, total_material_cost, total_labor_cost, suggested_price, revision_number, created_at")
      .eq("takeoff_id", takeoffId)
      .eq("status", "in_review")
      .maybeSingle();

    // Get division rates for labor cost estimation
    const { data: divisionRates } = await sb
      .from("division_rates")
      .select("division_id, hourly_rate");
    const rateByDivision = new Map<string, number>();
    for (const r of divisionRates ?? []) rateByDivision.set(r.division_id, Number(r.hourly_rate));

    // Build enriched item list
    const enrichedItems = (items ?? []).map(item => {
      const match = matchByItemId.get(item.id);
      const catalogMaterial = match?.catalog_material_id ? catalogMap.get(match.catalog_material_id) : null;
      const task = match?.task_catalog_id ? taskMap.get(match.task_catalog_id) : null;
      const invQty = catalogMaterial ? (inventoryMap.get(catalogMaterial.id) ?? 0) : 0;
      const stale = catalogMaterial ? staleCatalogIds.has(catalogMaterial.id) : false;

      const materialCost = catalogMaterial
        ? Number(catalogMaterial.default_unit_cost ?? 0) * Number(item.count ?? 0)
        : 0;

      let laborCost = 0;
      if (task) {
        const rate = rateByDivision.get(task.division_id) ?? 65;
        const mins = Number(task.minutes_per_unit ?? 0);
        laborCost = (mins / 60) * rate * Number(item.count ?? 0);
      }

      return {
        ...item,
        match: match ? {
          id: match.id,
          catalog_material_id: match.catalog_material_id,
          material_match_conf: match.material_match_conf,
          material_match_note: match.material_match_note,
          task_catalog_id: match.task_catalog_id,
          labor_match_conf: match.labor_match_conf,
          labor_match_note: match.labor_match_note,
          reviewed: match.reviewed,
          override_by_user: match.override_by_user,
          excluded: match.excluded,
          inventory_qty_on_hand: invQty,
          inventory_flagged: invQty > 0,
          pricing_stale: stale,
        } : null,
        catalog_material: catalogMaterial ?? null,
        task_catalog: task ?? null,
        material_cost: Math.round(materialCost * 100) / 100,
        labor_cost: Math.round(laborCost * 100) / 100,
      };
    });

    // Summary totals
    const totalMaterialCost = enrichedItems.reduce((s, i) => s + (i.match?.excluded ? 0 : i.material_cost), 0);
    const totalLaborCost = enrichedItems.reduce((s, i) => s + (i.match?.excluded ? 0 : i.labor_cost), 0);
    const matchedItems = enrichedItems.filter(i => i.match && (i.match.catalog_material_id || i.match.task_catalog_id) && !i.match.excluded);
    const pctMatched = items?.length ? Math.round((matchedItems.length / items.length) * 100) : 0;

    return NextResponse.json({
      takeoff,
      session,
      items: enrichedItems,
      catalog_options: allCatalog ?? [],
      task_options: allTasks ?? [],
      summary: {
        total_items: items?.length ?? 0,
        matched: matchedItems.length,
        pct_matched: pctMatched,
        total_material_cost: Math.round(totalMaterialCost * 100) / 100,
        total_labor_cost: Math.round(totalLaborCost * 100) / 100,
        total_cost: Math.round((totalMaterialCost + totalLaborCost) * 100) / 100,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
