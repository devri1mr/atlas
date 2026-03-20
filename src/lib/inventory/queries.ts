import { supabaseAdmin } from "@/lib/supabase/admin";

function n(v: any, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

export async function getInventoryLedger(filters: any = {}) {
  const supabase = supabaseAdmin();

  let q = supabase
    .from("inventory_transactions")
    .select(
      `
      *,
      materials(
        id,
        name,
        display_name,
        inventory_unit,
        inventory_enabled,
        division_id
      ),
      inventory_locations(
        id,
        name
      ),
      vendors(
        id,
        name
      )
      `
    )
    .order("transaction_date", { ascending: false });

  // Division filtering is done in JS after fetch (see below) so that materials
  // with a null division_id still appear under any division tab.
  if (filters.material_id) q = q.eq("material_id", filters.material_id);
  if (filters.location_id) q = q.eq("location_id", filters.location_id);

  const { data, error } = await q;

  if (error) throw new Error(error.message);

  const rows = Array.isArray(data) ? data : [];

  // Filter by division in JS: include rows whose material has the matching
  // division_id OR has no division_id (treat unassigned materials as universal).
  if (filters.division_id) {
    return rows.filter(r => {
      const matDiv = r.materials?.division_id ?? null;
      return matDiv === null || matDiv === filters.division_id;
    });
  }

  return rows;
}

export function computePosition(rows: any[]) {
  let qty = 0;
  let value = 0;

  for (const r of rows) {
    if (r.is_void) continue;

    const q = n(r.quantity);
    let v = 0;

    if (r.total_cost !== null) {
      v = n(r.total_cost);
    } else if (r.unit_cost !== null) {
      v = q * n(r.unit_cost);
    }

    qty += q;
    value += v;
  }

  const avg = qty !== 0 ? value / qty : 0;

  return {
    qty_on_hand: Number(qty.toFixed(2)),
    avg_unit_cost: Number(avg.toFixed(4)),
    inventory_value: Number(value.toFixed(2)),
    negative_flag: qty < 0,
  };
}

export async function getInventorySummary(filters: any = {}) {
  // Group by material+location only. Division is a property of the material, not
  // the transaction — this prevents double-counting when receipts and usage rows
  // have different (or null) division_id values for the same material.
  const { division_id: filterDivisionId, ...ledgerFilters } = filters;
  const rows = await getInventoryLedger(ledgerFilters);

  const groups = new Map<string, any[]>();

  for (const r of rows) {
    const materialDivisionId = r.materials?.division_id || null;
    // Filter by division: skip only if material has a non-matching division_id.
    // Null division_id materials appear under any division tab.
    if (filterDivisionId && materialDivisionId !== null && materialDivisionId !== filterDivisionId) continue;
    const key = `${r.material_id}_${r.location_id || "none"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const out: any[] = [];

  for (const [, group] of groups.entries()) {
    const pos = computePosition(group);
    const r = group[0];

    out.push({
      division_id: r.materials?.division_id || null,
      material_id: r.material_id,
      material_name: r.materials?.display_name || r.materials?.name || "",
      location_id: r.location_id,
      location_name: r.inventory_locations?.name || "",
      inventory_unit: r.materials?.inventory_unit || null,
      inventory_enabled: r.materials?.inventory_enabled || false,
      ...pos,
    });
  }

  return out.sort((a, b) => {
  const nameCompare = (a.material_name || "").localeCompare(b.material_name || "");
  if (nameCompare !== 0) return nameCompare;

  return (a.location_name || "").localeCompare(b.location_name || "");
});
}
