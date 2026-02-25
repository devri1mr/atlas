import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/atlasbid/bid-settings?division_id=3
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const divisionId = Number(searchParams.get("division_id"));

  if (!divisionId) {
    return NextResponse.json({ error: "division_id is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("atlas_bid_settings")
    .select("division_id, margin_default, contingency_pct, round_up_increment, prepay_discount_pct")
    .eq("division_id", divisionId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // fallback defaults if a row doesn't exist yet
  const settings =
    data ?? {
      division_id: divisionId,
      margin_default: 50,
      contingency_pct: 3,
      round_up_increment: 100,
      prepay_discount_pct: 3,
    };

  return NextResponse.json({ settings });
}

// POST /api/atlasbid/bid-settings
// body: { division_id, margin_default, contingency_pct, round_up_increment, prepay_discount_pct }
export async function POST(req: NextRequest) {
  const body = await req.json();

  const division_id = Number(body.division_id);
  if (!division_id) {
    return NextResponse.json({ error: "division_id is required" }, { status: 400 });
  }

  const payload = {
    division_id,
    margin_default: Number(body.margin_default ?? 50),
    contingency_pct: Number(body.contingency_pct ?? 3),
    round_up_increment: Number(body.round_up_increment ?? 100),
    prepay_discount_pct: Number(body.prepay_discount_pct ?? 3),
  };

  const { data, error } = await supabase
    .from("atlas_bid_settings")
    .upsert(payload, { onConflict: "division_id" })
    .select("division_id, margin_default, contingency_pct, round_up_increment, prepay_discount_pct")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}