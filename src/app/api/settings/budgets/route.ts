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
      .select("month, revenue, labor, job_materials, fuel, equipment, subcontractors")
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

// PUT { division, year, month, field, value } — updates only the one field
export async function PUT(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { division, year, month, field, value } = await req.json();
    if (!division || !year || !month || !field) return NextResponse.json({ error: "division, year, month, field required" }, { status: 400 });

    const ALLOWED = ["revenue", "labor", "job_materials", "fuel", "equipment", "subcontractors"];
    if (!ALLOWED.includes(field)) return NextResponse.json({ error: "Invalid field" }, { status: 400 });

    const now = new Date().toISOString();

    // Try to update existing row
    const { data: updated } = await sb
      .from("division_budgets")
      .update({ [field]: Number(value), updated_at: now })
      .match({ company_id: company.id, division, year: Number(year), month: Number(month) })
      .select("id");

    // If no row existed yet, insert a fresh one
    if (!updated || updated.length === 0) {
      const { error } = await sb.from("division_budgets").insert({
        company_id: company.id, division,
        year: Number(year), month: Number(month),
        [field]: Number(value), updated_at: now,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
