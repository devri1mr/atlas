import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("user_profiles")
    .update(body)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const sb = supabaseAdmin();

  // Deactivate rather than delete (preserves audit trail)
  const { error } = await sb
    .from("user_profiles")
    .update({ is_active: false })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
