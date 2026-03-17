import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const supabase = supabaseAdmin();
  const { id } = await ctx.params;

  try {
    const body = await req.json();

    const { data, error } = await supabase
      .from("inventory_transactions")
      .update(body)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to update transaction." },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const supabase = supabaseAdmin();
  const { id } = await ctx.params;

  try {
    const { error } = await supabase
      .from("inventory_transactions")
      .delete()
      .eq("id", id);

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to void transaction." },
      { status: 400 }
    );
  }
}
