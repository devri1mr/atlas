"use client";

import { useCallback, useEffect, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type WeekSlot = { label: string; start: string; end: string };

type DivisionRow = {
  key:         string;
  name:        string;
  weeks:       number[];
  month_total: number;
  ytd:         number;
};

type CompanyRevenue = {
  month:     string;
  year:      number;
  monthNum:  number;
  weeks:     WeekSlot[];
  divisions: DivisionRow[];
  totals: {
    weeks:       number[];
    month_total: number;
    ytd:         number;
  };
};

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];

const BG          = "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)";
const BG_FOOT     = "#0f3a1e";
const BG_FOOT_TOT = "#0a2010";

const fmt = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 0,
});

function fmtShort(v: number) {
  if (v === 0) return <span className="text-white/20">—</span>;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}K`;
  return fmt.format(v);
}

function today() {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

function prevMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

function nextMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CompanyRevenuePage() {
  const [month,   setMonth]   = useState<string>(today);
  const [data,    setData]    = useState<CompanyRevenue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async (m: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/operations-center/atlas-ops/company-revenue?month=${m}`);
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(month); }, [load, month]);

  const [y, mNum] = month.split("-").map(Number);
  const monthLabel = `${MONTHS[mNum - 1]} ${y}`;
  const isCurrentMonth = month === today();

  const numWeeks = data?.weeks.length ?? 0;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">

        {/* ── Card ─────────────────────────────────────────────────────────── */}
        <div className="rounded-2xl overflow-hidden shadow-xl border border-gray-200">

          {/* Header */}
          <div className="px-6 py-5 flex items-center justify-between" style={{ background: BG }}>
            <div>
              <div className="text-lg font-bold text-white tracking-wide">Revenue Outlook</div>
              <div className="text-xs text-white/50 mt-0.5">
                All divisions · Actuals + projected
              </div>
            </div>

            {/* Month navigation */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMonth(m => prevMonth(m))}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              >
                ‹
              </button>
              <div className="text-sm font-semibold text-white min-w-[130px] text-center">
                {monthLabel}
              </div>
              <button
                onClick={() => setMonth(m => nextMonth(m))}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              >
                ›
              </button>
              {!isCurrentMonth && (
                <button
                  onClick={() => setMonth(today())}
                  className="text-xs text-white/50 hover:text-white/80 border border-white/20 hover:border-white/40 rounded-lg px-2.5 py-1 transition-colors ml-1"
                >
                  Today
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="py-24 text-center text-sm text-gray-400 bg-white">Loading…</div>
          ) : error ? (
            <div className="py-24 text-center text-sm text-red-500 bg-white">{error}</div>
          ) : data && data.divisions.length === 0 ? (
            <div className="py-24 text-center text-sm text-gray-400 bg-white">No divisions found</div>
          ) : data ? (
            <div className="overflow-x-auto bg-white">
              <table className="w-full text-sm border-collapse">

                {/* Column header */}
                <thead>
                  <tr style={{ background: BG }}>
                    {/* Division */}
                    <th className="px-5 py-3 text-left text-xs font-semibold text-white/60 uppercase tracking-wider w-36">
                      Division
                    </th>

                    {/* Week columns */}
                    {data.weeks.map((w, i) => (
                      <th
                        key={i}
                        className="px-4 py-3 text-center text-xs font-semibold text-white/60 uppercase tracking-wider whitespace-nowrap"
                      >
                        {w.label}
                      </th>
                    ))}

                    {/* Month total */}
                    <th className="px-4 py-3 text-center text-xs font-semibold text-white/80 uppercase tracking-wider whitespace-nowrap border-l border-white/10">
                      {MONTHS[mNum - 1]}
                    </th>

                    {/* YTD */}
                    <th className="px-5 py-3 text-center text-xs font-semibold text-emerald-300 uppercase tracking-wider whitespace-nowrap border-l border-white/10">
                      YTD
                    </th>
                  </tr>
                </thead>

                {/* Division rows */}
                <tbody>
                  {data.divisions.map((div, ri) => (
                    <tr
                      key={div.key}
                      className={`border-b border-gray-100 transition-colors hover:bg-emerald-50/30 ${ri % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}
                    >
                      {/* Name */}
                      <td className="px-5 py-3.5 font-semibold text-gray-800 whitespace-nowrap">
                        {div.name}
                      </td>

                      {/* Week cells */}
                      {div.weeks.map((wv, wi) => (
                        <td key={wi} className="px-4 py-3.5 text-center tabular-nums text-gray-700 whitespace-nowrap">
                          {wv > 0 ? (
                            <span className="font-medium">{fmt.format(wv)}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      ))}

                      {/* Month total */}
                      <td className="px-4 py-3.5 text-center tabular-nums font-bold text-gray-900 whitespace-nowrap border-l border-gray-100">
                        {div.month_total > 0 ? fmt.format(div.month_total) : <span className="text-gray-300 font-normal">—</span>}
                      </td>

                      {/* YTD */}
                      <td className="px-5 py-3.5 text-center tabular-nums font-bold whitespace-nowrap border-l border-gray-100">
                        {div.ytd > 0 ? (
                          <span className="text-emerald-700">{fmt.format(div.ytd)}</span>
                        ) : (
                          <span className="text-gray-300 font-normal">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>

                {/* Totals footer */}
                <tfoot>
                  <tr style={{ background: BG_FOOT }}>
                    <td className="px-5 py-4 text-xs font-bold text-white/60 uppercase tracking-wider">
                      Total
                    </td>

                    {data.totals.weeks.map((wv, wi) => (
                      <td key={wi} className="px-4 py-4 text-center tabular-nums text-white font-bold whitespace-nowrap">
                        {wv > 0 ? fmt.format(wv) : <span className="text-white/20">—</span>}
                      </td>
                    ))}

                    <td className="px-4 py-4 text-center tabular-nums text-white font-bold whitespace-nowrap border-l border-white/10">
                      {data.totals.month_total > 0
                        ? fmt.format(data.totals.month_total)
                        : <span className="text-white/20">—</span>
                      }
                    </td>

                    <td className="px-5 py-4 text-center tabular-nums font-bold whitespace-nowrap border-l border-white/10"
                        style={{ color: "#6ee7b7" }}>
                      {data.totals.ytd > 0
                        ? fmt.format(data.totals.ytd)
                        : <span className="text-white/20">—</span>
                      }
                    </td>
                  </tr>

                  {/* Annual projection row — extrapolate from YTD pace */}
                  {data.totals.ytd > 0 && mNum > 0 && (
                    <tr style={{ background: BG_FOOT_TOT }}>
                      <td className="px-5 py-3 text-xs font-bold text-white/40 uppercase tracking-wider whitespace-nowrap">
                        Annual Proj.
                      </td>
                      {/* empty week + month cells */}
                      {Array.from({ length: numWeeks + 1 }).map((_, i) => (
                        <td key={i} />
                      ))}
                      <td className="px-5 py-3 text-center tabular-nums font-bold whitespace-nowrap border-l border-white/10"
                          style={{ color: "#86efac" }}>
                        {fmt.format(Math.round((data.totals.ytd / mNum) * 12))}
                      </td>
                    </tr>
                  )}
                </tfoot>

              </table>
            </div>
          ) : null}

          {/* Footer legend */}
          {!loading && !error && (
            <div className="px-5 py-2.5 flex gap-5 text-xs text-gray-400 border-t border-gray-100 bg-white">
              <span>Weeks: fixed 7-day blocks (1–7, 8–14, 15–21, 22–28, 29+)</span>
              <span className="ml-auto">YTD = prior months (COGS actuals) + {monthLabel} projection</span>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
