"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

type Field = "revenue" | "labor" | "job_materials" | "fuel" | "equipment";
type MonthRow = { month: number; revenue: number; labor: number; job_materials: number; fuel: number; equipment: number };
type Division = { id: string; name: string };

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const FIELDS: { key: Field; label: string; accent: string }[] = [
  { key: "revenue",       label: "Revenue",       accent: "text-sky-700" },
  { key: "labor",         label: "Labor",         accent: "text-gray-700" },
  { key: "job_materials", label: "Job Materials", accent: "text-gray-700" },
  { key: "fuel",          label: "Fuel",          accent: "text-gray-700" },
  { key: "equipment",     label: "Equipment",     accent: "text-gray-700" },
];

const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

function emptyRow(month: number): MonthRow {
  return { month, revenue: 0, labor: 0, job_materials: 0, fuel: 0, equipment: 0 };
}

// ── Editable cell ─────────────────────────────────────────────────────────────

function EditCell({ value, onSave, isRevenue }: { value: number; onSave: (v: number) => void; isRevenue?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(value === 0 ? "" : String(value));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }
  function commit() {
    onSave(parseFloat(draft.replace(/[^0-9.]/g, "")) || 0);
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
        className="w-full text-center text-xs font-semibold bg-white border border-emerald-400 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-300"
        autoFocus
      />
    );
  }

  return (
    <button
      onClick={startEdit}
      onFocus={startEdit}
      className={`w-full text-center text-xs rounded py-1.5 transition-colors ${
        value > 0
          ? `font-semibold hover:bg-emerald-50 ${isRevenue ? "text-sky-700" : "text-gray-800"}`
          : "text-gray-300 hover:bg-gray-50 hover:text-gray-500"
      }`}
    >
      {value > 0 ? fmt.format(value) : "—"}
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

const BG      = "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)";
const BG_FOOT = "#0f3a1e";
const BG_FOOT_TOTAL = "#0a2010";

export default function BudgetsPage() {
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [division,  setDivision]  = useState("");
  const [year,      setYear]      = useState(new Date().getFullYear());
  const [rows,      setRows]      = useState<MonthRow[]>(Array.from({ length: 12 }, (_, i) => emptyRow(i + 1)));
  const [saving,    setSaving]    = useState<Set<number>>(new Set());
  const [loading,   setLoading]   = useState(false);

  // Load divisions
  useEffect(() => {
    fetch("/api/operations-center/divisions")
      .then(r => r.json())
      .then(d => {
        const divs = ((d.data ?? []) as any[]).filter(x => x.active) as Division[];
        setDivisions(divs);
        if (divs.length > 0) setDivision(divs[0].name.toLowerCase());
      })
      .catch(() => {});
  }, []);

  // Load budget data
  const load = useCallback(async () => {
    if (!division) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/settings/budgets?division=${division}&year=${year}`);
      if (res.ok) {
        const data: MonthRow[] = await res.json();
        const byMonth = new Map(data.map(r => [r.month, r]));
        setRows(Array.from({ length: 12 }, (_, i) => byMonth.get(i + 1) ?? emptyRow(i + 1)));
      }
    } finally {
      setLoading(false);
    }
  }, [division, year]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(month: number, field: Field, value: number) {
    setRows(prev => prev.map(r => r.month !== month ? r : { ...r, [field]: value }));
    setSaving(prev => new Set(prev).add(month));
    await fetch("/api/settings/budgets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ division, year, month, field, value }),
    });
    setSaving(prev => { const s = new Set(prev); s.delete(month); return s; });
  }

  // Totals
  const totals = rows.reduce(
    (acc, r) => ({
      revenue:       acc.revenue       + r.revenue,
      labor:         acc.labor         + r.labor,
      job_materials: acc.job_materials + r.job_materials,
      fuel:          acc.fuel          + r.fuel,
      equipment:     acc.equipment     + r.equipment,
    }),
    { revenue: 0, labor: 0, job_materials: 0, fuel: 0, equipment: 0 }
  );

  const totalCOGS   = totals.labor + totals.job_materials + totals.fuel + totals.equipment;
  const totalProfit = totals.revenue - totalCOGS;
  const totalMargin = totals.revenue > 0 ? totalProfit / totals.revenue : null;

  function rowProfit(r: MonthRow) { return r.revenue - r.labor - r.job_materials - r.fuel - r.equipment; }
  function rowMargin(r: MonthRow) { return r.revenue > 0 ? rowProfit(r) / r.revenue : null; }

  function marginColor(m: number | null) {
    if (m === null) return "text-white/20";
    if (m >= 0.35) return "text-emerald-400";
    if (m >= 0.20) return "text-yellow-400";
    return "text-red-400";
  }
  function profitColor(p: number) {
    if (p > 0) return "text-emerald-300";
    if (p < 0) return "text-red-400";
    return "text-white/20";
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
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">Settings</span>
            </div>
            <div className="text-2xl font-black text-white">Annual Budgets</div>
          </div>

          <div className="flex items-center gap-3">
            {/* Division selector */}
            <select
              value={division}
              onChange={e => setDivision(e.target.value)}
              className="bg-white/10 border border-white/20 text-white text-sm font-semibold rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-400 cursor-pointer"
            >
              {divisions.map(d => (
                <option key={d.id} value={d.name.toLowerCase()} className="bg-gray-900 text-white">
                  {d.name}
                </option>
              ))}
            </select>

            {/* Year selector */}
            <div className="flex items-center gap-1 bg-white/10 rounded-xl px-2 py-1.5">
              <button onClick={() => setYear(y => y - 1)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">‹</button>
              <span className="text-sm font-bold text-white w-12 text-center">{year}</span>
              <button onClick={() => setYear(y => y + 1)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">›</button>
            </div>
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
                      {MONTHS.map((m, i) => (
                        <th key={m} className="px-2 py-3 text-center border border-emerald-900/50" style={{ background: BG, minWidth: 76 }}>
                          <span className="text-xs font-bold text-white/70 uppercase tracking-wider">{m}</span>
                          {saving.has(i + 1) && <span className="block text-[9px] text-emerald-400/50 mt-0.5">saving</span>}
                        </th>
                      ))}
                      <th className="px-3 py-3 text-center border border-emerald-900/50" style={{ background: BG_FOOT_TOTAL, minWidth: 84 }}>
                        <span className="text-xs font-bold text-white/40 uppercase tracking-widest">Annual</span>
                      </th>
                    </tr>
                  </thead>

                  {/* ── Data rows ── */}
                  <tbody>
                    {FIELDS.map((f, fi) => {
                      const isRevenue = f.key === "revenue";
                      const bg = fi % 2 === 0 ? "#fff" : "#f9fafb";
                      const annualTotal = totals[f.key as keyof typeof totals];
                      return (
                        <tr key={f.key}>
                          <td className="px-4 py-2 border border-gray-200" style={{ background: bg }}>
                            <div className="flex items-center gap-2">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRevenue ? "bg-sky-400" : "bg-emerald-400"}`} />
                              <span className={`text-xs font-semibold ${isRevenue ? "text-sky-700" : "text-gray-600"}`}>{f.label}</span>
                            </div>
                          </td>
                          {rows.map(row => (
                            <td key={row.month} className="px-1.5 py-1 border border-gray-200" style={{ background: bg }}>
                              <EditCell
                                value={row[f.key]}
                                isRevenue={isRevenue}
                                onSave={v => handleSave(row.month, f.key, v)}
                              />
                            </td>
                          ))}
                          <td className="px-3 py-2 text-center border border-gray-200" style={{ background: "#f0fdf4" }}>
                            <span className={`text-xs font-bold ${annualTotal > 0 ? (isRevenue ? "text-sky-700" : "text-gray-700") : "text-gray-300"}`}>
                              {annualTotal > 0 ? fmt.format(annualTotal) : "—"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* ── Calculated footer ── */}
                  <tfoot>
                    {/* Gross Profit */}
                    <tr>
                      <td className="px-4 py-2.5 border border-emerald-900/50" style={{ background: BG_FOOT }}>
                        <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">Gross Profit</span>
                      </td>
                      {rows.map(row => {
                        const gp = rowProfit(row);
                        return (
                          <td key={row.month} className="px-2 py-2.5 text-center border border-emerald-900/50" style={{ background: BG_FOOT }}>
                            <span className={`text-xs font-bold ${profitColor(row.revenue > 0 || gp !== 0 ? gp : 1)}`}>
                              {row.revenue > 0 || gp !== 0 ? fmt.format(gp) : "—"}
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 text-center border border-emerald-900/50" style={{ background: BG_FOOT_TOTAL }}>
                        <span className={`text-xs font-bold ${profitColor(totals.revenue > 0 ? totalProfit : 1)}`}>
                          {totals.revenue > 0 ? fmt.format(totalProfit) : "—"}
                        </span>
                      </td>
                    </tr>

                    {/* Margin % */}
                    <tr>
                      <td className="px-4 py-2.5 border border-emerald-900/50" style={{ background: BG_FOOT }}>
                        <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">Margin %</span>
                      </td>
                      {rows.map(row => {
                        const m = rowMargin(row);
                        return (
                          <td key={row.month} className="px-2 py-2.5 text-center border border-emerald-900/50" style={{ background: BG_FOOT }}>
                            <span className={`text-xs font-semibold ${marginColor(m)}`}>
                              {m !== null ? fmtPct(m) : "—"}
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
              Click any cell to enter a budget amount · Saves automatically · Gross Profit = Revenue − Labor − Materials − Fuel − Equipment
            </p>
          </>
        )}
      </div>
    </div>
  );
}
