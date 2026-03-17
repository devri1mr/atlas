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

  if (filters.division_id) q = q.eq("division_id", filters.division_id);
  if (filters.material_id) q = q.eq("material_id", filters.material_id);
  if (filters.location_id) q = q.eq("location_id", filters.location_id);

  const { data, error } = await q;

  if (error) throw new Error(error.message);

  return Array.isArray(data) ? data : [];
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
  const rows = await getInventoryLedger(filters);

  const groups = new Map<string, any[]>();

  for (const r of rows) {
    const key = `${r.division_id || "none"}_${r.material_id}_${r.location_id || "none"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const out: any[] = [];

  for (const [, group] of groups.entries()) {
    const pos = computePosition(group);
    const r = group[0];

    out.push({
      division_id: r.division_id || null,
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
