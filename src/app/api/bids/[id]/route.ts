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

const BID_SELECT = `
  id,
  company_id,
  customer_name,
  client_name,
  client_last_name,
  address,
  address1,
  address2,
  city,
  state,
  zip,
  division_id,
  status_id,
  internal_notes,
  created_at,
  trucking_hours,
  labor_cost,
  material_cost,
  trucking_cost,
  total_cost,
  target_gp_pct,
  sell_rounded,
  prepay_enabled,
  prepay_price
`;

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
      .select(BID_SELECT)
      .eq("id", bidId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Bid not found" }, { status: 404 });
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

    if (body?.customer_name !== undefined) {
      patch.customer_name =
        body.customer_name === "" ? null : String(body.customer_name);
    }

    if (body?.client_name !== undefined) {
      patch.client_name =
        body.client_name === "" ? null : String(body.client_name);
    }

    if (body?.client_last_name !== undefined) {
      patch.client_last_name =
        body.client_last_name === "" ? null : String(body.client_last_name);
    }

    if (body?.address !== undefined) {
      patch.address = body.address === "" ? null : String(body.address);
    }

    if (body?.address1 !== undefined) {
      patch.address1 = body.address1 === "" ? null : String(body.address1);
    }

    if (body?.address2 !== undefined) {
      patch.address2 = body.address2 === "" ? null : String(body.address2);
    }

    if (body?.city !== undefined) {
      patch.city = body.city === "" ? null : String(body.city);
    }

    if (body?.state !== undefined) {
      patch.state = body.state === "" ? null : String(body.state);
    }

    if (body?.zip !== undefined) {
      patch.zip = body.zip === "" ? null : String(body.zip);
    }

    if (body?.division_id !== undefined) {
      const v = body.division_id;
      patch.division_id = v === "" ? null : v;
    }

    if (body?.status_id !== undefined) {
      const v = body.status_id;
      patch.status_id = v === "" ? null : v;
    }

    if (body?.internal_notes !== undefined) {
      patch.internal_notes =
        body.internal_notes === "" ? null : body.internal_notes;
    }

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

    if (body?.labor_cost !== undefined) {
      const n = Number(body.labor_cost);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json(
          { error: "Invalid labor_cost" },
          { status: 400 }
        );
      }
      patch.labor_cost = n;
    }

    if (body?.material_cost !== undefined) {
      const n = Number(body.material_cost);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json(
          { error: "Invalid material_cost" },
          { status: 400 }
        );
      }
      patch.material_cost = n;
    }

    if (body?.trucking_cost !== undefined) {
      const n = Number(body.trucking_cost);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json(
          { error: "Invalid trucking_cost" },
          { status: 400 }
        );
      }
      patch.trucking_cost = n;
    }

    if (body?.total_cost !== undefined) {
      const n = Number(body.total_cost);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json(
          { error: "Invalid total_cost" },
          { status: 400 }
        );
      }
      patch.total_cost = n;
    }

    if (body?.target_gp_pct !== undefined) {
      const n = Number(body.target_gp_pct);
      if (!Number.isFinite(n) || n < 0 || n > 95) {
        return NextResponse.json(
          { error: "Invalid target_gp_pct" },
          { status: 400 }
        );
      }
      patch.target_gp_pct = n;
    }

    if (body?.sell_rounded !== undefined) {
      const n = Number(body.sell_rounded);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json(
          { error: "Invalid sell_rounded" },
          { status: 400 }
        );
      }
      patch.sell_rounded = n;
    }

    if (body?.prepay_enabled !== undefined) {
      patch.prepay_enabled = Boolean(body.prepay_enabled);
    }

    if (body?.prepay_price !== undefined) {
      const n = Number(body.prepay_price);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json(
          { error: "Invalid prepay_price" },
          { status: 400 }
        );
      }
      patch.prepay_price = n;
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
      .select(BID_SELECT)
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
 * DELETE /api/bids/[id]
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const bidId = String(id || "").trim();
    if (!bidId) return NextResponse.json({ error: "Missing bid id" }, { status: 400 });
    const supabase = supabaseAdmin();
    const { error } = await supabase.from(TABLE_BIDS).delete().eq("id", bidId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
