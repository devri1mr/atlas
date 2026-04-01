import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();
    const body = await req.json().catch(() => ({}));

    const patch: Record<string, any> = {};
    if ("name" in body) patch.name = String(body.name ?? "").trim();
    if ("active" in body) patch.active = Boolean(body.active);
    if ("time_clock_only" in body) patch.time_clock_only = Boolean(body.time_clock_only);
    if ("department_id" in body) patch.department_id = body.department_id ? String(body.department_id) : null;
    if ("qb_class_name" in body) patch.qb_class_name = body.qb_class_name ? String(body.qb_class_name).trim() : null;
    if ("division_id"   in body) patch.division_id   = body.division_id   ? String(body.division_id)   : null;
    if ("csv_name"           in body) patch.csv_name           = body.csv_name           ? String(body.csv_name).trim()           : null;
    if ("qb_payroll_item_reg" in body) patch.qb_payroll_item_reg = body.qb_payroll_item_reg ? String(body.qb_payroll_item_reg).trim() : null;
    if ("qb_payroll_item_ot"  in body) patch.qb_payroll_item_ot  = body.qb_payroll_item_ot  ? String(body.qb_payroll_item_ot).trim()  : null;

    if (!patch.name && "name" in body) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }

    const { data, error } = await sb
      .from("at_divisions")
      .update(patch)
      .eq("id", id)
      .select("id, name, active, time_clock_only, department_id, qb_class_name, division_id, csv_name, qb_payroll_item_reg, qb_payroll_item_ot")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ division: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();

    const { error } = await sb.from("at_divisions").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
