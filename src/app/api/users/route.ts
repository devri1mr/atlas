import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("user_profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { email, full_name, role, invited_by } = body;

  if (!email || !role) {
    return NextResponse.json({ error: "email and role required" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // Create auth user with invite (sends magic link / invite email via Supabase)
  const { data: invited, error: inviteErr } = await sb.auth.admin.inviteUserByEmail(email, {
    data: { full_name, role },
  });

  if (inviteErr) {
    return NextResponse.json({ error: inviteErr.message }, { status: 400 });
  }

  const userId = invited.user.id;

  // Upsert profile (in case trigger didn't fire yet)
  const { data, error } = await sb
    .from("user_profiles")
    .upsert({ id: userId, email, full_name, role, invited_by: invited_by ?? null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
