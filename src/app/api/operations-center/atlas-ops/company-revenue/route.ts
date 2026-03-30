import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Helpers ───────────────────────────────────────────────────────────────────

function sumRow(row: any): number {
  return (
    Number(row.mowing          ?? 0) +
    Number(row.weeding         ?? 0) +
    Number(row.shrubs          ?? 0) +
    Number(row.cleanups        ?? 0) +
    Number(row.brush_hogging   ?? 0) +
    Number(row.string_trimming ?? 0) +
    Number(row.other           ?? 0)
  );
}

function buildWeeks(year: number, month: number, daysInMonth: number) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const abbr = MONTH_ABBR[month - 1];
  const slots = [[1,7],[8,14],[15,21],[22,28],[29, daysInMonth]] as [number,number][];
  return slots
    .filter(([s]) => s <= daysInMonth)
    .map(([s, e]) => {
      const end = Math.min(e, daysInMonth);
      return {
        label: s === end ? `${abbr} ${s}` : `${abbr} ${s}–${end}`,
        start: `${year}-${pad(month)}-${pad(s)}`,
        end:   `${year}-${pad(month)}-${pad(end)}`,
      };
    });
}

// ── GET ?month=YYYY-MM ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("id").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
    const [year, monthNum] = monthParam.split("-").map(Number);

    const daysInMonth = new Date(year, monthNum, 0).getDate();
    const monthStart  = `${monthParam}-01`;
    const monthEnd    = `${monthParam}-${String(daysInMonth).padStart(2, "0")}`;

    const weeks = buildWeeks(year, monthNum, daysInMonth);

    // Active ops divisions
    const { data: divRows } = await sb
      .from("divisions")
      .select("id, name")
      .eq("active", true)
      .eq("show_in_ops", true)
      .order("name");

    const divisions = divRows ?? [];
    const isLawnDiv = (name: string) => name.toLowerCase() === "lawn";

    // ── Lawn: prior-month actuals from production reports ─────────────────────
    // Fetch once for the whole year-to-date range, group by month
    const lawnPriorMap = new Map<number, number>(); // month → earned total
    if (monthNum > 1 && divisions.some(d => isLawnDiv(d.name))) {
      const priorEnd = `${year}-${String(monthNum - 1).padStart(2, "0")}-31`; // generous upper bound

      const [{ data: lawnReports }, { data: lawnCogsOverrides }] = await Promise.all([
        sb.from("lawn_production_reports")
          .select("report_date, lawn_production_jobs(lawn_production_members(earned_amount))")
          .eq("company_id", company.id)
          .eq("is_complete", true)
          .gte("report_date", `${year}-01-01`)
          .lte("report_date", priorEnd),
        sb.from("division_cogs_actuals")
          .select("month, revenue_override")
          .eq("company_id", company.id)
          .eq("division", "lawn")
          .eq("year", year)
          .lt("month", monthNum),
      ]);

      // Sum production reports per calendar month
      for (const r of lawnReports ?? []) {
        const m = Number((r as any).report_date?.slice(5, 7));
        if (!m || m >= monthNum) continue;
        let earned = 0;
        for (const job of (r as any).lawn_production_jobs ?? [])
          for (const mem of (job as any).lawn_production_members ?? [])
            earned += Number(mem.earned_amount ?? 0);
        lawnPriorMap.set(m, (lawnPriorMap.get(m) ?? 0) + earned);
      }

      // COGS override takes precedence if set
      for (const row of lawnCogsOverrides ?? []) {
        if ((row as any).revenue_override != null)
          lawnPriorMap.set((row as any).month, Number((row as any).revenue_override));
      }
    }

    // ── Non-lawn: prior-month COGS actuals ────────────────────────────────────
    // Fetch all at once
    const nonLawnCogsMap = new Map<string, Map<number, number>>(); // divKey → month → amount
    if (monthNum > 1) {
      const nonLawnKeys = divisions
        .filter(d => !isLawnDiv(d.name))
        .map(d => d.name.toLowerCase());

      if (nonLawnKeys.length > 0) {
        const { data: cogsRows } = await sb
          .from("division_cogs_actuals")
          .select("division, month, revenue_override")
          .eq("company_id", company.id)
          .eq("year", year)
          .in("division", nonLawnKeys)
          .lt("month", monthNum);

        for (const row of cogsRows ?? []) {
          const key = (row as any).division as string;
          if (!nonLawnCogsMap.has(key)) nonLawnCogsMap.set(key, new Map());
          if ((row as any).revenue_override != null)
            nonLawnCogsMap.get(key)!.set((row as any).month, Number((row as any).revenue_override));
        }
      }
    }

    // ── Current month: per-division upcoming + lawn actuals ───────────────────
    const [
      { data: lawnUpcoming },
      { data: lawnReports },
      { data: divUpcoming },
    ] = await Promise.all([
      // Lawn upcoming entries for current month
      sb.from("lawn_upcoming_revenue")
        .select("date, mowing, weeding, shrubs, cleanups, brush_hogging, string_trimming, other, is_voided")
        .eq("company_id", company.id)
        .gte("date", monthStart)
        .lte("date", monthEnd),
      // Lawn completed production reports for current month
      sb.from("lawn_production_reports")
        .select("report_date, lawn_production_jobs(lawn_production_members(earned_amount))")
        .eq("company_id", company.id)
        .eq("is_complete", true)
        .gte("report_date", monthStart)
        .lte("report_date", monthEnd),
      // All non-lawn division upcoming revenue for current month
      sb.from("division_upcoming_revenue")
        .select("division, date, mowing, weeding, shrubs, cleanups, brush_hogging, string_trimming, other")
        .eq("company_id", company.id)
        .gte("date", monthStart)
        .lte("date", monthEnd),
    ]);

    // Build lawn day-totals map: date → revenue
    const lawnDayMap = new Map<string, number>();
    for (const row of lawnUpcoming ?? []) {
      if ((row as any).is_voided) continue;
      const s = sumRow(row);
      if (s > 0) lawnDayMap.set((row as any).date, s);
    }
    for (const r of lawnReports ?? []) {
      let actual = 0;
      for (const job of (r as any).lawn_production_jobs ?? [])
        for (const mem of (job as any).lawn_production_members ?? [])
          actual += Number(mem.earned_amount ?? 0);
      lawnDayMap.set((r as any).report_date, actual); // override with actual
    }

    // Build non-lawn day-totals: divKey → date → revenue
    const divDayMap = new Map<string, Map<string, number>>();
    for (const row of divUpcoming ?? []) {
      const key = (row as any).division as string;
      if (!divDayMap.has(key)) divDayMap.set(key, new Map());
      const s = sumRow(row);
      if (s > 0) divDayMap.get(key)!.set((row as any).date, s);
    }

    // ── Assemble per-division results ─────────────────────────────────────────
    const results = divisions.map(div => {
      const divKey = div.name.toLowerCase();
      const lawn = isLawnDiv(div.name);

      // YTD prior months
      let ytdPrior = 0;
      if (lawn) {
        for (const [, v] of lawnPriorMap) ytdPrior += v;
      } else {
        const monthMap = nonLawnCogsMap.get(divKey);
        if (monthMap) for (const [, v] of monthMap) ytdPrior += v;
      }

      // Current month week totals
      const dayMap = lawn ? lawnDayMap : (divDayMap.get(divKey) ?? new Map());
      const weekTotals = weeks.map(w => {
        let total = 0;
        for (const [date, amount] of dayMap)
          if (date >= w.start && date <= w.end) total += amount;
        return total;
      });

      const monthTotal = weekTotals.reduce((s, v) => s + v, 0);
      return {
        key:         divKey,
        name:        div.name,
        weeks:       weekTotals,
        month_total: monthTotal,
        ytd:         ytdPrior + monthTotal,
      };
    });

    // Company totals row
    const totals = {
      weeks:       weeks.map((_, i) => results.reduce((s, d) => s + d.weeks[i], 0)),
      month_total: results.reduce((s, d) => s + d.month_total, 0),
      ytd:         results.reduce((s, d) => s + d.ytd, 0),
    };

    return NextResponse.json({ month: monthParam, year, monthNum, weeks, divisions: results, totals });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
