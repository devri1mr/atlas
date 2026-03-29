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
  { key: "revenue",       apiField: "revenue_override", label: "Revenue",       isAuto: true,  overrideKey: "revenue_overridden" },
  { key: "labor",         apiField: "labor_override",   label: "Labor",         isAuto: true,  overrideKey: "labor_overridden" },
  { key: "job_materials", apiField: "job_materials",    label: "Job Materials", isAuto: false },
  { key: "fuel",          apiField: "fuel_override",    label: "Fuel",          isAuto: true,  overrideKey: "fuel_overridden" },
  { key: "equipment",     apiField: "equipment",        label: "Equipment",     isAuto: false },
];

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmt    = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

const BG           = "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)";
const BG_FOOT      = "#0f3a1e";
const BG_FOOT_TOTAL = "#0a2010";

// ── Editable cell ─────────────────────────────────────────────────────────────

function EditCell({
  value, isAuto, isOverridden, isRevenue,
  onSave, onClear,
}: {
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
        ref={inputRef}
        type="number"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        placeholder={isAuto ? "blank = auto" : "0"}
        className="w-full text-center text-xs font-semibold bg-white border border-emerald-400 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-300"
        autoFocus
      />
    );
  }

  return (
    <div className="relative group">
      <button
        onClick={startEdit}
        onFocus={startEdit}
        className={`w-full text-center text-xs rounded py-1.5 transition-colors ${
          value > 0
            ? `font-semibold hover:bg-emerald-50 ${isRevenue ? (isOverridden ? "text-amber-600" : "text-sky-700") : (isOverridden ? "text-amber-600" : "text-gray-800")}`
            : "text-gray-300 hover:bg-gray-50 hover:text-gray-500"
        }`}
      >
        {value > 0 ? fmt.format(value) : "—"}
      </button>
      {isAuto && !isOverridden && value > 0 && (
        <span className="absolute top-0.5 right-1 text-[8px] text-gray-300 leading-none pointer-events-none">auto</span>
      )}
      {isOverridden && (
        <button
          onMouseDown={e => { e.stopPropagation(); onClear(); }}
          className="absolute top-0.5 right-1 text-[9px] text-amber-400 hover:text-amber-600 leading-none"
          title="Revert to auto"
        >↺</button>
      )}
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
      const updated = { ...r };
      if (value === null) {
        if (field.key === "revenue")       { updated.revenue       = r.revenue_auto; updated.revenue_overridden = false; }
        if (field.key === "labor")         { updated.labor         = r.labor_auto;   updated.labor_overridden   = false; }
        if (field.key === "fuel")          { updated.fuel          = r.fuel_auto;    updated.fuel_overridden    = false; }
        if (field.key === "job_materials") { updated.job_materials = 0; }
        if (field.key === "equipment")     { updated.equipment     = 0; }
      } else {
        (updated as any)[field.key] = value;
        if (field.overrideKey) (updated as any)[field.overrideKey] = true;
      }
      updated.gross_profit = updated.revenue - updated.labor - updated.job_materials - updated.fuel - updated.equipment;
      updated.margin_pct   = updated.revenue > 0 ? updated.gross_profit / updated.revenue : null;
      return updated;
    }));

    await fetch("/api/operations-center/atlas-ops/lawn/cogs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ division: "lawn", year, month, field: field.apiField, value }),
    });

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
                <table className="w-full" style={{ minWidth: 900, borderCollapse: "collapse" }}>

                  {/* ── Month headers ── */}
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left border border-emerald-900/50" style={{ background: BG, width: 130 }}>
                        <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">Category</span>
                      </th>
                      {MONTHS.map((m, i) => {
                        const isCur = i + 1 === curMonth;
                        return (
                          <th key={m} className="px-2 py-3 text-center border border-emerald-900/50"
                            style={{ background: isCur ? "#0f4a25" : BG, minWidth: 76 }}>
                            <span className={`text-xs font-bold uppercase tracking-wider ${isCur ? "text-emerald-300" : "text-white/70"}`}>{m}</span>
                            {isCur && <span className="block w-1 h-1 rounded-full bg-emerald-400 mx-auto mt-0.5" />}
                          </th>
                        );
                      })}
                      <th className="px-3 py-3 text-center border border-emerald-900/50" style={{ background: BG_FOOT_TOTAL, minWidth: 84 }}>
                        <span className="text-xs font-bold text-white/40 uppercase tracking-widest">Annual</span>
                      </th>
                    </tr>
                  </thead>

                  {/* ── Data rows ── */}
                  <tbody>
                    {FIELDS.map((f, fi) => {
                      const isRevenue  = f.key === "revenue";
                      const bg         = fi % 2 === 0 ? "#fff" : "#f9fafb";
                      const annualVal  = totals[f.key as keyof typeof totals] as number;
                      const annualBud  = totals[`budget_${f.key}` as keyof typeof totals] as number;
                      return (
                        <tr key={f.key}>
                          <td className="px-4 py-2 border border-gray-200" style={{ background: bg }}>
                            <div className="flex items-center gap-2">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRevenue ? "bg-sky-400" : "bg-emerald-400"}`} />
                              <span className={`text-xs font-semibold ${isRevenue ? "text-sky-700" : "text-gray-600"}`}>{f.label}</span>
                            </div>
                            {f.key === "fuel" && (
                              <div className="text-[10px] text-gray-400 mt-0.5 pl-3.5">formula est.</div>
                            )}
                          </td>
                          {rows.map(row => {
                            const isCur     = row.month === curMonth;
                            const actual    = row[f.key] as number;
                            const isOver    = f.overrideKey ? (row[f.overrideKey] as boolean) : false;
                            return (
                              <td key={row.month} className="px-1.5 py-1 border border-gray-200"
                                style={{ background: isCur ? "#f0fdf4" : bg }}>
                                <EditCell
                                  value={actual}
                                  isAuto={f.isAuto}
                                  isOverridden={isOver}
                                  isRevenue={isRevenue}
                                  onSave={v => handleSave(row.month, f, v)}
                                  onClear={() => handleSave(row.month, f, null)}
                                />
                              </td>
                            );
                          })}
                          {/* Annual total */}
                          <td className="px-3 py-2 text-center border border-gray-200" style={{ background: "#f0fdf4" }}>
                            <span className={`text-xs font-bold ${annualVal > 0 ? (isRevenue ? "text-sky-700" : "text-gray-700") : "text-gray-300"}`}>
                              {annualVal > 0 ? fmt.format(annualVal) : "—"}
                            </span>
                            {annualBud > 0 && (
                              <div className="text-[10px] text-gray-400 mt-0.5">{fmt.format(annualBud)}</div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* ── Calculated footer ── */}
                  <tfoot>
                    {/* % of Revenue */}
                    <tr>
                      <td className="px-4 py-2 border border-emerald-900/50" style={{ background: BG_FOOT }}>
                        <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">% of Revenue</span>
                      </td>
                      {rows.map(row => {
                        const isCur = row.month === curMonth;
                        const cogs  = row.labor + row.job_materials + row.fuel + row.equipment;
                        const p     = row.revenue > 0 ? cogs / row.revenue : null;
                        return (
                          <td key={row.month} className="px-2 py-2 text-center border border-emerald-900/50"
                            style={{ background: isCur ? "#0d3d1f" : BG_FOOT }}>
                            <span className={`text-xs font-semibold ${p === null ? "text-white/20" : p <= 0.65 ? "text-emerald-300" : "text-yellow-300"}`}>
                              {p !== null ? fmtPct(p) : "—"}
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center border border-emerald-900/50" style={{ background: BG_FOOT_TOTAL }}>
                        {(() => {
                          const c = totals.labor + totals.job_materials + totals.fuel + totals.equipment;
                          const p = totals.revenue > 0 ? c / totals.revenue : null;
                          return (
                            <span className={`text-xs font-semibold ${p === null ? "text-white/20" : p <= 0.65 ? "text-emerald-300" : "text-yellow-300"}`}>
                              {p !== null ? fmtPct(p) : "—"}
                            </span>
                          );
                        })()}
                      </td>
                    </tr>

                    {/* Gross Profit */}
                    <tr>
                      <td className="px-4 py-2.5 border border-emerald-900/50" style={{ background: BG_FOOT }}>
                        <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">Gross Profit</span>
                      </td>
                      {rows.map(row => {
                        const isCur = row.month === curMonth;
                        return (
                          <td key={row.month} className="px-2 py-2.5 text-center border border-emerald-900/50"
                            style={{ background: isCur ? "#0d3d1f" : BG_FOOT }}>
                            <span className={`text-xs font-bold ${profitColor(row.revenue > 0 || row.gross_profit !== 0 ? row.gross_profit : 1)}`}>
                              {row.revenue > 0 || row.gross_profit !== 0 ? fmt.format(row.gross_profit) : "—"}
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 text-center border border-emerald-900/50" style={{ background: BG_FOOT_TOTAL }}>
                        <span className={`text-xs font-bold ${profitColor(totals.revenue > 0 ? totals.gross_profit : 1)}`}>
                          {totals.revenue > 0 ? fmt.format(totals.gross_profit) : "—"}
                        </span>
                      </td>
                    </tr>

                    {/* Margin % */}
                    <tr>
                      <td className="px-4 py-2.5 border border-emerald-900/50" style={{ background: BG_FOOT }}>
                        <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">Margin %</span>
                      </td>
                      {rows.map(row => {
                        const isCur = row.month === curMonth;
                        return (
                          <td key={row.month} className="px-2 py-2.5 text-center border border-emerald-900/50"
                            style={{ background: isCur ? "#0d3d1f" : BG_FOOT }}>
                            <span className={`text-xs font-semibold ${marginColor(row.margin_pct)}`}>
                              {row.margin_pct !== null ? fmtPct(row.margin_pct) : "—"}
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 text-center border border-emerald-900/50" style={{ background: BG_FOOT_TOTAL }}>
                        <span className={`text-xs font-semibold ${marginColor(totalMargin)}`}>
                          {totalMargin !== null ? fmtPct(totalMargin) : "—"}
                        </span>
                      </td>
                    </tr>
                  </tfoot>

                </table>
              </div>
            </div>

            <p className="text-center text-xs text-gray-400 mt-3">
              Click any cell to edit · Blank on auto fields reverts to auto · Amber = manual override · ↺ revert · Fuel estimated from labor ratio
            </p>
          </>
        )}
      </div>
    </div>
  );
}
