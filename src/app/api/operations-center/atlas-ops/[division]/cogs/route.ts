import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── GET ?year=2026 ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: { params: Promise<{ division: string }> }) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { division } = await params;
    // Normalize slug to match stored key format: "holiday-lights" → "holiday lights"
    const divisionKey = division.replace(/-/g, " ");
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));

    const [{ data: budgets }, { data: actuals }] = await Promise.all([
      sb.from("division_budgets")
        .select("month, revenue, labor, job_materials, fuel, equipment, subcontractors")
        .eq("company_id", company.id)
        .eq("division", divisionKey)
        .eq("year", year),
      sb.from("division_cogs_actuals")
        .select("month, revenue_override, labor_override, job_materials, fuel_override, equipment, subcontractors")
        .eq("company_id", company.id)
        .eq("division", divisionKey)
        .eq("year", year),
    ]);

    const budgetMap = new Map((budgets ?? []).map((b: any) => [b.month, b]));
    const actualMap = new Map((actuals ?? []).map((a: any) => [a.month, a]));

    const result = Array.from({ length: 12 }, (_, i) => {
      const month  = i + 1;
      const budget = budgetMap.get(month) ?? { revenue: 0, labor: 0, job_materials: 0, fuel: 0, equipment: 0 };
      const ov     = actualMap.get(month) ?? {};

      const revenue        = ov.revenue_override != null ? Number(ov.revenue_override) : 0;
      const labor          = ov.labor_override   != null ? Number(ov.labor_override)   : 0;
      const job_materials  = ov.job_materials    != null ? Number(ov.job_materials)    : 0;
      const fuel           = ov.fuel_override    != null ? Number(ov.fuel_override)    : 0;
      const equipment      = ov.equipment        != null ? Number(ov.equipment)        : 0;
      const subcontractors = ov.subcontractors   != null ? Number(ov.subcontractors)   : 0;

      const gross_profit = revenue - labor - job_materials - fuel - equipment - subcontractors;
      const margin_pct   = revenue > 0 ? gross_profit / revenue : null;

      return {
        month,
        revenue, labor, job_materials, fuel, equipment, subcontractors,
        gross_profit, margin_pct,
        revenue_auto: 0, labor_auto: 0, fuel_auto: 0,
        revenue_overridden:  ov.revenue_override != null,
        labor_overridden:    ov.labor_override   != null,
        fuel_overridden:     ov.fuel_override    != null,
        budget_revenue:           Number(budget.revenue        ?? 0),
        budget_labor:             Number(budget.labor          ?? 0),
        budget_job_materials:     Number(budget.job_materials  ?? 0),
        budget_fuel:              Number(budget.fuel           ?? 0),
        budget_equipment:         Number(budget.equipment      ?? 0),
        budget_subcontractors:    Number(budget.subcontractors ?? 0),
      };
    });

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// ── PUT { year, month, field, value } ─────────────────────────────────────────

export async function PUT(req: NextRequest, { params }: { params: Promise<{ division: string }> }) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { division } = await params;
    const divisionKey = division.replace(/-/g, " ");
    const { year, month, field, value } = await req.json();
    if (!year || !month || !field) return NextResponse.json({ error: "year, month, field required" }, { status: 400 });

    const ALLOWED = ["revenue_override","labor_override","job_materials","fuel_override","equipment","subcontractors"];
    if (!ALLOWED.includes(field)) return NextResponse.json({ error: "Invalid field" }, { status: 400 });

    const { error } = await sb.from("division_cogs_actuals").upsert(
      { company_id: company.id, division: divisionKey, year: Number(year), month: Number(month), [field]: value, updated_at: new Date().toISOString() },
      { onConflict: "company_id,division,year,month" }
    );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
