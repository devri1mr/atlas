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

const fmtPct = (n: number | null | undefined) =>
  n == null ? "" : `${Math.round(n)}%`;

const SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Google Sheets color palette
const GRID        = "#e2e3e4";
const YELLOW_COL  = "#fff9c4";
const YELLOW_HDR  = "#fff176";
const HDR_BG      = "#f3f3f3";
const CAT_BG      = "#ffffff";
const BUDGET_BG   = "#f8f9fa";
const PCT_BG      = "#f1f3f4";
const TOTAL_BG    = "#f8f9fa";

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

  // Base cell — all cells share these; override per-row
  const cell: React.CSSProperties = {
    fontFamily: "Arial, sans-serif",
    fontSize: 11,
    padding: "3px 6px",
    border: `1px solid ${GRID}`,
    whiteSpace: "nowrap",
    overflow: "hidden",
  };

  const colBg = (i: number, base: string) =>
    i === currentMonth ? YELLOW_COL : base;

  const totalColBg = (base: string) =>
    currentMonth >= 0 ? YELLOW_COL : base;

  // Text colors
  const revColor  = (v: number) => v > 0 ? "#0d7645" : "#bbb";
  const costColor = (v: number, b: number) => {
    if (v === 0) return "#bbb";
    if (b > 0 && v > b * 1.02) return "#c0392b";
    return "#222";
  };
  const profColor = (v: number) => v > 0 ? "#0d7645" : v < 0 ? "#c0392b" : "#bbb";
  const pctColor  = (v: number | null) => {
    if (v == null) return "#bbb";
    if (v < 0 || v > 100) return "#c0392b";
    return "#555";
  };

  /* ────── Row components ────── */

  // Category label cell (col A) — shows on actual row, blank on sub-rows
  const CatCell = ({ label, rowspan, bg }: { label: string; rowspan?: number; bg?: string }) => (
    <td rowSpan={rowspan ?? 1} style={{
      ...cell,
      background: bg ?? CAT_BG,
      fontWeight: 700,
      fontSize: 10,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      color: "#1a1a1a",
      textAlign: "left",
      verticalAlign: "middle",
      borderRight: `2px solid ${GRID}`,
    }}>
      {label}
    </td>
  );

  // Row-type label cell (col B)
  const TypeCell = ({ label, italic, bg }: { label: string; italic?: boolean; bg?: string }) => (
    <td style={{
      ...cell,
      background: bg ?? CAT_BG,
      fontSize: 10,
      color: "#555",
      fontStyle: italic ? "italic" : "normal",
      fontWeight: italic ? 600 : 400,
      textAlign: "left",
      borderRight: `2px solid ${GRID}`,
    }}>
      {label}
    </td>
  );

  // Money data cell
  const MC = ({ v, bg, color, bold, italic }: {
    v: number; bg: string; color: string; bold?: boolean; italic?: boolean;
  }) => (
    <td style={{
      ...cell,
      background: bg,
      color,
      fontWeight: bold ? 700 : 400,
      fontStyle: italic ? "italic" : "normal",
      textAlign: "right",
    }}>
      {v === 0 ? <span style={{ color: "#ccc" }}>–</span> : fmt$(v)}
    </td>
  );

  // Pct data cell
  const PC = ({ v, bg, italic }: { v: number | null; bg: string; italic?: boolean }) => (
    <td style={{
      ...cell,
      background: bg,
      color: pctColor(v),
      fontStyle: italic ? "italic" : "normal",
      textAlign: "center",
      fontSize: 10,
    }}>
      {fmtPct(v)}
    </td>
  );

  // Total cell
  const TC = ({ v, color, bold, italic }: { v: number; color: string; bold?: boolean; italic?: boolean }) => (
    <td style={{
      ...cell,
      background: totalColBg(TOTAL_BG),
      color,
      fontWeight: bold ? 700 : 400,
      fontStyle: italic ? "italic" : "normal",
      textAlign: "right",
      borderLeft: `2px solid ${GRID}`,
    }}>
      {v === 0 ? <span style={{ color: "#ccc" }}>–</span> : fmt$(v)}
    </td>
  );

  // Total pct cell
  const TPC = ({ v }: { v?: number | null }) => (
    <td style={{
      ...cell,
      background: TOTAL_BG,
      color: pctColor(v ?? null),
      textAlign: "center",
      fontSize: 10,
    }}>
      {fmtPct(v)}
    </td>
  );

  // Spacer row between sections
  const Gap = () => (
    <tr>
      <td colSpan={16} style={{ background: HDR_BG, height: 6, border: `1px solid ${GRID}` }} />
    </tr>
  );

  /* ── Section: Revenue (no % row) ── */
  const RevSection = () => (
    <>
      <tr>
        <CatCell label="Revenue" rowspan={2} />
        <TypeCell label="Actual" bg={CAT_BG} />
        {data.revenue.actual.map((v, i) => (
          <MC key={i} v={v} bg={colBg(i, CAT_BG)} color={revColor(v)} bold />
        ))}
        <TC v={data.revenue.totalActual} color={revColor(data.revenue.totalActual)} bold />
        <TPC />
      </tr>
      <tr>
        <TypeCell label="Budgeted" italic bg={BUDGET_BG} />
        {data.revenue.budget.map((v, i) => (
          <MC key={i} v={v} bg={colBg(i, BUDGET_BG)} color="#333" italic />
        ))}
        <TC v={data.revenue.totalBudget} color="#333" italic />
        <TPC />
      </tr>
    </>
  );

  /* ── Cost section with % row ── */
  const CostSection = ({ label, cat }: { label: string; cat: Cat }) => (
    <>
      <tr>
        <CatCell label={label} rowspan={3} />
        <TypeCell label="Actual" bg={CAT_BG} />
        {cat.actual.map((v, i) => (
          <MC key={i} v={v} bg={colBg(i, CAT_BG)} color={costColor(v, cat.budget[i])} bold />
        ))}
        <TC v={cat.totalActual} color={costColor(cat.totalActual, cat.totalBudget)} bold />
        <TPC v={cat.totalPctActual} />
      </tr>
      <tr>
        <TypeCell label="Budgeted" italic bg={BUDGET_BG} />
        {cat.budget.map((v, i) => (
          <MC key={i} v={v} bg={colBg(i, BUDGET_BG)} color="#333" italic />
        ))}
        <TC v={cat.totalBudget} color="#333" italic />
        <TPC v={cat.totalPctBudget} />
      </tr>
      <tr>
        <TypeCell label="% of Rev" italic bg={PCT_BG} />
        {(cat.pct ?? Array(12).fill(null)).map((v, i) => (
          <PC key={i} v={v} bg={colBg(i, PCT_BG)} italic />
        ))}
        <td style={{ ...cell, background: totalColBg(TOTAL_BG), textAlign: "center", fontSize: 10, color: pctColor(cat.totalPctActual ?? null), fontStyle: "italic", borderLeft: `2px solid ${GRID}` }}>
          {fmtPct(cat.totalPctActual)}
        </td>
        <td style={{ ...cell, background: TOTAL_BG }} />
      </tr>
    </>
  );

  /* ── Profit section ── */
  const ProfitSection = () => {
    const rowspan = data.profit.goal ? 4 : 3;
    return (
      <>
        <tr>
          <CatCell label="Profit" rowspan={rowspan} />
          <TypeCell label="Actual" bg={CAT_BG} />
          {data.profit.actual.map((v, i) => (
            <MC key={i} v={v} bg={colBg(i, CAT_BG)} color={profColor(v)} bold />
          ))}
          <TC v={data.profit.totalActual} color={profColor(data.profit.totalActual)} bold />
          <TPC v={data.profit.totalPctActual} />
        </tr>
        <tr>
          <TypeCell label="Budgeted" italic bg={BUDGET_BG} />
          {data.profit.budget.map((v, i) => (
            <MC key={i} v={v} bg={colBg(i, BUDGET_BG)} color="#333" italic />
          ))}
          <TC v={data.profit.totalBudget} color="#333" italic />
          <TPC v={data.profit.totalPctBudget} />
        </tr>
        <tr>
          <TypeCell label="% of Rev" italic bg={PCT_BG} />
          {(data.profit.pct ?? Array(12).fill(null)).map((v, i) => (
            <PC key={i} v={v} bg={colBg(i, PCT_BG)} italic />
          ))}
          <td style={{ ...cell, background: totalColBg(TOTAL_BG), textAlign: "center", fontSize: 10, color: pctColor(data.profit.totalPctActual ?? null), fontStyle: "italic", borderLeft: `2px solid ${GRID}` }}>
            {fmtPct(data.profit.totalPctActual)}
          </td>
          <td style={{ ...cell, background: TOTAL_BG }} />
        </tr>
        {data.profit.goal && (
          <tr>
            <TypeCell label="Goal %" italic bg={PCT_BG} />
            {data.profit.goal.map((v, i) => (
              <td key={i} style={{ ...cell, background: colBg(i, PCT_BG), color: "#4338ca", textAlign: "center", fontSize: 10, fontStyle: "italic" }}>
                {fmtPct(v)}
              </td>
            ))}
            <td style={{ ...cell, background: totalColBg(TOTAL_BG), borderLeft: `2px solid ${GRID}` }} />
            <td style={{ ...cell, background: TOTAL_BG }} />
          </tr>
        )}
      </>
    );
  };

  /* ── Profit Behind section ── */
  const BehindSection = () => (
    <tr>
      <CatCell label="Profit Behind" />
      <TypeCell label="Cumulative" bg={CAT_BG} />
      {data.profitBehind.map((v, i) => (
        <td key={i} style={{
          ...cell,
          background: colBg(i, CAT_BG),
          color: i === currentMonth ? (v < 0 ? "#0d7645" : "#c0392b") : "transparent",
          fontWeight: 700,
          textAlign: "right",
        }}>
          {i === currentMonth && v !== 0 ? fmt$(v) : ""}
        </td>
      ))}
      <td style={{ ...cell, background: totalColBg(TOTAL_BG), borderLeft: `2px solid ${GRID}` }} />
      <td style={{ ...cell, background: TOTAL_BG }} />
    </tr>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "#f3f4f6", overflow: "hidden" }}>

      {/* App header bar */}
      <div style={{ background: "linear-gradient(135deg,#0d2616 0%,#123b1f 55%,#1a5c2a 100%)", padding: "10px 18px", flexShrink: 0 }}>
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

      {/* Spreadsheet */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px" }}>
        <div style={{ background: "#fff", borderRadius: 6, border: `1px solid ${GRID}`, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", minWidth: 900 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "6%" }} />   {/* Category */}
              <col style={{ width: "5%" }} />   {/* Type */}
              {SHORT.map((_, i) => <col key={i} style={{ width: `${(81 / 12).toFixed(2)}%` }} />)}
              <col style={{ width: "5%" }} />   {/* Total */}
              <col style={{ width: "3%" }} />   {/* % */}
            </colgroup>

            {/* Column header — mimics Google Sheets frozen header row */}
            <thead>
              <tr style={{ background: HDR_BG }}>
                <th style={{ ...cell, background: HDR_BG, fontWeight: 700, fontSize: 10, color: "#555", textAlign: "left", borderRight: `2px solid ${GRID}` }}>
                  Category
                </th>
                <th style={{ ...cell, background: HDR_BG, fontWeight: 700, fontSize: 10, color: "#555", textAlign: "left", borderRight: `2px solid ${GRID}` }}>
                  Row
                </th>
                {SHORT.map((m, i) => {
                  const isCur = i === currentMonth;
                  const hasDat = i <= currentMonth;
                  return (
                    <th key={i} style={{
                      ...cell,
                      background: isCur ? YELLOW_HDR : HDR_BG,
                      fontWeight: 700,
                      fontSize: 11,
                      textAlign: "center",
                      color: isCur ? "#1a1a1a" : hasDat ? "#222" : "#aaa",
                      borderBottom: isCur ? "2px solid #f9a825" : `1px solid ${GRID}`,
                    }}>
                      {m}
                    </th>
                  );
                })}
                <th style={{ ...cell, background: HDR_BG, fontWeight: 700, fontSize: 10, textAlign: "center", color: "#555", borderLeft: `2px solid ${GRID}` }}>
                  Total
                </th>
                <th style={{ ...cell, background: HDR_BG, fontWeight: 700, fontSize: 9, textAlign: "center", color: "#888" }}>
                  %
                </th>
              </tr>
            </thead>

            <tbody>
              <RevSection />
              <Gap />
              <CostSection label="Job Materials" cat={data.materials} />
              <Gap />
              <CostSection label="Labor" cat={data.labor} />
              <Gap />
              <CostSection label="Fuel" cat={data.fuel} />
              <Gap />
              <CostSection label="Equipment" cat={data.equipment} />
              <Gap />
              <ProfitSection />
              <Gap />
              <BehindSection />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
