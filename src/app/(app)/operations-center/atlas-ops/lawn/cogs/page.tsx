"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

type MonthCOGS = {
  month: number;
  revenue: number; labor: number; job_materials: number; fuel: number; equipment: number;
  gross_profit: number; margin_pct: number | null;
  revenue_auto: number; labor_auto: number; fuel_auto: number;
  revenue_overridden: boolean; labor_overridden: boolean; fuel_overridden: boolean;
  budget_revenue: number; budget_labor: number; budget_job_materials: number;
  budget_fuel: number; budget_equipment: number;
};

type FieldKey = "revenue" | "labor" | "job_materials" | "fuel" | "equipment";

type FieldDef = {
  key: FieldKey;
  apiField: string;
  label: string;
  isAuto: boolean;
  overrideKey?: keyof MonthCOGS;
  hasPercent: boolean;
};

const FIELDS: FieldDef[] = [
  { key: "revenue",       apiField: "revenue_override", label: "Revenue",       isAuto: true,  overrideKey: "revenue_overridden", hasPercent: false },
  { key: "job_materials", apiField: "job_materials",    label: "Job Materials", isAuto: false,                                     hasPercent: true  },
  { key: "labor",         apiField: "labor_override",   label: "Labor",         isAuto: true,  overrideKey: "labor_overridden",   hasPercent: true  },
  { key: "fuel",          apiField: "fuel_override",    label: "Fuel",          isAuto: true,  overrideKey: "fuel_overridden",    hasPercent: true  },
  { key: "equipment",     apiField: "equipment",        label: "Equipment",     isAuto: false,                                     hasPercent: true  },
];

const MONTHS  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmt     = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtPct  = (n: number) => `${(n * 100).toFixed(0)}%`;

const BG            = "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)";
const BG_FOOT       = "#0f3a1e";
const BG_FOOT_TOTAL = "#0a2010";

// ── Editable actual cell ───────────────────────────────────────────────────────

