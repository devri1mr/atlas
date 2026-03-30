import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?start=YYYY-MM-DD&end=YYYY-MM-DD   — week planned rows
// GET ?summary=YYYY-MM                    — month projection (actual + planned)
// GET ?locked_start=&locked_end=          — no production locks for non-lawn
export async function GET(req: NextRequest, { params }: { params: Promise<{ division: string }> }) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { division } = await params;
    // Normalize slug to match stored key format: "holiday-lights" → "holiday lights"
    const divisionKey = division.replace(/-/g, " ");
    const { searchParams } = new URL(req.url);

    // ── Locked dates — no production reports for non-lawn ─────────────────────
    const lockedStart = searchParams.get("locked_start");
    const lockedEnd   = searchParams.get("locked_end");
    if (lockedStart && lockedEnd) {
      return NextResponse.json([]);
    }

    // ── Month projection summary ───────────────────────────────────────────────
    const summaryMonth = searchParams.get("summary"); // "YYYY-MM"
    if (summaryMonth) {
      const monthStart = `${summaryMonth}-01`;
      const [sy, sm]   = summaryMonth.split("-").map(Number);
      const monthEnd   = new Date(sy, sm, 0).toISOString().slice(0, 10);

      const [{ data: cogsRow }, { data: planned }] = await Promise.all([
        // Actual revenue from COGS actuals (revenue_override entered in the COGS page)
        sb.from("division_cogs_actuals")
          .select("revenue_override")
          .eq("company_id", company.id)
          .eq("division", divisionKey)
          .eq("year", sy)
          .eq("month", sm)
          .maybeSingle(),
        sb.from("division_upcoming_revenue")
          .select("date, mowing, weeding, shrubs, cleanups, brush_hogging, string_trimming, other")
          .eq("company_id", company.id)
          .eq("division", divisionKey)
          .gte("date", monthStart)
          .lte("date", monthEnd),
      ]);

      const actual = cogsRow?.revenue_override != null ? Number(cogsRow.revenue_override) : 0;

      // Build set of "completed" dates — for non-lawn there are none, so all future entries count
      const completedDates = new Set<string>();

      let plannedTotal = 0;
      for (const p of planned ?? []) {
        if (!completedDates.has((p as any).date)) {
          plannedTotal +=
            Number((p as any).mowing          ?? 0) +
            Number((p as any).weeding         ?? 0) +
            Number((p as any).shrubs          ?? 0) +
            Number((p as any).cleanups        ?? 0) +
            Number((p as any).brush_hogging   ?? 0) +
            Number((p as any).string_trimming ?? 0) +
            Number((p as any).other           ?? 0);
        }
      }

      return NextResponse.json({ actual, planned: plannedTotal });
    }

    // ── Week planned rows ──────────────────────────────────────────────────────
    const start = searchParams.get("start");
    const end   = searchParams.get("end");
    if (!start || !end) return NextResponse.json({ error: "start and end required" }, { status: 400 });

    const { data, error } = await sb
      .from("division_upcoming_revenue")
      .select("date, mowing, weeding, shrubs, cleanups, brush_hogging, string_trimming, other")
      .eq("company_id", company.id)
      .eq("division", divisionKey)
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
export async function PUT(req: NextRequest, { params }: { params: Promise<{ division: string }> }) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { division } = await params;
    const divisionKey = division.replace(/-/g, " ");
    const body = await req.json();
    const {
      date,
      mowing          = 0,
      weeding         = 0,
      shrubs          = 0,
      cleanups        = 0,
      brush_hogging   = 0,
      string_trimming = 0,
      other           = 0,
    } = body;
    if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

    const { error } = await sb
      .from("division_upcoming_revenue")
      .upsert(
        {
          company_id:      company.id,
          division:        divisionKey,
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
        { onConflict: "company_id,division,date" }
      );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
