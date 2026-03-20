import { supabaseAdmin } from "@/lib/supabase/admin";

function normalizeMaterialName(name: string) {
  const raw = String(name || "").trim().toLowerCase();

  const map: Record<string, string> = {
    "brown mulch": "Mulch - Brown",
    "mulch brown": "Mulch - Brown",
    "black mulch": "Mulch - Black",
    "mulch black": "Mulch - Black",
    "cedar mulch": "Mulch - Cedar",
    "mulch cedar": "Mulch - Cedar",
  };

  if (map[raw]) return map[raw];

  return String(name || "").trim();
}

export async function findOrCreateMaterial(
  name: string,
  unit: string,
  divisionId?: string
) {
  const supabase = supabaseAdmin();

  const normalizedName = normalizeMaterialName(name);

  // Search by division first (most specific), then fall back to any division.
  // This prevents creating duplicate material records when the same material
  // was previously imported without a division_id.
  let existingQuery = supabase
    .from("materials")
    .select("*")
    .ilike("name", normalizedName)
    .limit(1);

  if (divisionId) {
    existingQuery = existingQuery.eq("division_id", divisionId);
  }

  const { data: existing, error: existingError } = await existingQuery;
  if (existingError) throw new Error(existingError.message);
  if (existing && existing.length) return existing[0];

  let displayQuery = supabase
    .from("materials")
    .select("*")
    .ilike("display_name", normalizedName)
    .limit(1);

  if (divisionId) {
    displayQuery = displayQuery.eq("division_id", divisionId);
  }

  const { data: displayExisting, error: displayError } = await displayQuery;
  if (displayError) throw new Error(displayError.message);
  if (displayExisting && displayExisting.length) return displayExisting[0];

  // Fall back: look across all divisions (catches materials created without division_id)
  const { data: anyDivision } = await supabase
    .from("materials")
    .select("*")
    .or(`name.ilike.${normalizedName},display_name.ilike.${normalizedName}`)
    .limit(1);

  if (anyDivision && anyDivision.length) return anyDivision[0];

  const { data: created, error } = await supabase
    .from("materials")
    .insert({
      name: normalizedName,
      display_name: normalizedName,
      unit,
      inventory_unit: unit,
      unit_cost: 0,
      inventory_enabled: true,
      is_active: true,
      division_id: divisionId ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Sync to materials_catalog so this item is searchable for tasks/bundles/bids.
  let catQuery = supabase.from("materials_catalog").select("id").ilike("name", normalizedName);
  if (divisionId) catQuery = catQuery.eq("division_id", divisionId);
  const { data: existingCat } = await catQuery.maybeSingle();

  if (!existingCat) {
    const { data: catEntry } = await supabase
      .from("materials_catalog")
      .insert({
        name: normalizedName,
        default_unit: unit,
        default_unit_cost: 0,
        division_id: divisionId ?? null,
        is_active: true,
      })
      .select("id")
      .single();

    // Link the materials row back to the catalog entry
    if (catEntry) {
      await supabase.from("materials").update({ catalog_material_id: catEntry.id }).eq("id", created.id);
    }
  } else {
    // Link to existing catalog entry
    await supabase.from("materials").update({ catalog_material_id: existingCat.id }).eq("id", created.id);
  }

  return created;
}

export async function createReceiptTransaction(input: any) {
  const supabase = supabaseAdmin();

  const normalizedMaterialName = normalizeMaterialName(input.material_name);

  const material = await findOrCreateMaterial(
    normalizedMaterialName,
    input.inventory_unit,
    input.division_id
  );

  const unitCost =
    input.total_cost !== null && Number(input.quantity) > 0
      ? Number((Number(input.total_cost) / Number(input.quantity)).toFixed(4))
      : null;

  let fallbackLocationId = input.location_id || null;
  if (!fallbackLocationId) {
    const { data: loc } = await supabase
      .from("inventory_locations")
      .select("id")
      .order("name", { ascending: true })
      .limit(1)
      .maybeSingle();
    fallbackLocationId = loc?.id ?? null;
  }

  if (!fallbackLocationId) {
    throw new Error("No inventory location found. Please add a location in Operations Center → Inventory Locations first.");
  }

  const validSources = new Set(["receipt", "invoice", "ticket", "cc_receipt"]);
  const transactionType = validSources.has(input.receipt_source) ? input.receipt_source : "receipt";

  const { data, error } = await supabase
    .from("inventory_transactions")
    .insert({
      material_id: material.id,
      location_id: fallbackLocationId,
      division_id: input.division_id ?? null,
      transaction_type: transactionType,
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
