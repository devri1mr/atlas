import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();
    const body = await req.json().catch(() => ({}));

    const patch: Record<string, any> = {};
    if ("name" in body) patch.name = String(body.name).trim();
    if ("code" in body) patch.code = body.code ? String(body.code).trim().toUpperCase() : null;
    if ("sort_order" in body) patch.sort_order = Number(body.sort_order);
    if ("active" in body) patch.active = Boolean(body.active);

    const { data, error } = await sb
      .from("at_departments")
      .update(patch)
      .eq("id", id)
      .select("id, name, code, sort_order, active")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ department: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();
    const { error } = await sb.from("at_departments").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
