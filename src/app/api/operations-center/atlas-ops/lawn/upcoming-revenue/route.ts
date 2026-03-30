import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?start=YYYY-MM-DD&end=YYYY-MM-DD   — week planned rows
// GET ?summary=YYYY-MM                    — month projection (actual + planned)
export async function GET(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);

    // ── Month projection summary ────────────────────────────────────────────────
    const summaryMonth = searchParams.get("summary"); // "YYYY-MM"
    if (summaryMonth) {
      const monthStart = `${summaryMonth}-01`;
      const [sy, sm] = summaryMonth.split("-").map(Number);
      const monthEnd = new Date(sy, sm, 0).toISOString().slice(0, 10);

      const [{ data: reports }, { data: planned }] = await Promise.all([
        // Actual revenue from completed (is_complete=true) production reports only
        sb
          .from("lawn_production_reports")
          .select("report_date, lawn_production_jobs(lawn_production_members(earned_amount))")
          .eq("company_id", company.id)
          .eq("is_complete", true)
          .gte("report_date", monthStart)
          .lte("report_date", monthEnd),
        // All upcoming revenue entries for the month
        sb
          .from("lawn_upcoming_revenue")
          .select("date, mowing, weeding, shrubs, cleanups, brush_hogging, string_trimming, other, is_voided")
          .eq("company_id", company.id)
          .gte("date", monthStart)
          .lte("date", monthEnd),
      ]);

      // Build set of dates that have a completed import
      const completedDates = new Set((reports ?? []).map((r: any) => r.report_date as string));

      let actual = 0;
      for (const r of reports ?? []) {
        for (const job of (r as any).lawn_production_jobs ?? []) {
          for (const m of (job as any).lawn_production_members ?? []) {
            actual += Number(m.earned_amount ?? 0);
          }
        }
      }

      // Planned = upcoming entries for dates WITHOUT a completed import and not voided
      let plannedTotal = 0;
      for (const p of planned ?? []) {
        if (!completedDates.has((p as any).date) && !(p as any).is_voided) {
          plannedTotal += Number(p.mowing ?? 0) + Number(p.weeding ?? 0) + Number(p.shrubs ?? 0)
            + Number(p.cleanups ?? 0) + Number(p.brush_hogging ?? 0)
            + Number(p.string_trimming ?? 0) + Number(p.other ?? 0);
        }
      }

      return NextResponse.json({ actual, planned: plannedTotal });
    }

    // ── Locked dates (completed imports) for a date range ──────────────────────
    // Returns [{ date, actual_revenue }] for is_complete = true reports
    const lockedStart = searchParams.get("locked_start");
    const lockedEnd   = searchParams.get("locked_end");
    if (lockedStart && lockedEnd) {
      const { data: reports } = await sb
        .from("lawn_production_reports")
        .select("report_date, lawn_production_jobs(lawn_production_members(earned_amount))")
        .eq("company_id", company.id)
        .eq("is_complete", true)
        .gte("report_date", lockedStart)
        .lte("report_date", lockedEnd);

      const locked = (reports ?? []).map((r: any) => {
        let actual = 0;
        for (const job of r.lawn_production_jobs ?? []) {
          for (const m of job.lawn_production_members ?? []) {
            actual += Number(m.earned_amount ?? 0);
          }
        }
        return { date: r.report_date as string, actual_revenue: actual };
      });
      return NextResponse.json(locked);
    }

    // ── Week planned rows ───────────────────────────────────────────────────────
    const start = searchParams.get("start");
    const end   = searchParams.get("end");
    if (!start || !end) return NextResponse.json({ error: "start and end required" }, { status: 400 });

    const { data, error } = await sb
      .from("lawn_upcoming_revenue")
      .select("date, mowing, weeding, shrubs, cleanups, brush_hogging, string_trimming, other, is_voided")
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

// PATCH — void one or more dates { dates: string[] }
export async function PATCH(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { dates }: { dates: string[] } = await req.json();
    if (!dates?.length) return NextResponse.json({ error: "dates required" }, { status: 400 });

    const { error } = await sb
      .from("lawn_upcoming_revenue")
      .update({ is_voided: true, updated_at: new Date().toISOString() })
      .eq("company_id", company.id)
      .in("date", dates);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
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

    const payload = {
      company_id:      company.id,
      date,
      mowing:          Number(mowing),
      weeding:         Number(weeding),
      shrubs:          Number(shrubs),
      cleanups:        Number(cleanups),
      brush_hogging:   Number(brush_hogging),
      string_trimming: Number(string_trimming),
      other:           Number(other),
      updated_at:      new Date().toISOString(),
    };

    // Check if a row already exists for this company+date
    const { data: existing } = await sb
      .from("lawn_upcoming_revenue")
      .select("id")
      .eq("company_id", company.id)
      .eq("date", date)
      .maybeSingle();

    let error;
    if (existing?.id) {
      ({ error } = await sb
        .from("lawn_upcoming_revenue")
        .update(payload)
        .eq("id", existing.id));
    } else {
      ({ error } = await sb
        .from("lawn_upcoming_revenue")
        .insert(payload));
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
