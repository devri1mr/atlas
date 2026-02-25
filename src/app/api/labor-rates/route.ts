// src/app/api/labor-rates/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing env vars: NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET() {
  try {
    const supabase = getSupabase();

    // Divisions
    const { data: divisions, error: divErr } = await supabase
      .from("divisions")
      .select("id,name,is_active")
      .order("name", { ascending: true });

    if (divErr) {
      return NextResponse.json(
        { error: `Divisions query failed: ${divErr.message}` },
        { status: 500 }
      );
    }

    // Roles (job_roles)
    const { data: roles, error: roleErr } = await supabase
      .from("job_roles")
      .select("id,name,is_active")
      .order("name", { ascending: true });

    if (roleErr) {
      return NextResponse.json(
        { error: `Roles query failed: ${roleErr.message}` },
        { status: 500 }
      );
    }

    // Rates (division_labor_rates)
    const { data: rates, error: rateErr } = await supabase
      .from("division_labor_rates")
      .select("id,created_at,division_id,job_role_id,hourly_rate")
      .order("division_id", { ascending: true })
      .order("job_role_id", { ascending: true });

    if (rateErr) {
      return NextResponse.json(
        { error: `Rates query failed: ${rateErr.message}` },
        { status: 500 }
      );
    }

    // IMPORTANT: client expects `rows`, not `rates`
    return NextResponse.json(
      {
        rows: rates ?? [],
        divisions: divisions ?? [],
        roles: roles ?? [],
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}