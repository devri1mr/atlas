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

function nullableText(v: unknown) {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function nullableNumber(v: unknown) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = supabaseAdmin();
    const { searchParams } = new URL(req.url);

    const search = (searchParams.get("search") || "").trim().toLowerCase();
    const categoryId = (searchParams.get("category_id") || "").trim();
    const materialType = (searchParams.get("material_type") || "").trim().toLowerCase();

    let query = supabase
      .from("materials")
      .select(
        `
        id,
        name,
        display_name,
        common_name,
        scientific_name,
        cultivar,
        material_type,
        size,
        container_size,
        spacing_in,
        spread_in,
        height_in,
        plant_form,
        sun_exposure,
        notes,
        unit,
        unit_cost,
        is_active,
        category_id
        `
      )
      .order("display_name", { ascending: true });

    if (categoryId) {
      if (!isUuid(categoryId)) {
        return NextResponse.json(
          { error: "category_id must be a uuid" },
          { status: 400 }
        );
      }
      query = query.eq("category_id", categoryId);
    }

    if (materialType) {
      query = query.eq("material_type", materialType);
    }

    if (search) {
      query = query.or(
        [
          `display_name.ilike.%${search}%`,
          `name.ilike.%${search}%`,
          `common_name.ilike.%${search}%`,
          `scientific_name.ilike.%${search}%`,
          `cultivar.ilike.%${search}%`,
          `size.ilike.%${search}%`,
          `container_size.ilike.%${search}%`,
          `search_text.ilike.%${search}%`,
        ].join(",")
      );
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? [], { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = supabaseAdmin();
    const body = await req.json();

    const name = String(body?.name || "").trim();
    const display_name = String(body?.display_name || name).trim();
    const common_name = nullableText(body?.common_name);
    const scientific_name = nullableText(body?.scientific_name);
    const cultivar = nullableText(body?.cultivar);
    const material_type = nullableText(body?.material_type);
    const size = nullableText(body?.size);
    const container_size = nullableText(body?.container_size);
    const spacing_in = nullableNumber(body?.spacing_in);
    const spread_in = nullableNumber(body?.spread_in);
    const height_in = nullableNumber(body?.height_in);
    const plant_form = nullableText(body?.plant_form);
    const sun_exposure = nullableText(body?.sun_exposure);
    const notes = nullableText(body?.notes);
    const unit = nullableText(body?.unit);
    const category_id = nullableText(body?.category_id);

    const unit_cost =
      body?.unit_cost === null ||
      body?.unit_cost === undefined ||
      body?.unit_cost === ""
        ? null
        : Number(body.unit_cost);

    const is_active =
      body?.is_active === undefined ? true : Boolean(body.is_active);

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    if (unit_cost !== null && !Number.isFinite(unit_cost)) {
      return NextResponse.json(
        { error: "unit_cost must be a valid number" },
        { status: 400 }
      );
    }

    if (category_id && !isUuid(category_id)) {
      return NextResponse.json(
        { error: "category_id must be a uuid" },
        { status: 400 }
      );
    }

    const catalog_material_id = nullableText(body?.catalog_material_id);
    if (catalog_material_id && !isUuid(catalog_material_id)) {
      return NextResponse.json({ error: "catalog_material_id must be a uuid" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("materials")
      .insert({
        name,
        display_name,
        common_name,
        scientific_name,
        cultivar,
        material_type,
        size,
        container_size,
        spacing_in,
        spread_in,
        height_in,
        plant_form,
        sun_exposure,
        notes,
        unit,
        unit_cost,
        category_id,
        is_active,
        ...(catalog_material_id ? { catalog_material_id } : {}),
      })
      .select(
        `
        id,
        name,
        display_name,
        common_name,
        scientific_name,
        cultivar,
        material_type,
        size,
        container_size,
        spacing_in,
        spread_in,
        height_in,
        plant_form,
        sun_exposure,
        notes,
        unit,
        unit_cost,
        is_active,
        category_id
        `
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
