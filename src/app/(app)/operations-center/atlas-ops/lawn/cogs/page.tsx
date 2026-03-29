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

type FieldDef = {
  key:       "revenue" | "labor" | "job_materials" | "fuel" | "equipment";
  apiField:  string;
  label:     string;
  isAuto:    boolean;
  overrideKey?: keyof MonthCOGS;
};

const FIELDS: FieldDef[] = [
  { key: "revenue",       apiField: "revenue_override",  label: "Revenue",      isAuto: true,  overrideKey: "revenue_overridden" },
  { key: "labor",         apiField: "labor_override",    label: "Labor",        isAuto: true,  overrideKey: "labor_overridden" },
  { key: "job_materials", apiField: "job_materials",     label: "Job Materials",isAuto: false },
  { key: "fuel",          apiField: "fuel_override",     label: "Fuel",         isAuto: true,  overrideKey: "fuel_overridden" },
  { key: "equipment",     apiField: "equipment",         label: "Equipment",    isAuto: false },
];

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmt    = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

const BG      = "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)";
const BG_FOOT = "#0f3a1e";
const BG_FOOT_TOTAL = "#0a2010";

// ── Editable cell ─────────────────────────────────────────────────────────────

function COGSCell({
  actual, budget, actualPct, budgetPct,
  isAuto, isOverridden, isRevenue,
  onSave, onClear,
}: {
  actual: number; budget: number;
  actualPct: number | null; budgetPct: number | null;
  isAuto: boolean; isOverridden: boolean; isRevenue: boolean;
  onSave: (v: number) => void; onClear: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(actual === 0 ? "" : String(actual));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }
  function commit() {
    const v = draft.trim();
    if (v === "" && isAuto) { onClear(); }
    else { onSave(parseFloat(v.replace(/[^0-9.]/g, "")) || 0); }
    setEditing(false);
  }

  // % chip color
  function pctColor() {
    if (actualPct === null) return "text-white/30 bg-white/5";
    if (isRevenue) {
      if (budgetPct && actualPct >= budgetPct) return "text-emerald-300 bg-emerald-900/40";
      if (budgetPct && actualPct >= budgetPct * 0.9) return "text-yellow-300 bg-yellow-900/30";
      return "text-red-400 bg-red-900/30";
    }
    // COGS: lower % is better
    if (budgetPct == null || budgetPct === 0) return "text-white/50 bg-white/5";
    if (actualPct <= budgetPct) return "text-emerald-300 bg-emerald-900/40";
    if (actualPct <= budgetPct * 1.1) return "text-yellow-300 bg-yellow-900/30";
    return "text-red-400 bg-red-900/30";
  }

  if (editing) {
    return (
      <div className="px-1 py-1">
        <input
          ref={inputRef}
          type="number"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          placeholder={isAuto ? "blank = auto" : "0"}
          className="w-full text-center text-[11px] font-semibold bg-white border border-emerald-400 rounded px-1 py-0.5 focus:outline-none"
          autoFocus
        />
      </div>
    );
  }

  return (
    <button onClick={startEdit} onFocus={startEdit}
      className="w-full text-left px-2 py-1 group hover:bg-white/5 transition-colors rounded">
      {/* Actual value */}
      <div className="flex items-center justify-between gap-1">
        <span className={`text-[11px] font-bold leading-tight ${
          isRevenue
            ? (isOverridden ? "text-amber-300" : "text-sky-300")
            : (isOverridden ? "text-amber-300" : actual > 0 ? "text-white" : "text-white/20")
        }`}>
          {actual > 0 ? fmt.format(actual) : "—"}
        </span>
        {isAuto && !isOverridden && actual > 0 &&
          <span className="text-[8px] text-white/25 leading-none">auto</span>}
        {isOverridden &&
          <button onMouseDown={e => { e.stopPropagation(); onClear(); }}
            className="text-[9px] text-amber-400/60 hover:text-amber-300 leading-none">↺</button>}
      </div>
      {/* Budget */}
      <div className="text-[9px] text-white/25 leading-tight mt-0.5">
        {budget > 0 ? fmt.format(budget) : <span className="text-white/10">no budget</span>}
      </div>
      {/* % chip */}
      {actualPct !== null && (
        <div className={`mt-0.5 inline-block text-[9px] font-semibold px-1 py-0.5 rounded leading-none ${pctColor()}`}>
          {fmtPct(actualPct)}
        </div>
      )}
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
    // Optimistic update
    setRows(prev => prev.map(r => {
      if (r.month !== month) return r;
      const updated = { ...r };
      if (value === null) {
        // Revert to auto
        if (field.key === "revenue") { updated.revenue = r.revenue_auto; updated.revenue_overridden = false; }
        if (field.key === "labor")   { updated.labor   = r.labor_auto;   updated.labor_overridden   = false; }
        if (field.key === "fuel")    { updated.fuel     = r.fuel_auto;    updated.fuel_overridden     = false; }
        if (field.key === "job_materials") { updated.job_materials = 0; }
        if (field.key === "equipment")     { updated.equipment     = 0; }
      } else {
        (updated as any)[field.key] = value;
        if (field.overrideKey) (updated as any)[field.overrideKey] = true;
      }
      // Recompute derived
      updated.gross_profit = updated.revenue - updated.labor - updated.job_materials - updated.fuel - updated.equipment;
      updated.margin_pct   = updated.revenue > 0 ? updated.gross_profit / updated.revenue : null;
      return updated;
    }));

    await fetch("/api/operations-center/atlas-ops/lawn/cogs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ division: "lawn", year, month, field: field.apiField, value }),
    });

    // Reload fuel formula-dependent months if labor changed
    if (field.key === "labor" || field.key === "revenue") load();
  }

  // Annual totals
  const totals = rows.reduce((acc, r) => ({
    revenue:       acc.revenue       + r.revenue,
    labor:         acc.labor         + r.labor,
    job_materials: acc.job_materials + r.job_materials,
    fuel:          acc.fuel          + r.fuel,
    equipment:     acc.equipment     + r.equipment,
    gross_profit:  acc.gross_profit  + r.gross_profit,
    budget_revenue:       acc.budget_revenue       + r.budget_revenue,
    budget_labor:         acc.budget_labor         + r.budget_labor,
    budget_job_materials: acc.budget_job_materials + r.budget_job_materials,
    budget_fuel:          acc.budget_fuel          + r.budget_fuel,
    budget_equipment:     acc.budget_equipment     + r.budget_equipment,
  }), { revenue: 0, labor: 0, job_materials: 0, fuel: 0, equipment: 0, gross_profit: 0,
        budget_revenue: 0, budget_labor: 0, budget_job_materials: 0, budget_fuel: 0, budget_equipment: 0 });

  const totalMargin = totals.revenue > 0 ? totals.gross_profit / totals.revenue : null;

  function profitColor(p: number) {
    if (p > 0) return "text-emerald-300";
    if (p < 0) return "text-red-400";
    return "text-white/20";
  }
  function marginColor(m: number | null) {
    if (m === null) return "text-white/20";
    if (m >= 0.35) return "text-emerald-400";
    if (m >= 0.20) return "text-yellow-400";
    return "text-red-400";
  }

  const curMonth = new Date().getMonth() + 1;

  return (
    <div className="min-h-screen" style={{ background: "#f0f4f0" }}>

      {/* Header */}
      <div className="px-5 py-4" style={{ background: BG }}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">Lawn</span>
            <div className="text-xl font-black text-white mt-0.5">COGS</div>
          </div>
          <div className="flex items-center gap-1 bg-white/10 rounded-xl px-2 py-1.5">
            <button onClick={() => setYear(y => y - 1)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white">‹</button>
            <span className="text-sm font-bold text-white w-12 text-center">{year}</span>
            <button onClick={() => setYear(y => y + 1)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white">›</button>
          </div>
        </div>
      </div>

      <div className="p-3">
        {loading ? (
          <div className="text-center py-12 text-sm text-gray-400">Loading…</div>
        ) : (
          <>
            <div className="rounded-2xl overflow-hidden shadow-md" style={{ border: "1px solid rgba(16,64,32,0.15)" }}>
              <div className="overflow-x-auto">
                <table className="w-full" style={{ minWidth: 860, borderCollapse: "collapse" }}>

                  {/* Month header */}
                  <thead>
                    <tr>
                      <th className="px-3 py-2.5 text-left border border-emerald-900/50" style={{ background: BG, width: 110 }}>
                        <span className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">Category</span>
                      </th>
                      {MONTHS.map((m, i) => {
                        const isCur = i + 1 === curMonth;
                        return (
                          <th key={m} className="py-2.5 text-center border border-emerald-900/50"
                            style={{ background: isCur ? "#0f4a25" : BG, minWidth: 72 }}>
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${isCur ? "text-emerald-300" : "text-white/60"}`}>{m}</span>
                            {isCur && <span className="block w-1 h-1 rounded-full bg-emerald-400 mx-auto mt-0.5" />}
                          </th>
                        );
                      })}
                      <th className="px-2 py-2.5 text-center border border-emerald-900/50" style={{ background: BG_FOOT_TOTAL, minWidth: 80 }}>
                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Annual</span>
                      </th>
                    </tr>
                  </thead>

                  {/* Data rows */}
                  <tbody>
                    {FIELDS.map((f, fi) => {
                      const isRevenue = f.key === "revenue";
                      const bg = fi % 2 === 0 ? "#1a3a22" : "#162f1c";
                      const totalActual = totals[f.key as keyof typeof totals] as number;
                      const totalBudget = totals[`budget_${f.key}` as keyof typeof totals] as number;
                      const totalPct    = totals.revenue > 0 ? (totalActual as number) / totals.revenue : null;
                      const totalBPct   = totals.budget_revenue > 0 ? (totalBudget as number) / totals.budget_revenue : null;

                      return (
                        <tr key={f.key}>
                          <td className="px-3 py-1.5 border border-emerald-900/30" style={{ background: bg }}>
                            <div className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRevenue ? "bg-sky-400" : "bg-emerald-500"}`} />
                              <span className={`text-[11px] font-semibold ${isRevenue ? "text-sky-300" : "text-emerald-200"}`}>{f.label}</span>
                            </div>
                            {f.key === "fuel" && <div className="text-[8px] text-white/25 mt-0.5 pl-3">formula est.</div>}
                          </td>
                          {rows.map(row => {
                            const isCur    = row.month === curMonth;
                            const actual   = row[f.key] as number;
                            const budget   = row[`budget_${f.key}` as keyof MonthCOGS] as number;
                            const actualPct  = row.revenue > 0 ? actual / row.revenue : null;
                            const budgetPct  = row.budget_revenue > 0 ? budget / row.budget_revenue : null;
                            const isOver   = row[f.overrideKey as keyof MonthCOGS] as boolean | undefined;
                            return (
                              <td key={row.month} className="border border-emerald-900/30 p-0"
                                style={{ background: isCur ? "#0f4a25" : bg }}>
                                <COGSCell
                                  actual={actual} budget={budget}
                                  actualPct={isRevenue ? (row.budget_revenue > 0 ? actual / row.budget_revenue : null) : actualPct}
                                  budgetPct={isRevenue ? 1 : budgetPct}
                                  isAuto={f.isAuto} isOverridden={!!isOver} isRevenue={isRevenue}
                                  onSave={v => handleSave(row.month, f, v)}
                                  onClear={() => handleSave(row.month, f, null)}
                                />
                              </td>
                            );
                          })}
                          {/* Annual total cell */}
                          <td className="px-2 py-1.5 text-center border border-emerald-900/30" style={{ background: BG_FOOT_TOTAL }}>
                            <div className={`text-[11px] font-bold ${isRevenue ? "text-sky-300" : totalActual > 0 ? "text-white" : "text-white/20"}`}>
                              {totalActual > 0 ? fmt.format(totalActual) : "—"}
                            </div>
                            <div className="text-[9px] text-white/25">
                              {totalBudget > 0 ? fmt.format(totalBudget) : ""}
                            </div>
                            {totalPct !== null && (
                              <div className="text-[9px] text-white/40">{fmtPct(totalPct)}</div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* Footer: Gross Profit + Margin % */}
                  <tfoot>
                    <tr>
                      <td className="px-3 py-2 border border-emerald-900/50" style={{ background: BG_FOOT }}>
                        <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">Gross Profit</span>
                      </td>
                      {rows.map(row => {
                        const isCur = row.month === curMonth;
                        const budgetGP = row.budget_revenue - row.budget_labor - row.budget_job_materials - row.budget_fuel - row.budget_equipment;
                        return (
                          <td key={row.month} className="px-2 py-2 text-center border border-emerald-900/50"
                            style={{ background: isCur ? "#0d3d1f" : BG_FOOT }}>
                            <div className={`text-[11px] font-bold ${profitColor(row.revenue > 0 || row.gross_profit !== 0 ? row.gross_profit : 1)}`}>
                              {row.revenue > 0 || row.gross_profit !== 0 ? fmt.format(row.gross_profit) : "—"}
                            </div>
                            <div className="text-[9px] text-white/25">
                              {budgetGP !== 0 ? fmt.format(budgetGP) : ""}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-center border border-emerald-900/50" style={{ background: BG_FOOT_TOTAL }}>
                        <span className={`text-[11px] font-bold ${profitColor(totals.revenue > 0 ? totals.gross_profit : 1)}`}>
                          {totals.revenue > 0 ? fmt.format(totals.gross_profit) : "—"}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border border-emerald-900/50" style={{ background: BG_FOOT }}>
                        <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">Margin %</span>
                      </td>
                      {rows.map(row => {
                        const isCur = row.month === curMonth;
                        const bMargin = row.budget_revenue > 0
                          ? (row.budget_revenue - row.budget_labor - row.budget_job_materials - row.budget_fuel - row.budget_equipment) / row.budget_revenue
                          : null;
                        return (
                          <td key={row.month} className="px-2 py-2 text-center border border-emerald-900/50"
                            style={{ background: isCur ? "#0d3d1f" : BG_FOOT }}>
                            <div className={`text-[11px] font-semibold ${marginColor(row.margin_pct)}`}>
                              {row.margin_pct !== null ? fmtPct(row.margin_pct) : "—"}
                            </div>
                            <div className="text-[9px] text-white/25">
                              {bMargin !== null ? fmtPct(bMargin) : ""}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-center border border-emerald-900/50" style={{ background: BG_FOOT_TOTAL }}>
                        <span className={`text-[11px] font-semibold ${marginColor(totalMargin)}`}>
                          {totalMargin !== null ? fmtPct(totalMargin) : "—"}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <p className="text-center text-[10px] text-gray-400 mt-2">
              Click any cell to edit · Blank on auto fields reverts to auto · Amber = manual override · ↺ = revert to auto · Fuel estimated from labor ratio
            </p>
          </>
        )}
      </div>
    </div>
  );
}
