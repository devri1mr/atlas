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

/** Calendar Mon–Sun weeks clipped to the month. */
function buildWeeks(year: number, month: number, daysInMonth: number) {
  const pad = (n: number) => String(n).padStart(2, "0");

  // Day-of-week for the 1st (0=Sun … 6=Sat)
  const firstDow = new Date(year, month - 1, 1).getDay();
  // Days back to the nearest Monday (including the 1st if it IS a Monday)
  const daysBackToMon = firstDow === 0 ? 6 : firstDow - 1;

  const weeks: { label: string; start: string; end: string }[] = [];
  let weekStartDay = 1 - daysBackToMon; // may be ≤ 0 (days in prior month)

  while (weekStartDay <= daysInMonth) {
    const weekEndDay   = weekStartDay + 6;
    const clipStart    = Math.max(1, weekStartDay);
    const clipEnd      = Math.min(daysInMonth, weekEndDay);

    if (clipStart <= daysInMonth) {
      const startStr = `${year}-${pad(month)}-${pad(clipStart)}`;
      const endStr   = `${year}-${pad(month)}-${pad(clipEnd)}`;

      // Label: "M/D – M/D/YYYY"  (or just "M/D/YYYY" for single-day weeks)
      const s = `${month}/${clipStart}`;
      const e = `${month}/${clipEnd}/${year}`;
      const label = clipStart === clipEnd ? e : `${s} – ${e}`;

      weeks.push({ label, start: startStr, end: endStr });
    }
    weekStartDay += 7;
  }

  return weeks;
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
    const weeks       = buildWeeks(year, monthNum, daysInMonth);

    // Active ops divisions
    const { data: divRows } = await sb
      .from("divisions")
      .select("id, name")
      .eq("active", true)
      .eq("show_in_ops", true)
      .order("name");

    const divisions = divRows ?? [];
    const isLawnDiv = (name: string) => name.toLowerCase() === "lawn";

    // ── YTD prior months: lawn production reports ─────────────────────────────
    const lawnPriorMap = new Map<number, number>(); // month → revenue
    if (monthNum > 1 && divisions.some(d => isLawnDiv(d.name))) {
      const [{ data: lawnReports }, { data: lawnCogsOv }] = await Promise.all([
        sb.from("lawn_production_reports")
          .select("report_date, lawn_production_jobs(lawn_production_members(earned_amount))")
          .eq("company_id", company.id)
          .eq("is_complete", true)
          .gte("report_date", `${year}-01-01`)
          .lt("report_date", monthStart),
        sb.from("division_cogs_actuals")
          .select("month, revenue_override")
          .eq("company_id", company.id)
          .eq("division", "lawn")
          .eq("year", year)
          .lt("month", monthNum),
      ]);

      for (const r of lawnReports ?? []) {
        const m = Number((r as any).report_date?.slice(5, 7));
        if (!m || m >= monthNum) continue;
        let earned = 0;
        for (const job of (r as any).lawn_production_jobs ?? [])
          for (const mem of (job as any).lawn_production_members ?? [])
            earned += Number(mem.earned_amount ?? 0);
        lawnPriorMap.set(m, (lawnPriorMap.get(m) ?? 0) + earned);
      }
      // COGS override takes precedence
      for (const row of lawnCogsOv ?? []) {
        if ((row as any).revenue_override != null)
          lawnPriorMap.set((row as any).month, Number((row as any).revenue_override));
      }
    }

    // ── YTD prior months: non-lawn COGS actuals ───────────────────────────────
    const nonLawnCogsMap = new Map<string, Map<number, number>>();
    if (monthNum > 1) {
      const nlKeys = divisions.filter(d => !isLawnDiv(d.name)).map(d => d.name.toLowerCase());
      if (nlKeys.length > 0) {
        const { data: cogsRows } = await sb
          .from("division_cogs_actuals")
          .select("division, month, revenue_override")
          .eq("company_id", company.id)
          .eq("year", year)
          .in("division", nlKeys)
          .lt("month", monthNum);

        for (const row of cogsRows ?? []) {
          const key = (row as any).division as string;
          if (!nonLawnCogsMap.has(key)) nonLawnCogsMap.set(key, new Map());
          if ((row as any).revenue_override != null)
            nonLawnCogsMap.get(key)!.set((row as any).month, Number((row as any).revenue_override));
        }
      }
    }

    // ── YTD budgets (months 1 → monthNum) — all divisions ─────────────────────
    const budgetMap = new Map<string, number>(); // divKey → YTD budget revenue
    {
      const allKeys = divisions.map(d => d.name.toLowerCase());
      const { data: budgetRows } = await sb
        .from("division_budgets")
        .select("division, month, revenue")
        .eq("company_id", company.id)
        .eq("year", year)
        .lte("month", monthNum)
        .in("division", allKeys);

      for (const row of budgetRows ?? []) {
        const key = (row as any).division as string;
        budgetMap.set(key, (budgetMap.get(key) ?? 0) + Number((row as any).revenue ?? 0));
      }
    }

    // ── Current month: all queries in parallel ────────────────────────────────
    const [
      { data: lawnUpcoming },
      { data: lawnReportsCur },
      { data: divUpcoming },
      { data: curMonthCogs },   // COGS overrides for current month (non-lawn)
    ] = await Promise.all([
      sb.from("lawn_upcoming_revenue")
        .select("date, mowing, weeding, shrubs, cleanups, brush_hogging, string_trimming, other, is_voided")
        .eq("company_id", company.id)
        .gte("date", monthStart)
        .lte("date", monthEnd),
      sb.from("lawn_production_reports")
        .select("report_date, lawn_production_jobs(lawn_production_members(earned_amount))")
        .eq("company_id", company.id)
        .eq("is_complete", true)
        .gte("report_date", monthStart)
        .lte("report_date", monthEnd),
      sb.from("division_upcoming_revenue")
        .select("division, date, mowing, weeding, shrubs, cleanups, brush_hogging, string_trimming, other")
        .eq("company_id", company.id)
        .gte("date", monthStart)
        .lte("date", monthEnd),
      sb.from("division_cogs_actuals")
        .select("division, revenue_override")
        .eq("company_id", company.id)
        .eq("year", year)
        .eq("month", monthNum),
    ]);

    // Lawn day-map: date → revenue (actuals override upcoming)
    const lawnDayMap = new Map<string, number>();
    for (const row of lawnUpcoming ?? []) {
      if ((row as any).is_voided) continue;
      const s = sumRow(row);
      if (s > 0) lawnDayMap.set((row as any).date, s);
    }
    for (const r of lawnReportsCur ?? []) {
      let actual = 0;
      for (const job of (r as any).lawn_production_jobs ?? [])
        for (const mem of (job as any).lawn_production_members ?? [])
          actual += Number(mem.earned_amount ?? 0);
      lawnDayMap.set((r as any).report_date, actual);
    }

    // Non-lawn day-map: divKey → date → revenue
    const divDayMap = new Map<string, Map<string, number>>();
    for (const row of divUpcoming ?? []) {
      const key = (row as any).division as string;
      if (!divDayMap.has(key)) divDayMap.set(key, new Map());
      const s = sumRow(row);
      if (s > 0) divDayMap.get(key)!.set((row as any).date, s);
    }

    // Current-month COGS override map: divKey → revenue_override
    const curCogsMap = new Map<string, number>();
    for (const row of curMonthCogs ?? []) {
      if ((row as any).revenue_override != null)
        curCogsMap.set((row as any).division as string, Number((row as any).revenue_override));
    }

    // ── Assemble per-division results ─────────────────────────────────────────
    const results = divisions.map(div => {
      const divKey = div.name.toLowerCase();
      const lawn   = isLawnDiv(div.name);

      // YTD prior months
      let ytdPrior = 0;
      if (lawn) {
        for (const [, v] of lawnPriorMap) ytdPrior += v;
      } else {
        const mm = nonLawnCogsMap.get(divKey);
        if (mm) for (const [, v] of mm) ytdPrior += v;
      }

      // Current month week totals
      let weekTotals: number[];
      let monthCogsActual = 0; // current-month COGS override amount (non-lawn)

      if (lawn) {
        weekTotals = weeks.map(w => {
          let t = 0;
          for (const [date, amt] of lawnDayMap)
            if (date >= w.start && date <= w.end) t += amt;
          return t;
        });
      } else {
        // COGS override for current month: distribute across weeks
        // OR: if set, treat as lump-sum and show in the Month Total / YTD only
        // Strategy: show upcoming entries per week, then add COGS override as
        // a lump to month total (similar to how the summary route does actual + planned)
        const dayMap = divDayMap.get(divKey) ?? new Map<string, number>();
        weekTotals = weeks.map(w => {
          let t = 0;
          for (const [date, amt] of dayMap)
            if (date >= w.start && date <= w.end) t += amt;
          return t;
        });
        monthCogsActual = curCogsMap.get(divKey) ?? 0;
      }

      const weekSum    = weekTotals.reduce((s, v) => s + v, 0);
      const monthTotal = weekSum + monthCogsActual;
      const ytdBudget  = budgetMap.get(divKey) ?? 0;

      return {
        key:          divKey,
        name:         div.name,
        weeks:        weekTotals,
        month_total:  monthTotal,
        ytd:          ytdPrior + monthTotal,
        ytd_budget:   ytdBudget,
        over_under:   (ytdPrior + monthTotal) - ytdBudget,
      };
    });

    // Company totals
    const totals = {
      weeks:       weeks.map((_, i) => results.reduce((s, d) => s + d.weeks[i], 0)),
      month_total: results.reduce((s, d) => s + d.month_total, 0),
      ytd:         results.reduce((s, d) => s + d.ytd, 0),
      ytd_budget:  results.reduce((s, d) => s + d.ytd_budget, 0),
      over_under:  results.reduce((s, d) => s + d.over_under, 0),
    };

    return NextResponse.json({ month: monthParam, year, monthNum, weeks, divisions: results, totals });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
