import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — check if a punch already exists for an employee (±5 min window around clock_in_at)
export async function POST(req: NextRequest) {
  try {
    const sb   = supabaseAdmin();
    const body = await req.json().catch(() => ({}));

    const employee_id = String(body.employee_id ?? "").trim();
    const date        = String(body.date        ?? "").trim();
    const clock_in_at = String(body.clock_in_at ?? "").trim();

    if (!employee_id || !date || !clock_in_at)
      return NextResponse.json({ error: "employee_id, date, clock_in_at required" }, { status: 400 });

    const clockInMs   = new Date(clock_in_at).getTime();
    const windowMs    = 5 * 60 * 1000;
    const windowStart = new Date(clockInMs - windowMs).toISOString();
    const windowEnd   = new Date(clockInMs + windowMs).toISOString();

    const { data } = await sb
      .from("at_punches")
      .select("id")
      .eq("employee_id", employee_id)
      .eq("date_for_payroll", date)
      .gte("clock_in_at", windowStart)
      .lte("clock_in_at", windowEnd)
      .limit(1);

    return NextResponse.json({ is_duplicate: (data ?? []).length > 0 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
