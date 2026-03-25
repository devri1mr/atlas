import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("roles").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();

  // Check if this is a system admin role — permissions can't be changed
  const { data: existing } = await sb.from("roles").select("is_admin, is_system").eq("id", id).single();

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };

  if (body.name !== undefined) patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description;
  // Don't allow changing permissions on admin role
  if (body.permissions !== undefined && !existing?.is_admin) patch.permissions = body.permissions;

  const { data, error } = await sb.from("roles").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();

  const { data: role } = await sb.from("roles").select("is_system").eq("id", id).single();
  if (role?.is_system) return NextResponse.json({ error: "System roles cannot be deleted" }, { status: 400 });

  // Check if any users are assigned
  const { count } = await sb.from("user_profiles").select("id", { count: "exact", head: true }).eq("role_id", id);
  if ((count ?? 0) > 0) return NextResponse.json({ error: `${count} user(s) are assigned to this role. Reassign them first.` }, { status: 400 });

  const { error } = await sb.from("roles").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
