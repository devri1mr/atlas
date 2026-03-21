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
const fmtK = (n: number): string => {
  if (n === 0) return "—";
  const abs = Math.abs(n), sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000)    return `${sign}$${Math.round(abs / 1_000)}K`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${Math.round(abs)}`;
};
const fmtFull = (n: number): string =>
  n === 0 ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtPct = (n: number | null | undefined): string =>
  n == null ? "—" : `${Math.round(n)}%`;

/* ─── Section color palettes ─── */
// [headerBg, headerText, actualOverBg, actualOverText, actualUnderBg, actualUnderText, rowBudgetBg]
const PALETTES: Record<string, { hdr: string; sub: string; over: string; overTxt: string; under: string; underTxt: string; budget: string; pctRow: string }> = {
  revenue:   { hdr: "#14532d", sub: "#166534", over: "#fef2f2", overTxt: "#b91c1c", under: "#f0fdf4", underTxt: "#15803d", budget: "#f0fdf4", pctRow: "#f0fdf4" },
  materials: { hdr: "#1e3a8a", sub: "#1d4ed8", over: "#fef2f2", overTxt: "#b91c1c", under: "#eff6ff", underTxt: "#1d4ed8", budget: "#eff6ff", pctRow: "#dbeafe" },
  labor:     { hdr: "#7c2d12", sub: "#c2410c", over: "#fef2f2", overTxt: "#b91c1c", under: "#fff7ed", underTxt: "#c2410c", budget: "#fff7ed", pctRow: "#fed7aa" },
  fuel:      { hdr: "#713f12", sub: "#a16207", over: "#fef2f2", overTxt: "#b91c1c", under: "#fefce8", underTxt: "#a16207", budget: "#fefce8", pctRow: "#fef08a" },
  equipment: { hdr: "#4a1d96", sub: "#7c3aed", over: "#fef2f2", overTxt: "#b91c1c", under: "#faf5ff", underTxt: "#7c3aed", budget: "#faf5ff", pctRow: "#ede9fe" },
  profit:    { hdr: "#134e4a", sub: "#0f766e", over: "#fef2f2", overTxt: "#b91c1c", under: "#f0fdfa", underTxt: "#0f766e", budget: "#f0fdfa", pctRow: "#ccfbf1" },
  behind:    { hdr: "#312e81", sub: "#4338ca", over: "#fef2f2", overTxt: "#b91c1c", under: "#eef2ff", underTxt: "#4338ca", budget: "#eef2ff", pctRow: "#e0e7ff" },
};

/* ─── Month column alternating tint ─── */
const MONTH_TINTS = [
  "#f8fafc","#f1f5f9","#f8fafc","#f1f5f9","#f8fafc","#f1f5f9",
  "#f8fafc","#f1f5f9","#f8fafc","#f1f5f9","#f8fafc","#f1f5f9",
];

/* ─── Cell color logic ─── */
function revCellStyle(v: number): React.CSSProperties {
  if (v === 0) return { color: "#cbd5e1" };
  return { background: "#dcfce7", color: "#15803d", fontWeight: 600 };
}
function costCellStyle(actual: number, budget: number, p: typeof PALETTES.materials): React.CSSProperties {
  if (actual === 0) return { color: "#cbd5e1" };
  if (budget === 0) return { color: "#374151" };
  if (actual > budget * 1.02) return { background: p.over, color: p.overTxt, fontWeight: 600 };
  if (actual < budget * 0.98) return { background: p.under, color: p.underTxt };
  return { color: "#374151" };
}
function profitCellStyle(v: number): React.CSSProperties {
  if (v === 0) return { color: "#cbd5e1" };
  if (v > 0) return { background: "#dcfce7", color: "#15803d", fontWeight: 600 };
  return { background: "#fef2f2", color: "#b91c1c", fontWeight: 600 };
}
function behindCellStyle(v: number): React.CSSProperties {
  if (v === 0) return { color: "#cbd5e1" };
  if (v < 0) return { background: "#dcfce7", color: "#15803d", fontWeight: 600 }; // ahead = good
  return { background: "#ede9fe", color: "#4338ca", fontWeight: 600 };
}

const SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function AtlasPerformancePage() {
  const [data, setData]     = useState<Data | null>(null);
  const [error, setError]   = useState<string | null>(null);
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
      <div className="w-8 h-8 border-4 border-green-200 border-t-green-600 rounded-full animate-spin" />
    </div>
  );
  if (error || !data) return (
    <div className="min-h-screen bg-[#f0f4f0] flex items-center justify-center flex-col gap-3">
      <p className="text-red-500 font-semibold">{error || "Failed to load"}</p>
      <button onClick={load} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm">Retry</button>
    </div>
  );

  const minsAgo = Math.floor((Date.now() - lastRefresh.getTime()) / 60000);

  /* ─── Row builder helpers ─── */
  const Hdr = ({ label, pal }: { label: string; pal: typeof PALETTES.materials }) => (
    <tr>
      <td colSpan={15} style={{ background: pal.hdr, color: "#fff", fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", padding: "5px 10px" }}>
        {label}
      </td>
    </tr>
  );

  const cellBase: React.CSSProperties = { fontSize: 10, padding: "3px 4px", textAlign: "right", whiteSpace: "nowrap" };
  const labelBase: React.CSSProperties = { fontSize: 10, padding: "3px 8px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" };

  /* Money row */
  const MoneyRow = ({
    label, values, totalValue, totalPct, bgRow, cellStyleFn,
  }: {
    label: string; values: number[]; totalValue: number; totalPct?: number | null;
    bgRow: string; cellStyleFn: (v: number, i: number) => React.CSSProperties;
  }) => (
    <tr style={{ background: bgRow }}>
      <td style={{ ...labelBase, color: "#64748b", borderRight: "1px solid #e2e8f0" }}>{label}</td>
      {values.map((v, i) => (
        <td key={i} style={{ ...cellBase, background: MONTH_TINTS[i], ...cellStyleFn(v, i), borderRight: "1px solid #f1f5f9" }}>
          {fmtK(v)}
        </td>
      ))}
      <td style={{ ...cellBase, fontWeight: 700, borderLeft: "2px solid #e2e8f0", background: "#f8fafc", ...cellStyleFn(totalValue, -1) }}>
        {fmtFull(totalValue)}
      </td>
      <td style={{ ...cellBase, color: "#94a3b8", background: "#f8fafc", fontSize: 9 }}>
        {fmtPct(totalPct)}
      </td>
    </tr>
  );

  /* % of revenue row */
  const PctRow = ({ values, totalPct, pal }: { values: (number | null)[]; totalPct?: number | null; pal: typeof PALETTES.materials }) => (
    <tr style={{ background: pal.pctRow }}>
      <td style={{ ...labelBase, color: "#94a3b8", fontSize: 9, borderRight: "1px solid #e2e8f0" }}>% of Rev</td>
      {values.map((v, i) => (
        <td key={i} style={{ ...cellBase, fontSize: 9, color: v == null ? "#cbd5e1" : "#475569", background: MONTH_TINTS[i], borderRight: "1px solid #f1f5f9" }}>
          {fmtPct(v)}
        </td>
      ))}
      <td style={{ ...cellBase, fontWeight: 700, fontSize: 9, color: "#475569", borderLeft: "2px solid #e2e8f0", background: "#f8fafc" }}>{fmtPct(totalPct)}</td>
      <td style={{ background: "#f8fafc" }} />
    </tr>
  );

  /* Goal % row */
  const GoalRow = ({ values, pal }: { values: (number | null)[]; pal: typeof PALETTES.profit }) => (
    <tr style={{ background: pal.pctRow }}>
      <td style={{ ...labelBase, color: "#94a3b8", fontSize: 9, borderRight: "1px solid #e2e8f0" }}>Goal %</td>
      {values.map((v, i) => (
        <td key={i} style={{ ...cellBase, fontSize: 9, color: "#6366f1", background: MONTH_TINTS[i], borderRight: "1px solid #f1f5f9" }}>
          {fmtPct(v)}
        </td>
      ))}
      <td style={{ background: "#f8fafc", borderLeft: "2px solid #e2e8f0" }} /><td style={{ background: "#f8fafc" }} />
    </tr>
  );

  /* Spacer */
  const Gap = () => <tr style={{ height: 4, background: "#e2e8f0" }}><td colSpan={15} /></tr>;

  const P = PALETTES;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "#f0f4f0", overflow: "hidden" }}>

      {/* ── Header ── */}
      <div style={{ background: "linear-gradient(135deg,#0d2616 0%,#123b1f 55%,#1a5c2a 100%)", flexShrink: 0, padding: "10px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ background: "#fff", borderRadius: 10, padding: 4 }}>
              <Image src="/atlas-performance-logo.png" alt="Atlas Performance" width={36} height={36} style={{ objectFit: "contain", display: "block" }} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#fff", fontWeight: 800, fontSize: 16, letterSpacing: "-0.02em" }}>AtlasPerformance</span>
                <span style={{ background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.3)", color: "#4ade80", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>
                  {data.division}
                </span>
              </div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, marginTop: 1 }}>2026 Fiscal Year · Budget vs. Actual</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "4px 10px" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}>
                {minsAgo === 0 ? "Live" : `${minsAgo}m ago`} · auto-refreshes every 5 min
              </span>
            </div>
            <button onClick={load} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)", borderRadius: 10, padding: "4px 12px", fontSize: 10, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div style={{ flex: 1, overflow: "hidden", padding: "8px 10px 6px" }}>
        <div style={{ height: "100%", background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <table style={{ width: "100%", height: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "7%" }} />       {/* Label */}
              {SHORT.map((_, i) => <col key={i} style={{ width: "6%" }} />)}  {/* 12 months × 6% = 72% */}
              <col style={{ width: "7%" }} />       {/* Total */}
              <col style={{ width: "4%" }} />       {/* % */}
            </colgroup>

            {/* Column headers */}
            <thead>
              <tr style={{ background: "#0f1f14" }}>
                <th style={{ ...labelBase, color: "rgba(255,255,255,0.3)", textAlign: "left", borderRight: "1px solid rgba(255,255,255,0.08)", padding: "6px 8px" }}>Category</th>
                {SHORT.map((m, i) => {
                  const hasData = data.revenue.actual[i] > 0;
                  return (
                    <th key={i} style={{ ...cellBase, fontWeight: 700, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: hasData ? "#4ade80" : "rgba(255,255,255,0.25)", background: MONTH_TINTS[i], borderRight: "1px solid rgba(255,255,255,0.05)", padding: "6px 4px" }}>
                      {m}
                    </th>
                  );
                })}
                <th style={{ ...cellBase, fontWeight: 700, fontSize: 10, color: "rgba(255,255,255,0.6)", borderLeft: "2px solid rgba(255,255,255,0.12)", padding: "6px 4px" }}>Total</th>
                <th style={{ ...cellBase, fontSize: 9, color: "rgba(255,255,255,0.25)", padding: "6px 4px" }}>%</th>
              </tr>
            </thead>

            <tbody>

              {/* ── REVENUE ── */}
              <Hdr label="Revenue" pal={P.revenue} />
              <MoneyRow label="Actual"   values={data.revenue.actual} totalValue={data.revenue.totalActual} bgRow="#fff" cellStyleFn={(v) => revCellStyle(v)} />
              <MoneyRow label="Budget"   values={data.revenue.budget} totalValue={data.revenue.totalBudget} bgRow={P.revenue.budget} cellStyleFn={() => ({ color: "#374151" })} />
              <Gap />

              {/* ── JOB MATERIALS ── */}
              <Hdr label="Job Materials" pal={P.materials} />
              <MoneyRow label="Actual"  values={data.materials.actual} totalValue={data.materials.totalActual} totalPct={data.materials.totalPctActual}
                bgRow="#fff" cellStyleFn={(v, i) => costCellStyle(v, data.materials.budget[i] ?? 0, P.materials)} />
              <MoneyRow label="Budget"  values={data.materials.budget} totalValue={data.materials.totalBudget} totalPct={data.materials.totalPctBudget}
                bgRow={P.materials.budget} cellStyleFn={() => ({ color: "#374151" })} />
              <PctRow values={data.materials.pct ?? []} totalPct={data.materials.totalPctActual} pal={P.materials} />
              <Gap />

              {/* ── LABOR ── */}
              <Hdr label="Labor" pal={P.labor} />
              <MoneyRow label="Actual"  values={data.labor.actual} totalValue={data.labor.totalActual} totalPct={data.labor.totalPctActual}
                bgRow="#fff" cellStyleFn={(v, i) => costCellStyle(v, data.labor.budget[i] ?? 0, P.labor)} />
              <MoneyRow label="Budget"  values={data.labor.budget} totalValue={data.labor.totalBudget} totalPct={data.labor.totalPctBudget}
                bgRow={P.labor.budget} cellStyleFn={() => ({ color: "#374151" })} />
              <PctRow values={data.labor.pct ?? []} totalPct={data.labor.totalPctActual} pal={P.labor} />
              <Gap />

              {/* ── FUEL ── */}
              <Hdr label="Fuel" pal={P.fuel} />
              <MoneyRow label="Actual"  values={data.fuel.actual} totalValue={data.fuel.totalActual} totalPct={data.fuel.totalPctActual}
                bgRow="#fff" cellStyleFn={(v, i) => costCellStyle(v, data.fuel.budget[i] ?? 0, P.fuel)} />
              <MoneyRow label="Budget"  values={data.fuel.budget} totalValue={data.fuel.totalBudget} totalPct={data.fuel.totalPctBudget}
                bgRow={P.fuel.budget} cellStyleFn={() => ({ color: "#374151" })} />
              <PctRow values={data.fuel.pct ?? []} totalPct={data.fuel.totalPctActual} pal={P.fuel} />
              <Gap />

              {/* ── EQUIPMENT ── */}
              <Hdr label="Equipment" pal={P.equipment} />
              <MoneyRow label="Actual"  values={data.equipment.actual} totalValue={data.equipment.totalActual} totalPct={data.equipment.totalPctActual}
                bgRow="#fff" cellStyleFn={(v, i) => costCellStyle(v, data.equipment.budget[i] ?? 0, P.equipment)} />
              <MoneyRow label="Budget"  values={data.equipment.budget} totalValue={data.equipment.totalBudget} totalPct={data.equipment.totalPctBudget}
                bgRow={P.equipment.budget} cellStyleFn={() => ({ color: "#374151" })} />
              <PctRow values={data.equipment.pct ?? []} totalPct={data.equipment.totalPctActual} pal={P.equipment} />
              <Gap />

              {/* ── PROFIT ── */}
              <Hdr label="Profit" pal={P.profit} />
              <MoneyRow label="Actual"  values={data.profit.actual} totalValue={data.profit.totalActual} totalPct={data.profit.totalPctActual}
                bgRow="#fff" cellStyleFn={(v) => profitCellStyle(v)} />
              <MoneyRow label="Budget"  values={data.profit.budget} totalValue={data.profit.totalBudget} totalPct={data.profit.totalPctBudget}
                bgRow={P.profit.budget} cellStyleFn={() => ({ color: "#374151" })} />
              <PctRow values={data.profit.pct ?? []} totalPct={data.profit.totalPctActual} pal={P.profit} />
              {data.profit.goal && <GoalRow values={data.profit.goal} pal={P.profit} />}
              <Gap />

              {/* ── PROFIT BEHIND ── */}
              <Hdr label="Profit Behind (Cumulative)" pal={P.behind} />
              <MoneyRow label="Running"  values={data.profitBehind} totalValue={data.profit.needed}
                bgRow="#fff" cellStyleFn={(v) => behindCellStyle(v)} />

            </tbody>
          </table>
        </div>
      </div>

      {/* ── Legend ── */}
      <div style={{ flexShrink: 0, padding: "4px 12px 6px", display: "flex", alignItems: "center", gap: 16, justifyContent: "center" }}>
        {[
          { bg: "#dcfce7", color: "#15803d", label: "Under budget / Positive" },
          { bg: "#fef2f2", color: "#b91c1c", label: "Over budget / Negative" },
          { bg: "#eff6ff", color: "#1d4ed8", label: "Under budget" },
          { bg: "#ede9fe", color: "#4338ca", label: "Ahead of goal" },
          { color: "#cbd5e1", bg: "transparent", label: "No data yet" },
        ].map((l) => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: l.bg, border: "1px solid " + l.color, display: "inline-block" }} />
            <span style={{ fontSize: 9, color: "#94a3b8" }}>{l.label}</span>
          </div>
        ))}
      </div>

    </div>
  );
}
