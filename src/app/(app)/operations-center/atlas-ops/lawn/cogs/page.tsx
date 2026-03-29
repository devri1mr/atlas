"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

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
  key: FieldKey; apiField: string; label: string;
  isAuto: boolean; overrideKey?: keyof MonthCOGS;
};

const FIELDS: FieldDef[] = [
  { key: "revenue",       apiField: "revenue_override", label: "Revenue",       isAuto: true,  overrideKey: "revenue_overridden" },
  { key: "labor",         apiField: "labor_override",   label: "Labor",         isAuto: true,  overrideKey: "labor_overridden"   },
  { key: "job_materials", apiField: "job_materials",    label: "Job Materials", isAuto: false },
  { key: "fuel",          apiField: "fuel_override",    label: "Fuel",          isAuto: true,  overrideKey: "fuel_overridden"    },
  { key: "equipment",     apiField: "equipment",        label: "Equipment",     isAuto: false },
];

const MONTHS      = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmt    = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtPct = (n: number) => `${(n * 100).toFixed(0)}%`;
const BG     = "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)";

// ── Inline editable cell ───────────────────────────────────────────────────────

function InlineEdit({ value, isAuto, onSave, onClear }: {
  value: number; isAuto: boolean; onSave: (v: number) => void; onClear: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState("");
  const ref = useRef<HTMLInputElement>(null);

  function start() { setDraft(value === 0 ? "" : String(value)); setEditing(true); setTimeout(() => ref.current?.select(), 0); }
  function commit() {
    const v = draft.trim();
    if (v === "" && isAuto) onClear(); else onSave(parseFloat(v.replace(/[^0-9.]/g, "")) || 0);
    setEditing(false);
  }

  if (editing) return (
    <input ref={ref} type="number" value={draft} autoFocus
      onChange={e => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className="w-full text-center text-xs font-semibold bg-white border border-emerald-400 rounded px-1 py-0.5 focus:outline-none"
    />
  );

  return (
    <button onClick={start} onFocus={start}
      className={`w-full text-center text-xs font-semibold rounded py-0.5 hover:bg-black/5 transition-colors ${value > 0 ? "text-gray-900" : "text-gray-300"}`}>
      {value > 0 ? fmt.format(value) : "—"}
    </button>
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
  const isCurYear = year === curYear;

  function isFuture(month: number) {
    if (year < curYear) return false;
    if (year > curYear) return true;
    return month > curMonth;
  }

  // Annual totals (actuals = past/current only)
  const totals = rows.reduce((acc, r) => {
    const f = isFuture(r.month);
    return {
      revenue:              acc.revenue       + (f ? 0 : r.revenue),
      labor:                acc.labor         + (f ? 0 : r.labor),
      job_materials:        acc.job_materials + (f ? 0 : r.job_materials),
      fuel:                 acc.fuel          + (f ? 0 : r.fuel),
      equipment:            acc.equipment     + (f ? 0 : r.equipment),
      gross_profit:         acc.gross_profit  + (f ? 0 : r.gross_profit),
      budget_revenue:       acc.budget_revenue       + r.budget_revenue,
      budget_labor:         acc.budget_labor         + r.budget_labor,
      budget_job_materials: acc.budget_job_materials + r.budget_job_materials,
      budget_fuel:          acc.budget_fuel          + r.budget_fuel,
      budget_equipment:     acc.budget_equipment     + r.budget_equipment,
    };
  }, { revenue:0,labor:0,job_materials:0,fuel:0,equipment:0,gross_profit:0,
       budget_revenue:0,budget_labor:0,budget_job_materials:0,budget_fuel:0,budget_equipment:0 });

  const totalBudgetGP = totals.budget_revenue - totals.budget_labor - totals.budget_job_materials - totals.budget_fuel - totals.budget_equipment;
  const totalMargin   = totals.revenue > 0 ? totals.gross_profit / totals.revenue : null;

  return (
    <div className="min-h-screen" style={{ background: "#f0f4f0" }}>

      {/* ── Hero ── */}
      <div className="px-6 py-5" style={{ background: BG }}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">Lawn</span>
            <div className="text-2xl font-black text-white mt-0.5">Cost of Goods Sold</div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/operations-center/settings/budgets"
              className="text-xs text-white/50 hover:text-white transition-colors font-medium">
              Edit Budgets →
            </Link>
            <div className="flex items-center gap-1 bg-white/10 rounded-xl px-2 py-1.5">
              <button onClick={() => setYear(y => y - 1)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">‹</button>
              <span className="text-sm font-bold text-white w-12 text-center">{year}</span>
              <button onClick={() => setYear(y => y + 1)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">›</button>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-sm text-gray-400">Loading…</div>
      ) : (
        <div className="p-5 space-y-6">

          {/* ── Annual grid ── */}
          <div>
            <div className="rounded-2xl overflow-hidden shadow-sm" style={{ border: "1px solid rgba(16,64,32,0.12)" }}>
              <div className="overflow-x-auto">
                <table className="w-full" style={{ minWidth: 900, borderCollapse: "collapse" }}>

                  {/* Header */}
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left border-b border-emerald-900/40 text-xs font-semibold text-white/40 uppercase tracking-widest" style={{ background: BG, width: 120 }}>
                        Category
                      </th>
                      {MONTHS.map((m, i) => {
                        const isCur = i + 1 === curMonth && isCurYear;
                        return (
                          <th key={m} className="py-3 text-center border-b border-emerald-900/40 text-xs font-bold uppercase tracking-wide"
                            style={{ background: isCur ? "#0f4a25" : BG, minWidth: 68, color: isCur ? "#6ee7b7" : "rgba(255,255,255,0.6)" }}>
                            {m}
                            {isCur && <span className="block w-1 h-1 rounded-full bg-emerald-400 mx-auto mt-0.5" />}
                          </th>
                        );
                      })}
                      <th className="px-3 py-3 text-center border-b border-emerald-900/40 text-xs font-bold text-white/40 uppercase tracking-widest" style={{ background: "#0a2010", minWidth: 76 }}>
                        YTD
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {FIELDS.map((f, fi) => {
                      const isRevenue  = f.key === "revenue";
                      const bg         = fi % 2 === 0 ? "#ffffff" : "#f9fafb";
                      const annualActual = totals[f.key as keyof typeof totals] as number;
                      const annualBudget = totals[`budget_${f.key}` as keyof typeof totals] as number;
                      const annualPct    = !isRevenue && totals.revenue > 0 ? annualActual / totals.revenue : null;

                      return (
                        <tr key={f.key} style={{ background: bg }}>
                          {/* Category label */}
                          <td className="px-4 py-3 border-b border-gray-100" style={{ background: bg }}>
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${isRevenue ? "bg-sky-400" : "bg-emerald-400"}`} />
                              <span className="text-xs font-bold text-gray-800">{f.label}</span>
                            </div>
                            {f.key === "fuel" && <div className="text-[10px] text-gray-400 mt-0.5 pl-4">formula est.</div>}
                          </td>

                          {/* Month cells */}
                          {rows.map(row => {
                            const future = isFuture(row.month);
                            const actual = row[f.key] as number;
                            const budget = row[`budget_${f.key}` as keyof MonthCOGS] as number;
                            const pct    = !future && !isRevenue && row.revenue > 0 ? actual / row.revenue : null;
                            const isCur  = row.month === curMonth && isCurYear;
                            const cellBg = isCur ? "#f0fdf4" : future ? "#fafafa" : bg;

                            return (
                              <td key={row.month} className="px-1.5 py-1.5 border-b border-gray-100 align-top"
                                style={{ background: cellBg }}>
                                {/* Actual — editable, blank for future */}
                                {future ? null : (
                                  <InlineEdit value={actual} isAuto={f.isAuto}
                                    onSave={v => handleSave(row.month, f, v)}
                                    onClear={() => handleSave(row.month, f, null)}
                                  />
                                )}
                                {/* % of revenue */}
                                {pct !== null && (
                                  <div className="text-center text-[10px] text-gray-400 leading-none mt-0.5">{fmtPct(pct)}</div>
                                )}
                                {/* Budget */}
                                {budget > 0 && (
                                  <div className={`text-center text-[10px] leading-none mt-0.5 ${future ? "text-gray-400" : "text-gray-300"}`}>
                                    {fmt.format(budget)}
                                  </div>
                                )}
                              </td>
                            );
                          })}

                          {/* YTD */}
                          <td className="px-3 py-1.5 border-b border-gray-100 align-top" style={{ background: "#f0fdf4" }}>
                            <div className={`text-center text-xs font-bold ${annualActual > 0 ? "text-gray-900" : "text-gray-300"}`}>
                              {annualActual > 0 ? fmt.format(annualActual) : "—"}
                            </div>
                            {annualPct !== null && (
                              <div className="text-center text-[10px] text-gray-400 leading-none mt-0.5">{fmtPct(annualPct)}</div>
                            )}
                            {annualBudget > 0 && (
                              <div className="text-center text-[10px] text-gray-300 leading-none mt-0.5">{fmt.format(annualBudget)}</div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* Footer */}
                  <tfoot>
                    {/* Gross Profit */}
                    <tr>
                      <td className="px-4 py-3 border-t-2 border-emerald-900/30" style={{ background: "#0f3a1e" }}>
                        <span className="text-xs font-bold text-white uppercase tracking-wide">Gross Profit</span>
                      </td>
                      {rows.map(row => {
                        const future = isFuture(row.month);
                        const isCur  = row.month === curMonth && isCurYear;
                        const budGP  = row.budget_revenue - row.budget_labor - row.budget_job_materials - row.budget_fuel - row.budget_equipment;
                        return (
                          <td key={row.month} className="px-1.5 py-1.5 text-center border-t-2 border-emerald-900/30 align-top"
                            style={{ background: isCur ? "#0d3d1f" : "#0f3a1e" }}>
                            {!future && (row.revenue > 0 || row.gross_profit !== 0) && (
                              <div className={`text-xs font-bold ${row.gross_profit >= 0 ? "text-white" : "text-red-300"}`}>
                                {fmt.format(row.gross_profit)}
                              </div>
                            )}
                            {budGP !== 0 && (
                              <div className="text-[10px] text-white/30 leading-none mt-0.5">{fmt.format(budGP)}</div>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-1.5 text-center border-t-2 border-emerald-900/30" style={{ background: "#0a2010" }}>
                        <div className={`text-xs font-bold ${totals.gross_profit >= 0 ? "text-white" : "text-red-300"}`}>
                          {totals.revenue > 0 ? fmt.format(totals.gross_profit) : "—"}
                        </div>
                        {totalBudgetGP !== 0 && (
                          <div className="text-[10px] text-white/30 leading-none mt-0.5">{fmt.format(totalBudgetGP)}</div>
                        )}
                      </td>
                    </tr>

                    {/* Margin % */}
                    <tr>
                      <td className="px-4 py-2.5" style={{ background: "#0f3a1e" }}>
                        <span className="text-xs font-bold text-white uppercase tracking-wide">Margin %</span>
                      </td>
                      {rows.map(row => {
                        const future = isFuture(row.month);
                        const isCur  = row.month === curMonth && isCurYear;
                        const m      = !future ? row.margin_pct : null;
                        const budM   = row.budget_revenue > 0
                          ? (row.budget_revenue - row.budget_labor - row.budget_job_materials - row.budget_fuel - row.budget_equipment) / row.budget_revenue
                          : null;
                        return (
                          <td key={row.month} className="px-1.5 py-2.5 text-center align-top"
                            style={{ background: isCur ? "#0d3d1f" : "#0f3a1e" }}>
                            {m !== null && <div className="text-xs font-semibold text-white">{fmtPct(m)}</div>}
                            {budM !== null && <div className="text-[10px] text-white/30 leading-none mt-0.5">{fmtPct(budM)}</div>}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 text-center" style={{ background: "#0a2010" }}>
                        {totalMargin !== null && <div className="text-xs font-semibold text-white">{fmtPct(totalMargin)}</div>}
                      </td>
                    </tr>
                  </tfoot>

                </table>
              </div>
            </div>
            <p className="text-center text-xs text-gray-400 mt-3">
              Click any actual value to edit · Revenue & labor auto-populated from imports · Fuel estimated from labor ratio
            </p>
          </div>

        </div>
      )}
    </div>
  );
}
