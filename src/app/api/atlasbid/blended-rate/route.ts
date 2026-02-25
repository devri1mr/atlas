import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

// GET /api/atlasbid/blended-rate?division_id=123
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const divisionIdRaw = searchParams.get("division_id");

    if (!divisionIdRaw) {
      return NextResponse.json({ error: "Missing division_id" }, { status: 400 });
    }

    const division_id = Number(divisionIdRaw);
    if (!Number.isFinite(division_id)) {
      return NextResponse.json({ error: "division_id must be a number" }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    // Pull all rates for that division + include flag from job_roles
    const { data, error } = await supabase
      .from("division_labor_rates")
      .select("hourly_rate, job_roles:job_role_id(include_in_blended)")
      .eq("division_id", division_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const includedRates =
      (data ?? [])
        .filter((r: any) => r?.job_roles?.include_in_blended === true)
        .map((r: any) => Number(r.hourly_rate))
        .filter((n: number) => Number.isFinite(n) && n > 0);

    const blended_rate =
      includedRates.length === 0
        ? 0
        : includedRates.reduce((sum: number, n: number) => sum + n, 0) / includedRates.length;

    // Return rounded to 2 decimals
    return NextResponse.json({ blended_rate: Math.round(blended_rate * 100) / 100 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}