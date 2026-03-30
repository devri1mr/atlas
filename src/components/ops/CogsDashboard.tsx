"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MonthCOGS = {
  month: number;
  revenue: number; labor: number; job_materials: number; fuel: number; equipment: number;
  gross_profit: number; margin_pct: number | null;
  revenue_auto: number; labor_auto: number; fuel_auto: number;
  revenue_overridden: boolean; labor_overridden: boolean; fuel_overridden: boolean;
  budget_revenue: number; budget_labor: number; budget_job_materials: number;
  budget_fuel: number; budget_equipment: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmt    = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

const BG          = "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)";
const BG_FOOT     = "#0f3a1e";
const BG_FOOT_TOT = "#0a2010";

const TODAY     = new Date();
const CUR_MONTH = TODAY.getMonth() + 1;
const CUR_YEAR  = TODAY.getFullYear();

function isFuture(month: number, year: number) {
  if (year > CUR_YEAR) return true;
  if (year < CUR_YEAR) return false;
  return month > CUR_MONTH;
}

function marginTextColor(m: number | null) {
  if (m === null) return "text-white/25";
  if (m >= 0.35)  return "text-emerald-300";
  if (m >= 0.20)  return "text-yellow-300";
  return "text-red-400";
}

function marginPillBg(m: number | null): string {
  if (m === null) return "transparent";
  if (m >= 0.35)  return "rgba(16,185,129,0.25)";
  if (m >= 0.20)  return "rgba(234,179,8,0.25)";
  return "rgba(239,68,68,0.25)";
}

// ── Editable actual cell ───────────────────────────────────────────────────────

function ActualCell({ value, isAuto, color, onSave, onClear }: {
  value: number; isAuto: boolean; color: string;
  onSave: (v: number) => void; onClear: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState("");
  const ref = useRef<HTMLInputElement>(null);

  function start() {
    setDraft(value === 0 ? "" : String(value));
    setEditing(true);
    setTimeout(() => ref.current?.select(), 0);
  }
  function commit() {
    const v = draft.trim();
    if (v === "" && isAuto) onClear();
    else onSave(parseFloat(v.replace(/[^0-9.]/g, "")) || 0);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={ref} type="number" value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        className="w-full text-center text-xs font-black bg-white border border-emerald-400 rounded-lg px-1 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-300"
        autoFocus
      />
    );
  }

  return (
    <button
      onClick={start} onFocus={start}
      className="w-full text-center text-xs font-black rounded-lg py-0.5 transition-colors hover:bg-black/5"
      style={{ color: value > 0 ? color : "#e5e7eb" }}
    >
      {value > 0 ? fmt.format(value) : "—"}
    </button>
  );
}

// ── % of revenue badge ────────────────────────────────────────────────────────

function RevPctBadge({ value, revenue }: { value: number; revenue: number }) {
  if (revenue === 0 || value === 0) return null;
  const pct = Math.round((value / revenue) * 100);
  return (
    <span className="inline-block text-xs font-bold text-gray-500 whitespace-nowrap">
      {pct}%
    </span>
  );
}

// ── Row definition ────────────────────────────────────────────────────────────

type RowDef = {
  key: keyof MonthCOGS;
  apiField: string;
  label: string;
  color: string;
  accentBg: string;
  isAuto: boolean;
  overrideKey?: keyof MonthCOGS;
  budgetKey: keyof MonthCOGS;
  showRevPct: boolean;
};

