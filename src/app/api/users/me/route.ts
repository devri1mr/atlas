import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = supabaseAdmin();
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await sb
    .from("user_profiles")
    .select("id, email, full_name, role, role_id, permissions, allowed_division_ids, roles(id, name, is_admin, permissions)")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({
      data: {
        id: user.id,
        email: user.email,
        full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
        role_id: null,
        role_name: null,
        role_is_admin: false,
        role_permissions: {},
        permissions: {},
      },
    });
  }

  const roleRow = profile.roles as any;
  return NextResponse.json({
    data: {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role, // legacy, keep for now
      role_id: profile.role_id,
      role_name: roleRow?.name ?? null,
      role_is_admin: roleRow?.is_admin ?? false,
      role_permissions: roleRow?.permissions ?? {},
      permissions: profile.permissions ?? {},
      allowed_division_ids: (profile as any).allowed_division_ids ?? null,
    },
  });
}
