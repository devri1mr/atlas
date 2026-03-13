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
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = supabaseAdmin();

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const bid_id = String(body?.bid_id ?? body?.bidId ?? "").trim();
    const name = String(body?.name ?? "").trim();
    const unit = String(body?.unit ?? "").trim();

    if (!bid_id || !isUuid(bid_id)) {
      return NextResponse.json(
        { error: "bid_id must be a uuid" },
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
        { error: "qty must be >= 0" },
        { status: 400 }
      );
    }

    const unit_cost = Number(body?.unit_cost ?? body?.unitCost ?? 0);
    if (!Number.isFinite(unit_cost) || unit_cost < 0) {
      return NextResponse.json(
        { error: "unit_cost must be >= 0" },
        { status: 400 }
      );
    }

    // Normalize optional UUID fields
    const material_id =
      typeof body?.material_id === "string" && body.material_id.trim()
        ? body.material_id.trim()
        : null;

    const source_task_id =
      typeof body?.source_task_id === "string" && body.source_task_id.trim()
        ? body.source_task_id.trim()
        : null;

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

    const details =
      typeof body?.details === "string" && body.details.trim()
        ? body.details.trim()
        : null;

    const source_type =
      typeof body?.source_type === "string" && body.source_type.trim()
        ? body.source_type.trim()
        : "manual";

    // 🔑 DERIVE company_id FROM THE BID (do not trust frontend)
    const { data: bidRow, error: bidError } = await supabase
      .from("bids")
      .select("company_id")
      .eq("id", bid_id)
      .single();

    if (bidError || !bidRow?.company_id) {
      return NextResponse.json(
        { error: "Could not determine company_id from bid" },
        { status: 400 }
      );
    }

    const company_id = bidRow.company_id;

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
