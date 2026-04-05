import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH — update a receipt entry (vendor, reference, notes, cost, date)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb   = supabaseAdmin();
    const body = await req.json().catch(() => ({}));

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if ("vendor_name"      in body) patch.vendor_name      = body.vendor_name      || null;
    if ("reference_number" in body) patch.reference_number = body.reference_number || null;
    if ("notes"            in body) patch.notes            = body.notes            || null;
    if ("transaction_date" in body) patch.transaction_date = body.transaction_date;
    if ("unit_cost"        in body) patch.unit_cost        = body.unit_cost != null ? Number(body.unit_cost) : null;
    if ("total_cost"       in body) patch.total_cost       = body.total_cost != null ? Number(body.total_cost) : null;
    if ("quantity"         in body) patch.quantity         = Number(body.quantity);

    const { data, error } = await sb
      .from("at_uniform_inventory")
      .update(patch)
      .eq("id", id)
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entry: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// DELETE — void an inventory entry (soft delete) + cancel any linked pay adjustments
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();

    const [voidRes] = await Promise.all([
      sb.from("at_uniform_inventory")
        .update({ is_void: true, updated_at: new Date().toISOString() })
        .eq("id", id),
      sb.from("at_pay_adjustments")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("source_inventory_id", id)
        .neq("status", "applied"), // never cancel already-applied adjustments
    ]);

    if (voidRes.error) return NextResponse.json({ error: voidRes.error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
