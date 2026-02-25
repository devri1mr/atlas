import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getEnv(name: string) {
  const v = process.env[name];
  return v && v.trim().length ? v : null;
}

export async function GET() {
  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY"); // optional

  // Prefer service key if present, otherwise fall back to anon key
  const keyToUse = serviceKey ?? anonKey;

  if (!url || !keyToUse) {
    return NextResponse.json(
      {
        error: "Missing env",
        hasUrl: !!url,
        hasAnonKey: !!anonKey,
        hasServiceRoleKey: !!serviceKey,
      },
      { status: 500 }
    );
  }

  const supabase = createClient(url, keyToUse, {
    auth: { persistSession: false },
  });

  // Pull base data
  const [{ data: divisions, error: divErr }, { data: roles, error: roleErr }, { data: rates, error: rateErr }] =
    await Promise.all([
      supabase.from("divisions").select("id,name").order("name"),
      supabase.from("job_roles").select("id,name").order("name"),
      supabase
        .from("division_labor_rates")
        .select("id,division_id,job_role_id,hourly_rate")
        .order("division_id"),
    ]);

  if (divErr || roleErr || rateErr) {
    return NextResponse.json(
      {
        error: "Supabase query failed",
        details: {
          divisions: divErr?.message ?? null,
          roles: roleErr?.message ?? null,
          rates: rateErr?.message ?? null,
        },
      },
      { status: 500 }
    );
  }

  // Join into the exact shape the UI expects
  const divisionById = new Map((divisions ?? []).map((d: any) => [d.id, d.name]));
  const roleById = new Map((roles ?? []).map((r: any) => [r.id, r.name]));

  const rows =
    (rates ?? []).map((r: any) => ({
      id: r.id,
      division: divisionById.get(r.division_id) ?? String(r.division_id),
      role: roleById.get(r.job_role_id) ?? String(r.job_role_id),
      hourly_rate: r.hourly_rate,
      division_id: r.division_id,
      job_role_id: r.job_role_id,
    })) ?? [];

  return NextResponse.json({ rows });
}