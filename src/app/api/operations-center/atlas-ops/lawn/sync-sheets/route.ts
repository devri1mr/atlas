import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { month } — compute projection server-side, return the Apps Script URL for the browser to call
export async function POST(req: NextRequest) {
  const webhookUrl = process.env.SHEETS_WEBHOOK_URL?.replace(/\s+/g, "");
  if (!webhookUrl) {
    return NextResponse.json({ error: "SHEETS_WEBHOOK_URL not configured" }, { status: 503 });
  }

  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body  = await req.json().catch(() => ({}));
    const { month } = body as { month?: string };
    if (!month) return NextResponse.json({ error: "month required" }, { status: 400 });

    const monthStart = `${month}-01`;
    const [y, mo]  = month.split("-").map(Number);
    const monthEnd = new Date(y, mo, 0).toISOString().slice(0, 10); // last real day of month

    const [{ data: reports }, { data: planned }] = await Promise.all([
      sb
        .from("lawn_production_reports")
        .select("report_date, lawn_production_jobs(lawn_production_members(earned_amount))")
        .eq("company_id", company.id)
        .eq("is_complete", true)
        .gte("report_date", monthStart)
        .lte("report_date", monthEnd),
      sb
        .from("lawn_upcoming_revenue")
        .select("date, mowing, weeding, shrubs, cleanups, brush_hogging, string_trimming, other")
        .eq("company_id", company.id)
        .gte("date", monthStart)
        .lte("date", monthEnd),
    ]);

    const completedDates = new Set((reports ?? []).map((r: any) => r.report_date as string));

    let actual = 0;
    for (const r of reports ?? []) {
      for (const job of (r as any).lawn_production_jobs ?? []) {
        for (const m of (job as any).lawn_production_members ?? []) {
          actual += Number(m.earned_amount ?? 0);
        }
      }
    }

    let plannedTotal = 0;
    for (const p of planned ?? []) {
      if (!completedDates.has((p as any).date)) {
        plannedTotal += Number(p.mowing ?? 0) + Number(p.weeding ?? 0) + Number(p.shrubs ?? 0)
          + Number(p.cleanups ?? 0) + Number(p.brush_hogging ?? 0)
          + Number(p.string_trimming ?? 0) + Number(p.other ?? 0);
      }
    }

    const projection = actual + plannedTotal;

    // Return the Apps Script URL for the browser to call (server can't auth with Google)
    const url = new URL(webhookUrl);
    url.searchParams.set("month",      month);
    url.searchParams.set("projection", String(projection));

    return NextResponse.json({ ok: true, month, projection, scriptUrl: url.toString() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
