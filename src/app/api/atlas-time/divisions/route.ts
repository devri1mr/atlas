import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getCompanyId(sb: ReturnType<typeof supabaseAdmin>) {
  const { data } = await sb.from("companies").select("id").limit(1).single();
  return data?.id ?? null;
}

// GET — returns company divisions (read-only, from `divisions`) merged with
//        time-clock-only extras (from `at_divisions`)
export async function GET() {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const [companyRes, extrasRes] = await Promise.all([
      sb.from("divisions").select("id, name, active, department_id, qb_class_name").order("name", { ascending: true }),
      sb.from("at_divisions")
        .select("id, name, active, time_clock_only, department_id, qb_class_name")
        .eq("company_id", companyId)
        .eq("time_clock_only", true)
        .order("name", { ascending: true }),
    ]);

    const company = (companyRes.data ?? []).map(d => ({ ...d, source: "company" as const, time_clock_only: false }));
    const extras = (extrasRes.data ?? []).map(d => ({ ...d, source: "time_clock" as const }));

    return NextResponse.json({ divisions: [...company, ...extras] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// POST — only creates time-clock-only extras in at_divisions
export async function POST(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const companyId = await getCompanyId(sb);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const department_id = body.department_id ? String(body.department_id) : null;
    const qb_class_name = body.qb_class_name ? String(body.qb_class_name).trim() : null;

    const { data, error } = await sb
      .from("at_divisions")
      .insert({ company_id: companyId, name, active: true, time_clock_only: true, department_id, qb_class_name })
      .select("id, name, active, time_clock_only, department_id, qb_class_name")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ division: { ...data, source: "time_clock" } }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
