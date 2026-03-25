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
    .select("id, email, full_name, role, permissions")
    .eq("id", user.id)
    .single();

  return NextResponse.json({
    data: profile ?? {
      id: user.id,
      email: user.email,
      full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
      role: null,
    },
  });
}
