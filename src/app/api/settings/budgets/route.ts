import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?division=lawn&year=2026
export async function GET(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const division = searchParams.get("division");
    const year     = parseInt(searchParams.get("year") ?? "0");
    if (!division || !year) return NextResponse.json({ error: "division and year required" }, { status: 400 });

    const { data, error } = await sb
      .from("division_budgets")
      .select("month, revenue, labor, job_materials, fuel, equipment")
      .eq("company_id", company.id)
      .eq("division", division)
      .eq("year", year)
      .order("month");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// PUT { division, year, month, revenue, labor, job_materials, fuel, equipment }
export async function PUT(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body = await req.json();
    const { division, year, month, revenue = 0, labor = 0, job_materials = 0, fuel = 0, equipment = 0 } = body;
    if (!division || !year || !month) return NextResponse.json({ error: "division, year, month required" }, { status: 400 });

    const { error } = await sb.from("division_budgets").upsert(
      {
        company_id:    company.id,
        division,
        year:          Number(year),
        month:         Number(month),
        revenue:       Number(revenue),
        labor:         Number(labor),
        job_materials: Number(job_materials),
        fuel:          Number(fuel),
        equipment:     Number(equipment),
        updated_at:    new Date().toISOString(),
      },
      { onConflict: "company_id,division,year,month" }
    );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
