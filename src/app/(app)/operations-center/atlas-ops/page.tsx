"use client";

import { useCallback, useEffect, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type WeekSlot = { label: string; start: string; end: string };

type DivisionRow = {
  key:          string;
  name:         string;
  weeks:        number[];
  month_total:  number;
  month_budget: number;
  ytd:          number;
  ytd_budget:   number;
  over_under:   number;
};

type CompanyRevenue = {
  month:     string;
  year:      number;
  monthNum:  number;
  weeks:     WeekSlot[];
  divisions: DivisionRow[];
  totals: {
    weeks:        number[];
    month_total:  number;
    month_budget: number;
    ytd:          number;
    ytd_budget:   number;
    over_under:   number;
  };
};

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];

const BG      = "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)";
const BG_HEAD = "#132d1a"; // column header row — distinct from main header
const BG_FOOT = "#0f3a1e";
const BG_TOT  = "#0a2010";

const fmt = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 0,
});

function money(v: number) { return fmt.format(v); }

function today() { return new Date().toISOString().slice(0, 7); }

function prevMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
function nextMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

// ── Cell helpers ──────────────────────────────────────────────────────────────

const CELL  = "px-3 py-3 text-center tabular-nums whitespace-nowrap border-r border-gray-100 text-sm";
const HCELL = "px-3 py-2.5 text-center text-xs font-bold uppercase tracking-wider whitespace-nowrap border-r border-white/10";
const FCELL = "px-3 py-3.5 text-center tabular-nums whitespace-nowrap border-r border-white/10 text-sm font-bold";

function Val({ v, dim }: { v: number; dim?: boolean }) {
  if (v === 0) return <span className="text-gray-300">—</span>;
  if (v < 0) return <span className="font-semibold text-red-500">{money(v)}</span>;
  return <span className={dim ? "text-gray-600" : "font-semibold text-gray-900"}>{money(v)}</span>;
}

function FValNeg({ v }: { v: number }) {
  if (v === 0) return <span className="text-white/25">—</span>;
  if (v < 0) return <span style={{ color: "#fca5a5" }}>{money(v)}</span>;
  return <span style={{ color: "rgba(255,255,255,0.5)" }}>{money(v)}</span>;
}

function FVal({ v, color }: { v: number; color?: string }) {
  if (v === 0) return <span className="text-white/25">—</span>;
  return <span style={{ color: color ?? "#ffffff" }}>{money(v)}</span>;
}

function OverUnder({ v }: { v: number }) {
  if (v === 0) return <span className="text-gray-300">—</span>;
  const color = v >= 0 ? "text-emerald-600" : "text-red-500";
  const sign  = v >= 0 ? "+" : "";
  return <span className={`font-semibold ${color}`}>{sign}{money(v)}</span>;
}

