"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@/lib/userContext";

// ── Types ──────────────────────────────────────────────────────────────────────

type DayRecord = {
  date: string;          // YYYY-MM-DD
  day_of_week: string;   // Mon, Tue, …
  is_weekday: boolean;
  computed_cost: number;
  override_cost: number | null | undefined;
  notes: string | null;
};

type Config = {
  manager_1_name: string;
  manager_2_name: string;
  manager_1_annual: number | null;
  manager_2_annual: number | null;
  jan_daily: number | null; feb_daily: number | null; mar_daily: number | null;
  apr_daily: number | null; may_daily: number | null; jun_daily: number | null;
  jul_daily: number | null; aug_daily: number | null; sep_daily: number | null;
  oct_daily: number | null; nov_daily: number | null; dec_daily: number | null;
};

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_KEYS  = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"] as const;

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtDateDisplay(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}

function effectiveCost(day: DayRecord): number {
  if (!day.is_weekday) return 0;
  if (day.override_cost !== undefined && day.override_cost !== null) return day.override_cost;
  return day.computed_cost;
}

// ── Inline cost cell ──────────────────────────────────────────────────────────

function CostCell({ day, onSave }: { day: DayRecord; onSave: (date: string, val: number | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState("");
  const [saving, setSaving]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const effective = effectiveCost(day);
  const isOverridden = day.override_cost !== undefined && day.override_cost !== null;
  const isPast = new Date(day.date + "T12:00:00") < new Date();

  function startEdit() {
    if (!day.is_weekday) return;
    setDraft(isOverridden ? String(day.override_cost) : effective.toFixed(2));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function commit() {
    const val = parseFloat(draft);
    if (!isNaN(val) && val !== day.computed_cost) {
      setSaving(true);
      await onSave(day.date, val);
      setSaving(false);
    } else if (draft.trim() === "") {
      // Revert to computed
      setSaving(true);
      await onSave(day.date, null);
      setSaving(false);
    }
    setEditing(false);
  }

  async function revert() {
    setSaving(true);
    await onSave(day.date, null);
    setSaving(false);
    setEditing(false);
  }

  if (!day.is_weekday) {
    return <td className="px-4 py-2.5 text-center text-gray-200 text-xs">—</td>;
  }

  if (editing) {
    return (
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1">
          <span className="text-gray-400 text-xs">$</span>
          <input
            ref={inputRef}
            type="number"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
            onBlur={commit}
            className="w-24 border border-emerald-400 rounded px-2 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          {isOverridden && (
            <button
              onMouseDown={e => { e.preventDefault(); revert(); }}
              className="text-xs text-gray-400 hover:text-red-500 ml-1"
              title="Revert to computed"
            >↺</button>
          )}
        </div>
      </td>
    );
  }

  return (
    <td
      className={`px-4 py-2.5 text-center cursor-pointer group relative ${
        saving ? "opacity-50" : ""
      }`}
      onClick={startEdit}
    >
      <span className={`font-medium ${isOverridden ? "text-amber-600" : isPast ? "text-gray-500" : "text-emerald-950"}`}>
        {effective > 0 ? money.format(effective) : "—"}
      </span>
      {isOverridden && (
        <span className="ml-1 text-xs text-amber-400" title={`Computed: ${money.format(day.computed_cost)}`}>✎</span>
      )}
      {!isOverridden && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-300 opacity-0 group-hover:opacity-100">✎</span>
      )}
    </td>
  );
}

// ── Settings panel ────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Config = {
  manager_1_name: "Barnes, Scott",
  manager_2_name: "Shores, Kasey",
  manager_1_annual: null,
  manager_2_annual: null,
  jan_daily: null, feb_daily: null, mar_daily: null, apr_daily: null,
  may_daily: null, jun_daily: null, jul_daily: null, aug_daily: null,
  sep_daily: null, oct_daily: null, nov_daily: null, dec_daily: null,
};

