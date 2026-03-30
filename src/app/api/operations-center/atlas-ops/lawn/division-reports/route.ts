import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?division=lawn — list reports with widget counts
export async function GET(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const division = searchParams.get("division") ?? "lawn";

    const { data, error } = await sb
      .from("division_reports")
      .select(`
        id, name, description, division, created_at, updated_at,
        division_report_widgets (id)
      `)
      .eq("company_id", company.id)
      .eq("division", division)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const reports = (data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      division: r.division,
      created_at: r.created_at,
      updated_at: r.updated_at,
      widget_count: (r.division_report_widgets ?? []).length,
    }));

    return NextResponse.json({ data: reports });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// POST { name, description, division } — create report
export async function POST(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { name, description, division = "lawn" } = await req.json();
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

    const { data, error } = await sb
      .from("division_reports")
      .insert({ company_id: company.id, division, name, description: description ?? null })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