function FOverUnder({ v }: { v: number }) {
  if (v === 0) return <span className="text-white/25">—</span>;
  const color = v >= 0 ? "#6ee7b7" : "#fca5a5";
  const sign  = v >= 0 ? "+" : "";
  return <span style={{ color }}>{sign}{money(v)}</span>;
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

  const [, mNum] = month.split("-").map(Number);
  const monthLabel = `${MONTHS[mNum - 1]} ${month.split("-")[0]}`;
  const isCurrentMonth = month === today();

  const numWeeks  = data?.weeks.length ?? 0;
  // Extra fixed cols after weeks: Month | YTD | YTD Budget | Over/Under
  const fixedCols = 4;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-[1400px]">
        <div className="rounded-2xl overflow-hidden shadow-xl border border-gray-200">

          {/* ── Main header ──────────────────────────────────────────────── */}
          <div className="px-6 py-5 flex items-center justify-between" style={{ background: BG }}>
            <div>
              <div className="text-lg font-bold text-white tracking-wide">Revenue Outlook</div>
              <div className="text-xs text-white/50 mt-0.5">All divisions · Actuals + projected</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMonth(m => prevMonth(m))}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors text-lg"
              >‹</button>
              <span className="text-sm font-semibold text-white min-w-[140px] text-center">{monthLabel}</span>
              <button
                onClick={() => setMonth(m => nextMonth(m))}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors text-lg"
              >›</button>
              {!isCurrentMonth && (
                <button
                  onClick={() => setMonth(today())}
                  className="text-xs text-white/50 hover:text-white/80 border border-white/20 rounded-lg px-2.5 py-1 transition-colors ml-1"
                >Today</button>
              )}
            </div>
          </div>

          {/* ── Table ────────────────────────────────────────────────────── */}
          {loading ? (
            <div className="py-24 text-center text-sm text-gray-400 bg-white">Loading…</div>
          ) : error ? (
            <div className="py-24 text-center text-sm text-red-500 bg-white">{error}</div>
          ) : !data || data.divisions.length === 0 ? (
            <div className="py-24 text-center text-sm text-gray-400 bg-white">No divisions found</div>
          ) : (
            <div className="overflow-x-auto bg-white">
              <table className="w-full text-sm border-collapse">

                {/* Column headers — inline style overrides global thead th { background: white } */}
                <thead>
                  <tr>
                    {/* Division label */}
                    <th
                      className={`${HCELL} text-left sticky left-0 z-20`}
                      style={{ background: BG_HEAD, color: "rgba(255,255,255,0.55)", minWidth: 140 }}
                    >
                      Division
                    </th>

                    {/* Week columns */}
                    {data.weeks.map((w, i) => (
                      <th
                        key={i}
                        className={HCELL}
                        style={{ background: BG_HEAD, color: "rgba(255,255,255,0.55)" }}
                      >
                        {w.label}
                      </th>
                    ))}

                    {/* Month total — thick left border separates weeks from summary cols */}
                    <th
                      className={HCELL}
                      style={{ background: BG_HEAD, color: "rgba(255,255,255,0.8)", borderLeft: "3px solid rgba(255,255,255,0.25)" }}
                    >
                      {MONTHS[mNum - 1]}
                    </th>

                    {/* Month Budget */}
                    <th
                      className={HCELL}
                      style={{ background: BG_HEAD, color: "rgba(255,255,255,0.45)", borderLeft: "1px solid rgba(255,255,255,0.12)" }}
                    >
                      Mth Budget
                    </th>

                    {/* YTD — thick left border separates month group from YTD group */}
                    <th
                      className={HCELL}
                      style={{ background: BG_HEAD, color: "#6ee7b7", borderLeft: "3px solid rgba(255,255,255,0.25)" }}
                    >
                      YTD
                    </th>

                    {/* YTD Budget */}
                    <th
                      className={HCELL}
                      style={{ background: BG_HEAD, color: "rgba(255,255,255,0.45)", borderLeft: "1px solid rgba(255,255,255,0.12)" }}
                    >
                      YTD Budget
                    </th>

                    {/* Over / Under */}
                    <th
                      className={HCELL}
                      style={{ background: BG_HEAD, color: "rgba(255,255,255,0.55)", borderLeft: "1px solid rgba(255,255,255,0.12)" }}
                    >
                      Over / Under
                    </th>
                  </tr>
                </thead>

                {/* Division rows */}
                <tbody>
                  {data.divisions.map((div, ri) => (
                    <tr
                      key={div.key}
                      className={`border-b border-gray-100 hover:bg-emerald-50/30 transition-colors ${ri % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}
                    >
                      {/* Name */}
                      <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap border-r border-gray-100 sticky left-0 bg-inherit">
                        {div.name}
                      </td>

                      {/* Week cells */}
                      {div.weeks.map((wv, wi) => (
                        <td key={wi} className={CELL}>
                          <Val v={wv} dim />
                        </td>
                      ))}

                      {/* Month total */}
                      <td className={`${CELL} border-l-[3px] border-l-gray-300`}>
                        <Val v={div.month_total} />
                      </td>

                      {/* Month Budget */}
                      <td className={`${CELL} border-l border-l-gray-100`}>
                        <Val v={div.month_budget} dim />
                      </td>

                      {/* YTD — thick separator */}
                      <td className={`${CELL} border-l-[3px] border-l-gray-300`}>
                        {div.ytd > 0
                          ? <span className="font-bold text-emerald-700">{money(div.ytd)}</span>
                          : <span className="text-gray-300">—</span>
                        }
                      </td>

                      {/* YTD Budget */}
                      <td className={`${CELL} border-l border-l-gray-100`}>
                        <Val v={div.ytd_budget} dim />
                      </td>

                      {/* Over / Under */}
                      <td className={`${CELL} border-l border-l-gray-100`}>
                        <OverUnder v={div.over_under} />
                      </td>
                    </tr>
                  ))}
                </tbody>

                {/* Totals footer */}
                <tfoot>
                  <tr style={{ background: BG_FOOT }}>
                    <td className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-white/60 border-r border-white/10 sticky left-0" style={{ background: BG_FOOT }}>
                      Total
                    </td>
                    {data.totals.weeks.map((wv, wi) => (
                      <td key={wi} className={FCELL}>
                        <FVal v={wv} />
                      </td>
                    ))}
                    {/* Month group */}
                    <td className={`${FCELL} border-l-[3px] border-l-white/30`}>
                      <FVal v={data.totals.month_total} />
                    </td>
                    <td className={`${FCELL} border-l border-l-white/10`}>
                      <FValNeg v={data.totals.month_budget} />
                    </td>
                    {/* YTD group */}
                    <td className={`${FCELL} border-l-[3px] border-l-white/30`}>
                      <FVal v={data.totals.ytd} color="#6ee7b7" />
                    </td>
                    <td className={`${FCELL} border-l border-l-white/10`}>
                      <FValNeg v={data.totals.ytd_budget} />
                    </td>
                    <td className={`${FCELL} border-l border-l-white/10`}>
                      <FOverUnder v={data.totals.over_under} />
                    </td>
                  </tr>

                  {/* Annual projection row */}
                  {data.totals.ytd > 0 && mNum > 0 && (
                    <tr style={{ background: BG_TOT }}>
                      <td className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white/35 border-r border-white/10 sticky left-0" style={{ background: BG_TOT }}>
                        Annual Proj.
                      </td>
                      {/* skip week cols + month + month budget */}
                      {Array.from({ length: numWeeks + 2 }).map((_, i) => (
                        <td key={i} className="border-r border-white/10" />
                      ))}
                      {/* YTD projection */}
                      <td className="px-3 py-2.5 text-center font-bold tabular-nums whitespace-nowrap border-r border-white/10 border-l-[3px] border-l-white/25" style={{ color: "#86efac" }}>
                        {money(Math.round((data.totals.ytd / mNum) * 12))}
                      </td>
                      <td className="border-r border-white/10" />
                      <td className="border-r border-white/10" />
                    </tr>
                  )}
                </tfoot>

              </table>
            </div>
          )}

          {/* Legend */}
          {!loading && !error && (
            <div className="px-5 py-2 flex gap-4 text-xs text-gray-400 border-t border-gray-100 bg-white">
              <span>Weeks: Mon – Sun, clipped to month</span>
              <span className="ml-auto">YTD = prior months (COGS actuals) + {monthLabel} projection</span>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
