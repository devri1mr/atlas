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
 * GET single material
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = supabaseAdmin();
    const { id } = await ctx.params;

    if (!isUuid(id)) {
      return NextResponse.json({ error: "Invalid material id" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("materials")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH update material
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = supabaseAdmin();
    const { id } = await ctx.params;

    if (!isUuid(id)) {
      return NextResponse.json({ error: "Invalid material id" }, { status: 400 });
    }

    const body = await req.json();

    const updates: Record<string, any> = {};

    if ("name" in body) updates.name = body.name?.trim();
    if ("display_name" in body) updates.display_name = body.display_name?.trim();
    if ("common_name" in body) updates.common_name = body.common_name?.trim();
    if ("scientific_name" in body)
      updates.scientific_name = body.scientific_name?.trim();
    if ("cultivar" in body) updates.cultivar = body.cultivar?.trim();

    if ("unit" in body) updates.unit = body.unit?.trim();

    if ("category_id" in body) {
      if (body.category_id && !isUuid(body.category_id)) {
        return NextResponse.json(
          { error: "category_id must be uuid" },
          { status: 400 }
        );
      }
      updates.category_id = body.category_id;
    }

    if ("unit_cost" in body) {
      const cost =
        body.unit_cost === null || body.unit_cost === ""
          ? null
          : Number(body.unit_cost);

      if (cost !== null && !Number.isFinite(cost)) {
        return NextResponse.json(
          { error: "unit_cost must be numeric" },
          { status: 400 }
        );
      }

      updates.unit_cost = cost;
    }

    if ("is_active" in body) {
      updates.is_active = Boolean(body.is_active);
    }

    const { data, error } = await supabase
      .from("materials")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = supabaseAdmin();
    const { id } = await ctx.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid material id" }, { status: 400 });
    const { error } = await supabase.from("materials").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
