import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const body = await req.json();

    const bid_id = body?.bid_id;

    if (!bid_id) {
      return NextResponse.json({ error: "Missing bid_id" }, { status: 400 });
    }

    // Get labor rows
    const { data: laborRows } = await supabase
      .from("bid_labor")
      .select("*")
      .eq("bid_id", bid_id);

    // Get material rows
    const { data: materialRows } = await supabase
      .from("bid_materials")
      .select("*")
      .eq("bid_id", bid_id);

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

    const total_cost = labor_cost + material_cost;

    // Load pricing settings from operations center later
    const margin = 0.5;
    const contingency = 0.05;
    const round_to = 100;
    const prepay_discount = 0.03;

    let sell_price = total_cost / (1 - margin);

    sell_price = sell_price * (1 + contingency);

    const rounded_price =
      Math.round(sell_price / round_to) * round_to;

    const prepay_price = rounded_price * (1 - prepay_discount);

    return NextResponse.json({
      labor_cost,
      material_cost,
      total_cost,
      sell_price,
      rounded_price,
      prepay_price,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
