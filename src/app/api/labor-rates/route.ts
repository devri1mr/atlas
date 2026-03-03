// src/app/api/labor-rates/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const TABLE_RATES = "division_rates";
const TABLE_DIVISIONS = "divisions";

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

/**
 * GET:
 * returns { rates: [{division_id, hourly_rate}], divisions: [{id,name}] }
 */
export async function GET() {
  try {
    const supabase = supabaseAdmin();

    const [{ data: rates, error: ratesError }, { data: divisions, error: divErr }] =
      await Promise.all([
        supabase
          .from(TABLE_RATES)
          .select("division_id, hourly_rate, updated_at")
          .order("updated_at", { ascending: false }),
        supabase
          .from(TABLE_DIVISIONS)
          .select("id, name")
          .order("name", { ascending: true }),
      ]);

    if (ratesError) return NextResponse.json({ error: ratesError.message }, { status: 500 });
    if (divErr) return NextResponse.json({ error: divErr.message }, { status: 500 });

    return NextResponse.json({
      rates: rates ?? [],
      divisions: divisions ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

/**
 * POST: upsert a division rate
 * body: { division_id: uuid, hourly_rate: number }
 */
export async function POST(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const body = await req.json();

    const division_id = String(body?.division_id || "").trim();
    const hourly_rate = Number(body?.hourly_rate);

    if (!division_id) {
      return NextResponse.json({ error: "division_id is required" }, { status: 400 });
    }
    if (!Number.isFinite(hourly_rate)) {
      return NextResponse.json({ error: "hourly_rate is required" }, { status: 400 });
    }

    // upsert: 1 row per division
    const { data, error } = await supabase
      .from(TABLE_RATES)
      .upsert([{ division_id, hourly_rate }], { onConflict: "division_id" })
      .select("division_id, hourly_rate, updated_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ rate: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

/**
 * PATCH: same as POST (upsert), kept for your row-save UI style
 * body: { division_id: uuid, hourly_rate: number }
 */
export async function PATCH(req: Request) {
  return POST(req);
}

/**
 * DELETE: delete a division rate row
 * body: { division_id: uuid }
 */
export async function DELETE(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const body = await req.json().catch(() => ({}));

    const division_id = String(body?.division_id || "").trim();
    if (!division_id) {
      return NextResponse.json({ error: "division_id is required" }, { status: 400 });
    }

    const { error } = await supabase.from(TABLE_RATES).delete().eq("division_id", division_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
