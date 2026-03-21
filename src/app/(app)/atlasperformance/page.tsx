"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";

/* ─── Types ─── */
type Cat = {
  actual: number[]; budget: number[];
  pct?: (number | null)[];
  goal?: (number | null)[];
  totalActual: number; totalBudget: number;
  totalPctActual?: number | null; totalPctBudget?: number | null;
};
type Data = {
  division: string; lastFetched: string; months: string[];
  revenue: Cat & { remaining: number };
  materials: Cat; labor: Cat; fuel: Cat; equipment: Cat;
  profit: Cat & { needed: number };
  profitBehind: number[];
};

/* ─── Formatters ─── */
const fmt$ = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const fmtPct = (n: number | null | undefined) =>
  n == null ? "—" : `${n % 1 === 0 ? n : n.toFixed(1)}%`;

const cell$ = (n: number) => (n === 0 ? "—" : fmt$(n));

/* ─── Month short names ─── */
const SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/* ─── Color helpers ─── */
// Revenue actual: green if has money, gray if zero
const revActualColor = (v: number) => v > 0 ? "#15803d" : "#9ca3af";
// Cost actual vs budget: red if over, blue if under, gray if zero
const costColor = (actual: number, budget: number) => {
  if (actual === 0 && budget === 0) return "#9ca3af";
  if (actual === 0) return "#9ca3af";
  if (actual > budget * 1.02) return "#dc2626";
  if (actual < budget * 0.98) return "#2563eb";
  return "#374151";
};
// Profit color
const profitColor = (n: number) => n > 0 ? "#15803d" : n < 0 ? "#dc2626" : "#9ca3af";
// % of revenue color for costs (high % = bad)
const pctColor = (pct: number | null, budgetPct: number | null) => {
  if (pct == null) return "#9ca3af";
  if (budgetPct == null) return "#374151";
  if (pct > budgetPct * 1.1) return "#dc2626";
  if (pct < budgetPct * 0.9) return "#2563eb";
  return "#374151";
};

/* ─── Table row components ─── */
const COL_W = "min-w-[80px] w-20";

function SectionHeader({ label }: { label: string }) {
  return (
    <tr className="bg-[#1a3a22]">
      <td colSpan={16} className="px-4 py-1.5 text-xs font-bold text-white/80 tracking-widest uppercase">
        {label}
      </td>
    </tr>
  );
}

function MoneyRow({
  label, values, totalValue, totalPct, colorFn, dim,
}: {
  label: string;
  values: number[];
  totalValue: number;
  totalPct?: number | null;
  colorFn?: (v: number, i: number) => string;
  dim?: boolean;
}) {
  return (
    <tr className={`border-b border-gray-100 ${dim ? "bg-gray-50/50" : "bg-white"} hover:bg-green-50/30 transition-colors`}>
      <td className="sticky left-0 z-10 bg-inherit px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap border-r border-gray-100 min-w-[110px]">
        {label}
      </td>
      {values.map((v, i) => (
        <td key={i} className={`${COL_W} px-2 py-2.5 text-right text-sm tabular-nums whitespace-nowrap`}
          style={{ color: colorFn ? colorFn(v, i) : v === 0 ? "#9ca3af" : "#374151" }}>
          {cell$(v)}
        </td>
      ))}
      <td className="min-w-[90px] px-2 py-2.5 text-right text-sm font-bold tabular-nums whitespace-nowrap border-l border-gray-200"
        style={{ color: colorFn ? colorFn(totalValue, -1) : totalValue === 0 ? "#9ca3af" : "#374151" }}>
        {cell$(totalValue)}
      </td>
      <td className="min-w-[60px] px-2 py-2.5 text-right text-xs tabular-nums whitespace-nowrap text-gray-400">
        {fmtPct(totalPct)}
      </td>
    </tr>
  );
}

function PctRow({
  values, totalPct, budgetPcts,
}: {
  values: (number | null)[];
  totalPct?: number | null;
  budgetPcts?: (number | null)[];
}) {
  return (
    <tr className="bg-gray-50 border-b border-gray-100">
      <td className="sticky left-0 z-10 bg-gray-50 px-4 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-r border-gray-100 min-w-[110px]">
        % of Rev
      </td>
      {values.map((v, i) => (
        <td key={i} className={`${COL_W} px-2 py-1.5 text-right text-xs tabular-nums whitespace-nowrap`}
          style={{ color: pctColor(v, budgetPcts?.[i] ?? null) }}>
          {fmtPct(v)}
        </td>
      ))}
      <td className="min-w-[90px] px-2 py-1.5 text-right text-xs font-bold tabular-nums whitespace-nowrap border-l border-gray-200"
        style={{ color: "#374151" }}>
        {fmtPct(totalPct)}
      </td>
      <td className="min-w-[60px]" />
    </tr>
  );
}