const ROWS: RowDef[] = [
  { key: "revenue",       apiField: "revenue_override", label: "Revenue",       color: "#0284c7", accentBg: "#f0f9ff", isAuto: true,  overrideKey: "revenue_overridden", budgetKey: "budget_revenue",       showRevPct: false },
  { key: "labor",         apiField: "labor_override",   label: "Labor",         color: "#374151", accentBg: "#f9fafb", isAuto: true,  overrideKey: "labor_overridden",   budgetKey: "budget_labor",         showRevPct: true  },
  { key: "job_materials", apiField: "job_materials",    label: "Job Materials", color: "#374151", accentBg: "#fff",    isAuto: false,                                    budgetKey: "budget_job_materials", showRevPct: true  },
  { key: "fuel",          apiField: "fuel_override",    label: "Fuel",          color: "#374151", accentBg: "#f9fafb", isAuto: true,  overrideKey: "fuel_overridden",    budgetKey: "budget_fuel",          showRevPct: true  },
  { key: "equipment",     apiField: "equipment",        label: "Equipment",     color: "#374151", accentBg: "#fff",    isAuto: false,                                    budgetKey: "budget_equipment",     showRevPct: true  },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface CogsDashboardProps {
  division: string;
  divisionLabel: string;
  /** API path for GET/PUT — required unless externalData is provided */
  apiPath?: string;
  /** Pre-loaded data (e.g. from Sheets). Skips the API fetch. */
  externalData?: MonthCOGS[];
  /** When true, shows values as static text (no editing, no year selector) */
  readOnly?: boolean;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function CogsDashboard({ division, divisionLabel, apiPath, externalData, readOnly = false }: CogsDashboardProps) {
  const [year,    setYear]    = useState(CUR_YEAR);
  const [data,    setData]    = useState<MonthCOGS[]>([]);
  const [loading, setLoading] = useState(!externalData);

  const load = useCallback(async () => {
    if (!apiPath) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiPath}?year=${year}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [apiPath, year]);

  useEffect(() => {
    if (externalData) {
      setData(externalData);
      setLoading(false);
    } else {
      load();
    }
  }, [load, externalData]);

  async function handleSave(month: number, field: string, value: number | null) {
    if (!apiPath) return;
    await fetch(apiPath, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ division, year, month, field, value }),
    });
    await load();
  }

  // ── Aggregates ───────────────────────────────────────────────────────────────

  const past = data.filter(r => !isFuture(r.month, year));

  const ytd = past.reduce(
    (acc, r) => ({
      revenue:       acc.revenue       + r.revenue,
      labor:         acc.labor         + r.labor,
      job_materials: acc.job_materials + r.job_materials,
      fuel:          acc.fuel          + r.fuel,
      equipment:     acc.equipment     + r.equipment,
      gp:            acc.gp            + r.gross_profit,
      bRevenue:      acc.bRevenue      + r.budget_revenue,
      bLabor:        acc.bLabor        + r.budget_labor,
      bMat:          acc.bMat          + r.budget_job_materials,
      bFuel:         acc.bFuel         + r.budget_fuel,
      bEquip:        acc.bEquip        + r.budget_equipment,
    }),
    { revenue: 0, labor: 0, job_materials: 0, fuel: 0, equipment: 0, gp: 0, bRevenue: 0, bLabor: 0, bMat: 0, bFuel: 0, bEquip: 0 }
  );

  const ytdMargin   = ytd.revenue > 0 ? ytd.gp / ytd.revenue : null;
  const ytdBudgetGP = ytd.bRevenue - ytd.bLabor - ytd.bMat - ytd.bFuel - ytd.bEquip;
  const ytdBudgetMgn = ytd.bRevenue > 0 ? ytdBudgetGP / ytd.bRevenue : null;

  const ytdByKey: Record<string, number> = {
    revenue: ytd.revenue, labor: ytd.labor, job_materials: ytd.job_materials,
    fuel: ytd.fuel, equipment: ytd.equipment,
  };
  const ytdBudgetByKey: Record<string, number> = {
    revenue: ytd.bRevenue, labor: ytd.bLabor, job_materials: ytd.bMat,
    fuel: ytd.bFuel, equipment: ytd.bEquip,
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ background: "#f0f4f0" }}>

      {/* ── Hero ── */}
      <div className="px-6 py-3" style={{ background: BG }}>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div>
            <div className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-0.5">{divisionLabel}</div>
            <div className="text-xl font-black text-white">Cost of Goods Sold</div>
          </div>
          {/* Show year nav when data comes from an API (apiPath); hide for external/sheets data */}
          {apiPath ? (
            <div className="flex items-center gap-1 bg-white/10 rounded-xl px-2 py-1.5">
              <button onClick={() => setYear(y => y - 1)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">‹</button>
              <span className="text-sm font-bold text-white w-12 text-center">{year}</span>
              <button onClick={() => setYear(y => y + 1)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">›</button>
            </div>
          ) : null}
        </div>

        {/* KPI chips */}
        <div className="grid grid-cols-3 gap-2">
          {[
            {
              label: "YTD Revenue",
              value: fmt.format(ytd.revenue),
              budget: ytd.bRevenue > 0 ? `Budget ${fmt.format(ytd.bRevenue)}` : null,
              color: "#7dd3fc",
            },
            {
              label: "Gross Profit",
              value: fmt.format(ytd.gp),
              budget: ytdBudgetGP !== 0 ? `Budget ${fmt.format(ytdBudgetGP)}` : null,
              color: ytd.gp >= 0 ? "#6ee7b7" : "#fca5a5",
            },
            {
              label: "GP Margin",
              value: ytdMargin !== null ? fmtPct(ytdMargin) : "—",
              budget: ytdBudgetMgn !== null ? `Budget ${fmtPct(ytdBudgetMgn)}` : null,
              color: ytdMargin !== null
                ? ytdMargin >= 0.35 ? "#6ee7b7"
                : ytdMargin >= 0.20 ? "#fde68a"
                : "#fca5a5"
                : "#9ca3af",
            },
          ].map(chip => (
            <div key={chip.label} className="bg-white/10 rounded-xl px-3 py-2 text-center">
              <div className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-0.5">{chip.label}</div>
              <div className="text-xl font-black" style={{ color: chip.color }}>{chip.value}</div>
              {chip.budget && <div className="text-xs text-white/40">{chip.budget}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="p-2">
        {loading ? (
          <div className="text-center py-16 text-sm text-gray-400">Loading…</div>
        ) : (
          <>
            <div className="rounded-2xl overflow-hidden shadow-lg" style={{ border: "1px solid rgba(16,64,32,0.12)" }}>
              <div className="overflow-x-auto">
                <table className="w-full" style={{ minWidth: 740, borderCollapse: "collapse" }}>

                  {/* ── Month headers ── */}
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left" style={{ background: BG, width: 96, borderRight: "1px solid rgba(255,255,255,0.08)" }}>
                        <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">Category</span>
                      </th>
                      {MONTHS.map((m, i) => {
                        const future = isFuture(i + 1, year);
                        const isCurr = !future && year === CUR_YEAR && i + 1 === CUR_MONTH;
                        return (
                          <th
                            key={m}
                            className="py-2 text-center"
                            style={{ background: isCurr ? "#fefce8" : BG, minWidth: 52, opacity: future ? 0.4 : 1, borderRight: isCurr ? "2px solid #ca8a04" : "1px solid rgba(255,255,255,0.15)", borderBottom: isCurr ? "2px solid #ca8a04" : undefined, borderLeft: isCurr ? "2px solid #ca8a04" : undefined, borderTop: isCurr ? "2px solid #ca8a04" : undefined }}
                          >
                            <span className={`font-bold uppercase tracking-wider ${isCurr ? "text-sm text-gray-900" : "text-xs text-white/70"}`}>{m}</span>
                          </th>
                        );
                      })}
                      <th className="py-2 text-center" style={{ background: BG_FOOT_TOT, minWidth: 90 }}>
                        <span className="text-xs font-bold text-white/50 uppercase tracking-widest">YTD</span>
                      </th>
                    </tr>
                  </thead>

                  {/* ── Data rows ── */}
                  <tbody>
                    {ROWS.map((row, ri) => {
                      const cellBg = ri % 2 === 0 ? "#ffffff" : "#f8fafb";
                      const ytdVal = ytdByKey[row.key as string];
                      const ytdBud = ytdBudgetByKey[row.key as string];
                      const isRev  = row.key === "revenue";

                      return (
                        <tr key={row.key}>

                          {/* Label */}
                          <td
                            className="px-3 py-2"
                            style={{ background: row.accentBg, borderRight: "1px solid #d1d5db", borderBottom: "1px solid #d1d5db" }}
                          >
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: isRev ? "#0284c7" : "#10b981" }} />
                              <span className="text-xs font-black text-gray-700 whitespace-nowrap">{row.label}</span>
                            </div>
                          </td>

                          {/* Month cells */}
                          {data.map(r => {
                            const future    = isFuture(r.month, year);
                            const isCurrCol = !future && year === CUR_YEAR && r.month === CUR_MONTH;
                            const actualVal = r[row.key] as number;
                            const budgetVal = r[row.budgetKey] as number;
                            const colBg     = isCurrCol ? "#fefce8" : cellBg;

                            return (
                              <td
                                key={r.month}
                                className="px-1 py-2 text-center"
                                style={{ background: colBg, borderBottom: "1px solid #d1d5db", borderRight: "1px solid #d1d5db", opacity: future ? 0.35 : 1, verticalAlign: "top" }}
                              >
                                {future ? (
                                  <div className="py-0.5">
                                    {budgetVal > 0
                                      ? <span className="text-xs font-semibold text-gray-300">{fmt.format(budgetVal)}</span>
                                      : <span className="text-xs text-gray-200">—</span>
                                    }
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center gap-1">
                                    {readOnly ? (
                                      <div className="text-center text-xs font-black py-0.5" style={{ color: actualVal > 0 ? (isCurrCol && row.key !== "revenue" ? "#111827" : row.color) : "#e5e7eb" }}>
                                        {actualVal !== 0 ? fmt.format(actualVal) : "—"}
                                      </div>
                                    ) : (
                                      <ActualCell
                                        value={actualVal}
                                        isAuto={row.isAuto}
                                        color={isCurrCol && row.key !== "revenue" ? "#111827" : row.color}
                                        onSave={v  => handleSave(r.month, row.apiField, v)}
                                        onClear={() => handleSave(r.month, row.apiField, null)}
                                      />
                                    )}
                                    {budgetVal > 0 && (
                                      <span className={`text-xs font-medium ${isCurrCol ? "text-gray-600" : "text-gray-400"}`}>{fmt.format(budgetVal)}</span>
                                    )}
                                    {row.showRevPct && (
                                      <RevPctBadge value={actualVal} revenue={r.revenue} />
                                    )}
                                  </div>
                                )}
                              </td>
                            );
                          })}

                          {/* YTD */}
                          <td
                            className="px-2 py-1.5 text-center"
                            style={{ background: "#f0fdf4", borderBottom: "1px solid #d1d5db", borderLeft: "1px solid #d1d5db" }}
                          >
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-xs font-black" style={{ color: ytdVal > 0 ? row.color : "#e5e7eb" }}>
                                {ytdVal > 0 ? fmt.format(ytdVal) : "—"}
                              </span>
                              {ytdBud > 0 && (
                                <span className="text-xs text-gray-400 font-medium">{fmt.format(ytdBud)}</span>
                              )}
                              {row.showRevPct && (
                                <RevPctBadge value={ytdVal} revenue={ytd.revenue} />
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* ── Footer ── */}
                  <tfoot>

                    {/* Gross Profit */}
                    <tr>
                      <td className="px-3 py-2.5" style={{ background: BG_FOOT, borderRight: "1px solid rgba(255,255,255,0.06)", borderTop: "2px solid rgba(255,255,255,0.08)" }}>
                        <span className="text-sm font-black text-emerald-300 uppercase tracking-wider">Gross Profit</span>
                      </td>
                      {data.map(r => {
                        const future    = isFuture(r.month, year);
                        const isCurrCol = !future && year === CUR_YEAR && r.month === CUR_MONTH;
                        const bGP    = r.budget_revenue - r.budget_labor - r.budget_job_materials - r.budget_fuel - r.budget_equipment;
                        const hasAny = r.revenue > 0 || r.gross_profit !== 0;
                        return (
                          <td
                            key={r.month}
                            className="px-2 py-2.5 text-center"
                            style={{ background: isCurrCol ? "#1a4a1a" : BG_FOOT, opacity: future ? 0.35 : 1, borderTop: "2px solid rgba(255,255,255,0.08)", borderRight: "1px solid rgba(255,255,255,0.2)" }}
                          >
                            <div className="flex flex-col items-center gap-1">
                              {!future && (
                                <span className={`text-sm font-black ${r.gross_profit > 0 ? "text-emerald-300" : r.gross_profit < 0 ? "text-red-400" : "text-white/20"}`}>
                                  {hasAny ? fmt.format(r.gross_profit) : "—"}
                                </span>
                              )}
                              {bGP !== 0 && <span className="text-xs text-white/40 font-medium">{fmt.format(bGP)}</span>}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-2 py-2.5 text-center" style={{ background: BG_FOOT_TOT, borderTop: "2px solid rgba(255,255,255,0.08)" }}>
                        <div className="flex flex-col items-center gap-1">
                          <span className={`text-sm font-black ${ytd.gp > 0 ? "text-emerald-300" : ytd.gp < 0 ? "text-red-400" : "text-white/25"}`}>
                            {ytd.revenue > 0 ? fmt.format(ytd.gp) : "—"}
                          </span>
                          {ytdBudgetGP !== 0 && <span className="text-xs text-white/40">{fmt.format(ytdBudgetGP)}</span>}
                        </div>
                      </td>
                    </tr>

                    {/* GP Margin */}
                    <tr>
                      <td className="px-3 py-2" style={{ background: BG_FOOT, borderRight: "1px solid rgba(255,255,255,0.06)", borderTop: "1px solid rgba(255,255,255,0.25)" }}>
                        <span className="text-xs font-black text-emerald-300 uppercase tracking-wider">GP Margin</span>
                      </td>
                      {data.map(r => {
                        const future    = isFuture(r.month, year);
                        const isCurrCol = !future && year === CUR_YEAR && r.month === CUR_MONTH;
                        return (
                          <td
                            key={r.month}
                            className="px-1.5 py-3 text-center"
                            style={{ background: isCurrCol ? "#1a4a1a" : BG_FOOT, opacity: future ? 0.35 : 1, borderRight: "1px solid rgba(255,255,255,0.2)", borderTop: "1px solid rgba(255,255,255,0.25)" }}
                          >
                            {!future && r.margin_pct !== null && (
                              <span
                                className={`inline-block text-xs font-black px-2 py-0.5 rounded-full ${marginTextColor(r.margin_pct)}`}
                                style={{ background: marginPillBg(r.margin_pct) }}
                              >
                                {fmtPct(r.margin_pct)}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-1 py-2 text-center" style={{ background: BG_FOOT_TOT, borderTop: "1px solid rgba(255,255,255,0.25)" }}>
                        {ytdMargin !== null && (
                          <span
                            className={`inline-block text-xs font-black px-2 py-0.5 rounded-full ${marginTextColor(ytdMargin)}`}
                            style={{ background: marginPillBg(ytdMargin) }}
                          >
                            {fmtPct(ytdMargin)}
                          </span>
                        )}
                      </td>
                    </tr>

                  </tfoot>
                </table>
              </div>
            </div>

            <p className="text-center text-xs text-gray-400 mt-3">
              {readOnly
                ? "Data sourced from performance sheet · Gray = budget · % = cost as % of revenue"
                : "Click any actual value to edit · Leave blank on auto-calculated fields to revert to auto · Gray = budget · % = cost as % of revenue"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
