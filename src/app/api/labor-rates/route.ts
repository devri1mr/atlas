// src/app/api/labor-rates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// IMPORTANT: this table name matches what you showed in Supabase:
const TABLE_RATES = "division_labor_rates";
const TABLE_DIVISIONS = "divisions";
const TABLE_ROLES = "job_roles";

function supabaseAdmin() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"
    );
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function num(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * ONE RATE PER DIVISION:
 * We treat job_role_id as optional and default it to null.
 * We will store ONE row per division where job_role_id is null.
 *
 * Later we can remove roles from UI and (optionally) drop the column in DB.
 */

/* =========================
   GET
   - If division_id query param is provided: return the SINGLE division rate
   - Otherwise: return full admin payload (rates + divisions + roles)
========================= */
export async function GET(req: NextRequest) {
  try {
    const supabase = supabaseAdmin();

    const url = new URL(req.url);
    const divisionId = num(url.searchParams.get("division_id"));

    // ✅ single-rate mode (what Scope should use)
    if (divisionId != null) {
      const { data, error } = await supabase
        .from(TABLE_RATES)
        .select("id, division_id, job_role_id, hourly_rate")
        .eq("division_id", divisionId)
        .is("job_role_id", null)
        .maybeSingle();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // If nothing set yet, return 0 (Scope can show warning)
      const hourly_rate = Number(data?.hourly_rate ?? 0);

      return NextResponse.json({
        division_id: divisionId,
        hourly_rate,
        row: data ?? null,
      });
    }

    // ✅ admin grid mode (keeps existing page working)
    const [
      { data: rates, error: ratesError },
      { data: divisions, error: divErr },
      { data: roles, error: roleErr },
    ] = await Promise.all([
      supabase
        .from(TABLE_RATES)
        .select("id, division_id, job_role_id, hourly_rate")
        .order("id", { ascending: true }),
      supabase.from(TABLE_DIVISIONS).select("id, name").order("name", { ascending: true }),
      supabase.from(TABLE_ROLES).select("id, name").order("name", { ascending: true }),
    ]);

    if (ratesError) return NextResponse.json({ error: ratesError.message }, { status: 500 });
    if (divErr) return NextResponse.json({ error: divErr.message }, { status: 500 });
    if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: 500 });

    return NextResponse.json({
      rates: rates ?? [],
      divisions: divisions ?? [],
      roles: roles ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

/* =========================
   CREATE / UPSERT DIVISION RATE
   POST will create OR update the single row for that division (job_role_id null)
========================= */
export async function POST(req: NextRequest) {
  try {
    const supabase = supabaseAdmin();
    const body = await req.json();

    const division_id = num(body?.division_id);
    const hourly_rate = num(body?.hourly_rate);

    // job_role_id is optional — ignored for “one rate per division”
    if (division_id == null || hourly_rate == null) {
      return NextResponse.json(
        { error: "Missing required fields: division_id, hourly_rate" },
        { status: 400 }
      );
    }

    // Check if row already exists for this division (job_role_id null)
    const { data: existing, error: findErr } = await supabase
      .from(TABLE_RATES)
      .select("id")
      .eq("division_id", division_id)
      .is("job_role_id", null)
      .maybeSingle();

    if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });

    // Update if exists
    if (existing?.id) {
      const { data, error } = await supabase
        .from(TABLE_RATES)
        .update({ hourly_rate })
        .eq("id", existing.id)
        .select("id, division_id, job_role_id, hourly_rate")
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ rate: data }, { status: 200 });
    }

    // Insert if not
    const { data, error } = await supabase
      .from(TABLE_RATES)
      .insert([{ division_id, job_role_id: null, hourly_rate }])
      .select("id, division_id, job_role_id, hourly_rate")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ rate: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

/* =========================
   PATCH
   - Supports:
     { id, hourly_rate }  (existing behavior)
     OR { division_id, hourly_rate } (preferred for “one rate per division”)
========================= */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = supabaseAdmin();
    const body = await req.json();

    const id = num(body?.id);
    const division_id = num(body?.division_id);
    const hourly_rate = body?.hourly_rate !== undefined ? num(body.hourly_rate) : null;

    if (hourly_rate == null) {
      return NextResponse.json({ error: "Invalid or missing hourly_rate" }, { status: 400 });
    }

    // ✅ preferred: patch by division_id (job_role_id null)
    if (division_id != null) {
      const { data: existing, error: findErr } = await supabase
        .from(TABLE_RATES)
        .select("id")
        .eq("division_id", division_id)
        .is("job_role_id", null)
        .maybeSingle();

      if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });

      if (existing?.id) {
        const { data, error } = await supabase
          .from(TABLE_RATES)
          .update({ hourly_rate })
          .eq("id", existing.id)
          .select("id, division_id, job_role_id, hourly_rate")
          .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ rate: data }, { status: 200 });
      }

      // create if missing
      const { data, error } = await supabase
        .from(TABLE_RATES)
        .insert([{ division_id, job_role_id: null, hourly_rate }])
        .select("id, division_id, job_role_id, hourly_rate")
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ rate: data }, { status: 201 });
    }

    // ✅ fallback: patch by id (keeps older grid behaviors working)
    if (id == null) {
      return NextResponse.json({ error: "Missing id or division_id" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from(TABLE_RATES)
      .update({ hourly_rate })
      .eq("id", id)
      .select("id, division_id, job_role_id, hourly_rate")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ rate: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

/* =========================
   DELETE
========================= */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = supabaseAdmin();

    const url = new URL(req.url);
    const qsId = url.searchParams.get("id");
    let id = qsId ? num(qsId) : null;

    if (id == null) {
      try {
        const body = await req.json();
        id = num(body?.id);
      } catch {
        id = null;
      }
    }

    if (id == null) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const { error } = await supabase.from(TABLE_RATES).delete().eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
