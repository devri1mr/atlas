import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("takeoff_marks")
      .select("*")
      .eq("takeoff_id", params.id)
      .order("created_at");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = supabaseAdmin();
    const body = await req.json().catch(() => ({}));

    const { data, error } = await sb
      .from("takeoff_marks")
      .insert({
        takeoff_id: params.id,
        item_id: body.item_id ?? null,
        mark_type: body.mark_type ?? "count",
        x_pct: body.x_pct ?? null,
        y_pct: body.y_pct ?? null,
        points: body.points ?? null,
        value: body.value ?? null,
        label: body.label ?? null,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = supabaseAdmin();
    const { searchParams } = new URL(req.url);
    const markId = searchParams.get("id");
    if (!markId) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { error } = await sb
      .from("takeoff_marks")
      .delete()
      .eq("id", markId)
      .eq("takeoff_id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
