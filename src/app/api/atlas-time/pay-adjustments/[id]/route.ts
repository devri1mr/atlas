import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH — update status, paycheck_date, description, amount, notes
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb   = supabaseAdmin();
    const body = await req.json().catch(() => ({}));

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if ("status"         in body) patch.status         = body.status;
    if ("paycheck_date"  in body) patch.paycheck_date  = body.paycheck_date;
    if ("description"    in body) patch.description    = body.description;
    if ("amount"         in body) patch.amount         = Number(body.amount);
    if ("notes"          in body) patch.notes          = body.notes || null;

    const { data, error } = await sb
      .from("at_pay_adjustments")
      .update(patch)
      .eq("id", id)
      .select("id, type, category, description, amount, paycheck_date, status, notes, employee_id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ adjustment: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// DELETE — cancel an adjustment (soft delete via status=cancelled)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();

    const { error } = await sb
      .from("at_pay_adjustments")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