function ActualCell({ value, isAuto, isOverridden, isRevenue, onSave, onClear }: {
  value: number; isAuto: boolean; isOverridden: boolean; isRevenue: boolean;
  onSave: (v: number) => void; onClear: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(value === 0 ? "" : String(value));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }
  function commit() {
    const v = draft.trim();
    if (v === "" && isAuto) { onClear(); }
    else { onSave(parseFloat(v.replace(/[^0-9.]/g, "")) || 0); }
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef} type="number" value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        placeholder={isAuto ? "auto" : "0"}
        className="w-full text-center text-xs font-semibold bg-white border border-emerald-400 rounded px-1 py-0.5 focus:outline-none"
        autoFocus
      />
    );
  }

  return (
    <div className="relative group">
      <button
        onClick={startEdit} onFocus={startEdit}
        className={`w-full text-center text-xs rounded py-0.5 transition-colors ${
          value > 0
            ? `font-semibold hover:bg-emerald-50 ${isRevenue ? (isOverridden ? "text-amber-600" : "text-sky-700") : (isOverridden ? "text-amber-600" : "text-gray-800")}`
            : "text-gray-300 hover:bg-gray-50 hover:text-gray-500"
        }`}
      >
        {value > 0 ? fmt.format(value) : "—"}
      </button>
      {isAuto && !isOverridden && value > 0 &&
        <span className="absolute top-0 right-0.5 text-[8px] text-gray-300 pointer-events-none">auto</span>}
      {isOverridden &&
        <button onMouseDown={e => { e.stopPropagation(); onClear(); }}
          className="absolute top-0 right-0.5 text-[9px] text-amber-400 hover:text-amber-600" title="Revert">↺</button>}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function COGSPage() {
  const [year,    setYear]    = useState(new Date().getFullYear());
  const [rows,    setRows]    = useState<MonthCOGS[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/operations-center/atlas-ops/lawn/cogs?year=${year}&division=lawn`);
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }, [year]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(month: number, field: FieldDef, value: number | null) {
    setRows(prev => prev.map(r => {
      if (r.month !== month) return r;
      const u = { ...r };
      if (value === null) {
        if (field.key === "revenue")       { u.revenue       = r.revenue_auto; u.revenue_overridden = false; }
        if (field.key === "labor")         { u.labor         = r.labor_auto;   u.labor_overridden   = false; }
        if (field.key === "fuel")          { u.fuel          = r.fuel_auto;    u.fuel_overridden    = false; }
        if (field.key === "job_materials") { u.job_materials = 0; }
        if (field.key === "equipment")     { u.equipment     = 0; }
      } else {
        (u as any)[field.key] = value;
        if (field.overrideKey) (u as any)[field.overrideKey] = true;
      }
      u.gross_profit = u.revenue - u.labor - u.job_materials - u.fuel - u.equipment;
      u.margin_pct   = u.revenue > 0 ? u.gross_profit / u.revenue : null;
      return u;
    }));
    await fetch("/api/operations-center/atlas-ops/lawn/cogs", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ division: "lawn", year, month, field: field.apiField, value }),
    });
    if (field.key === "labor" || field.key === "revenue") load();
  }

  const today    = new Date();
  const curYear  = today.getFullYear();
  const curMonth = today.getMonth() + 1;

  function isFuture(month: number): boolean {
    if (year < curYear) return false;
    if (year > curYear) return true;
    return month > curMonth;
  }

  // Annual totals — actuals only for past/current months
  const totals = rows.reduce((acc, r) => {
    const f = isFuture(r.month);
    return {
      revenue:       acc.revenue       + (f ? 0 : r.revenue),
      labor:         acc.labor         + (f ? 0 : r.labor),
      job_materials: acc.job_materials + (f ? 0 : r.job_materials),
      fuel:          acc.fuel          + (f ? 0 : r.fuel),
      equipment:     acc.equipment     + (f ? 0 : r.equipment),
      gross_profit:  acc.gross_profit  + (f ? 0 : r.gross_profit),
      budget_revenue:       acc.budget_revenue       + r.budget_revenue,
      budget_labor:         acc.budget_labor         + r.budget_labor,
      budget_job_materials: acc.budget_job_materials + r.budget_job_materials,
      budget_fuel:          acc.budget_fuel          + r.budget_fuel,
      budget_equipment:     acc.budget_equipment     + r.budget_equipment,
    };
  }, { revenue: 0, labor: 0, job_materials: 0, fuel: 0, equipment: 0, gross_profit: 0,
       budget_revenue: 0, budget_labor: 0, budget_job_materials: 0, budget_fuel: 0, budget_equipment: 0 });

  const totalBudgetGP     = totals.budget_revenue - totals.budget_labor - totals.budget_job_materials - totals.budget_fuel - totals.budget_equipment;
  const totalMargin       = totals.revenue > 0 ? totals.gross_profit / totals.revenue : null;
  const totalBudgetMargin = totals.budget_revenue > 0 ? totalBudgetGP / totals.budget_revenue : null;

  function profitColor(p: number) {
    if (p > 0) return "text-emerald-300"; if (p < 0) return "text-red-400"; return "text-white/20";
  }
  function marginColor(m: number | null) {
    if (m === null) return "text-white/20";
    if (m >= 0.35) return "text-emerald-400"; if (m >= 0.20) return "text-yellow-400"; return "text-red-400";
  }

  const isCurYear = year === curYear;

  function cellBg(month: number) {
    if (month === curMonth && isCurYear) return "#f0fdf4";
    if (isFuture(month)) return "#fafafa";
    return undefined; // inherit from row
  }

  return (
    <div className="min-h-screen" style={{ background: "#f0f4f0" }}>

      {/* ── Hero ── */}
      <div className="px-6 py-5" style={{ background: BG }}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">Lawn</span>
            </div>
            <div className="text-2xl font-black text-white">Cost of Goods Sold</div>
          </div>
          <div className="flex items-center gap-1 bg-white/10 rounded-xl px-2 py-1.5">
            <button onClick={() => setYear(y => y - 1)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">‹</button>
            <span className="text-sm font-bold text-white w-12 text-center">{year}</span>
            <button onClick={() => setYear(y => y + 1)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">›</button>
          </div>
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="text-center py-16 text-sm text-gray-400">Loading…</div>
        ) : (
          <>
            <div className="rounded-2xl overflow-hidden shadow-md" style={{ border: "1px solid rgba(16,64,32,0.12)" }}>
              <div className="overflow-x-auto">
                <table className="w-full" style={{ minWidth: 1000, borderCollapse: "collapse" }}>

                  {/* ── Month headers ── */}
                  <thead>
                    <tr>
                      <th className="px-3 py-3 text-left border border-emerald-900/50" style={{ background: BG, width: 96 }}>
                        <span className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">Category</span>
                      </th>
                      <th className="px-2 py-3 border border-emerald-900/50" style={{ background: BG, width: 56 }} />
                      {MONTHS.map((m, i) => {
                        const isCur = i + 1 === curMonth && isCurYear;
                        return (
                          <th key={m} className="py-3 text-center border border-emerald-900/50"
                            style={{ background: isCur ? "#0f4a25" : BG, minWidth: 64 }}>
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${isCur ? "text-emerald-300" : "text-white/70"}`}>{m}</span>
                            {isCur && <span className="block w-1 h-1 rounded-full bg-emerald-400 mx-auto mt-0.5" />}
                          </th>
                        );
                      })}
                      <th className="px-2 py-3 text-center border border-emerald-900/50" style={{ background: BG_FOOT_TOTAL, minWidth: 72 }}>
                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Total</span>
                      </th>
                      <th className="px-2 py-3 text-center border border-emerald-900/50" style={{ background: BG_FOOT_TOTAL, width: 40 }}>
                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">%</span>
                      </th>
                    </tr>
                  </thead>

                  {/* ── Data rows ── */}
                  <tbody>
                    {FIELDS.map((f, fi) => {
                      const isRevenue = f.key === "revenue";
                      const rowCount  = f.hasPercent ? 3 : 2;
                      const bg        = fi % 2 === 0 ? "#fff" : "#f9fafb";
                      const isLast    = fi === FIELDS.length - 1;
                      const sepBorder = `border-b ${isLast ? "border-gray-300" : "border-gray-200"}`;
                      const annualActual = totals[f.key as keyof typeof totals] as number;
                      const annualBudget = totals[`budget_${f.key}` as keyof typeof totals] as number;
                      const annualPct    = !isRevenue && totals.revenue > 0 ? annualActual / totals.revenue : null;
                      const annualBudPct = !isRevenue && totals.budget_revenue > 0 ? annualBudget / totals.budget_revenue : null;

                      // Shared cell style — right border only for column sep, bottom only on last sub-row
                      const tdBase   = "border-r border-gray-100";
                      const tdLast   = `border-r border-gray-100 ${sepBorder}`;

                      return (
                        <React.Fragment key={f.key}>

                          {/* ── ACTUAL row ── */}
                          <tr style={{ background: bg }}>
                            <td rowSpan={rowCount} className={`px-3 py-2 border-r border-gray-200 align-middle ${sepBorder}`} style={{ background: bg }}>
                              <div className="flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRevenue ? "bg-sky-400" : "bg-emerald-400"}`} />
                                <span className={`text-[11px] font-bold ${isRevenue ? "text-sky-700" : "text-gray-700"}`}>{f.label}</span>
                              </div>
                              {f.key === "fuel" && (
                                <div className="text-[9px] text-gray-400 mt-0.5 pl-3">formula est.</div>
                              )}
                            </td>
                            <td className={`px-2 py-1 ${tdBase} text-[10px] font-semibold text-gray-500`} style={{ background: bg }}>
                              Actual
                            </td>
                            {rows.map(row => {
                              const future = isFuture(row.month);
                              const actual = row[f.key] as number;
                              const isOver = f.overrideKey ? (row[f.overrideKey] as boolean) : false;
                              const bg2    = cellBg(row.month) ?? bg;
                              return (
                                <td key={row.month} className={`px-1 py-0.5 ${tdBase}`} style={{ background: bg2 }}>
                                  {!future && (
                                    <ActualCell
                                      value={actual} isAuto={f.isAuto} isOverridden={isOver} isRevenue={isRevenue}
                                      onSave={v => handleSave(row.month, f, v)}
                                      onClear={() => handleSave(row.month, f, null)}
                                    />
                                  )}
                                </td>
                              );
                            })}
                            <td className={`px-2 py-1 text-center ${tdBase}`} style={{ background: "#f0fdf4" }}>
                              <span className={`text-xs font-bold ${annualActual > 0 ? (isRevenue ? "text-sky-700" : "text-gray-800") : "text-gray-300"}`}>
                                {annualActual > 0 ? fmt.format(annualActual) : "—"}
                              </span>
                            </td>
                            <td className="px-2 py-1 text-center" style={{ background: "#f0fdf4" }}>
                              {!isRevenue && annualPct !== null && (
                                <span className="text-xs font-semibold text-gray-600">{fmtPct(annualPct)}</span>
                              )}
                            </td>
                          </tr>

                          {/* ── BUDGETED row ── */}
                          <tr style={{ background: bg }}>
                            <td className={`px-2 py-0.5 ${f.hasPercent ? tdBase : tdLast} text-[10px] text-gray-400 italic`} style={{ background: bg }}>
                              Budgeted
                            </td>
                            {rows.map(row => {
                              const budget = row[`budget_${f.key}` as keyof MonthCOGS] as number;
                              const bg2    = cellBg(row.month) ?? bg;
                              return (
                                <td key={row.month} className={`px-1 py-0.5 text-center ${f.hasPercent ? tdBase : tdLast}`} style={{ background: bg2 }}>
                                  <span className={`text-[11px] ${budget > 0 ? (isRevenue ? "text-sky-600/60" : "text-gray-400") : "text-gray-200"}`}>
                                    {budget > 0 ? fmt.format(budget) : ""}
                                  </span>
                                </td>
                              );
                            })}
                            <td className={`px-2 py-0.5 text-center ${f.hasPercent ? tdBase : tdLast}`} style={{ background: "#f0fdf4" }}>
                              <span className={`text-[11px] ${annualBudget > 0 ? (isRevenue ? "text-sky-600/60" : "text-gray-400") : "text-gray-200"}`}>
                                {annualBudget > 0 ? fmt.format(annualBudget) : "—"}
                              </span>
                            </td>
                            <td className={`px-2 py-0.5 text-center ${f.hasPercent ? "" : sepBorder}`} style={{ background: "#f0fdf4" }}>
                              {!isRevenue && annualBudPct !== null && (
                                <span className="text-[10px] text-gray-400">{fmtPct(annualBudPct)}</span>
                              )}
                            </td>
                          </tr>

                          {/* ── % row ── */}
                          {f.hasPercent && (
                            <tr style={{ background: bg }}>
                              <td className={`px-2 py-0.5 ${tdLast} text-[10px] text-gray-400`} style={{ background: bg }}>
                                %
                              </td>
                              {rows.map(row => {
                                const future = isFuture(row.month);
                                const actual = row[f.key] as number;
                                const p      = !future && row.revenue > 0 ? actual / row.revenue : null;
                                const bg2    = cellBg(row.month) ?? bg;
                                return (
                                  <td key={row.month} className={`px-1 py-0.5 text-center ${tdLast}`} style={{ background: bg2 }}>
                                    {p !== null && <span className="text-[10px] text-gray-500">{fmtPct(p)}</span>}
                                  </td>
                                );
                              })}
                              <td className={`px-2 py-0.5 ${tdLast}`} style={{ background: "#f0fdf4" }} />
                              <td className={`px-2 py-0.5 ${sepBorder}`} style={{ background: "#f0fdf4" }} />
                            </tr>
                          )}

                        </React.Fragment>
                      );
                    })}
                  </tbody>

                  {/* ── Profit footer ── */}
                  <tfoot>

                    {/* PROFIT ACTUAL */}
                    <tr>
                      <td rowSpan={3} className="px-3 py-2 border border-emerald-900/50 align-middle" style={{ background: BG_FOOT }}>
                        <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">Profit</span>
                      </td>
                      <td className="px-2 py-1 border border-emerald-900/50 text-[10px] font-semibold text-emerald-300/70" style={{ background: BG_FOOT }}>
                        Actual
                      </td>
                      {rows.map(row => {
                        const future = isFuture(row.month);
                        const isCur  = row.month === curMonth && isCurYear;
                        return (
                          <td key={row.month} className="px-1 py-0.5 text-center border border-emerald-900/50"
                            style={{ background: isCur ? "#0d3d1f" : BG_FOOT }}>
                            {!future && (row.revenue > 0 || row.gross_profit !== 0) && (
                              <span className={`text-xs font-bold ${profitColor(row.gross_profit)}`}>
                                {fmt.format(row.gross_profit)}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1 text-center border border-emerald-900/50" style={{ background: BG_FOOT_TOTAL }}>
                        <span className={`text-xs font-bold ${profitColor(totals.revenue > 0 ? totals.gross_profit : 0)}`}>
                          {totals.revenue > 0 ? fmt.format(totals.gross_profit) : "—"}
                        </span>
                      </td>
                      <td className="px-2 py-1 text-center border border-emerald-900/50" style={{ background: BG_FOOT_TOTAL }}>
                        <span className={`text-xs font-bold ${marginColor(totalMargin)}`}>
                          {totalMargin !== null ? fmtPct(totalMargin) : "—"}
                        </span>
                      </td>
                    </tr>

                    {/* PROFIT BUDGETED */}
                    <tr>
                      <td className="px-2 py-1 border border-emerald-900/50 text-[10px] text-emerald-300/40 italic" style={{ background: BG_FOOT }}>
                        Budgeted
                      </td>
                      {rows.map(row => {
                        const budgetGP = row.budget_revenue - row.budget_labor - row.budget_job_materials - row.budget_fuel - row.budget_equipment;
                        const isCur    = row.month === curMonth && isCurYear;
                        return (
                          <td key={row.month} className="px-1 py-0.5 text-center border border-emerald-900/50"
                            style={{ background: isCur ? "#0d3d1f" : BG_FOOT }}>
                            {budgetGP !== 0 && (
                              <span className={`text-[11px] ${budgetGP > 0 ? "text-emerald-400/50" : "text-red-400/50"}`}>
                                {fmt.format(budgetGP)}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1 text-center border border-emerald-900/50" style={{ background: BG_FOOT_TOTAL }}>
                        <span className={`text-[11px] ${totalBudgetGP > 0 ? "text-emerald-400/50" : totalBudgetGP < 0 ? "text-red-400/50" : "text-white/10"}`}>
                          {totalBudgetGP !== 0 ? fmt.format(totalBudgetGP) : "—"}
                        </span>
                      </td>
                      <td className="px-2 py-1 text-center border border-emerald-900/50" style={{ background: BG_FOOT_TOTAL }}>
                        <span className="text-[10px] text-white/30">
                          {totalBudgetMargin !== null ? fmtPct(totalBudgetMargin) : "—"}
                        </span>
                      </td>
                    </tr>

                    {/* PROFIT % */}
                    <tr>
                      <td className="px-2 py-0.5 border border-emerald-900/50 text-[10px] text-emerald-300/40" style={{ background: BG_FOOT }}>
                        %
                      </td>
                      {rows.map(row => {
                        const future = isFuture(row.month);
                        const isCur  = row.month === curMonth && isCurYear;
                        const m      = !future ? row.margin_pct : null;
                        return (
                          <td key={row.month} className="px-1 py-0.5 text-center border border-emerald-900/50"
                            style={{ background: isCur ? "#0d3d1f" : BG_FOOT }}>
                            {m !== null && (
                              <span className={`text-[10px] font-semibold ${marginColor(m)}`}>{fmtPct(m)}</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="border border-emerald-900/50" style={{ background: BG_FOOT_TOTAL }} />
                      <td className="border border-emerald-900/50" style={{ background: BG_FOOT_TOTAL }} />
                    </tr>

                  </tfoot>
                </table>
              </div>
            </div>

            <p className="text-center text-xs text-gray-400 mt-3">
              Click any actual cell to edit · Blank reverts auto fields · Amber = manual override · ↺ revert · Fuel estimated from labor ratio
            </p>
          </>
        )}
      </div>
    </div>
  );
}
