import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();

    const { error } = await sb.from("at_payroll_items").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();
    const body = await req.json().catch(() => ({}));

    const patch: Record<string, any> = {};
    if (body.name !== undefined) patch.name = String(body.name).trim();
    if (body.type !== undefined) patch.type = String(body.type).trim();
    if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order);
    if (body.active !== undefined) patch.active = Boolean(body.active);

    const { data, error } = await sb
      .from("at_payroll_items")
      .update(patch)
      .eq("id", id)
      .select("id, department_id, name, type, sort_order, active")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ payroll_item: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
