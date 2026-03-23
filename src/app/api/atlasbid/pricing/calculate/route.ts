import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function getDivisionMinimumGpPct(bidRow: any): number {
  const divisionName = String(
    bidRow?.division_name ??
      bidRow?.division ??
      bidRow?.division_label ??
      ""
  ).toLowerCase();

  // Fallback defaults for now.
  // Later these should come from Operations Center / division settings.
  if (divisionName.includes("landscap")) return 45;
  if (divisionName.includes("irrig")) return 42;
  if (divisionName.includes("fert")) return 50;
  if (divisionName.includes("lawn")) return 40;
  if (divisionName.includes("snow")) return 35;
  if (divisionName.includes("holiday")) return 45;
  if (divisionName.includes("phc")) return 50;

  return 45;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const body = await req.json();

    const bid_id = body?.bid_id;
    const target_gp_pct = num(body?.target_gp_pct, 50);
    const prepay_enabled = Boolean(body?.prepay_enabled ?? false);
    const manual_price =
      body?.manual_price !== null &&
      body?.manual_price !== undefined &&
      body?.manual_price !== ""
        ? num(body.manual_price, NaN)
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
        const hours = num(r.man_hours);
        const rate = num(r.hourly_rate);
        return sum + hours * rate;
      }, 0) ?? 0;

    const material_cost =
      materialRows?.reduce((sum, r) => {
        const qty = num(r.qty ?? r.quantity);
        const cost = num(r.unit_cost);
        return sum + qty * cost;
      }, 0) ?? 0;

    const trucking_hours = num(bidRow?.trucking_hours);
    const trucking_rate = num(
      bidRow?.division_rate ?? bidRow?.hourly_rate ?? 0
    );

    const trucking_cost =
      bidRow?.trucking_cost !== null && bidRow?.trucking_cost !== undefined
        ? num(bidRow.trucking_cost)
        : trucking_hours * trucking_rate;

    const total_cost = round2(labor_cost + material_cost + trucking_cost);

    const { data: opsRow } = await supabase
      .from("operations_settings")
      .select("*")
      .eq("company_id", bidRow.company_id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    // Fallback: read from bid_settings if operations_settings is missing values
    const { data: bidSettings } = await supabase
      .from("bid_settings")
      .select("contingency_pct, round_up_increment, prepay_discount_pct")
      .limit(1)
      .maybeSingle();

    const contingency =
      num(
        opsRow?.company_contingency_percent ??
          opsRow?.contingency_pct ??
          bidSettings?.contingency_pct,
        3
      ) / 100;

    const round_to = num(
      opsRow?.round_increment ??
        opsRow?.round_up_increment ??
        bidSettings?.round_up_increment,
      100
    );

    const prepay_discount =
      num(
        opsRow?.prepay_discount_percent ??
          opsRow?.prepay_discount_pct ??
          bidSettings?.prepay_discount_pct,
        3
      ) / 100;

const minimum_gp_pct = getDivisionMinimumGpPct(bidRow);
    const clamped_target_gp_pct = Math.max(0, Math.min(95, target_gp_pct));
    const margin = clamped_target_gp_pct / 100;

    let calculated_price =
      total_cost > 0 && margin < 1 ? total_cost / (1 - margin) : 0;

    calculated_price = calculated_price * (1 + contingency);

    const rounded_price =
      round_to > 0
        ? Math.ceil(calculated_price / round_to) * round_to
        : calculated_price;

    // Atlas recommendation before manual override
    const suggested_price = round2(rounded_price);

    // Actual price after override if provided
    const has_manual_override =
      manual_price !== null && Number.isFinite(manual_price) && manual_price > 0;

    const final_price = round2(
      has_manual_override ? Number(manual_price) : suggested_price
    );

    const prepay_price = round2(
      prepay_enabled ? final_price * (1 - prepay_discount) : final_price
    );

    const gp_base_price = prepay_enabled ? prepay_price : final_price;

    const effective_gp =
      gp_base_price > 0
        ? round2(((gp_base_price - total_cost) / gp_base_price) * 100)
        : 0;

    const override_amount = round2(final_price - suggested_price);
    const below_target = effective_gp < clamped_target_gp_pct;
    const target_gap_pct = round2(effective_gp - clamped_target_gp_pct);

    const below_minimum_gp = effective_gp < minimum_gp_pct;
    const minimum_gap_pct = round2(effective_gp - minimum_gp_pct);

    return NextResponse.json({
      labor_cost: round2(labor_cost),
      material_cost: round2(material_cost),
      trucking_cost: round2(trucking_cost),
      total_cost,

      suggested_price,
      final_price,
      prepay_price,
      gp_base_price,
      effective_gp,

      target_gp_pct: clamped_target_gp_pct,
      minimum_gp_pct,
      prepay_discount_pct: prepay_discount * 100,

      override_amount,
      has_manual_override,
      pricing_mode: has_manual_override ? "manual_override" : "suggested",

      below_target,
      target_gap_pct,

      below_minimum_gp,
      minimum_gap_pct,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Pricing calculation failed." },
      { status: 500 }
    );
  }
}
