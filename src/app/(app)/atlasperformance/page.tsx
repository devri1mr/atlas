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
const fmt$ = (n: number): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const fmtCell = (n: number): string => {
  if (n === 0) return "$0";
  return fmt$(n);
};

const fmtPct = (n: number | null | undefined): string =>
  n == null ? "" : `${Math.round(n)}%`;

const SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/* ─── Styles ─── */
const YELLOW = "#fff59d";
const YELLOW_HDR = "#fdd835";

const base: React.CSSProperties = {
  fontSize: 10, padding: "2px 4px", textAlign: "right",
  whiteSpace: "nowrap", overflow: "hidden", borderRight: "1px solid #d1d5db",
};
const labelStyle: React.CSSProperties = {
  fontSize: 10, padding: "2px 6px", fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.05em", whiteSpace: "nowrap", textAlign: "left",
  borderRight: "1px solid #d1d5db", color: "#374151",
};

/* ─── Section palettes ─── */
const SEC: Record<string, { hdr: string; txt: string; stripe: string }> = {
  revenue:   { hdr: "#14532d", txt: "#fff", stripe: "#f0fdf4" },
  materials: { hdr: "#1e3a8a", txt: "#fff", stripe: "#eff6ff" },
  labor:     { hdr: "#7c2d12", txt: "#fff", stripe: "#fff7ed" },
  fuel:      { hdr: "#78350f", txt: "#fff", stripe: "#fefce8" },
  equipment: { hdr: "#4a1d96", txt: "#fff", stripe: "#faf5ff" },
  profit:    { hdr: "#134e4a", txt: "#fff", stripe: "#f0fdfa" },
  behind:    { hdr: "#1e1b4b", txt: "#fff", stripe: "#eef2ff" },
};

