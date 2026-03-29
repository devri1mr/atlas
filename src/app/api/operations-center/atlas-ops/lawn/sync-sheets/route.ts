import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — push current month projection + this week's rows to Google Sheets
export async function POST(req: NextRequest) {
  const webhookUrl = process.env.SHEETS_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({ error: "SHEETS_WEBHOOK_URL not configured" }, { status: 503 });
  }

  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const { month, start, end } = body as { month?: string; start?: string; end?: string };
    if (!month || !start || !end) {
      return NextResponse.json({ error: "month, start, end required" }, { status: 400 });
    }

    const monthStart = `${month}-01`;
    const monthEnd   = `${month}-31`;

    // Fetch month summary + week rows in parallel
    const [{ data: reports }, { data: planned }, { data: weekRows }] = await Promise.all([
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
      sb
        .from("lawn_upcoming_revenue")
        .select("date, mowing, weeding, shrubs, cleanups, brush_hogging, string_trimming, other")
        .eq("company_id", company.id)
        .gte("date", start)
        .lte("date", end)
        .order("date"),
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

    // Use GET with query params — avoids Apps Script POST redirect body-loss issue
    const url = new URL(webhookUrl);
    url.searchParams.set("month",      month);
    url.searchParams.set("projection", String(projection));

    const sheetRes = await fetch(url.toString(), {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    const text = await sheetRes.text();
    let sheetJson: any = {};
    try { sheetJson = JSON.parse(text); } catch { sheetJson = { raw: text.slice(0, 300) }; }

    // Apps Script returns 200 on success; treat any JSON with ok:true as success
    const succeeded = sheetRes.ok || sheetJson?.ok === true;
    if (!succeeded) {
      return NextResponse.json(
        { error: `Sheets webhook failed (HTTP ${sheetRes.status})`, detail: sheetJson },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, month, projection, sheets: sheetJson });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
