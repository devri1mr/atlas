import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

/**
 * GET /api/operations-center/divisions
 * Returns divisions for the Operations Center.
 */
export async function GET() {
  try {
    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from("divisions")
      .select("id,name,labor_rate,target_gross_profit_percent,allow_overtime,active,created_at")
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: error.message, details: error },
        { status: 500 }
      );
    }

    return NextResponse.json({ divisions: data ?? [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/operations-center/divisions
 * Creates a division.
 *
 * Accepts BOTH:
 * - snake_case: labor_rate, target_gross_profit_percent
 * - camelCase: laborRate, targetGrossProfitPercent
 */
export async function POST(req: Request) {
  try {
    const supabase = supabaseAdmin();

    const body = await req.json();

    // Name
    const name = body?.name?.toString?.().trim?.() ?? "";

    // Accept snake_case OR camelCase from the UI
    const laborRateRaw = body?.labor_rate ?? body?.laborRate;
    const targetGpRaw =
      body?.target_gross_profit_percent ??
      body?.targetGrossProfitPercent ??
      body?.target_gp_pct ??
      body?.targetGpPct;

    const allowOvertimeRaw = body?.allow_overtime ?? body?.allowOvertime;
    const activeRaw = body?.active;

    if (!name) {
      return NextResponse.json(
        { error: "Division name required" },
        { status: 400 }
      );
    }

    if (laborRateRaw === undefined || laborRateRaw === null || laborRateRaw === "") {
      return NextResponse.json(
        { error: "Labor rate required" },
        { status: 400 }
      );
    }

    if (targetGpRaw === undefined || targetGpRaw === null || targetGpRaw === "") {
      return NextResponse.json(
        { error: "Target Gross Profit % required" },
        { status: 400 }
      );
    }

    const labor_rate = Number(laborRateRaw);
    const target_gross_profit_percent = Number(targetGpRaw);

    if (Number.isNaN(labor_rate)) {
      return NextResponse.json(
        { error: "Labor rate must be a number" },
        { status: 400 }
      );
    }

    if (Number.isNaN(target_gross_profit_percent)) {
      return NextResponse.json(
        { error: "Target Gross Profit % must be a number" },
        { status: 400 }
      );
    }

    const allow_overtime =
      allowOvertimeRaw === undefined || allowOvertimeRaw === null
        ? true
        : Boolean(allowOvertimeRaw);

    const active =
      activeRaw === undefined || activeRaw === null ? true : Boolean(activeRaw);

    const { data, error } = await supabase
      .from("divisions")
      .insert([
        {
          name,
          labor_rate,
          target_gross_profit_percent,
          allow_overtime,
          active,
        },
      ])
      .select("id,name,labor_rate,target_gross_profit_percent,allow_overtime,active,created_at")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message, details: error },
        { status: 500 }
      );
    }

    return NextResponse.json({ division: data }, { status: 201 });
  } catch (e: any) {
    // This catches JSON parse errors too
    return NextResponse.json(
      { error: e?.message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}
