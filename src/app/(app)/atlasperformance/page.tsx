"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine, Legend, Cell,
} from "recharts";

/* ─────────────────── Types ─────────────────── */
type CategoryData = { actual: number[]; budget: number[]; totalActual: number; totalBudget: number };
type PerformanceData = {
  division: string;
  lastFetched: string;
  months: string[];
  revenue:   CategoryData & { remaining: number };
  materials: CategoryData;
  labor:     CategoryData;
  fuel:      CategoryData;
  equipment: CategoryData;
  profit:    CategoryData & { needed: number };
  profitBehind: number[];
};

/* ─────────────────── Helpers ─────────────────── */
const fmt$ = (n: number, compact = false) => {
  if (compact) {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
};
const pct = (a: number, b: number) => b === 0 ? "—" : `${((a / b) * 100).toFixed(1)}%`;
const activeMths = (arr: number[]) => arr.filter((v) => v !== 0).length;

const STATUS = (actual: number, budget: number, isCost: boolean) => {
  if (budget === 0) return "neutral";
  const ratio = actual / budget;
  if (isCost) return ratio > 1.05 ? "over" : ratio < 0.95 ? "under" : "on";
  return ratio >= 0.95 ? "on" : ratio >= 0.5 ? "behind" : "over";
};

const statusColors: Record<string, string> = {
  over: "#ef4444", on: "#22c55e", behind: "#f59e0b", under: "#3b82f6", neutral: "#9ca3af",
};
const statusLabels: Record<string, string> = {
  over: "Over Budget", on: "On Track", behind: "Behind", under: "Under Budget", neutral: "No Data",
};

/* ─────────────────── Custom Tooltip ─────────────────── */
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-gray-800 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-medium text-gray-800">{fmt$(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────── KPI Card ─────────────────── */
function KPICard({ label, value, sub, color, icon }: {
  label: string; value: string; sub: string; color: string; icon: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-start justify-between mb-3">
        <span className="text-2xl">{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</span>
      </div>
      <div className="text-2xl font-bold tracking-tight" style={{ color }}>{value}</div>
      <div className="text-xs text-gray-400 mt-1">{sub}</div>
    </div>
  );
}

/* ─────────────────── COGS Row ─────────────────── */
function CogsRow({ name, data, activeMonths, revActual, isCost = true }: {
  name: string; data: CategoryData; activeMonths: number; revActual: number; isCost?: boolean;
}) {
  const ytdActual = data.actual.slice(0, activeMonths).reduce((a, b) => a + b, 0);
  const ytdBudget = data.budget.slice(0, activeMonths).reduce((a, b) => a + b, 0);
  const variance = ytdActual - ytdBudget;
  const pctOfRev = revActual > 0 ? (ytdActual / revActual) * 100 : 0;
  const status = STATUS(ytdActual, ytdBudget, isCost);
  const barPct = ytdBudget > 0 ? Math.min((ytdActual / ytdBudget) * 100, 200) : 0;

  return (
    <div className="grid grid-cols-[180px_1fr_100px_100px_100px_100px] items-center gap-4 py-3.5 border-b border-gray-50 last:border-0">
      <div className="font-medium text-gray-800 text-sm">{name}</div>
      <div className="relative">
        <div className="h-5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(barPct, 100)}%`, background: statusColors[status], opacity: barPct > 100 ? 0.9 : 0.7 }}
          />
          {barPct > 100 && (
            <div className="absolute inset-0 flex items-center pl-2">
              <span className="text-[10px] font-bold text-red-700">OVER BUDGET</span>
            </div>
          )}
        </div>
      </div>
      <div className="text-sm font-semibold text-gray-800 text-right">{fmt$(ytdActual)}</div>
      <div className="text-sm text-gray-400 text-right">{fmt$(ytdBudget)}</div>
      <div className={`text-sm font-semibold text-right ${variance > 0 && isCost ? "text-red-500" : variance < 0 && isCost ? "text-blue-500" : "text-green-600"}`}>
        {variance >= 0 ? "+" : ""}{fmt$(variance)}
      </div>
      <div className="text-xs text-center">
        <span className="px-2 py-1 rounded-full font-semibold" style={{ background: statusColors[status] + "20", color: statusColors[status] }}>
          {statusLabels[status]}
        </span>
      </div>
    </div>
  );
}

/* ─────────────────── Main Page ─────────────────── */
export default function AtlasPerformancePage() {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/performance", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load data");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setLastRefresh(new Date());
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Auto-refresh every 5 minutes — stays in sync with any Google Sheet changes
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadData]);

  if (loading) return (
    <div className="min-h-screen bg-[#f0f4f0] flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-4 border-green-200 border-t-green-600 rounded-full animate-spin mx-auto" />
        <p className="text-gray-500 text-sm">Pulling live data from Google Sheets…</p>
      </div>
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen bg-[#f0f4f0] flex items-center justify-center">
      <div className="text-center space-y-2">
        <p className="text-red-500 font-semibold">Failed to load performance data</p>
        <p className="text-gray-400 text-sm">{error}</p>
        <button onClick={loadData} className="mt-3 px-4 py-2 bg-green-600 text-white rounded-lg text-sm">Retry</button>
      </div>
    </div>
  );

  const activeMonths = Math.max(activeMths(data.revenue.actual), 1);
  const monthLabels = data.months.map((m) => m.slice(0, 3));

  // YTD sums
  const ytdRevActual = data.revenue.actual.slice(0, activeMonths).reduce((a, b) => a + b, 0);
  const ytdRevBudget = data.revenue.budget.slice(0, activeMonths).reduce((a, b) => a + b, 0);
  const ytdProfActual = data.profit.actual.slice(0, activeMonths).reduce((a, b) => a + b, 0);
  const ytdProfBudget = data.profit.budget.slice(0, activeMonths).reduce((a, b) => a + b, 0);
  const ytdCogsActual = data.materials.actual.slice(0, activeMonths).reduce((a, b) => a + b, 0)
    + data.labor.actual.slice(0, activeMonths).reduce((a, b) => a + b, 0)
    + data.fuel.actual.slice(0, activeMonths).reduce((a, b) => a + b, 0)
    + data.equipment.actual.slice(0, activeMonths).reduce((a, b) => a + b, 0);

  // Monthly chart data
  const monthlyData = data.months.map((m, i) => ({
    month: m.slice(0, 3),
    "Revenue Budget": data.revenue.budget[i],
    "Revenue Actual": data.revenue.actual[i],
    "Profit Budget": data.profit.budget[i],
    "Profit Actual": data.profit.actual[i],
  }));

  const cogsMonthly = data.months.map((m, i) => ({
    month: m.slice(0, 3),
    Materials: data.materials.actual[i],
    Labor: data.labor.actual[i],
    Fuel: data.fuel.actual[i],
    Equipment: data.equipment.actual[i],
    "Labor Budget": data.labor.budget[i],
  }));

  const profitBehindData = data.months.map((m, i) => ({
    month: m.slice(0, 3),
    "Profit Behind": data.profitBehind[i],
  }));

  const minsAgo = Math.floor((Date.now() - lastRefresh.getTime()) / 60000);
  const refreshLabel = minsAgo === 0 ? "just now" : `${minsAgo}m ago`;

  return (
    <div className="min-h-screen bg-[#f0f4f0]">

      {/* ── Header ── */}
      <div style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}
        className="px-6 md:px-10 py-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="bg-green-400/20 border border-green-400/30 rounded-xl p-2">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                  <polyline points="16 7 22 7 22 13" />
                </svg>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">AtlasPerformance</h1>
              <span className="bg-green-500/20 border border-green-500/30 text-green-300 text-xs font-semibold px-3 py-1 rounded-full">
                {data.division}
              </span>
            </div>
            <p className="text-white/40 text-sm">Budget vs. Actual · 2026 Fiscal Year</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-white/60 text-xs">Live · refreshed {refreshLabel}</span>
            </div>
            <button
              onClick={loadData}
              className="bg-white/10 hover:bg-white/20 border border-white/10 text-white/70 hover:text-white rounded-xl px-4 py-2 text-xs font-medium transition-all flex items-center gap-2"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 md:px-10 py-8 max-w-7xl mx-auto space-y-8">

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard
            icon="💰"
            label="Revenue YTD"
            value={fmt$(ytdRevActual)}
            sub={`${pct(ytdRevActual, ytdRevBudget)} of YTD budget (${fmt$(ytdRevBudget, true)})`}
            color={ytdRevActual >= ytdRevBudget * 0.9 ? "#16a34a" : "#ef4444"}
          />
          <KPICard
            icon="🏗️"
            label="Total COGS YTD"
            value={fmt$(ytdCogsActual)}
            sub={`${pct(ytdCogsActual, ytdRevActual)} of revenue`}
            color={ytdCogsActual > ytdRevActual ? "#ef4444" : "#f59e0b"}
          />
          <KPICard
            icon="📈"
            label="Gross Profit YTD"
            value={fmt$(ytdProfActual)}
            sub={`Budget: ${fmt$(ytdProfBudget, true)} · ${pct(ytdProfActual, ytdProfBudget)} of target`}
            color={ytdProfActual >= 0 ? "#16a34a" : "#ef4444"}
          />
          <KPICard
            icon="🎯"
            label="Annual Profit Goal"
            value={fmt$(data.profit.totalBudget, true)}
            sub={`${fmt$(data.profit.needed, true)} needed to reach goal`}
            color="#6366f1"
          />
        </div>

        {/* ── Revenue Progress ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-bold text-gray-800">Annual Revenue Progress</h2>
              <p className="text-xs text-gray-400 mt-0.5">{fmt$(data.revenue.totalActual)} earned · {fmt$(data.revenue.remaining)} remaining to {fmt$(data.revenue.totalBudget, true)} goal</p>
            </div>
            <span className="text-sm font-semibold text-gray-500">{pct(data.revenue.totalActual, data.revenue.totalBudget)}</span>
          </div>
          <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full transition-all duration-700"
              style={{ width: `${Math.min((data.revenue.totalActual / data.revenue.totalBudget) * 100, 100)}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-400">
            <span>$0</span>
            <span className="text-green-600 font-semibold">{fmt$(data.revenue.totalActual)} actual</span>
            <span>{fmt$(data.revenue.totalBudget, true)} goal</span>
          </div>
        </div>

        {/* ── Monthly Revenue & Profit ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-bold text-gray-800 mb-1">Monthly Revenue</h2>
            <p className="text-xs text-gray-400 mb-5">Budget vs. Actual by month</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} barGap={2} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt$(v, true)} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar dataKey="Revenue Budget" fill="#d1fae5" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Revenue Actual" radius={[3, 3, 0, 0]}>
                  {monthlyData.map((entry, i) => (
                    <Cell key={i} fill={entry["Revenue Actual"] > 0 ? "#16a34a" : "#e5e7eb"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-bold text-gray-800 mb-1">Monthly Profit</h2>
            <p className="text-xs text-gray-400 mb-5">Budget vs. Actual (negative = loss)</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} barGap={2} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt$(v, true)} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <ReferenceLine y={0} stroke="#e5e7eb" />
                <Bar dataKey="Profit Budget" fill="#dbeafe" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Profit Actual" radius={[3, 3, 0, 0]}>
                  {monthlyData.map((entry, i) => (
                    <Cell key={i} fill={entry["Profit Actual"] >= 0 ? "#16a34a" : entry["Profit Actual"] < 0 ? "#ef4444" : "#e5e7eb"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── COGS Breakdown ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-bold text-gray-800 mb-1">COGS Breakdown — YTD</h2>
          <p className="text-xs text-gray-400 mb-6">First {activeMonths} month{activeMonths !== 1 ? "s" : ""} of {data.division} division · budget vs actual</p>

          {/* Header */}
          <div className="grid grid-cols-[180px_1fr_100px_100px_100px_100px] items-center gap-4 pb-2 mb-1 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Category</span>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">vs Budget</span>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">Actual</span>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">Budget</span>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">Variance</span>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center">Status</span>
          </div>

          <CogsRow name="Job Materials" data={data.materials} activeMonths={activeMonths} revActual={ytdRevActual} />
          <CogsRow name="Labor" data={data.labor} activeMonths={activeMonths} revActual={ytdRevActual} />
          <CogsRow name="Fuel" data={data.fuel} activeMonths={activeMonths} revActual={ytdRevActual} />
          <CogsRow name="Equipment" data={data.equipment} activeMonths={activeMonths} revActual={ytdRevActual} />

          {/* Totals */}
          <div className="grid grid-cols-[180px_1fr_100px_100px_100px_100px] items-center gap-4 pt-3 mt-2 border-t border-gray-200">
            <span className="text-sm font-bold text-gray-800">Total COGS</span>
            <div />
            <span className="text-sm font-bold text-gray-800 text-right">{fmt$(ytdCogsActual)}</span>
            <span className="text-sm text-gray-500 text-right">
              {fmt$(data.materials.budget.slice(0, activeMonths).reduce((a, b) => a + b, 0)
                + data.labor.budget.slice(0, activeMonths).reduce((a, b) => a + b, 0)
                + data.fuel.budget.slice(0, activeMonths).reduce((a, b) => a + b, 0)
                + data.equipment.budget.slice(0, activeMonths).reduce((a, b) => a + b, 0))}
            </span>
            <span className={`text-sm font-bold text-right ${ytdCogsActual > ytdRevActual ? "text-red-500" : "text-green-600"}`}>
              {pct(ytdCogsActual, ytdRevActual)} of rev
            </span>
            <div />
          </div>
        </div>

        {/* ── Monthly COGS Stacked ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-bold text-gray-800 mb-1">Monthly COGS Mix</h2>
            <p className="text-xs text-gray-400 mb-5">Materials · Labor · Fuel · Equipment</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={cogsMonthly} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt$(v, true)} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar dataKey="Materials" stackId="a" fill="#34d399" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Labor" stackId="a" fill="#f87171" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Fuel" stackId="a" fill="#fbbf24" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Equipment" stackId="a" fill="#818cf8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-bold text-gray-800 mb-1">Cumulative Profit Behind</h2>
            <p className="text-xs text-gray-400 mb-5">Running gap to annual profit target</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={profitBehindData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt$(v, true)} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0} stroke="#e5e7eb" strokeDasharray="4 4" />
                <Line dataKey="Profit Behind" stroke="#6366f1" strokeWidth={2.5} dot={{ fill: "#6366f1", r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Labor Alert ── */}
        {data.labor.totalActual / Math.max(data.revenue.totalActual, 1) > 1 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-start gap-4">
            <div className="text-2xl">⚠️</div>
            <div>
              <h3 className="text-sm font-bold text-red-800 mb-1">Labor Cost Alert</h3>
              <p className="text-sm text-red-600">
                Labor YTD ({fmt$(data.labor.totalActual)}) exceeds total revenue ({fmt$(data.revenue.totalActual)}).
                Labor is running at <strong>{((data.labor.totalActual / Math.max(data.revenue.totalActual, 1)) * 100).toFixed(0)}% of revenue</strong> — budget target is 24%.
                This is common in Q1 ramp-up but worth watching closely.
              </p>
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div className="text-center text-xs text-gray-300 pb-4">
          Live data from Google Sheets · auto-refreshes every 5 minutes · last fetched {new Date(data.lastFetched).toLocaleTimeString()}
        </div>

      </div>
    </div>
  );
}
