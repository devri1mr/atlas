import { supabaseAdmin } from "@/lib/supabase/admin";

export async function findOrCreateMaterial(name: string, unit: string) {
  const supabase = supabaseAdmin();

  const { data } = await supabase
    .from("materials")
    .select("*")
    .ilike("name", name)
    .limit(1);

  if (data && data.length) return data[0];

  const { data: created, error } = await supabase
    .from("materials")
    .insert({
      name,
      display_name: name,
      unit: unit,
      unit_cost: 0,
      inventory_enabled: true,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return created;
}

export async function createReceiptTransaction(input: any) {
  const supabase = supabaseAdmin();

  const material = await findOrCreateMaterial(
    input.material_name,
    input.inventory_unit
  );

  const unitCost =
    input.total_cost !== null
      ? Number((input.total_cost / input.quantity).toFixed(4))
      : null;

const fallbackLocationId =
  input.location_id ||
  (
    await supabase
      .from("inventory_locations")
      .select("id")
      .limit(1)
      .maybeSingle()
  ).data?.id;

if (!fallbackLocationId) {
  throw new Error("No inventory location found. Create an inventory location first.");
}
  const { data, error } = await supabase
    .from("inventory_transactions")
    .insert({
      material_id: material.id,
      location_id: fallbackLocationId,
      transaction_type: "receipt",
      quantity: input.quantity,
      total_cost: input.total_cost,
      unit_cost: unitCost,
      transaction_date: input.transaction_date,
      reference_number: input.reference_number,
      vendor_name: input.vendor_name,
      notes: input.notes,
      invoiced_final: input.invoiced_final,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return data;
}
