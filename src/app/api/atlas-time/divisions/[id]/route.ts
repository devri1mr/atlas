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

    if (!patch.name && "name" in body) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }

    const { data, error } = await sb
      .from("at_divisions")
      .update(patch)
      .eq("id", id)
      .select("id, name, active, time_clock_only")
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