function SettingsPanel({ config, year, onSaved }: { config: Config | null; year: number; onSaved: () => void }) {
  const [open, setOpen]     = useState(!config);
  const [form, setForm]     = useState<Config>(config ?? DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState<string | null>(null);

  useEffect(() => {
    setForm(config ?? DEFAULT_CONFIG);
  }, [config]);

  function upd(field: keyof Config, val: string) {
    setForm(prev => ({ ...prev, [field]: val === "" ? null : val }));
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/operations-center/atlas-ops/lawn/admin-pay", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, year }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Save failed");
      onSaved();
      setOpen(false);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-emerald-100 bg-white shadow-sm overflow-hidden mb-6">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 border-b border-emerald-100 bg-emerald-50/60 text-left"
      >
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-700"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
          <span className="text-sm font-semibold text-emerald-950">Configuration — {year}</span>
          {!config && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">Not configured</span>}
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
          className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="px-5 py-4 space-y-5">
          {/* Manager names */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Division Managers</div>
            <div className="grid grid-cols-2 gap-3">
              {[1, 2].map(n => (
                <div key={n} className="space-y-1">
                  <label className="text-xs text-gray-500">Manager {n}</label>
                  <input
                    type="text"
                    value={(form[`manager_${n}_name` as keyof Config] as string) ?? ""}
                    onChange={e => upd(`manager_${n}_name` as keyof Config, e.target.value)}
                    placeholder="Last, First"
                    className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:border-emerald-400"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Annual salaries */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Annual Salaries (auto-computes daily rate)</div>
            <div className="grid grid-cols-2 gap-3">
              {[1, 2].map(n => (
                <div key={n} className="space-y-1">
                  <label className="text-xs text-gray-500">
                    {(form[`manager_${n}_name` as keyof Config] as string) || `Manager ${n}`} — Annual
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      type="number"
                      value={(form[`manager_${n}_annual` as keyof Config] as number | null) ?? ""}
                      onChange={e => upd(`manager_${n}_annual` as keyof Config, e.target.value)}
                      placeholder="0.00"
                      className="w-full border border-gray-200 rounded pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                </div>
              ))}
            </div>
            {(form.manager_1_annual || form.manager_2_annual) && (
              <div className="mt-2 text-xs text-gray-400">
                Combined annual: {money.format((Number(form.manager_1_annual ?? 0)) + (Number(form.manager_2_annual ?? 0)))}
                {" · "}
                Auto daily rate = combined ÷ 12 ÷ weekdays/month
              </div>
            )}
          </div>

          {/* Per-month daily rate overrides */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Monthly Daily Rate Overrides <span className="font-normal text-gray-400">(leave blank to use auto-computed)</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {MONTH_KEYS.map((mk, i) => {
                const val = form[`${mk}_daily` as keyof Config] as number | null;
                return (
                  <div key={mk} className="space-y-0.5">
                    <label className="text-xs text-gray-400">{MONTH_NAMES[i].slice(0, 3)}</label>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-300 text-xs">$</span>
                      <input
                        type="number"
                        value={val ?? ""}
                        onChange={e => upd(`${mk}_daily` as keyof Config, e.target.value)}
                        placeholder="auto"
                        className="w-full border border-gray-200 rounded pl-5 pr-2 py-1.5 text-xs focus:outline-none focus:border-emerald-400"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {err && <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{err}</div>}

          <div className="flex justify-end">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save Configuration"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminPayPage() {
  const { user, loading: userLoading } = useUser();
  const [year, setYear]       = useState(new Date().getFullYear());
  const [config, setConfig]   = useState<Config | null>(null);
  const [days, setDays]       = useState<DayRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (yr: number) => {
    setLoading(true);
    const res = await fetch(`/api/operations-center/atlas-ops/lawn/admin-pay?year=${yr}`, { cache: "no-store" });
    const d = await res.json();
    setConfig(d.config);
    setDays(d.days ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(year); }, [year, load]);

  async function handleOverride(date: string, val: number | null) {
    await fetch("/api/operations-center/atlas-ops/lawn/admin-pay/override", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, payroll_cost: val }),
    });
    // Update local state immediately
    setDays(prev => prev.map(d => {
      if (d.date !== date) return d;
      return { ...d, override_cost: val ?? undefined };
    }));
  }

  // Admin gate
  if (userLoading) return null;
  if (!user?.is_super_admin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Admin Only</h2>
        <p className="text-sm text-gray-500 max-w-xs">This section is restricted to administrators.</p>
      </div>
    );
  }

  // Group days by month
  const byMonth: DayRecord[][] = Array.from({ length: 12 }, () => []);
  for (const d of days) {
    const m = parseInt(d.date.split("-")[1]) - 1;
    byMonth[m].push(d);
  }

  // Summary stats
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const ytdCost = days
    .filter(d => d.date <= today)
    .reduce((s, d) => s + effectiveCost(d), 0);

  const curMonth = new Date().getMonth();
  const monthCost = byMonth[curMonth]
    .filter(d => d.date <= today)
    .reduce((s, d) => s + effectiveCost(d), 0);

  const todayRecord = days.find(d => d.date === today);
  const todayCost = todayRecord ? effectiveCost(todayRecord) : 0;

  const annualTotal = days.reduce((s, d) => s + effectiveCost(d), 0);
  const biweekly = annualTotal / 26;

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="mx-auto max-w-[900px] px-4 md:px-6 py-6 md:py-8">

        {/* Header */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-emerald-950">Admin Pay</h1>
            <p className="text-sm text-emerald-900/60 mt-0.5">
              {config ? `${config.manager_1_name} & ${config.manager_2_name}` : "Division manager payroll allocation"}
            </p>
          </div>
          {/* Year selector */}
          <div className="flex items-center gap-1.5">
            <button onClick={() => setYear(y => y - 1)} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50">‹</button>
            <span className="text-sm font-semibold text-gray-800 w-12 text-center">{year}</span>
            <button onClick={() => setYear(y => y + 1)} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50">›</button>
          </div>
        </div>

        {/* Summary cards */}
        {!loading && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: "Today", val: todayCost, show: todayRecord?.is_weekday },
              { label: "Month to Date", val: monthCost },
              { label: "YTD", val: ytdCost },
              { label: `${year} Annual`, val: annualTotal },
            ].map(c => (
              <div key={c.label} className="rounded-xl border border-emerald-100 bg-white shadow-sm px-4 py-3">
                <div className="text-xs text-emerald-900/50 font-medium">{c.label}</div>
                <div className="text-lg font-bold text-emerald-950 mt-0.5">
                  {c.show === false ? <span className="text-gray-300 text-sm">Non-workday</span> : money.format(c.val)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Bi-weekly equivalent note */}
        {!loading && annualTotal > 0 && (
          <div className="mb-6 px-4 py-3 rounded-lg border border-emerald-100 bg-emerald-50/60 text-xs text-emerald-800">
            Bi-weekly equivalent: <strong>{money.format(biweekly)}</strong> &nbsp;·&nbsp;
            Monthly average: <strong>{money.format(annualTotal / 12)}</strong> &nbsp;·&nbsp;
            <span className="text-emerald-600">Click any weekday amount to override it. Overridden values show in amber.</span>
          </div>
        )}

        {/* Configuration */}
        <SettingsPanel config={config} year={year} onSaved={() => load(year)} />

        {/* Calendar table */}
        {loading ? (
          <div className="text-center py-16 text-sm text-emerald-900/40">Loading…</div>
        ) : (
          <div className="space-y-4">
            {byMonth.map((monthDays, mi) => {
              if (monthDays.length === 0) return null;
              const monthTotal = monthDays.reduce((s, d) => s + effectiveCost(d), 0);
              const weekdayCount = monthDays.filter(d => d.is_weekday).length;
              return (
                <div key={mi} className="rounded-xl border border-emerald-100 bg-white shadow-sm overflow-hidden">
                  <div className="border-b border-emerald-100 bg-emerald-50/60 px-5 py-2.5 flex items-center justify-between">
                    <span className="text-sm font-semibold text-emerald-950">{MONTH_NAMES[mi]}</span>
                    <div className="flex items-center gap-4 text-xs text-emerald-900/50">
                      <span>{weekdayCount} workdays</span>
                      <span className="font-semibold text-emerald-800">{money.format(monthTotal)}</span>
                    </div>
                  </div>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="text-xs font-semibold text-emerald-900/50 bg-emerald-50/30">
                        <th className="px-5 py-2 text-left w-24">Day</th>
                        <th className="px-5 py-2 text-left">Date</th>
                        <th className="px-4 py-2 text-center w-40">Payroll Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthDays.map(d => {
                        const isPast = d.date < today;
                        const isToday = d.date === today;
                        return (
                          <tr
                            key={d.date}
                            className={`border-t border-gray-50 ${
                              !d.is_weekday ? "bg-gray-50/50 opacity-40" :
                              isToday ? "bg-emerald-50/60" :
                              isPast ? "" : "opacity-60"
                            }`}
                          >
                            <td className={`px-5 py-2.5 text-sm ${d.is_weekday ? "font-medium text-gray-700" : "text-gray-400"}`}>
                              {d.day_of_week}
                            </td>
                            <td className="px-5 py-2.5 text-sm text-gray-600">
                              {fmtDateDisplay(d.date)}
                              {isToday && <span className="ml-2 text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">Today</span>}
                            </td>
                            <CostCell day={d} onSave={handleOverride} />
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
