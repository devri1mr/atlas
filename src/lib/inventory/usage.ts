import { supabaseAdmin } from "@/lib/supabase/admin";
import { computePosition, getInventoryLedger } from "@/lib/inventory/queries";

export async function createUsageTransaction(input: any) {
  const supabase = supabaseAdmin();

  const rows = await getInventoryLedger({
    material_id: input.material_id,
  });

  const pos = computePosition(rows);

  const avg = pos.avg_unit_cost || 0;

  const qty = -Math.abs(input.quantity);

  const totalCost = Number((qty * avg).toFixed(2));

  const divisionId = rows[0]?.materials?.division_id ?? input.division_id ?? null;

  const { data, error } = await supabase
    .from("inventory_transactions")
    .insert({
      material_id: input.material_id,
      location_id: input.location_id,
      division_id: divisionId,
      transaction_type: "usage",
      quantity: qty,
      unit_cost: avg,
      total_cost: totalCost,
      transaction_date: input.transaction_date,
      reference_type: input.reference_type,
      reference_id: input.reference_id,
      reference_number: input.reference_number,
      notes: input.notes,
      invoiced_final: true,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return data;
}
