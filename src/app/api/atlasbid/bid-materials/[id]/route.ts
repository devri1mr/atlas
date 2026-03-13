import { NextResponse } from "next/server";
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
 * PATCH /api/atlasbid/bid-materials/[id]
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const rowId = String(id || "").trim();

    if (!rowId || !isUuid(rowId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const patch: Record<string, any> = {};

    if (body?.name !== undefined) {
      const name = String(body.name || "").trim();
      if (!name) {
        return NextResponse.json({ error: "name is required" }, { status: 400 });
      }
      patch.name = name;
    }

    if (body?.details !== undefined) {
      patch.details =
        body.details === null || String(body.details || "").trim() === ""
          ? null
          : String(body.details).trim();
    }

    if (body?.qty !== undefined) {
      const qty = Number(body.qty);
      if (!Number.isFinite(qty) || qty < 0) {
        return NextResponse.json({ error: "qty must be >= 0" }, { status: 400 });
      }
      patch.qty = qty;
    }

    if (body?.unit !== undefined) {
      const unit = String(body.unit || "").trim();
      if (!unit) {
        return NextResponse.json({ error: "unit is required" }, { status: 400 });
      }
      patch.unit = unit;
    }

    if (body?.unit_cost !== undefined || body?.unitCost !== undefined) {
      const unitCost = Number(body?.unit_cost ?? body?.unitCost);
      if (!Number.isFinite(unitCost) || unitCost < 0) {
        return NextResponse.json(
          { error: "unit_cost must be >= 0" },
          { status: 400 }
        );
      }
      patch.unit_cost = unitCost;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from("bid_materials")
      .update(patch)
      .eq("id", rowId)
      .select(
        "id, bid_id, material_id, name, details, qty, unit, unit_cost, source_type, source_task_id, created_at"
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ row: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/atlasbid/bid-materials/[id]
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const rowId = String(id || "").trim();

    if (!rowId || !isUuid(rowId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const supabase = supabaseAdmin();
    const { error } = await supabase.from("bid_materials").delete().eq("id", rowId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
