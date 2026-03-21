"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";

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

const fmt$ = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const fmtK = (n: number) => {
  if (n === 0) return null;
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${n < 0 ? "-" : ""}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${n < 0 ? "-" : ""}$${Math.round(abs / 1_000)}K`;
  return fmt$(n);
};

const fmtPct = (n: number | null | undefined) =>
  n == null ? "" : `${Math.round(n)}%`;

const SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Atlas brand palette
const ATLAS_DARK    = "#0d2616";
const ATLAS_GREEN   = "#123b1f";
const ATLAS_MID     = "#166534";
const GRID          = "#e5e7eb";
const CUR_COL_BG    = "#dcfce7";
const CUR_COL_HDR   = "#15803d";
const CUR_COL_BORDER = "#86efac";
const ACTUAL_BG     = "#ffffff";
const BUDGET_BG     = "#f9fafb";
const PCT_BG        = "#f3f4f6";
const TOTAL_BG      = "#f9fafb";
const HDR_BG        = "#1f2937";

export default function AtlasPerformancePage() {
  const [data, setData]       = useState<Data | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const load = useCallback(async () => {
    try {
      const res  = await fetch("/api/performance", { cache: "no-store" });
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
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-green-200 border-t-green-700 rounded-full animate-spin" />
    </div>
  );
  if (error || !data) return (
    <div className="min-h-screen bg-white flex items-center justify-center flex-col gap-3">
      <p className="text-red-500 font-semibold">{error || "Failed to load"}</p>
      <button onClick={load} className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm">Retry</button>
    </div>
  );

  const currentMonth = data.revenue.actual.reduce((last, v, i) => v !== 0 ? i : last, -1);
  const minsAgo = Math.floor((Date.now() - lastRefresh.getTime()) / 60000);

  const cell: React.CSSProperties = {
    fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
    fontSize: 11,
    padding: "3px 5px",
    border: `1px solid ${GRID}`,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textAlign: "center",
  };

  const colBg      = (i: number, base: string) => i === currentMonth ? CUR_COL_BG : base;
  const totalBg    = () => currentMonth >= 0 ? CUR_COL_BG : TOTAL_BG;
  const curBorder  = (i: number) => i === currentMonth
    ? { borderLeft: `1px solid ${CUR_COL_BORDER}`, borderRight: `1px solid ${CUR_COL_BORDER}` }
    : {};

  const revColor  = (v: number) => v > 0 ? "#15803d" : "#9ca3af";
  const costColor = (v: number, b: number) => {
    if (v === 0) return "#9ca3af";
    if (b > 0 && v > b * 1.02) return "#dc2626";
    return "#111827";
  };
  const profColor = (v: number) => v > 0 ? "#15803d" : v < 0 ? "#dc2626" : "#9ca3af";
  const pctColor  = (v: number | null) => {
    if (v == null) return "#9ca3af";
    if (v < 0 || v > 100) return "#dc2626";
    return "#6b7280";
  };

  /* ── Section header row — Atlas dark green ── */
  const SHdr = ({ label }: { label: string }) => (
    <tr>
      <td colSpan={16} style={{
        ...cell,
        background: `linear-gradient(90deg, ${ATLAS_DARK} 0%, ${ATLAS_GREEN} 60%, ${ATLAS_MID} 100%)`,
        color: "#ffffff",
        fontWeight: 700,
        fontSize: 10,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        textAlign: "left",
        padding: "5px 14px",
        borderLeft: "none",
        borderRight: "none",
      }}>
        {label}
      </td>
    </tr>
  );

  /* ── Category label (col A) — spans rows ── */
  const CatCell = ({ rowspan }: { rowspan: number }) => (
    <td rowSpan={rowspan} style={{
      ...cell,
      background: ACTUAL_BG,
      borderRight: `1px solid ${GRID}`,
      width: 0,
      padding: 0,
    }} />
  );

  /* ── Row-type label (col B) ── */
  const TypeCell = ({ label, italic, bg }: { label: string; italic?: boolean; bg: string }) => (
    <td style={{
      ...cell,
      background: bg,
      fontSize: 11,
      fontWeight: italic ? 500 : 600,
      fontStyle: italic ? "italic" : "normal",
      color: italic ? "#6b7280" : "#374151",
      textAlign: "left",
      paddingLeft: 14,
      borderRight: `2px solid ${GRID}`,
    }}>
      {label}
    </td>
  );

  /* ── Money cell (month columns — abbreviated) ── */
  const MC = ({ v, bg, color, bold, italic, idx }: {
    v: number; bg: string; color: string; bold?: boolean; italic?: boolean; idx: number;
  }) => (
    <td style={{
      ...cell,
      ...curBorder(idx),
      background: bg,
      color,
      fontWeight: bold ? 700 : italic ? 500 : 400,
      fontStyle: italic ? "italic" : "normal",
      textAlign: "center",
    }}>
      {v === 0 ? <span style={{ color: "#d1d5db" }}>—</span> : fmtK(v)}
    </td>
  );

  /* ── Pct cell ── */
  const PC = ({ v, bg, italic, idx }: { v: number | null; bg: string; italic?: boolean; idx: number }) => (
    <td style={{
      ...cell,
      ...curBorder(idx),
      background: bg,
      color: pctColor(v),
      fontStyle: italic ? "italic" : "normal",
      fontSize: 11,
      textAlign: "center",
    }}>
      {fmtPct(v)}
    </td>
  );

  /* ── Total cell ── */
  const TC = ({ v, color, bold, italic }: { v: number; color: string; bold?: boolean; italic?: boolean }) => (
    <td style={{
      ...cell,
      background: totalBg(),
      color,
      fontWeight: bold ? 700 : italic ? 500 : 400,
      fontStyle: italic ? "italic" : "normal",
      textAlign: "center",
      borderLeft: `2px solid #d1d5db`,
      fontSize: 11,
    }}>
      {v === 0 ? <span style={{ color: "#d1d5db" }}>—</span> : fmt$(v)}
    </td>
  );

  /* ── Total pct cell ── */
  const TPC = ({ v }: { v?: number | null }) => (
    <td style={{
      ...cell,
      background: TOTAL_BG,
      color: pctColor(v ?? null),
      fontSize: 11,
      textAlign: "center",
    }}>
      {fmtPct(v)}
    </td>
  );

  /* ── Revenue section (no % row) ── */
  const RevSection = () => (
    <>
      <SHdr label="Revenue" />
      <tr>
        <TypeCell label="Actual" bg={ACTUAL_BG} />
        {data.revenue.actual.map((v, i) => (
          <MC key={i} v={v} bg={colBg(i, ACTUAL_BG)} color={revColor(v)} bold idx={i} />
        ))}
        <TC v={data.revenue.totalActual} color={revColor(data.revenue.totalActual)} bold />
        <TPC />
      </tr>
      <tr>
        <TypeCell label="Budgeted" italic bg={BUDGET_BG} />
        {data.revenue.budget.map((v, i) => (
          <MC key={i} v={v} bg={colBg(i, BUDGET_BG)} color="#374151" italic idx={i} />
        ))}
        <TC v={data.revenue.totalBudget} color="#374151" italic />
        <TPC />
      </tr>
    </>
  );

  /* ── Cost section ── */
  const CostSection = ({ label, cat }: { label: string; cat: Cat }) => (
    <>
      <SHdr label={label} />
      <tr>
        <TypeCell label="Actual" bg={ACTUAL_BG} />
        {cat.actual.map((v, i) => (
          <MC key={i} v={v} bg={colBg(i, ACTUAL_BG)} color={costColor(v, cat.budget[i])} bold idx={i} />
        ))}
        <TC v={cat.totalActual} color={costColor(cat.totalActual, cat.totalBudget)} bold />
        <TPC v={cat.totalPctActual} />
      </tr>
      <tr>
        <TypeCell label="Budgeted" italic bg={BUDGET_BG} />
        {cat.budget.map((v, i) => (
          <MC key={i} v={v} bg={colBg(i, BUDGET_BG)} color="#374151" italic idx={i} />
        ))}
        <TC v={cat.totalBudget} color="#374151" italic />
        <TPC v={cat.totalPctBudget} />
      </tr>
      <tr>
        <TypeCell label="% of Rev" italic bg={PCT_BG} />
        {(cat.pct ?? Array(12).fill(null)).map((v, i) => (
          <PC key={i} v={v} bg={colBg(i, PCT_BG)} italic idx={i} />
        ))}
        <td style={{ ...cell, background: totalBg(), color: pctColor(cat.totalPctActual ?? null), fontSize: 11, fontStyle: "italic", borderLeft: "2px solid #d1d5db", textAlign: "center" }}>
          {fmtPct(cat.totalPctActual)}
        </td>
        <td style={{ ...cell, background: TOTAL_BG }} />
      </tr>
    </>
  );

  /* ── Profit section ── */
  const ProfitSection = () => (
    <>
      <SHdr label="Profit" />
      <tr>
        <TypeCell label="Actual" bg={ACTUAL_BG} />
        {data.profit.actual.map((v, i) => (
          <MC key={i} v={v} bg={colBg(i, ACTUAL_BG)} color={profColor(v)} bold idx={i} />
        ))}
        <TC v={data.profit.totalActual} color={profColor(data.profit.totalActual)} bold />
        <TPC v={data.profit.totalPctActual} />
      </tr>
      <tr>
        <TypeCell label="Budgeted" italic bg={BUDGET_BG} />
        {data.profit.budget.map((v, i) => (
          <MC key={i} v={v} bg={colBg(i, BUDGET_BG)} color="#374151" italic idx={i} />
        ))}
        <TC v={data.profit.totalBudget} color="#374151" italic />
        <TPC v={data.profit.totalPctBudget} />
      </tr>
      <tr>
        <TypeCell label="% of Rev" italic bg={PCT_BG} />
        {(data.profit.pct ?? Array(12).fill(null)).map((v, i) => (
          <PC key={i} v={v} bg={colBg(i, PCT_BG)} italic idx={i} />
        ))}
        <td style={{ ...cell, background: totalBg(), color: pctColor(data.profit.totalPctActual ?? null), fontSize: 11, fontStyle: "italic", borderLeft: "2px solid #d1d5db", textAlign: "center" }}>
          {fmtPct(data.profit.totalPctActual)}
        </td>
        <td style={{ ...cell, background: TOTAL_BG }} />
      </tr>
      {data.profit.goal && (
        <tr>
          <TypeCell label="Goal %" italic bg={PCT_BG} />
          {data.profit.goal.map((v, i) => (
            <td key={i} style={{ ...cell, ...curBorder(i), background: colBg(i, PCT_BG), color: "#4338ca", fontSize: 11, fontStyle: "italic", textAlign: "center" }}>
              {fmtPct(v)}
            </td>
          ))}
          <td style={{ ...cell, background: totalBg(), borderLeft: "2px solid #d1d5db" }} />
          <td style={{ ...cell, background: TOTAL_BG }} />
        </tr>
      )}
    </>
  );

  /* ── Profit Behind section ── */
  const BehindSection = () => (
    <>
      <SHdr label="Profit Behind" />
      <tr>
        <TypeCell label="Cumulative" bg={ACTUAL_BG} />
        {data.profitBehind.map((v, i) => (
          <td key={i} style={{
            ...cell,
            ...curBorder(i),
            background: colBg(i, ACTUAL_BG),
            color: i === currentMonth ? (v < 0 ? "#15803d" : "#dc2626") : "transparent",
            fontWeight: 700,
            textAlign: "center",
          }}>
            {i === currentMonth && v !== 0 ? fmt$(v) : ""}
          </td>
        ))}
        <td style={{ ...cell, background: totalBg(), borderLeft: "2px solid #d1d5db" }} />
        <td style={{ ...cell, background: TOTAL_BG }} />
      </tr>
    </>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "#f3f4f6", overflow: "hidden" }}>

      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${ATLAS_DARK} 0%, ${ATLAS_GREEN} 55%, #1a5c2a 100%)`, padding: "10px 18px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ background: "#fff", borderRadius: 8, padding: 3 }}>
              <Image src="/atlas-performance-logo.png" alt="Atlas Performance" width={34} height={34} style={{ objectFit: "contain", display: "block" }} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>AtlasPerformance</span>
                <span style={{ background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.3)", color: "#4ade80", fontSize: 10, fontWeight: 700, padding: "1px 8px", borderRadius: 20 }}>
                  {data.division}
                </span>
              </div>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10 }}>2026 · Budget vs. Actual · Live from Google Sheets</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "4px 10px" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}>{minsAgo === 0 ? "Live" : `${minsAgo}m ago`}</span>
            </div>
            <button onClick={load} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)", borderRadius: 8, padding: "4px 12px", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>
              ↻ Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto", padding: "12px" }}>
        <div style={{ background: "#fff", borderRadius: 10, border: `1px solid ${GRID}`, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", minWidth: 900 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "7%" }} />    {/* Row label */}
              {SHORT.map((_, i) => <col key={i} style={{ width: `${(76 / 12).toFixed(2)}%` }} />)}
              <col style={{ width: "9%" }} />    {/* Total — wide enough for full $ */}
              <col style={{ width: "3%" }} />    {/* % */}
            </colgroup>

            {/* Column headers */}
            <thead>
              <tr style={{ background: HDR_BG }}>
                <th style={{
                  ...cell,
                  background: HDR_BG,
                  borderRight: `2px solid #374151`,
                }} />
                {SHORT.map((m, i) => {
                  const isCur  = i === currentMonth;
                  const hasDat = i <= currentMonth;
                  return (
                    <th key={i} style={{
                      ...cell,
                      background: isCur ? CUR_COL_HDR : HDR_BG,
                      color: isCur ? "#fff" : hasDat ? "#e5e7eb" : "rgba(255,255,255,0.25)",
                      fontWeight: isCur ? 800 : 600,
                      fontSize: 11,
                      textAlign: "center",
                      borderBottom: isCur ? `2px solid #4ade80` : `1px solid #374151`,
                      borderRight: `1px solid #374151`,
                    }}>
                      {m}
                    </th>
                  );
                })}
                <th style={{
                  ...cell,
                  background: HDR_BG,
                  color: "rgba(255,255,255,0.5)",
                  fontWeight: 700,
                  fontSize: 11,
                  textAlign: "center",
                  borderLeft: `2px solid #374151`,
                  borderRight: `1px solid #374151`,
                }}>
                  Total
                </th>
                <th style={{
                  ...cell,
                  background: HDR_BG,
                  color: "rgba(255,255,255,0.3)",
                  fontWeight: 600,
                  fontSize: 10,
                  textAlign: "center",
                }}>
                  %
                </th>
              </tr>
            </thead>

            <tbody>
              <RevSection />
              <CostSection label="Job Materials" cat={data.materials} />
              <CostSection label="Labor" cat={data.labor} />
              <CostSection label="Fuel" cat={data.fuel} />
              <CostSection label="Equipment" cat={data.equipment} />
              <ProfitSection />
              <BehindSection />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
