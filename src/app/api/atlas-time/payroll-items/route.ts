import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).single();
  return data?.id ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const departmentId = searchParams.get("department_id");

    let query = sb
      .from("at_payroll_items")
      .select("id, department_id, name, type, sort_order, active")
      .eq("company_id", companyId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (departmentId) query = query.eq("department_id", departmentId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ payroll_items: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();
    const type = String(body.type ?? "").trim();
    const departmentId = String(body.department_id ?? "").trim();

    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!type) return NextResponse.json({ error: "Type is required" }, { status: 400 });
    if (!departmentId) return NextResponse.json({ error: "department_id is required" }, { status: 400 });

    const { data, error } = await sb
      .from("at_payroll_items")
      .insert({
        company_id: companyId,
        department_id: departmentId,
        name,
        type,
        sort_order: body.sort_order ?? 0,
        active: true,
      })
      .select("id, department_id, name, type, sort_order, active")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ payroll_item: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
