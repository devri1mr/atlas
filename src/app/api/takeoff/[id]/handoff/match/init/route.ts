import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// Creates a bare match record for a single takeoff item (no AI).
// Used when user manually selects a material/task for an item that has no match record yet.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: takeoffId } = await params;
    const sb = supabaseAdmin();
    const body = await req.json().catch(() => null);
    if (!body?.takeoff_item_id) {
      return NextResponse.json({ error: "takeoff_item_id required" }, { status: 400 });
    }

    const { data: takeoff } = await sb
      .from("takeoffs")
      .select("id, company_id")
      .eq("id", takeoffId)
      .single();
    if (!takeoff) return NextResponse.json({ error: "Takeoff not found" }, { status: 404 });

    // Get or create handoff session
    let sessionId: string;
    const { data: existing } = await sb
      .from("handoff_sessions")
      .select("id")
      .eq("takeoff_id", takeoffId)
      .eq("status", "in_review")
      .maybeSingle();

    if (existing?.id) {
      sessionId = existing.id;
    } else {
      const { data: newSession, error: se } = await sb
        .from("handoff_sessions")
        .insert({ company_id: takeoff.company_id, takeoff_id: takeoffId, pct_matched: 0 })
        .select("id")
        .single();
      if (se || !newSession) return NextResponse.json({ error: se?.message ?? "Could not create session" }, { status: 500 });
      sessionId = newSession.id;
    }

    const now = new Date().toISOString();
    const { data: record, error: ue } = await sb
      .from("takeoff_item_matches")
      .upsert({
        company_id: takeoff.company_id,
        takeoff_id: takeoffId,
        takeoff_item_id: body.takeoff_item_id,
        handoff_session_id: sessionId,
        catalog_material_id: body.catalog_material_id ?? null,
        material_match_conf: body.catalog_material_id ? "high" : "none",
        material_match_note: body.catalog_material_id ? "Manually selected" : null,
        task_catalog_id: body.task_catalog_id ?? null,
        labor_match_conf: body.task_catalog_id ? "high" : "none",
        labor_match_note: body.task_catalog_id ? "Auto-populated from material" : null,
        reviewed: true,
        override_by_user: true,
        excluded: false,
        updated_at: now,
      }, { onConflict: "takeoff_item_id" })
      .select("*")
      .single();

    if (ue) return NextResponse.json({ error: ue.message }, { status: 500 });
    return NextResponse.json({ data: record });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
