import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// IMPORTANT: this table name matches what you showed in Supabase:
const TABLE_RATES = "division_labor_rates";
const TABLE_DIVISIONS = "divisions";
const TABLE_ROLES = "job_roles";

function supabaseAdmin() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export async function GET() {
  try {
    const supabase = supabaseAdmin();

    const [{ data: rates, error: ratesError }, { data: divisions, error: divErr }, { data: roles, error: roleErr }] =
      await Promise.all([
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

export async function POST(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const body = await req.json();

    const division_id = Number(body?.division_id);
    const job_role_id = Number(body?.job_role_id);
    const hourly_rate = Number(body?.hourly_rate);

    if (!Number.isFinite(division_id) || !Number.isFinite(job_role_id) || !Number.isFinite(hourly_rate)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from(TABLE_RATES)
      .insert([{ division_id, job_role_id, hourly_rate }])
      .select("id, division_id, job_role_id, hourly_rate")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ rate: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// Per-row Save uses PATCH (NOT PUT) to avoid 405
export async function PATCH(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const body = await req.json();

    const id = Number(body?.id);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const patch: Record<string, any> = {};

    // allow updating any of these, but only if provided
    if (body?.hourly_rate !== undefined) {
      const hourly_rate = Number(body.hourly_rate);
      if (!Number.isFinite(hourly_rate)) return NextResponse.json({ error: "Invalid hourly_rate" }, { status: 400 });
      patch.hourly_rate = hourly_rate;
    }

    if (body?.division_id !== undefined) {
      const division_id = Number(body.division_id);
      if (!Number.isFinite(division_id)) return NextResponse.json({ error: "Invalid division_id" }, { status: 400 });
      patch.division_id = division_id;
    }

    if (body?.job_role_id !== undefined) {
      const job_role_id = Number(body.job_role_id);
      if (!Number.isFinite(job_role_id)) return NextResponse.json({ error: "Invalid job_role_id" }, { status: 400 });
      patch.job_role_id = job_role_id;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from(TABLE_RATES)
      .update(patch)
      .eq("id", id)
      .select("id, division_id, job_role_id, hourly_rate")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ rate: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = supabaseAdmin();

    // support either ?id=123 OR JSON body { id: 123 }
    const url = new URL(req.url);
    const qsId = url.searchParams.get("id");
    let id: number | null = qsId ? Number(qsId) : null;

    if (!Number.isFinite(id as number)) {
      try {
        const body = await req.json();
        id = Number(body?.id);
      } catch {
        id = null;
      }
    }

    if (!Number.isFinite(id as number)) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const { error } = await supabase.from(TABLE_RATES).delete().eq("id", id as number);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}