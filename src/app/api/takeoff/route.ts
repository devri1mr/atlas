import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).maybeSingle();
  if (data?.id) return data.id as string;
  const { data: b } = await sb.from("bids").select("company_id").not("company_id", "is", null).limit(1).maybeSingle();
  return (b?.company_id as string | null) ?? null;
}

export async function GET() {
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("takeoffs")
      .select("*, takeoff_items(id)")
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 500 });

    const body = await req.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const { data, error } = await sb
      .from("takeoffs")
      .insert({
        company_id: companyId,
        name,
        client_name: body.client_name ?? null,
        address: body.address ?? null,
        notes: body.notes ?? null,
        division_id: body.division_id ?? null,
        salesperson_name: body.salesperson_name ?? null,
        status: "active",
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
