import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// PATCH — clock out or update a punch
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();
    const body = await req.json().catch(() => ({}));

    const now = new Date();
    const patch: Record<string, any> = { updated_at: now.toISOString() };

    if (body.clock_out === true) {
      // Clock out
      const { data: punch } = await sb
        .from("at_punches")
        .select("clock_in_at")
        .eq("id", id)
        .single();

      patch.clock_out_at = now.toISOString();
      patch.status = "pending";

      if (punch?.clock_in_at) {
        const inMs = new Date(punch.clock_in_at).getTime();
        const diffHrs = (now.getTime() - inMs) / 3_600_000;
        patch.regular_hours = Math.round(diffHrs * 100) / 100;
      }

      if (body.lat) patch.clock_out_lat = body.lat;
      if (body.lng) patch.clock_out_lng = body.lng;
      if (body.note) patch.employee_note = body.note;
    } else {
      // Generic patch (manager note, status, etc.)
      if ("status" in body) patch.status = body.status;
      if ("manager_note" in body) patch.manager_note = body.manager_note;
    }

    const { data, error } = await sb
      .from("at_punches")
      .update(patch)
      .eq("id", id)
      .select("id, employee_id, clock_in_at, clock_out_at, regular_hours, status")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ punch: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
