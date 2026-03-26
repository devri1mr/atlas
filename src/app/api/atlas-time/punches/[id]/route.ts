import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// PATCH — clock out, edit times, approve, or update metadata
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb     = supabaseAdmin();
    const body   = await req.json().catch(() => ({}));
    const now    = new Date();
    const patch: Record<string, any> = { updated_at: now.toISOString() };

    if (body.clock_out === true) {
      // Standard clock-out
      const { data: punch } = await sb
        .from("at_punches")
        .select("clock_in_at")
        .eq("id", id)
        .single();

      patch.clock_out_at    = now.toISOString();
      patch.status          = "pending";
      if (body.lat)  patch.clock_out_lat = body.lat;
      if (body.lng)  patch.clock_out_lng = body.lng;
      if (body.note) patch.employee_note = body.note;

      if (punch?.clock_in_at) {
        const diffHrs = (now.getTime() - new Date(punch.clock_in_at).getTime()) / 3_600_000;
        patch.regular_hours = Math.round(diffHrs * 100) / 100;
      }
    } else {
      // Direct field edits (manager corrections)
      if ("clock_in_at"   in body) patch.clock_in_at   = body.clock_in_at  || null;
      if ("clock_out_at"  in body) patch.clock_out_at  = body.clock_out_at || null;
      if ("division_id"    in body) patch.division_id    = body.division_id    || null;
      if ("at_division_id" in body) patch.at_division_id = body.at_division_id || null;
      if ("employee_note" in body) patch.employee_note = body.employee_note ?? null;
      if ("manager_note"  in body) patch.manager_note  = body.manager_note ?? null;
      if ("status"        in body) patch.status        = body.status;
      if ("date_for_payroll" in body) patch.date_for_payroll = body.date_for_payroll;

      // Recalculate regular_hours if both times are provided
      if (patch.clock_in_at && patch.clock_out_at) {
        const diffHrs = (new Date(patch.clock_out_at).getTime() - new Date(patch.clock_in_at).getTime()) / 3_600_000;
        patch.regular_hours = Math.round(Math.max(0, diffHrs) * 100) / 100;
        patch.status = patch.status ?? "pending";
      } else if ("clock_in_at" in body || "clock_out_at" in body) {
        // One side changed — need to re-read the other from DB to recalculate
        const { data: existing } = await sb
          .from("at_punches")
          .select("clock_in_at, clock_out_at")
          .eq("id", id)
          .single();
        const inTime  = patch.clock_in_at  ?? existing?.clock_in_at;
        const outTime = patch.clock_out_at ?? existing?.clock_out_at;
        if (inTime && outTime) {
          const diffHrs = (new Date(outTime).getTime() - new Date(inTime).getTime()) / 3_600_000;
          patch.regular_hours = Math.round(Math.max(0, diffHrs) * 100) / 100;
          if (!("status" in body)) patch.status = "pending";
        }
      }

      // Write back OT if provided (from timesheet approval recalculation)
      if ("regular_hours"       in body) patch.regular_hours       = body.regular_hours;
      if ("ot_hours"            in body) patch.ot_hours            = body.ot_hours;
      if ("dt_hours"            in body) patch.dt_hours            = body.dt_hours;
      if ("lunch_deducted_mins" in body) patch.lunch_deducted_mins = body.lunch_deducted_mins;
      if ("approved_by"         in body) patch.approved_by         = body.approved_by;
      if ("approved_at"         in body) patch.approved_at         = body.approved_at;
      if ("locked"              in body) patch.locked              = body.locked;
    }

    const { data, error } = await sb
      .from("at_punches")
      .update(patch)
      .eq("id", id)
      .select("id, employee_id, clock_in_at, clock_out_at, regular_hours, ot_hours, dt_hours, lunch_deducted_mins, status, locked, division_id, at_division_id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ punch: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// DELETE — remove a punch (only if not locked)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb     = supabaseAdmin();

    const { data: punch } = await sb
      .from("at_punches")
      .select("locked")
      .eq("id", id)
      .single();

    if (punch?.locked) return NextResponse.json({ error: "Cannot delete a locked punch" }, { status: 403 });

    const { error } = await sb.from("at_punches").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
