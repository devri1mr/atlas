import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("user_profiles")
    .update(body)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Keep auth user_metadata in sync when full_name changes
  if (body.full_name !== undefined) {
    await sb.auth.admin.updateUserById(id, {
      user_metadata: { full_name: body.full_name },
    });
  }

  return NextResponse.json({ data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();

  // Delete from user_profiles first, then auth.users
  await sb.from("user_profiles").delete().eq("id", id);

  const { error } = await sb.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