export default function AtlasPerformancePage() {
  const [data, setData]       = useState<Data | null>(null);
  const [error, setError]     = useState<string | null>(null);
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

  // Detect current month = last month with actual revenue data
  const currentMonth = data.revenue.actual.reduce((last, v, i) => v !== 0 ? i : last, -1);
  const minsAgo = Math.floor((Date.now() - lastRefresh.getTime()) / 60000);

  /* ── Cell background helpers ── */
  const colBg = (i: number, isCurrent: boolean): string => {
    if (isCurrent) return YELLOW;
    return i % 2 === 0 ? "#fff" : "#f9fafb";
  };

  const revActualBg = (v: number, i: number): string => {
    const cur = i === currentMonth;
    if (v > 0) return cur ? "#fef08a" : "#dcfce7";
    return colBg(i, cur);
  };

  const costBg = (actual: number, budget: number, i: number): string => {
    const cur = i === currentMonth;
    if (actual === 0) return colBg(i, cur);
    if (budget > 0 && actual > budget * 1.02) return cur ? "#fca5a5" : "#fee2e2"; // over = red
    if (budget > 0 && actual < budget * 0.98) return cur ? "#bfdbfe" : "#dbeafe"; // under = blue
    return colBg(i, cur);
  };

  const profitBg = (v: number, i: number): string => {
    const cur = i === currentMonth;
    if (v > 0) return cur ? "#fef08a" : "#dcfce7";
    if (v < 0) return cur ? "#fca5a5" : "#fee2e2";
    return colBg(i, cur);
  };

  const pctColor = (v: number | null): string => {
    if (v == null || v === 0) return "#9ca3af";
    if (v < 0) return "#dc2626";
    if (v > 100) return "#dc2626";
    return "#374151";
  };

  /* ── Row renderers ── */
  const SectionHdr = ({ label, sec }: { label: string; sec: keyof typeof SEC }) => (
    <tr>
      <td colSpan={15} style={{
        background: SEC[sec].hdr, color: SEC[sec].txt,
        fontSize: 10, fontWeight: 900, letterSpacing: "0.15em",
        textTransform: "uppercase", padding: "4px 8px",
        borderBottom: "2px solid rgba(255,255,255,0.2)",
      }}>
        {label}
      </td>
    </tr>
  );

  type RowMode = "actual" | "budget" | "pct" | "goal" | "behind";

  const DataRow = ({
    mode, label, values, totalValue, totalPct, sec,
    bgFn, colorFn, pctValues,
  }: {
    mode: RowMode; label: string; values: number[]; totalValue: number;
    totalPct?: number | null; sec: keyof typeof SEC;
    bgFn?: (v: number, i: number) => string;
    colorFn?: (v: number, i: number) => string;
    pctValues?: (number | null)[];
  }) => {
    const isBudget = mode === "budget";
    const isPct    = mode === "pct" || mode === "goal";
    const isBehind = mode === "behind";

    return (
      <tr style={{ background: isBudget ? SEC[sec].stripe : isPct ? SEC[sec].stripe : "#fff" }}>
        {/* Row label */}
        <td style={{
          ...labelStyle,
          fontStyle: isBudget ? "italic" : "normal",
          fontWeight: isBudget ? 800 : isPct ? 400 : 700,
          color: isPct ? "#6b7280" : "#1f2937",
          fontSize: isPct ? 9 : 10,
          background: isBudget ? SEC[sec].stripe : isPct ? SEC[sec].stripe : "#fff",
        }}>
          {label}
        </td>

        {/* Month cells */}
        {Array.from({ length: 12 }, (_, i) => {
          const isCur = i === currentMonth;

          if (isPct) {
            const v = pctValues?.[i] ?? null;
            return (
              <td key={i} style={{ ...base, fontSize: 9,
                background: isCur ? YELLOW : i % 2 === 0 ? SEC[sec].stripe : "#f9fafb",
                color: pctColor(v), fontWeight: v !== null && Math.abs(v) > 100 ? 700 : 400,
              }}>
                {fmtPct(v)}
              </td>
            );
          }

          if (isBehind) {
            // Only show in current month
            const v = i === currentMonth ? values[i] : 0;
            return (
              <td key={i} style={{ ...base,
                background: isCur ? YELLOW : colBg(i, false),
                color: v > 0 ? "#4338ca" : v < 0 ? "#15803d" : "#d1d5db",
                fontWeight: isCur ? 700 : 400,
              }}>
                {isCur && v !== 0 ? fmt$(v) : ""}
              </td>
            );
          }

          const v = values[i];
          const bg = bgFn ? bgFn(v, i) : colBg(i, isCur);
          const color = colorFn ? colorFn(v, i)
            : v === 0 ? "#d1d5db"
            : isBudget ? "#374151"
            : "#1f2937";

          return (
            <td key={i} style={{ ...base, background: bg, color,
              fontWeight: isBudget ? 700 : v !== 0 ? 600 : 400,
              fontStyle: isBudget ? "italic" : "normal",
            }}>
              {fmtCell(v)}
            </td>
          );
        })}

        {/* Total */}
        <td style={{ ...base, fontWeight: 800, borderLeft: "2px solid #9ca3af",
          background: isPct ? "#f1f5f9" : isBudget ? "#f1f5f9" : "#f8fafc",
          color: totalValue === 0 && !isPct ? "#d1d5db" : "#1f2937",
          fontStyle: isBudget ? "italic" : "normal",
        }}>
          {isPct ? fmtPct(totalPct) : isBehind ? "" : fmtCell(totalValue)}
        </td>

        {/* % column */}
        <td style={{ ...base, fontSize: 9, background: "#f1f5f9",
          color: pctColor(totalPct ?? null),
          fontWeight: totalPct != null && Math.abs(totalPct) > 50 ? 700 : 400,
        }}>
          {!isPct && !isBehind ? fmtPct(totalPct) : ""}
        </td>
      </tr>
    );
  };

  const Gap = () => (
    <tr style={{ height: 3, background: "#e5e7eb" }}><td colSpan={15} /></tr>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "#e5e7eb", overflow: "hidden" }}>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#0d2616 0%,#123b1f 55%,#1a5c2a 100%)", padding: "8px 16px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ background: "#fff", borderRadius: 8, padding: 3 }}>
              <Image src="/atlas-performance-logo.png" alt="Atlas Performance" width={32} height={32} style={{ objectFit: "contain", display: "block" }} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#fff", fontWeight: 800, fontSize: 15, letterSpacing: "-0.02em" }}>AtlasPerformance</span>
                <span style={{ background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.3)", color: "#4ade80", fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 20 }}>
                  {data.division}
                </span>
              </div>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9 }}>2026 · Budget vs. Actual · Live from Google Sheets</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Legend */}
            <div style={{ display: "flex", gap: 10, marginRight: 8 }}>
              {[
                { bg: "#dcfce7", label: "Under / Positive" },
                { bg: "#fee2e2", label: "Over / Negative" },
                { bg: "#dbeafe", label: "Under budget" },
                { bg: YELLOW,    label: "Current month" },
              ].map(l => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: l.bg, border: "1px solid rgba(255,255,255,0.3)", display: "inline-block" }} />
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>{l.label}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "3px 8px" }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 9 }}>{minsAgo === 0 ? "Live" : `${minsAgo}m ago`}</span>
            </div>
            <button onClick={load} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)", borderRadius: 8, padding: "3px 10px", fontSize: 9, fontWeight: 600, cursor: "pointer" }}>
              ↻ Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Table container */}
      <div style={{ flex: 1, overflow: "hidden", padding: "6px" }}>
        <div style={{ height: "100%", background: "#fff", borderRadius: 10, border: "1px solid #d1d5db", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <table style={{ width: "100%", height: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "7.5%" }} />
              {SHORT.map((_, i) => <col key={i} style={{ width: `${(85 / 12).toFixed(2)}%` }} />)}
              <col style={{ width: "5.5%" }} />
              <col style={{ width: "3%" }} />
            </colgroup>

            <thead>
              <tr style={{ background: "#111827" }}>
                <th style={{ ...base, textAlign: "left", color: "rgba(255,255,255,0.4)", fontSize: 9, padding: "5px 6px", fontWeight: 700, letterSpacing: "0.08em", borderRight: "1px solid rgba(255,255,255,0.1)" }}>
                  CATEGORY
                </th>
                {SHORT.map((m, i) => {
                  const isCur = i === currentMonth;
                  return (
                    <th key={i} style={{ ...base, fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
                      color: isCur ? "#1a1a1a" : i <= currentMonth ? "#e5e7eb" : "rgba(255,255,255,0.25)",
                      background: isCur ? YELLOW_HDR : "transparent",
                      padding: "5px 4px", borderRight: "1px solid rgba(255,255,255,0.08)",
                    }}>
                      {m}
                    </th>
                  );
                })}
                <th style={{ ...base, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.6)", borderLeft: "2px solid rgba(255,255,255,0.15)", padding: "5px 4px" }}>Total</th>
                <th style={{ ...base, fontSize: 9, color: "rgba(255,255,255,0.3)", padding: "5px 4px" }}>%</th>
              </tr>
            </thead>

            <tbody>
              {/* REVENUE */}
              <SectionHdr label="Revenue" sec="revenue" />
              <DataRow mode="actual" label="Actual"   sec="revenue" values={data.revenue.actual} totalValue={data.revenue.totalActual}
                bgFn={revActualBg}
                colorFn={(v) => v > 0 ? "#15803d" : "#d1d5db"}
              />
              <DataRow mode="budget" label="Budgeted" sec="revenue" values={data.revenue.budget} totalValue={data.revenue.totalBudget} />
              <Gap />

              {/* JOB MATERIALS */}
              <SectionHdr label="Job Materials" sec="materials" />
              <DataRow mode="actual" label="Actual"   sec="materials" values={data.materials.actual} totalValue={data.materials.totalActual} totalPct={data.materials.totalPctActual}
                bgFn={(v, i) => costBg(v, data.materials.budget[i], i)}
                colorFn={(v, i) => v === 0 ? "#d1d5db" : v > (data.materials.budget[i] ?? 0) * 1.02 ? "#b91c1c" : v < (data.materials.budget[i] ?? 0) * 0.98 ? "#1d4ed8" : "#1f2937"}
              />
              <DataRow mode="budget" label="Budgeted" sec="materials" values={data.materials.budget} totalValue={data.materials.totalBudget} totalPct={data.materials.totalPctBudget} />
              <DataRow mode="pct"    label="% of Rev" sec="materials" values={[]} totalValue={0} totalPct={data.materials.totalPctActual} pctValues={data.materials.pct} />
              <Gap />

              {/* LABOR */}
              <SectionHdr label="Labor" sec="labor" />
              <DataRow mode="actual" label="Actual"   sec="labor" values={data.labor.actual} totalValue={data.labor.totalActual} totalPct={data.labor.totalPctActual}
                bgFn={(v, i) => costBg(v, data.labor.budget[i], i)}
                colorFn={(v, i) => v === 0 ? "#d1d5db" : v > (data.labor.budget[i] ?? 0) * 1.02 ? "#b91c1c" : v < (data.labor.budget[i] ?? 0) * 0.98 ? "#1d4ed8" : "#1f2937"}
              />
              <DataRow mode="budget" label="Budgeted" sec="labor" values={data.labor.budget} totalValue={data.labor.totalBudget} totalPct={data.labor.totalPctBudget} />
              <DataRow mode="pct"    label="% of Rev" sec="labor" values={[]} totalValue={0} totalPct={data.labor.totalPctActual} pctValues={data.labor.pct} />
              <Gap />

              {/* FUEL */}
              <SectionHdr label="Fuel" sec="fuel" />
              <DataRow mode="actual" label="Actual"   sec="fuel" values={data.fuel.actual} totalValue={data.fuel.totalActual} totalPct={data.fuel.totalPctActual}
                bgFn={(v, i) => costBg(v, data.fuel.budget[i], i)}
                colorFn={(v, i) => v === 0 ? "#d1d5db" : v > (data.fuel.budget[i] ?? 0) * 1.02 ? "#b91c1c" : v < (data.fuel.budget[i] ?? 0) * 0.98 ? "#1d4ed8" : "#1f2937"}
              />
              <DataRow mode="budget" label="Budgeted" sec="fuel" values={data.fuel.budget} totalValue={data.fuel.totalBudget} totalPct={data.fuel.totalPctBudget} />
              <DataRow mode="pct"    label="% of Rev" sec="fuel" values={[]} totalValue={0} totalPct={data.fuel.totalPctActual} pctValues={data.fuel.pct} />
              <Gap />

              {/* EQUIPMENT */}
              <SectionHdr label="Equipment" sec="equipment" />
              <DataRow mode="actual" label="Actual"   sec="equipment" values={data.equipment.actual} totalValue={data.equipment.totalActual} totalPct={data.equipment.totalPctActual}
                bgFn={(v, i) => costBg(v, data.equipment.budget[i], i)}
                colorFn={(v, i) => v === 0 ? "#d1d5db" : v > (data.equipment.budget[i] ?? 0) * 1.02 ? "#b91c1c" : v < (data.equipment.budget[i] ?? 0) * 0.98 ? "#1d4ed8" : "#1f2937"}
              />
              <DataRow mode="budget" label="Budgeted" sec="equipment" values={data.equipment.budget} totalValue={data.equipment.totalBudget} totalPct={data.equipment.totalPctBudget} />
              <DataRow mode="pct"    label="% of Rev" sec="equipment" values={[]} totalValue={0} totalPct={data.equipment.totalPctActual} pctValues={data.equipment.pct} />
              <Gap />

              {/* PROFIT */}
              <SectionHdr label="Profit" sec="profit" />
              <DataRow mode="actual" label="Actual"   sec="profit" values={data.profit.actual} totalValue={data.profit.totalActual} totalPct={data.profit.totalPctActual}
                bgFn={(v, i) => profitBg(v, i)}
                colorFn={(v) => v > 0 ? "#15803d" : v < 0 ? "#b91c1c" : "#d1d5db"}
              />
              <DataRow mode="budget" label="Budgeted" sec="profit" values={data.profit.budget} totalValue={data.profit.totalBudget} totalPct={data.profit.totalPctBudget} />
              <DataRow mode="pct"    label="% of Rev" sec="profit" values={[]} totalValue={0} totalPct={data.profit.totalPctActual} pctValues={data.profit.pct} />
              {data.profit.goal && (
                <DataRow mode="goal" label="Goal %" sec="profit" values={[]} totalValue={0} pctValues={data.profit.goal} />
              )}
              <Gap />

              {/* PROFIT BEHIND */}
              <SectionHdr label="Profit Behind" sec="behind" />
              <DataRow mode="behind" label="Cumulative" sec="behind" values={data.profitBehind} totalValue={data.profit.needed} />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
