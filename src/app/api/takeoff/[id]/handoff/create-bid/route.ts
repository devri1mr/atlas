import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// ── POST /api/takeoff/[id]/handoff/create-bid ────────────────
// Creates a bid from a completed handoff review.
// Body: { division_id?, markup_pct?, created_by_name? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: takeoffId } = await params;
    const sb = supabaseAdmin();
    const body = await req.json().catch(() => ({}));

    // Load takeoff
    const { data: takeoff, error: te } = await sb
      .from("takeoffs")
      .select("id, company_id, client_name, address, name, division_id, salesperson_name")
      .eq("id", takeoffId)
      .single();
    if (te || !takeoff) return NextResponse.json({ error: "Takeoff not found" }, { status: 404 });

    const companyId = takeoff.company_id;

    // Load handoff session
    const { data: session } = await sb
      .from("handoff_sessions")
      .select("id, status")
      .eq("takeoff_id", takeoffId)
      .eq("status", "in_review")
      .maybeSingle();
    if (!session) return NextResponse.json({ error: "No active handoff session found. Run matching first." }, { status: 400 });

    // Load all non-excluded matches with their items
    const { data: matches, error: matchErr } = await sb
      .from("takeoff_item_matches")
      .select(`
        id,
        catalog_material_id,
        material_match_conf,
        task_catalog_id,
        labor_match_conf,
        excluded,
        takeoff_item_id
      `)
      .eq("takeoff_id", takeoffId)
      .eq("excluded", false);
    if (matchErr) return NextResponse.json({ error: matchErr.message }, { status: 500 });

    if (!matches?.length) {
      return NextResponse.json({ error: "No matched items to create a bid from." }, { status: 400 });
    }

    // Load the takeoff items for counts/units
    const itemIds = matches.map(m => m.takeoff_item_id);
    const { data: takeoffItems } = await sb
      .from("takeoff_items")
      .select("id, common_name, botanical_name, category, size, container, count, unit")
      .in("id", itemIds);
    const itemById = new Map<string, any>();
    for (const i of takeoffItems ?? []) itemById.set(i.id, i);

    // Load catalog materials for pricing
    const catalogIds = [...new Set(matches.filter(m => m.catalog_material_id).map(m => m.catalog_material_id!))];
    const catalogById = new Map<string, any>();
    if (catalogIds.length) {
      const { data: catalogItems } = await sb
        .from("materials_catalog")
        .select("id, name, default_unit, default_unit_cost, vendor")
        .in("id", catalogIds);
      for (const c of catalogItems ?? []) catalogById.set(c.id, c);
    }

    // Load task catalog for labor
    const taskIds = [...new Set(matches.filter(m => m.task_catalog_id).map(m => m.task_catalog_id!))];
    const taskById = new Map<string, any>();
    if (taskIds.length) {
      const { data: taskItems } = await sb
        .from("task_catalog")
        .select("id, name, unit, minutes_per_unit, division_id, client_facing_template")
        .in("id", taskIds);
      for (const t of taskItems ?? []) taskById.set(t.id, t);
    }

    // Load division rates
    const { data: divisionRates } = await sb
      .from("division_rates")
      .select("division_id, hourly_rate");
    const rateByDivision = new Map<string, number>();
    for (const r of divisionRates ?? []) rateByDivision.set(r.division_id, Number(r.hourly_rate));

    // Parse client name into first / last
    const fullName = (takeoff.client_name ?? "").trim();
    const nameParts = fullName.split(" ");
    const clientLastName = nameParts.length > 1 ? nameParts.pop()! : "";
    const clientFirstName = nameParts.join(" ") || fullName;

    // Division/salesperson come from the takeoff; body values are overrides
    const divisionId = body.division_id ?? takeoff.division_id ?? null;
    const createdByName = body.created_by_name ?? takeoff.salesperson_name ?? null;

    // ── Create the bid ───────────────────────────────────────
    const { data: bid, error: bidErr } = await sb
      .from("bids")
      .insert({
        company_id: companyId,
        client_name: clientFirstName,
        client_last_name: clientLastName,
        division_id: divisionId,
        created_by_name: createdByName,
        address: takeoff.address ?? null,
        handoff_session_id: session.id,
        internal_notes: `Created from takeoff: ${takeoff.name ?? takeoffId}`,
      })
      .select("id, company_id")
      .single();
    if (bidErr || !bid) return NextResponse.json({ error: bidErr?.message ?? "Could not create bid" }, { status: 500 });

    const bidId = bid.id;

    // ── Build material inserts ───────────────────────────────
    // Aggregate by catalog_material_id to avoid duplicate key constraint
    const materialTotals = new Map<string, { qty: number; cat: any }>();
    const laborTaskCounts = new Map<string, number>(); // aggregate by task_catalog_id

    for (const match of matches) {
      const item = itemById.get(match.takeoff_item_id);
      if (!item) continue;

      const count = Number(item.count ?? 0);

      if (match.catalog_material_id && match.material_match_conf !== "none") {
        const cat = catalogById.get(match.catalog_material_id);
        if (cat) {
          const existing = materialTotals.get(match.catalog_material_id);
          if (existing) {
            existing.qty += count;
          } else {
            materialTotals.set(match.catalog_material_id, { qty: count, cat });
          }
        }
      }

      if (match.task_catalog_id && match.labor_match_conf !== "none") {
        laborTaskCounts.set(match.task_catalog_id, (laborTaskCounts.get(match.task_catalog_id) ?? 0) + count);
      }
    }

    const materialInserts: any[] = [];
    for (const [materialId, { qty, cat }] of materialTotals) {
      materialInserts.push({
        company_id: companyId,
        bid_id: bidId,
        material_id: materialId,
        name: cat.name,
        details: null,
        qty,
        unit: cat.default_unit ?? "EA",
        unit_cost: Number(cat.default_unit_cost ?? 0),
        source_type: "takeoff_handoff",
        source_task_id: null,
      });
    }

    const laborInserts: any[] = [];
    // Build labor rows (one per unique task)
    for (const [taskId, totalQty] of laborTaskCounts) {
      const task = taskById.get(taskId);
      if (!task) continue;
      const rate = rateByDivision.get(task.division_id) ?? rateByDivision.values().next().value ?? 65;
      const minsPerUnit = Number(task.minutes_per_unit ?? 0);
      const manHours = Math.round((minsPerUnit / 60) * totalQty * 100) / 100;

      laborInserts.push({
        company_id: companyId,
        bid_id: bidId,
        task_catalog_id: taskId,
        task: task.name,
        item: task.name,
        proposal_text: task.client_facing_template ?? task.name,
        quantity: totalQty,
        unit: task.unit ?? "EA",
        man_hours: manHours,
        hourly_rate: rate,
      });
    }

    // ── Insert materials ─────────────────────────────────────
    if (materialInserts.length > 0) {
      const { error: miErr } = await sb.from("bid_materials").insert(materialInserts);
      if (miErr) return NextResponse.json({ error: `Materials insert failed: ${miErr.message}` }, { status: 500 });
    }

    // ── Insert labor ─────────────────────────────────────────
    if (laborInserts.length > 0) {
      const { error: liErr } = await sb.from("bid_labor").insert(laborInserts);
      if (liErr) return NextResponse.json({ error: `Labor insert failed: ${liErr.message}` }, { status: 500 });
    }

    // ── Calculate totals for session ─────────────────────────
    const totalMaterialCost = materialInserts.reduce((s, m) => s + m.qty * m.unit_cost, 0);
    const totalLaborCost = laborInserts.reduce((s, l) => s + l.man_hours * l.hourly_rate, 0);
    const markupPct = Number(body.markup_pct ?? 50);
    const totalCost = totalMaterialCost + totalLaborCost;
    const suggestedPrice = totalCost > 0 && markupPct < 100
      ? Math.ceil((totalCost / (1 - markupPct / 100)) / 100) * 100
      : 0;

    // ── Finalize session ─────────────────────────────────────
    await sb
      .from("handoff_sessions")
      .update({
        bid_id: bidId,
        status: "bid_created",
        markup_pct: markupPct,
        total_material_cost: Math.round(totalMaterialCost * 100) / 100,
        total_labor_cost: Math.round(totalLaborCost * 100) / 100,
        suggested_price: suggestedPrice,
        finalized_at: new Date().toISOString(),
      })
      .eq("id", session.id);

    // Link bid back to session
    await sb.from("bids").update({ handoff_session_id: session.id }).eq("id", bidId);

    return NextResponse.json({
      bid_id: bidId,
      materials_added: materialInserts.length,
      labor_rows_added: laborInserts.length,
      total_material_cost: Math.round(totalMaterialCost * 100) / 100,
      total_labor_cost: Math.round(totalLaborCost * 100) / 100,
      suggested_price: suggestedPrice,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
