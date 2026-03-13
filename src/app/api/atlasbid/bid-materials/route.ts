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
 * GET /api/atlasbid/bid-materials?bid_id=<uuid>
 * Also supports ?bidId=<uuid>
 * Returns: { rows: BidMaterial[] }
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = supabaseAdmin();
    const { searchParams } = new URL(req.url);

    const bid_id =
      (searchParams.get("bid_id") || "").trim() ||
      (searchParams.get("bidId") || "").trim();

    if (!bid_id) {
      return NextResponse.json({ rows: [] }, { status: 200 });
    }

    if (!isUuid(bid_id)) {
      return NextResponse.json(
        { error: "bid_id must be a uuid" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("bid_materials")
      .select(
        "id, bid_id, material_id, name, details, qty, unit, unit_cost, source_type, source_task_id, created_at"
      )
      .eq("bid_id", bid_id)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rows: data ?? [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/atlasbid/bid-materials
 * Body:
 * {
 *   bid_id: uuid (required)
 *   material_id?: uuid|null
 *   name: string (required)
 *   details?: string|null
 *   qty: number (required)
 *   unit: string (required)
 *   unit_cost: number (required)
 *   source_type?: string|null
 *   source_task_id?: uuid|null
 * }
 * Returns: { row: BidMaterial }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = supabaseAdmin();

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const bid_id = String(body?.bid_id ?? body?.bidId ?? "").trim();
    const material_id = String(body?.material_id ?? "").trim() || null;
    const name = String(body?.name ?? "").trim();
    const details = String(body?.details ?? "").trim() || null;
    const unit = String(body?.unit ?? "").trim();
    const source_type = String(body?.source_type ?? "manual").trim() || "manual";
    const source_task_id = String(body?.source_task_id ?? "").trim() || null;

    if (!bid_id || !isUuid(bid_id)) {
      return NextResponse.json({ error: "bid_id must be a uuid" }, { status: 400 });
    }

    if (material_id && !isUuid(material_id)) {
      return NextResponse.json(
        { error: "material_id must be a uuid" },
        { status: 400 }
      );
    }

    if (source_task_id && !isUuid(source_task_id)) {
      return NextResponse.json(
        { error: "source_task_id must be a uuid" },
        { status: 400 }
      );
    }

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    if (!unit) {
      return NextResponse.json({ error: "unit is required" }, { status: 400 });
    }

    const qty = Number(body?.qty ?? 0);
    if (!Number.isFinite(qty) || qty < 0) {
      return NextResponse.json(
        { error: "qty must be a number >= 0" },
        { status: 400 }
      );
    }

    const unit_cost = Number(body?.unit_cost ?? body?.unitCost ?? 0);
    if (!Number.isFinite(unit_cost) || unit_cost < 0) {
      return NextResponse.json(
        { error: "unit_cost must be a number >= 0" },
        { status: 400 }
      );
    }

    const company_id = String(body?.company_id ?? "").trim();

const { data, error } = await supabase
  .from("bid_materials")
  .insert({
    company_id,
    bid_id,
    material_id,
    name,
    details,
    qty,
    unit,
    unit_cost,
    source_type,
    source_task_id,
  })
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
