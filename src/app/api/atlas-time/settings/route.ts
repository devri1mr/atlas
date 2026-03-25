import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(v: unknown, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  if (v === true || v === "true") return true;
  if (v === false || v === "false") return false;
  return fallback;
}

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).single();
  return data?.id ?? null;
}

export async function GET() {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { data, error } = await sb
      .from("at_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ settings: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));

    const patch: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    const fields: Array<[string, "num" | "bool" | "str", number | boolean | string]> = [
      ["pay_cycle", "str", "weekly"],
      ["pay_period_start_day", "num", 1],
      ["ot_daily_threshold", "num", 8],
      ["ot_weekly_threshold", "num", 40],
      ["ot_multiplier", "num", 1.5],
      ["dt_daily_threshold", "num", 0],
      ["dt_multiplier", "num", 2.0],
      ["lunch_auto_deduct", "bool", false],
      ["lunch_deduct_after_hours", "num", 6],
      ["lunch_deduct_minutes", "num", 30],
      ["punch_rounding_minutes", "num", 0],
      ["geofence_enabled", "bool", false],
      ["geofence_radius_meters", "num", 300],
      ["kiosk_pin_length", "num", 4],
      ["esta_enabled", "bool", false],
      ["esta_accrual_hours_per", "num", 30],
      ["esta_wait_days", "num", 90],
      ["esta_annual_cap_hours", "num", 72],
    ];

    for (const [key, type, fallback] of fields) {
      if (key in body) {
        if (type === "num") patch[key] = body[key] === null ? null : num(body[key], fallback as number);
        else if (type === "bool") patch[key] = bool(body[key], fallback as boolean);
        else patch[key] = body[key];
      }
    }

    // Upsert — creates the row if it doesn't exist yet
    const { data, error } = await sb
      .from("at_settings")
      .upsert({ company_id: companyId, ...patch }, { onConflict: "company_id" })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ settings: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
