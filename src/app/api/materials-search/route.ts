import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function supabaseAdmin() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(v || "").trim()
  );
}

/**
 * GET /api/materials-search?q=<search>&division_id=<uuid>&catalog_material_id=<uuid>&subcategory_id=<uuid>&limit=<n>
 *
 * Returns product-level material search rows from `materials`,
 * joined to vendors, materials_catalog, and material_subcategories.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = supabaseAdmin();
    const { searchParams } = new URL(req.url);

    const q = (searchParams.get("q") || "").trim();
    const division_id = (searchParams.get("division_id") || "").trim();
    const catalog_material_id = (searchParams.get("catalog_material_id") || "").trim();
    const subcategory_id = (searchParams.get("subcategory_id") || "").trim();

    const limitRaw = Number(searchParams.get("limit") || 20);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 50)
      : 20;

    if (division_id && !isUuid(division_id)) {
      return NextResponse.json(
        { error: "division_id must be a uuid" },
        { status: 400 }
      );
    }

    if (catalog_material_id && !isUuid(catalog_material_id)) {
      return NextResponse.json(
        { error: "catalog_material_id must be a uuid" },
        { status: 400 }
      );
    }

    if (subcategory_id && !isUuid(subcategory_id)) {
      return NextResponse.json(
        { error: "subcategory_id must be a uuid" },
        { status: 400 }
      );
    }

    let query = supabase
      .from("materials")
      .select(
        `
        id,
        company_id,
        vendor_id,
        catalog_material_id,
        subcategory_id,
        display_name,
        common_name,
        scientific_name,
        cultivar,
        sku,
        unit,
        unit_cost,
        is_active,
        search_text,
        created_at,
        vendors (
          id,
          name
        ),
        materials_catalog (
          id,
          division_id,
          name,
          default_unit
        ),
        material_subcategories (
          id,
          name
        )
        `
      )
      .eq("is_active", true)
      .order("display_name", { ascending: true })
      .limit(limit);

    if (catalog_material_id) {
      query = query.eq("catalog_material_id", catalog_material_id);
    }

    if (subcategory_id) {
      query = query.eq("subcategory_id", subcategory_id);
    }

    if (division_id) {
      query = query.eq("materials_catalog.division_id", division_id);
    }

    if (q) {
      query = query.or(
        [
          `display_name.ilike.%${q}%`,
          `common_name.ilike.%${q}%`,
          `scientific_name.ilike.%${q}%`,
          `cultivar.ilike.%${q}%`,
          `sku.ilike.%${q}%`,
          `search_text.ilike.%${q}%`,
        ].join(",")
      );
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []).map((row: any) => ({
      id: row.id,
      company_id: row.company_id ?? null,
      vendor_id: row.vendor_id ?? null,
      catalog_material_id: row.catalog_material_id ?? null,
      subcategory_id: row.subcategory_id ?? null,
      display_name: row.display_name ?? "",
      common_name: row.common_name ?? null,
      scientific_name: row.scientific_name ?? null,
      cultivar: row.cultivar ?? null,
      sku: row.sku ?? null,
      unit: row.unit ?? null,
      unit_cost: Number(row.unit_cost ?? 0),
      is_active: row.is_active ?? true,
      search_text: row.search_text ?? null,
      created_at: row.created_at ?? null,

      vendor_name: row.vendors?.name ?? null,

      catalog_name: row.materials_catalog?.name ?? null,
      division_id: row.materials_catalog?.division_id ?? null,
      default_unit: row.materials_catalog?.default_unit ?? null,

      subcategory_name: row.material_subcategories?.name ?? null,
    }));

    return NextResponse.json({ data: rows }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
