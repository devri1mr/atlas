import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── GET /api/takeoff/[id]/handoff/client-history ─────────────
// Returns prior bids matching this takeoff's client name or address
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: takeoffId } = await params;
    const sb = supabaseAdmin();

    const { data: takeoff, error: te } = await sb
      .from("takeoffs")
      .select("client_name, address")
      .eq("id", takeoffId)
      .single();
    if (te || !takeoff) return NextResponse.json({ error: "Takeoff not found" }, { status: 404 });

    if (!takeoff.client_name && !takeoff.address) {
      return NextResponse.json({ data: [] });
    }

    // Search bids by client name fragment or address
    const clientName = (takeoff.client_name ?? "").trim();
    const address = (takeoff.address ?? "").trim();

    let query = sb
      .from("bids")
      .select(`
        id, client_name, client_last_name, address, created_at,
        sell_rounded, total_cost, labor_cost, material_cost,
        statuses:status_id ( name, color ),
        divisions:division_id ( name )
      `)
      .order("created_at", { ascending: false })
      .limit(10);

    if (clientName) {
      const parts = clientName.split(" ");
      const lastName = parts.length > 1 ? parts[parts.length - 1] : clientName;
      query = query.ilike("client_last_name", `%${lastName}%`);
    } else if (address) {
      query = query.ilike("address", `%${address.split(",")[0]}%`);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
