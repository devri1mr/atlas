import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

// GET — get report with widgets ordered by position
export async function GET(_req: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { data, error } = await sb
      .from("division_reports")
      .select(`
        id, name, description, division, created_at, updated_at,
        division_report_widgets (
          id, widget_type, config, position
        )
      `)
      .eq("id", id)
      .eq("company_id", company.id)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const widgets = [...((data as any).division_report_widgets ?? [])].sort(
      (a: any, b: any) => a.position - b.position
    );

    return NextResponse.json({ data: { ...data, widgets } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// PUT { name, description, widgets: [{id?, widget_type, config, position}] }
export async function PUT(req: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body = await req.json();
    const { name, description, widgets } = body;

    // Update the report header
    const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updatePayload.name = name;
    if (description !== undefined) updatePayload.description = description;

    const { error: updateErr } = await sb
      .from("division_reports")
      .update(updatePayload)
      .eq("id", id)
      .eq("company_id", company.id);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    // If widgets array provided: delete existing, re-insert in order
    if (Array.isArray(widgets)) {
      const { error: delErr } = await sb
        .from("division_report_widgets")
        .delete()
        .eq("report_id", id);
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

      if (widgets.length > 0) {
        const toInsert = widgets.map((w: any, i: number) => ({
          report_id: id,
          widget_type: w.widget_type,
          config: w.config ?? {},
          position: w.position ?? i,
        }));
        const { error: insErr } = await sb.from("division_report_widgets").insert(toInsert);
        if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// DELETE — delete report (cascades to widgets)
export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { error } = await sb
      .from("division_reports")
      .delete()
      .eq("id", id)
      .eq("company_id", company.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
