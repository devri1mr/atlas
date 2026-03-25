import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).single();
  return data?.id ?? null;
}

export async function GET() {
  const sb = supabaseAdmin();
  const companyId = await getCompanyId(sb);
  if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const { data, error } = await sb
    .from("roles")
    .select("id, name, description, is_admin, is_system, permissions, created_at")
    .eq("company_id", companyId)
    .order("is_admin", { ascending: false })
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Get user count per role
  const { data: counts } = await sb
    .from("user_profiles")
    .select("role_id")
    .eq("role_id", data?.map(r => r.id) as any);

  const countMap: Record<string, number> = {};
  (counts ?? []).forEach((u: any) => {
    if (u.role_id) countMap[u.role_id] = (countMap[u.role_id] ?? 0) + 1;
  });

  return NextResponse.json({ data: data?.map(r => ({ ...r, user_count: countMap[r.id] ?? 0 })) ?? [] });
}

export async function POST(req: NextRequest) {
  const sb = supabaseAdmin();
  const companyId = await getCompanyId(sb);
  if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { name, description, permissions } = body;
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const { data, error } = await sb
    .from("roles")
    .insert({ company_id: companyId, name: name.trim(), description: description ?? null, permissions: permissions ?? {} })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