function GoalRow({ values }: { values: (number | null)[] }) {
  return (
    <tr className="bg-gray-50 border-b border-gray-200">
      <td className="sticky left-0 z-10 bg-gray-50 px-4 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-r border-gray-100 min-w-[110px]">
        Goal %
      </td>
      {values.map((v, i) => (
        <td key={i} className={`${COL_W} px-2 py-1.5 text-right text-xs tabular-nums whitespace-nowrap text-indigo-400`}>
          {fmtPct(v)}
        </td>
      ))}
      <td className="min-w-[90px]" />
      <td className="min-w-[60px]" />
    </tr>
  );
}

function Spacer() {
  return <tr className="h-2 bg-[#f0f4f0]"><td colSpan={16} /></tr>;
}

/* ─── Main Page ─── */
export default function AtlasPerformancePage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/performance", { cache: "no-store" });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setLastRefresh(new Date());
      setError(null);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) return (
    <div className="min-h-screen bg-[#f0f4f0] flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-4 border-green-200 border-t-green-600 rounded-full animate-spin mx-auto" />
        <p className="text-gray-400 text-sm">Pulling live data…</p>
      </div>
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen bg-[#f0f4f0] flex items-center justify-center">
      <div className="text-center space-y-2">
        <p className="text-red-500 font-semibold">Failed to load</p>
        <p className="text-gray-400 text-sm">{error}</p>
        <button onClick={load} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm mt-2">Retry</button>
      </div>
    </div>
  );

  const minsAgo = Math.floor((Date.now() - lastRefresh.getTime()) / 60000);

  // Budget % of revenue by month (for % row coloring reference)
  const matBudgetPcts = data.materials.budget.map((b, i) =>
    data.revenue.budget[i] > 0 ? (b / data.revenue.budget[i]) * 100 : null);
  const laborBudgetPcts = data.labor.budget.map((b, i) =>
    data.revenue.budget[i] > 0 ? (b / data.revenue.budget[i]) * 100 : null);
  const fuelBudgetPcts = data.fuel.budget.map((b, i) =>
    data.revenue.budget[i] > 0 ? (b / data.revenue.budget[i]) * 100 : null);
  const equipBudgetPcts = data.equipment.budget.map((b, i) =>
    data.revenue.budget[i] > 0 ? (b / data.revenue.budget[i]) * 100 : null);

  return (
    <div className="min-h-screen bg-[#f0f4f0]">

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}
        className="px-6 md:px-10 py-6">
        <div className="max-w-full flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-white rounded-xl p-1.5 shadow-sm">
              <Image src="/atlas-performance-logo.png" alt="Atlas Performance" width={44} height={44} className="object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">AtlasPerformance</h1>
                <span className="bg-green-500/20 border border-green-500/30 text-green-300 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                  {data.division}
                </span>
              </div>
              <p className="text-white/40 text-xs mt-0.5">2026 Fiscal Year · Budget vs. Actual</p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-white/50 text-xs">{minsAgo === 0 ? "Live" : `${minsAgo}m ago`}</span>
            </div>
            <button onClick={load}
              className="bg-white/10 hover:bg-white/20 border border-white/10 text-white/70 hover:text-white rounded-xl px-3 py-1.5 text-xs font-medium transition-all flex items-center gap-1.5">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="p-4 md:p-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">

              {/* Column headers */}
              <thead>
                <tr className="bg-[#123b1f]">
                  <th className="sticky left-0 z-20 bg-[#123b1f] px-4 py-3 text-left text-xs font-bold text-white/60 uppercase tracking-widest border-r border-white/10 min-w-[110px]">
                    Category
                  </th>
                  {SHORT.map((m, i) => (
                    <th key={i} className={`${COL_W} px-2 py-3 text-right text-xs font-bold text-white/60 uppercase tracking-wide`}>
                      {m}
                    </th>
                  ))}
                  <th className="min-w-[90px] px-2 py-3 text-right text-xs font-bold text-white/80 uppercase tracking-wide border-l border-white/10">
                    Total
                  </th>
                  <th className="min-w-[60px] px-2 py-3 text-right text-xs font-bold text-white/40 uppercase tracking-wide">
                    %
                  </th>
                </tr>
              </thead>

              <tbody>

                {/* ── REVENUE ── */}
                <SectionHeader label="Revenue" />
                <MoneyRow
                  label="Actual"
                  values={data.revenue.actual}
                  totalValue={data.revenue.totalActual}
                  colorFn={(v) => revActualColor(v)}
                />
                <MoneyRow
                  label="Budgeted"
                  values={data.revenue.budget}
                  totalValue={data.revenue.totalBudget}
                  dim
                />
                <Spacer />

                {/* ── JOB MATERIALS ── */}
                <SectionHeader label="Job Materials" />
                <MoneyRow
                  label="Actual"
                  values={data.materials.actual}
                  totalValue={data.materials.totalActual}
                  totalPct={data.materials.totalPctActual}
                  colorFn={(v, i) => i === -1 ? costColor(data.materials.totalActual, data.materials.totalBudget) : costColor(v, data.materials.budget[i])}
                />
                <MoneyRow label="Budgeted" values={data.materials.budget} totalValue={data.materials.totalBudget} totalPct={data.materials.totalPctBudget} dim />
                <PctRow values={data.materials.pct ?? []} totalPct={data.materials.totalPctActual} budgetPcts={matBudgetPcts} />
                <Spacer />

                {/* ── LABOR ── */}
                <SectionHeader label="Labor" />
                <MoneyRow
                  label="Actual"
                  values={data.labor.actual}
                  totalValue={data.labor.totalActual}
                  totalPct={data.labor.totalPctActual}
                  colorFn={(v, i) => i === -1 ? costColor(data.labor.totalActual, data.labor.totalBudget) : costColor(v, data.labor.budget[i])}
                />
                <MoneyRow label="Budgeted" values={data.labor.budget} totalValue={data.labor.totalBudget} totalPct={data.labor.totalPctBudget} dim />
                <PctRow values={data.labor.pct ?? []} totalPct={data.labor.totalPctActual} budgetPcts={laborBudgetPcts} />
                <Spacer />

                {/* ── FUEL ── */}
                <SectionHeader label="Fuel" />
                <MoneyRow
                  label="Actual"
                  values={data.fuel.actual}
                  totalValue={data.fuel.totalActual}
                  totalPct={data.fuel.totalPctActual}
                  colorFn={(v, i) => i === -1 ? costColor(data.fuel.totalActual, data.fuel.totalBudget) : costColor(v, data.fuel.budget[i])}
                />
                <MoneyRow label="Budgeted" values={data.fuel.budget} totalValue={data.fuel.totalBudget} totalPct={data.fuel.totalPctBudget} dim />
                <PctRow values={data.fuel.pct ?? []} totalPct={data.fuel.totalPctActual} budgetPcts={fuelBudgetPcts} />
                <Spacer />

                {/* ── EQUIPMENT ── */}
                <SectionHeader label="Equipment" />
                <MoneyRow
                  label="Actual"
                  values={data.equipment.actual}
                  totalValue={data.equipment.totalActual}
                  totalPct={data.equipment.totalPctActual}
                  colorFn={(v, i) => i === -1 ? costColor(data.equipment.totalActual, data.equipment.totalBudget) : costColor(v, data.equipment.budget[i])}
                />
                <MoneyRow label="Budgeted" values={data.equipment.budget} totalValue={data.equipment.totalBudget} totalPct={data.equipment.totalPctBudget} dim />
                <PctRow values={data.equipment.pct ?? []} totalPct={data.equipment.totalPctActual} budgetPcts={equipBudgetPcts} />
                <Spacer />

                {/* ── PROFIT ── */}
                <SectionHeader label="Profit" />
                <MoneyRow
                  label="Actual"
                  values={data.profit.actual}
                  totalValue={data.profit.totalActual}
                  totalPct={data.profit.totalPctActual}
                  colorFn={(v) => profitColor(v)}
                />
                <MoneyRow label="Budgeted" values={data.profit.budget} totalValue={data.profit.totalBudget} totalPct={data.profit.totalPctBudget} dim />
                <PctRow values={data.profit.pct ?? []} totalPct={data.profit.totalPctActual} />
                {data.profit.goal && <GoalRow values={data.profit.goal} />}
                <Spacer />

                {/* ── PROFIT BEHIND ── */}
                <SectionHeader label="Profit Behind (Cumulative)" />
                <MoneyRow
                  label="Running Total"
                  values={data.profitBehind}
                  totalValue={data.profit.needed}
                  colorFn={(v) => v > 0 ? "#4f46e5" : v < 0 ? "#15803d" : "#9ca3af"}
                />

              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-300">
              Live from Google Sheets · auto-refreshes every 5 min
            </span>
            <span className="text-xs text-gray-300">
              Last fetched {new Date(data.lastFetched).toLocaleTimeString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
