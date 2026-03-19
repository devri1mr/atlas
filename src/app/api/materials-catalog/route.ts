import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function supabaseAdmin() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || "").trim());
}

/**
 * GET /api/materials-catalog?division_id=<uuid>&q=<search>
 * Returns: { data: Material[] }
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = supabaseAdmin();
    const { searchParams } = new URL(req.url);

    const division_id = (searchParams.get("division_id") || "").trim();
    const q = (searchParams.get("q") || "").trim();

    let query = supabase
      .from("materials_catalog")
      .select("id, division_id, name, default_unit, default_unit_cost, vendor, sku, is_active, created_at")
      .order("name", { ascending: true });

    if (division_id) {
      if (!isUuid(division_id)) return NextResponse.json({ error: "division_id must be a uuid" }, { status: 400 });
      query = query.eq("division_id", division_id);
    }

    // only active by default
    query = query.eq("is_active", true);

    if (q) {
      // simple name search
      query = query.ilike("name", `%${q}%`);
    }

    const { data, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Flag which catalog items are linked to an inventory (materials) row
    const catalogIds = (data ?? []).map((r: any) => r.id);
    let inInventorySet = new Set<string>();
    if (catalogIds.length > 0) {
      const { data: linked } = await supabase
        .from("materials")
        .select("catalog_material_id")
        .in("catalog_material_id", catalogIds)
        .eq("is_active", true);
      for (const r of linked ?? []) {
        if (r.catalog_material_id) inInventorySet.add(r.catalog_material_id);
      }
    }

    const rows = (data ?? []).map((r: any) => ({ ...r, in_inventory: inInventorySet.has(r.id) }));
    return NextResponse.json({ data: rows }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}

/**
 * POST /api/materials-catalog
 * Body:
 * {
 *   division_id?: uuid|null,
 *   name: string (required),
 *   default_unit: string (required),
 *   default_unit_cost?: number,
 *   vendor?: string|null,
 *   sku?: string|null,
 *   is_active?: boolean
 * }
 * Returns: { data: Material }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = supabaseAdmin();

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const division_id = (body?.division_id ?? "").toString().trim() || null;
    const name = (body?.name ?? "").toString().trim();
    const default_unit = (body?.default_unit ?? "").toString().trim();

    if (division_id && !isUuid(division_id)) {
      return NextResponse.json({ error: "division_id must be a uuid" }, { status: 400 });
    }
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    if (!default_unit) return NextResponse.json({ error: "default_unit is required" }, { status: 400 });

    const default_unit_cost = Number(body?.default_unit_cost ?? 0);
    if (!Number.isFinite(default_unit_cost) || default_unit_cost < 0) {
      return NextResponse.json({ error: "default_unit_cost must be a number >= 0" }, { status: 400 });
    }

    const vendor = body?.vendor ?? null;
    const sku = body?.sku ?? null;
    const is_active = body?.is_active !== undefined ? Boolean(body.is_active) : true;

    const { data, error } = await supabase
      .from("materials_catalog")
      .insert({
        division_id,
        name,
        default_unit,
        default_unit_cost,
        vendor,
        sku,
        is_active,
      })
      .select("id, division_id, name, default_unit, default_unit_cost, vendor, sku, is_active, created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
