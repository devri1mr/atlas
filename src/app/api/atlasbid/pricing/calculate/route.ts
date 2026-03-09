import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const body = await req.json();

    const bid_id = body?.bid_id;
    const target_gp_pct = Number(body?.target_gp_pct ?? 50);
    const prepay_enabled = Boolean(body?.prepay_enabled ?? false);
    const manual_price =
      body?.manual_price !== null && body?.manual_price !== undefined
        ? Number(body.manual_price)
        : null;

    if (!bid_id) {
      return NextResponse.json({ error: "Missing bid_id" }, { status: 400 });
    }

    const { data: laborRows, error: laborError } = await supabase
      .from("bid_labor")
      .select("*")
      .eq("bid_id", bid_id);

    if (laborError) {
      return NextResponse.json({ error: laborError.message }, { status: 500 });
    }

    const { data: materialRows, error: materialError } = await supabase
      .from("bid_materials")
      .select("*")
      .eq("bid_id", bid_id);

    if (materialError) {
      return NextResponse.json({ error: materialError.message }, { status: 500 });
    }

    const { data: bidRow, error: bidError } = await supabase
      .from("bids")
      .select("*")
      .eq("id", bid_id)
      .single();

    if (bidError) {
      return NextResponse.json({ error: bidError.message }, { status: 500 });
    }

    const labor_cost =
      laborRows?.reduce((sum, r) => {
        const hours = Number(r.man_hours ?? 0);
        const rate = Number(r.hourly_rate ?? 0);
        return sum + hours * rate;
      }, 0) ?? 0;

    const material_cost =
      materialRows?.reduce((sum, r) => {
        const qty = Number(r.quantity ?? 0);
        const cost = Number(r.unit_cost ?? 0);
        return sum + qty * cost;
      }, 0) ?? 0;

    const trucking_hours = Number(bidRow?.trucking_hours ?? 0);
    const trucking_rate = Number(
      bidRow?.division_rate ?? bidRow?.hourly_rate ?? 0
    );

    const trucking_cost =
      bidRow?.trucking_cost !== null && bidRow?.trucking_cost !== undefined
        ? Number(bidRow.trucking_cost)
        : trucking_hours * trucking_rate;

    const total_cost = labor_cost + material_cost + trucking_cost;

    // Hidden Ops values for now.
    // Later replace these with Operations Center settings.
    const contingency = 0.05;
    const round_to = 100;
    const prepay_discount = 0.03;

    const margin = Math.max(0, Math.min(0.95, target_gp_pct / 100));

    let calculated_price =
      total_cost > 0 && margin < 1 ? total_cost / (1 - margin) : 0;

    calculated_price = calculated_price * (1 + contingency);

    const rounded_price =
      round_to > 0
        ? Math.round(calculated_price / round_to) * round_to
        : calculated_price;

    // This is the Atlas system recommendation before manual override
    const suggested_price = rounded_price;

    // This is the actual project price after override if provided
    const final_price =
      manual_price !== null && !Number.isNaN(manual_price) && manual_price > 0
        ? manual_price
        : suggested_price;

    const prepay_price = prepay_enabled
      ? final_price * (1 - prepay_discount)
      : final_price;

    const effective_gp =
      final_price > 0 ? ((final_price - total_cost) / final_price) * 100 : 0;

    return NextResponse.json({
      labor_cost,
      material_cost,
      trucking_cost,
      total_cost,
      suggested_price,
      final_price,
      prepay_price,
      effective_gp,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Pricing calculation failed." },
      { status: 500 }
    );
  }
}
