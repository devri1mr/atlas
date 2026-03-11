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

export async function GET() {
  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("operations_settings")
      .select("*")
      .eq("is_active", true)
      .limit(1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const row = Array.isArray(data) ? data[0] ?? null : null;

    if (!row) {
      return NextResponse.json(
        { error: "No active pricing settings found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ row });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to load pricing settings." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const body = await req.json().catch(() => ({}));

    const patch: Record<string, any> = {};

    if (body?.default_margin_percent !== undefined) {
      patch.default_margin_percent = num(body.default_margin_percent, 50);
    }

    if (body?.prepay_discount_percent !== undefined) {
      const prepay = num(body.prepay_discount_percent, 3);
      patch.prepay_discount_percent = prepay;
      patch.prepay_discount_pct = prepay;
    }

    if (body?.round_increment !== undefined) {
      patch.round_increment = num(body.round_increment, 100);
    }

    if (body?.company_contingency_percent !== undefined) {
      patch.company_contingency_percent = num(
        body.company_contingency_percent,
        5
      );
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "No fields to update." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("operations_settings")
      .update(patch)
      .eq("is_active", true)
      .select("*")
      .limit(1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const row = Array.isArray(data) ? data[0] ?? null : null;

    if (!row) {
      return NextResponse.json(
        { error: "No active pricing settings row was updated." },
        { status: 404 }
      );
    }

    return NextResponse.json({ row });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to save pricing settings." },
      { status: 500 }
    );
  }
}
