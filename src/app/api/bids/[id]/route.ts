// src/app/api/bids/[id]/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

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

const TABLE_BIDS = "bids";

/**
 * GET /api/bids/[id]
 * returns: { data: bid }
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const bidId = String(id || "").trim();

    if (!bidId) {
      return NextResponse.json({ error: "Missing bid id" }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from(TABLE_BIDS)
      .select(
        "id, client_name, client_last_name, division_id, status_id, internal_notes, created_at, trucking_hours"
      )
      .eq("id", bidId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/bids/[id]
 * body can include any of:
 * { division_id?: uuid|null, status_id?: number|null, internal_notes?: string|null, trucking_hours?: number }
 *
 * returns: { data: updatedBid }
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const bidId = String(id || "").trim();

    if (!bidId) {
      return NextResponse.json({ error: "Missing bid id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));

    const patch: Record<string, any> = {};

    // Preserve existing features: only patch what is explicitly provided
    if (body?.division_id !== undefined) {
      const v = body.division_id;
      patch.division_id = v === "" ? null : v; // allow null
    }

    if (body?.status_id !== undefined) {
      const v = body.status_id;
      patch.status_id = v === "" ? null : v; // allow null
    }

    if (body?.internal_notes !== undefined) {
      patch.internal_notes =
        body.internal_notes === "" ? null : body.internal_notes;
    }

    // ✅ NEW: persist trucking hours
    if (body?.trucking_hours !== undefined) {
      const n = Number(body.trucking_hours);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json(
          { error: "Invalid trucking_hours" },
          { status: 400 }
        );
      }
      patch.trucking_hours = n;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from(TABLE_BIDS)
      .update(patch)
      .eq("id", bidId)
      .select(
        "id, client_name, client_last_name, division_id, status_id, internal_notes, created_at, trucking_hours"
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
