import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// GET /api/atlas-time/employees/[id]/divisions
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();

    const { data, error } = await sb
      .from("at_employee_divisions")
      .select("id, division_id, is_primary, at_divisions(id, name)")
      .eq("employee_id", id)
      .order("is_primary", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ divisions: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// POST /api/atlas-time/employees/[id]/divisions — add a division
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();
    const body = await req.json().catch(() => ({}));
    const { division_id, is_primary } = body;

    if (!division_id) return NextResponse.json({ error: "division_id required" }, { status: 400 });

    // Check not already linked
    const { data: existing } = await sb
      .from("at_employee_divisions")
      .select("id")
      .eq("employee_id", id)
      .eq("division_id", division_id)
      .maybeSingle();

    if (existing) return NextResponse.json({ error: "Division already assigned" }, { status: 409 });

    // If setting as primary, clear existing primary
    if (is_primary) {
      await sb.from("at_employee_divisions").update({ is_primary: false }).eq("employee_id", id);
    }

    const { data, error } = await sb
      .from("at_employee_divisions")
      .insert({ employee_id: id, division_id, is_primary: is_primary ?? false })
      .select("id, division_id, is_primary, at_divisions(id, name)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// DELETE /api/atlas-time/employees/[id]/divisions?link_id=xxx — remove a division link
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();
    const { searchParams } = new URL(req.url);
    const linkId = searchParams.get("link_id");

    if (!linkId) return NextResponse.json({ error: "link_id required" }, { status: 400 });

    const { error } = await sb
      .from("at_employee_divisions")
      .delete()
      .eq("id", linkId)
      .eq("employee_id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// PATCH /api/atlas-time/employees/[id]/divisions — set primary
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = supabaseAdmin();
    const body = await req.json().catch(() => ({}));
    const { link_id } = body;

    if (!link_id) return NextResponse.json({ error: "link_id required" }, { status: 400 });

    // Clear existing primary
    await sb.from("at_employee_divisions").update({ is_primary: false }).eq("employee_id", id);
    // Set new primary
    const { error } = await sb
      .from("at_employee_divisions")
      .update({ is_primary: true })
      .eq("id", link_id)
      .eq("employee_id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
