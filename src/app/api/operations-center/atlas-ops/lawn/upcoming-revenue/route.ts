import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?start=YYYY-MM-DD&end=YYYY-MM-DD
export async function GET(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const start = searchParams.get("start");
    const end   = searchParams.get("end");
    if (!start || !end) return NextResponse.json({ error: "start and end required" }, { status: 400 });

    const { data, error } = await sb
      .from("lawn_upcoming_revenue")
      .select("date, mowing, weeding, shrubs, cleanups, brush_hogging, string_trimming, other")
      .eq("company_id", company.id)
      .gte("date", start)
      .lte("date", end)
      .order("date");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// PUT — upsert a single day's row
// body: { date, mowing, weeding, shrubs, cleanups, brush_hogging, string_trimming, other }
export async function PUT(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body = await req.json();
    const { date, mowing = 0, weeding = 0, shrubs = 0, cleanups = 0, brush_hogging = 0, string_trimming = 0, other = 0 } = body;
    if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

    const { error } = await sb
      .from("lawn_upcoming_revenue")
      .upsert(
        {
          company_id: company.id,
          date,
          mowing:          Number(mowing),
          weeding:         Number(weeding),
          shrubs:          Number(shrubs),
          cleanups:        Number(cleanups),
          brush_hogging:   Number(brush_hogging),
          string_trimming: Number(string_trimming),
          other:           Number(other),
          updated_at:      new Date().toISOString(),
        },
        { onConflict: "company_id,date" }
      );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
