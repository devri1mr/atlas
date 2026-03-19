import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || "").trim());
}

// GET /api/materials-catalog?q=&category_id=&division_id=&include_inactive=true
export async function GET(req: NextRequest) {
  try {
    const supabase = supabaseAdmin();
    const { searchParams } = new URL(req.url);

    const q = (searchParams.get("q") || "").trim();
    const category_id = (searchParams.get("category_id") || "").trim();
    const division_id = (searchParams.get("division_id") || "").trim();
    const include_inactive = searchParams.get("include_inactive") === "true";

    let query = supabase
      .from("materials_catalog")
      .select("id, name, default_unit, default_unit_cost, vendor, sku, is_active, category_id, created_at")
      .order("name", { ascending: true });

    if (!include_inactive) query = query.eq("is_active", true);
    if (division_id && isUuid(division_id)) query = query.eq("division_id", division_id);
    if (category_id && isUuid(category_id)) query = query.eq("category_id", category_id);
    if (q) query = query.ilike("name", `%${q}%`);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Flag inventory links and capture linked materials.id for un-register
    const catalogIds = (data ?? []).map((r: any) => r.id);
    const inventoryIdByCatalog = new Map<string, string>();
    if (catalogIds.length > 0) {
      const { data: linked } = await supabase
        .from("materials")
        .select("id, catalog_material_id")
        .in("catalog_material_id", catalogIds);
      for (const r of linked ?? []) {
        if (r.catalog_material_id) inventoryIdByCatalog.set(r.catalog_material_id, r.id);
      }
    }

    const rows = (data ?? []).map((r: any) => ({
      ...r,
      in_inventory: inventoryIdByCatalog.has(r.id),
      inventory_material_id: inventoryIdByCatalog.get(r.id) ?? null,
    }));
    return NextResponse.json({ data: rows });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}

// POST /api/materials-catalog
export async function POST(req: NextRequest) {
  try {
    const supabase = supabaseAdmin();
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const name = (body?.name ?? "").toString().trim();
    const default_unit = (body?.default_unit ?? "").toString().trim();
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    if (!default_unit) return NextResponse.json({ error: "default_unit is required" }, { status: 400 });

    const default_unit_cost = Number(body?.default_unit_cost ?? 0);
    const category_id = body?.category_id && isUuid(body.category_id) ? body.category_id : null;
    const division_id = body?.division_id && isUuid(body.division_id) ? body.division_id : null;
    const vendor = body?.vendor || null;
    const sku = body?.sku || null;
    const is_active = body?.is_active !== undefined ? Boolean(body.is_active) : true;

    const { data, error } = await supabase
      .from("materials_catalog")
      .insert({ name, default_unit, default_unit_cost, vendor, sku, is_active, category_id, division_id })
      .select("id, name, default_unit, default_unit_cost, vendor, sku, is_active, category_id, created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
