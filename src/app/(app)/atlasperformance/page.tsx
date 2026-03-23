"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

/* ─── Types ─────────────────────────────────────────────────────────── */
type Cat = {
  actual: number[]; budget: number[];
  pct?: (number | null)[];
  goal?: (number | null)[];
  totalActual: number; totalBudget: number;
  totalPctActual?: number | null; totalPctBudget?: number | null;
};
type Data = {
  division: string; lastFetched: string; months: string[];
  targetGp?: number;
  revenue: Cat & { remaining: number };
  materials: Cat; labor: Cat; fuel: Cat; equipment: Cat;
  profit: Cat & { needed: number };
  profitBehind: number[];
};
type Division = {
  id: string; name: string; active: boolean;
  performance_sheet_url: string | null;
  target_gross_profit_percent: number;
};
type SummaryItem = { divisionId: string; divisionName: string; targetGp: number; data: Data };

/* ─── Formatters ─────────────────────────────────────────────────────── */
const fmt$ = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtK = (n: number) => {
  if (n === 0) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${n < 0 ? "-" : ""}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${n < 0 ? "-" : ""}$${Math.round(abs / 1_000)}K`;
  return fmt$(n);
};
const fmtPct = (n: number | null | undefined) => n == null ? "" : `${Math.round(n)}%`;

const SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

/* ─── Design tokens ──────────────────────────────────────────────────── */
const ATLAS_DARK  = "#0d2616";
const ATLAS_GREEN = "#123b1f";
const ATLAS_MID   = "#166534";
const GRID        = "#e5e7eb";
const CUR_HDR     = "#15803d";
const CUR_BG      = "#dcfce7";
const CUR_BORDER  = "#86efac";
const HDR_BG      = "#1f2937";

/* ─── Status dot ─────────────────────────────────────────────────────── */
function statusColor(profitPct: number | null, targetGp: number): string {
  if (profitPct == null) return "#9ca3af";
  if (profitPct >= targetGp) return "#22c55e";
  if (profitPct >= targetGp * 0.8) return "#f59e0b";
  return "#ef4444";
}
function statusLabel(profitPct: number | null, targetGp: number): string {
  if (profitPct == null) return "No data";
  if (profitPct >= targetGp) return "On track";
  if (profitPct >= targetGp * 0.8) return "Near goal";
  return "Behind";
}

/* ─── Summary KPI card ───────────────────────────────────────────────── */
function SummaryCard({ item }: { item: SummaryItem }) {
  const { data, targetGp, divisionName } = item;
  // Each card uses its own current month so a division with no data doesn't zero out others
  const currentMonth = data.revenue.actual.reduce((last, v, i) => v !== 0 ? i : last, -1);
  const rev   = currentMonth >= 0 ? data.revenue.actual[currentMonth] : 0;
  const revB  = currentMonth >= 0 ? data.revenue.budget[currentMonth] : 0;
  const prof  = currentMonth >= 0 ? data.profit.actual[currentMonth] : 0;
  const profB = currentMonth >= 0 ? data.profit.budget[currentMonth] : 0;
  const mat   = currentMonth >= 0 ? data.materials.actual[currentMonth] : 0;
  const lab   = currentMonth >= 0 ? data.labor.actual[currentMonth] : 0;
  const fuel  = currentMonth >= 0 ? data.fuel.actual[currentMonth] : 0;
  const equip = currentMonth >= 0 ? data.equipment.actual[currentMonth] : 0;

  // Prefer the sheet's goal % for the current month; fall back to division setting
  const sheetGoal = currentMonth >= 0 ? (data.profit.goal?.[currentMonth] ?? null) : null;
  const effectiveGoal = sheetGoal ?? targetGp;

  const profitPct = rev > 0 ? (prof / rev) * 100 : null;
  const revPct    = revB > 0 ? Math.min((rev / revB) * 100, 100) : null;
  const dot       = statusColor(profitPct, effectiveGoal);
  const label     = statusLabel(profitPct, effectiveGoal);

  const costPct = (v: number) => rev > 0 ? Math.round((v / rev) * 100) : 0;

  return (
    <div style={{
      background: "#fff",
      borderRadius: 14,
      border: `1px solid ${GRID}`,
      overflow: "hidden",
      boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Card header */}
      <div style={{
        background: `linear-gradient(135deg, ${ATLAS_DARK} 0%, ${ATLAS_GREEN} 100%)`,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{divisionName}</span>
        <span style={{
          display: "flex", alignItems: "center", gap: 5,
          background: "rgba(255,255,255,0.12)",
          borderRadius: 20, padding: "2px 8px",
        }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, display: "inline-block", boxShadow: `0 0 6px ${dot}` }} />
          <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 10, fontWeight: 600 }}>{label}</span>
        </span>
      </div>

      <div style={{ padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Revenue */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Revenue</span>
            <span style={{ fontSize: 10, color: "#9ca3af" }}>
              {revPct != null ? `${Math.round(revPct)}% of budget` : ""}
            </span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: rev > 0 ? "#15803d" : "#9ca3af", lineHeight: 1 }}>
            {fmtK(rev)}
          </div>
          {revB > 0 && (
            <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>Budget: {fmtK(revB)}</div>
          )}
          {/* Progress bar */}
          <div style={{ marginTop: 6, height: 5, borderRadius: 99, background: "#f3f4f6", overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 99,
              width: `${revPct ?? 0}%`,
              background: (revPct ?? 0) >= 90 ? "#22c55e" : (revPct ?? 0) >= 70 ? "#f59e0b" : "#ef4444",
              transition: "width 0.6s ease",
            }} />
          </div>
        </div>

        {/* Profit */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Profit</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: prof > 0 ? "#15803d" : prof < 0 ? "#dc2626" : "#9ca3af" }}>
              {fmtK(prof)}
            </div>
            {profB > 0 && <div style={{ fontSize: 10, color: "#9ca3af" }}>Budget: {fmtK(profB)}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{
              fontSize: 22, fontWeight: 900,
              color: profitPct == null ? "#9ca3af" : profitPct >= effectiveGoal ? "#15803d" : profitPct >= effectiveGoal * 0.8 ? "#d97706" : "#dc2626",
            }}>
              {profitPct != null ? `${Math.round(profitPct)}%` : "—"}
            </div>
            <div style={{ fontSize: 10, color: "#9ca3af" }}>Goal: {effectiveGoal}%</div>
          </div>
        </div>

        {/* Cost breakdown mini-bars */}
        {rev > 0 && (
          <div style={{ borderTop: `1px solid #f3f4f6`, paddingTop: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Cost Breakdown</div>
            {[
              { label: "Materials", val: mat, color: "#7c3aed" },
              { label: "Labor",     val: lab, color: "#2563eb" },
              { label: "Fuel",      val: fuel, color: "#ea580c" },
              { label: "Equipment", val: equip, color: "#0891b2" },
            ].map(({ label, val, color }) => (
              val > 0 ? (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <div style={{ width: 54, fontSize: 9, color: "#6b7280", fontWeight: 600 }}>{label}</div>
                  <div style={{ flex: 1, height: 4, borderRadius: 99, background: "#f3f4f6", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(costPct(val), 100)}%`, background: color, borderRadius: 99 }} />
                  </div>
                  <div style={{ width: 24, fontSize: 9, color: "#6b7280", textAlign: "right", fontWeight: 600 }}>{costPct(val)}%</div>
                </div>
              ) : null
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────── */
export default function AtlasPerformancePage() {
  const [divisions, setDivisions]         = useState<Division[]>([]);
  const [activeTab, setActiveTab]         = useState<string>("summary");
  const [divData, setDivData]             = useState<Record<string, Data | null | "loading" | "error">>({});
  const [summaryItems, setSummaryItems]   = useState<SummaryItem[] | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [lastRefresh, setLastRefresh]     = useState(new Date());
  const [pageLoading, setPageLoading]     = useState(true);
  const [pageError, setPageError]         = useState<string | null>(null);
  const scrollRef                         = useRef<HTMLDivElement>(null);

  /* Load divisions list */
  const loadDivisions = useCallback(async () => {
    try {
      const res  = await fetch("/api/operations-center/divisions", { cache: "no-store" });
      const json = await res.json();
      const all: Division[] = (json.data ?? []).filter((d: Division) => d.active && d.performance_sheet_url);
      setDivisions(all);
      return all;
    } catch (e: any) {
      setPageError(e.message);
      return [];
    } finally {
      setPageLoading(false);
    }
  }, []);

  /* Load summary (all divisions current month) */
  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res  = await fetch("/api/performance?all=1", { cache: "no-store" });
      const json = await res.json();
      setSummaryItems(json.items ?? []);
      setLastRefresh(new Date());
    } catch {}
    finally { setSummaryLoading(false); }
  }, []);

  /* Load single division */
  const loadDivision = useCallback(async (divId: string) => {
    setDivData(prev => ({ ...prev, [divId]: "loading" }));
    try {
      const res  = await fetch(`/api/performance?divisionId=${divId}`, { cache: "no-store" });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setDivData(prev => ({ ...prev, [divId]: json }));
      setLastRefresh(new Date());
    } catch {
      setDivData(prev => ({ ...prev, [divId]: "error" }));
    }
  }, []);

  /* Refresh current view */
  const refresh = useCallback(() => {
    if (activeTab === "summary") {
      loadSummary();
    } else {
      loadDivision(activeTab);
    }
  }, [activeTab, loadSummary, loadDivision]);

  /* Mount: load divisions, then summary */
  useEffect(() => {
    loadDivisions().then(() => loadSummary());
    const t = setInterval(() => {
      if (activeTab === "summary") loadSummary();
      else loadDivision(activeTab);
    }, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line

  /* Tab switch */
  useEffect(() => {
    if (activeTab === "summary") {
      if (!summaryItems) loadSummary();
    } else {
      if (!divData[activeTab]) loadDivision(activeTab);
    }
    scrollRef.current?.scrollTo(0, 0);
  }, [activeTab]); // eslint-disable-line

  const minsAgo = Math.floor((Date.now() - lastRefresh.getTime()) / 60000);
  const currentMonth = (() => {
    // Try to get from first available data
    const first = summaryItems?.[0]?.data ?? (typeof divData[activeTab] === "object" && divData[activeTab] !== null ? divData[activeTab] as Data : null);
    if (!first) return new Date().getMonth();
    return (first.revenue.actual as number[]).reduce((last, v, i) => v !== 0 ? i : last, -1);
  })();

  if (pageLoading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-green-200 border-t-green-700 rounded-full animate-spin" />
    </div>
  );
  if (pageError) return (
    <div className="min-h-screen bg-white flex items-center justify-center flex-col gap-3">
      <p className="text-red-500 font-semibold">{pageError}</p>
      <button onClick={() => { setPageError(null); loadDivisions(); }} className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm">Retry</button>
    </div>
  );

  /* ── Render ── */
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "#f0f2f0", overflow: "hidden" }}>

      {/* ── Header ── */}
      <div style={{ background: `linear-gradient(135deg, ${ATLAS_DARK} 0%, ${ATLAS_GREEN} 55%, #1a5c2a 100%)`, padding: "10px 16px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ background: "#fff", borderRadius: 8, padding: 3 }}>
              <Image src="/atlas-performance-logo.png" alt="Atlas Performance" width={32} height={32} style={{ objectFit: "contain", display: "block" }} />
            </div>
            <div>
              <span style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>AtlasPerformance</span>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>2026 · Budget vs. Actual · Live from Google Sheets</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "3px 10px" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}>{minsAgo === 0 ? "Live" : `${minsAgo}m ago`}</span>
            </div>
            <button onClick={refresh} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)", borderRadius: 8, padding: "4px 12px", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>
              ↻ Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ background: "#fff", borderBottom: `1px solid ${GRID}`, display: "flex", alignItems: "center", gap: 0, overflowX: "auto", flexShrink: 0, padding: "0 12px" }}>
        {/* Summary tab */}
        <TabBtn
          label="Summary"
          icon="⊞"
          active={activeTab === "summary"}
          dot={null}
          onClick={() => setActiveTab("summary")}
        />
        {/* Division tabs */}
        {divisions.map(div => {
          const d = divData[div.id];
          let dot: string | null = null;
          if (d && typeof d === "object" && d !== null) {
            const dd = d as Data;
            const cm = dd.revenue.actual.reduce((last, v, i) => v !== 0 ? i : last, -1);
            const profAct = cm >= 0 ? dd.profit.actual[cm] : null;
            const revAct  = cm >= 0 ? dd.revenue.actual[cm] : null;
            const pct = (profAct != null && revAct && revAct > 0) ? (profAct / revAct) * 100 : null;
            dot = statusColor(pct, div.target_gross_profit_percent);
          } else if (summaryItems) {
            const si = summaryItems.find(s => s.divisionId === div.id);
            if (si) {
              const cm2 = si.data.revenue.actual.reduce((last, v, i) => v !== 0 ? i : last, -1);
              const p2 = cm2 >= 0 ? si.data.profit.actual[cm2] : null;
              const r2 = cm2 >= 0 ? si.data.revenue.actual[cm2] : null;
              const pct2 = (p2 != null && r2 && r2 > 0) ? (p2 / r2) * 100 : null;
              dot = statusColor(pct2, div.target_gross_profit_percent);
            }
          }
          return (
            <TabBtn
              key={div.id}
              label={div.name}
              active={activeTab === div.id}
              dot={dot}
              onClick={() => setActiveTab(div.id)}
            />
          );
        })}

        {divisions.length === 0 && (
          <span style={{ fontSize: 11, color: "#9ca3af", padding: "12px 8px" }}>
            No divisions configured — go to Operations Center → Divisions to add sheet URLs.
          </span>
        )}
      </div>

      {/* ── Content ── */}
      <div ref={scrollRef} style={{ flex: 1, overflow: "auto", padding: 12 }}>

        {/* Summary tab */}
        {activeTab === "summary" && (
          summaryLoading && !summaryItems ? (
            <CenteredSpinner />
          ) : summaryItems && summaryItems.length === 0 ? (
            <EmptyState msg="No division performance sheets configured yet. Go to Operations Center → Divisions and add a sheet URL to each division." />
          ) : (
            <>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#111827" }}>
                  {MONTHS_FULL[currentMonth] ?? ""} Overview
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af" }}>Current month · all active divisions</div>
              </div>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 14,
              }}>
                {(summaryItems ?? []).map(item => (
                  <div
                    key={item.divisionId}
                    onClick={() => setActiveTab(item.divisionId)}
                    style={{ cursor: "pointer" }}
                    title={`Open ${item.divisionName} detail`}
                  >
                    <SummaryCard item={item} />
                  </div>
                ))}
              </div>
              {/* All-divisions totals row */}
              {summaryItems && summaryItems.length > 1 && (
                <AllDivisionsTotals items={summaryItems} />
              )}
            </>
          )
        )}

        {/* Division tabs */}
        {activeTab !== "summary" && (() => {
          const d = divData[activeTab];
          if (!d || d === "loading") return <CenteredSpinner />;
          if (d === "error") return <EmptyState msg="Failed to load sheet data. Check that the sheet URL is correct and publicly accessible." retry={() => loadDivision(activeTab)} />;
          return <DivisionTable data={d as Data} />;
        })()}
      </div>
    </div>
  );
}

/* ─── Tab button ─────────────────────────────────────────────────────── */
function TabBtn({ label, active, dot, onClick, icon }: { label: string; active: boolean; dot: string | null; onClick: () => void; icon?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "10px 14px",
        fontSize: 12, fontWeight: active ? 700 : 500,
        color: active ? "#15803d" : "#6b7280",
        background: "none", border: "none", cursor: "pointer",
        borderBottom: active ? "2px solid #15803d" : "2px solid transparent",
        whiteSpace: "nowrap",
        transition: "color 0.15s",
      }}
    >
      {icon && <span style={{ fontSize: 13 }}>{icon}</span>}
      {dot && <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, display: "inline-block", boxShadow: `0 0 5px ${dot}` }} />}
      {label}
    </button>
  );
}

/* ─── All divisions totals strip ─────────────────────────────────────── */
function AllDivisionsTotals({ items }: { items: SummaryItem[] }) {
  // Use the latest month that has ANY revenue across ANY division
  const bestMonth = items.reduce((best, item) => {
    const m = item.data.revenue.actual.reduce((last, v, i) => v !== 0 ? i : last, -1);
    return m > best ? m : best;
  }, -1);
  const currentMonth = bestMonth;
  const sum = (vals: number[]) => vals.reduce((a, b) => a + b, 0);
  const rev   = sum(items.map(i => currentMonth >= 0 ? i.data.revenue.actual[currentMonth] : 0));
  const revB  = sum(items.map(i => currentMonth >= 0 ? i.data.revenue.budget[currentMonth] : 0));
  const prof  = sum(items.map(i => currentMonth >= 0 ? i.data.profit.actual[currentMonth] : 0));
  const mat   = sum(items.map(i => currentMonth >= 0 ? i.data.materials.actual[currentMonth] : 0));
  const lab   = sum(items.map(i => currentMonth >= 0 ? i.data.labor.actual[currentMonth] : 0));
  const fuel  = sum(items.map(i => currentMonth >= 0 ? i.data.fuel.actual[currentMonth] : 0));
  const equip = sum(items.map(i => currentMonth >= 0 ? i.data.equipment.actual[currentMonth] : 0));
  const profPct = rev > 0 ? (prof / rev) * 100 : null;

  const pill = (label: string, val: number, color: string) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px 16px" }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color }}>{fmtK(val)}</div>
    </div>
  );

  return (
    <div style={{
      marginTop: 16,
      background: `linear-gradient(135deg, ${ATLAS_DARK} 0%, ${ATLAS_GREEN} 100%)`,
      borderRadius: 14, padding: "14px 20px",
      display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10,
    }}>
      <div style={{ marginRight: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.07em" }}>All Divisions</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{MONTHS_FULL[currentMonth] ?? ""} combined</div>
      </div>
      {pill("Revenue", rev, rev >= revB ? "#4ade80" : "#fbbf24")}
      {pill("Budget", revB, "rgba(255,255,255,0.6)")}
      {pill("Profit", prof, prof > 0 ? "#4ade80" : "#f87171")}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px 16px" }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>Profit %</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: profPct != null && profPct > 0 ? "#4ade80" : "#f87171" }}>
          {profPct != null ? `${Math.round(profPct)}%` : "—"}
        </div>
      </div>
      {pill("Materials", mat, "rgba(255,255,255,0.8)")}
      {pill("Labor", lab, "rgba(255,255,255,0.8)")}
      {fuel > 0 && pill("Fuel", fuel, "rgba(255,255,255,0.8)")}
      {equip > 0 && pill("Equipment", equip, "rgba(255,255,255,0.8)")}
    </div>
  );
}

/* ─── Division detail table ──────────────────────────────────────────── */
function DivisionTable({ data }: { data: Data }) {
  const currentMonth = data.revenue.actual.reduce((last, v, i) => v !== 0 ? i : last, -1);

  const cell: React.CSSProperties = {
    fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
    fontSize: 12, padding: "4px 5px",
    border: `1px solid ${GRID}`,
    whiteSpace: "nowrap", overflow: "hidden", textAlign: "center",
  };

  const colBg     = (i: number, base: string) => i === currentMonth ? CUR_BG : base;
  const totalBg   = () => currentMonth >= 0 ? CUR_BG : "#f9fafb";
  const curBorder = (i: number) => i === currentMonth
    ? { borderLeft: `1px solid ${CUR_BORDER}`, borderRight: `1px solid ${CUR_BORDER}` } : {};

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

  /* KPI strip */
  const curRev  = currentMonth >= 0 ? data.revenue.actual[currentMonth] : 0;
  const curProf = currentMonth >= 0 ? data.profit.actual[currentMonth] : 0;
  const curProfPct = curRev > 0 ? (curProf / curRev) * 100 : null;
  const revBudget = currentMonth >= 0 ? data.revenue.budget[currentMonth] : 0;

  const SHdr = ({ label }: { label: string }) => (
    <tr>
      <td colSpan={15} style={{
        ...cell,
        background: `linear-gradient(90deg, ${ATLAS_DARK} 0%, ${ATLAS_GREEN} 60%, ${ATLAS_MID} 100%)`,
        color: "#fff", fontWeight: 700, fontSize: 10, letterSpacing: "0.1em",
        textTransform: "uppercase", textAlign: "left", padding: "5px 14px",
        borderLeft: "none", borderRight: "none",
      }}>
        {label}
      </td>
    </tr>
  );

  const TypeCell = ({ label, italic, bg }: { label: string; italic?: boolean; bg: string }) => (
    <td style={{
      ...cell, background: bg, fontSize: 12,
      fontWeight: italic ? 500 : 700,
      fontStyle: italic ? "italic" : "normal",
      color: italic ? "#6b7280" : "#1f2937",
      textAlign: "left", paddingLeft: 14, borderRight: `2px solid ${GRID}`,
    }}>
      {label}
    </td>
  );

  const MC = ({ v, bg, color, bold, italic, idx }: { v: number; bg: string; color: string; bold?: boolean; italic?: boolean; idx: number }) => {
    const isCur  = idx === currentMonth;
    const isPast = idx < currentMonth;
    const fw = bold ? (isCur ? 800 : isPast ? 700 : 400) : (isCur ? 600 : isPast ? 500 : 400);
    return (
      <td style={{
        ...cell, ...curBorder(idx), background: bg,
        color: idx > currentMonth && v === 0 ? "#e5e7eb" : color,
        fontWeight: fw, fontStyle: italic ? "italic" : "normal",
        fontSize: isCur ? 13 : 12, textAlign: "center",
      }}>
        {v === 0 ? <span style={{ color: "#d1d5db" }}>—</span> : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v)}
      </td>
    );
  };

  const PC = ({ v, bg, italic, idx }: { v: number | null; bg: string; italic?: boolean; idx: number }) => {
    const isCur  = idx === currentMonth;
    const isPast = idx < currentMonth;
    return (
      <td style={{
        ...cell, ...curBorder(idx), background: bg, color: pctColor(v),
        fontStyle: italic ? "italic" : "normal",
        fontWeight: isCur ? 700 : isPast ? 500 : 400,
        fontSize: isCur ? 12 : 11, textAlign: "center",
      }}>
        {fmtPct(v)}
      </td>
    );
  };

  const TC = ({ v, color, bold, italic }: { v: number; color: string; bold?: boolean; italic?: boolean }) => (
    <td style={{
      ...cell, background: totalBg(), color,
      fontWeight: bold ? 800 : italic ? 500 : 600,
      fontStyle: italic ? "italic" : "normal",
      textAlign: "center", borderLeft: `2px solid #d1d5db`, fontSize: 13,
    }}>
      {v === 0 ? <span style={{ color: "#d1d5db" }}>—</span> : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v)}
    </td>
  );

  const TPC = ({ v }: { v?: number | null }) => (
    <td style={{ ...cell, background: "#f9fafb", color: pctColor(v ?? null), fontSize: 11, textAlign: "center" }}>
      {fmtPct(v)}
    </td>
  );

  const CostSection = ({ label, cat }: { label: string; cat: Cat }) => (
    <>
      <SHdr label={label} />
      <tr>
        <TypeCell label="Actual" bg="#fff" />
        {cat.actual.map((v, i) => <MC key={i} v={v} bg={colBg(i, "#fff")} color={costColor(v, cat.budget[i])} bold idx={i} />)}
        <TC v={cat.totalActual} color={costColor(cat.totalActual, cat.totalBudget)} bold />
        <TPC v={cat.totalPctActual} />
      </tr>
      <tr>
        <TypeCell label="Budgeted" italic bg="#f9fafb" />
        {cat.budget.map((v, i) => <MC key={i} v={v} bg={colBg(i, "#f9fafb")} color="#374151" italic idx={i} />)}
        <TC v={cat.totalBudget} color="#374151" italic />
        <TPC v={cat.totalPctBudget} />
      </tr>
      <tr>
        <TypeCell label="% of Rev" italic bg="#f3f4f6" />
        {(cat.pct ?? Array(12).fill(null)).map((v, i) => <PC key={i} v={v} bg={colBg(i, "#f3f4f6")} italic idx={i} />)}
        <td style={{ ...cell, background: totalBg(), color: pctColor(cat.totalPctActual ?? null), fontSize: 11, fontStyle: "italic", borderLeft: "2px solid #d1d5db", textAlign: "center" }}>
          {fmtPct(cat.totalPctActual)}
        </td>
        <td style={{ ...cell, background: "#f9fafb" }} />
      </tr>
    </>
  );

  return (
    <>
      {/* KPI strip */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <KpiCard label="Revenue MTD" value={fmtK(curRev)} sub={revBudget > 0 ? `Budget: ${fmtK(revBudget)}` : ""} color={curRev > 0 ? "#15803d" : "#9ca3af"} />
        <KpiCard label="Profit MTD" value={fmtK(curProf)} sub="" color={curProf > 0 ? "#15803d" : curProf < 0 ? "#dc2626" : "#9ca3af"} />
        <KpiCard label="Profit %" value={curProfPct != null ? `${Math.round(curProfPct)}%` : "—"} sub={data.targetGp ? `Goal: ${data.targetGp}%` : ""} color={curProfPct != null && data.targetGp && curProfPct >= data.targetGp ? "#15803d" : "#dc2626"} />
        <KpiCard label="YTD Revenue" value={fmtK(data.revenue.totalActual)} sub={data.revenue.totalBudget > 0 ? `Budget: ${fmtK(data.revenue.totalBudget)}` : ""} color="#374151" />
        <KpiCard label="YTD Profit" value={fmtK(data.profit.totalActual)} sub={data.profit.totalPctActual != null ? `${Math.round(data.profit.totalPctActual)}% of rev` : ""} color={data.profit.totalActual > 0 ? "#15803d" : "#dc2626"} />
      </div>

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: 10, border: `1px solid ${GRID}`, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", overflow: "hidden" }}>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" as any }}>
          <div style={{ minWidth: 700 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "8%" }} />
                {SHORT.map((_, i) => <col key={i} style={{ width: `${(75 / 12).toFixed(2)}%` }} />)}
                <col style={{ width: "9%" }} />
                <col style={{ width: "3%" }} />
              </colgroup>

              {/* Sticky header */}
              <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
                <tr style={{ background: HDR_BG }}>
                  <th style={{ ...cell, background: HDR_BG, borderRight: `2px solid #374151`, color: "rgba(255,255,255,0.3)", fontSize: 10 }} />
                  {SHORT.map((m, i) => {
                    const isCur  = i === currentMonth;
                    const hasDat = i <= currentMonth;
                    return (
                      <th key={i} style={{
                        ...cell,
                        background: isCur ? CUR_HDR : HDR_BG,
                        color: isCur ? "#fff" : hasDat ? "#e5e7eb" : "rgba(255,255,255,0.25)",
                        fontWeight: isCur ? 800 : 600, fontSize: 11,
                        borderBottom: isCur ? `2px solid #4ade80` : `1px solid #374151`,
                        borderRight: `1px solid #374151`,
                      }}>
                        {m}
                      </th>
                    );
                  })}
                  <th style={{ ...cell, background: HDR_BG, color: "rgba(255,255,255,0.5)", fontWeight: 700, fontSize: 11, borderLeft: `2px solid #374151`, borderRight: `1px solid #374151` }}>Total</th>
                  <th style={{ ...cell, background: HDR_BG, color: "rgba(255,255,255,0.3)", fontWeight: 600, fontSize: 10 }}>%</th>
                </tr>
              </thead>

              <tbody>
                {/* Revenue */}
                <SHdr label="Revenue" />
                <tr>
                  <TypeCell label="Actual" bg="#fff" />
                  {data.revenue.actual.map((v, i) => <MC key={i} v={v} bg={colBg(i, "#fff")} color={revColor(v)} bold idx={i} />)}
                  <TC v={data.revenue.totalActual} color={revColor(data.revenue.totalActual)} bold />
                  <TPC />
                </tr>
                <tr>
                  <TypeCell label="Budgeted" italic bg="#f9fafb" />
                  {data.revenue.budget.map((v, i) => <MC key={i} v={v} bg={colBg(i, "#f9fafb")} color="#374151" italic idx={i} />)}
                  <TC v={data.revenue.totalBudget} color="#374151" italic />
                  <TPC />
                </tr>

                <CostSection label="Job Materials" cat={data.materials} />
                <CostSection label="Labor" cat={data.labor} />
                <CostSection label="Fuel" cat={data.fuel} />
                <CostSection label="Equipment" cat={data.equipment} />

                {/* Profit */}
                <SHdr label="Profit" />
                <tr>
                  <TypeCell label="Actual" bg="#fff" />
                  {data.profit.actual.map((v, i) => <MC key={i} v={v} bg={colBg(i, "#fff")} color={profColor(v)} bold idx={i} />)}
                  <TC v={data.profit.totalActual} color={profColor(data.profit.totalActual)} bold />
                  <TPC v={data.profit.totalPctActual} />
                </tr>
                <tr>
                  <TypeCell label="Budgeted" italic bg="#f9fafb" />
                  {data.profit.budget.map((v, i) => <MC key={i} v={v} bg={colBg(i, "#f9fafb")} color="#374151" italic idx={i} />)}
                  <TC v={data.profit.totalBudget} color="#374151" italic />
                  <TPC v={data.profit.totalPctBudget} />
                </tr>
                <tr>
                  <TypeCell label="% of Rev" italic bg="#f3f4f6" />
                  {(data.profit.pct ?? Array(12).fill(null)).map((v, i) => <PC key={i} v={v} bg={colBg(i, "#f3f4f6")} italic idx={i} />)}
                  <td style={{ ...cell, background: totalBg(), color: pctColor(data.profit.totalPctActual ?? null), fontSize: 11, fontStyle: "italic", borderLeft: "2px solid #d1d5db", textAlign: "center" }}>
                    {fmtPct(data.profit.totalPctActual)}
                  </td>
                  <td style={{ ...cell, background: "#f9fafb" }} />
                </tr>
                {data.profit.goal && (
                  <tr>
                    <TypeCell label="Goal %" italic bg="#f3f4f6" />
                    {data.profit.goal.map((v, i) => (
                      <td key={i} style={{ ...cell, ...curBorder(i), background: colBg(i, "#f3f4f6"), color: "#4338ca", fontSize: 11, fontStyle: "italic", textAlign: "center" }}>
                        {fmtPct(v)}
                      </td>
                    ))}
                    <td style={{ ...cell, background: totalBg(), borderLeft: "2px solid #d1d5db" }} />
                    <td style={{ ...cell, background: "#f9fafb" }} />
                  </tr>
                )}

                {/* Profit Behind */}
                <SHdr label="Profit Behind" />
                <tr>
                  <TypeCell label="Cumulative" bg="#fff" />
                  {data.profitBehind.map((v, i) => (
                    <td key={i} style={{
                      ...cell, ...curBorder(i), background: colBg(i, "#fff"),
                      color: i === currentMonth ? (v < 0 ? "#15803d" : "#dc2626") : "transparent",
                      fontWeight: 700, textAlign: "center",
                    }}>
                      {i === currentMonth && v !== 0 ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v) : ""}
                    </td>
                  ))}
                  <td style={{ ...cell, background: totalBg(), borderLeft: "2px solid #d1d5db" }} />
                  <td style={{ ...cell, background: "#f9fafb" }} />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── KPI card ───────────────────────────────────────────────────────── */
function KpiCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 10, border: `1px solid ${GRID}`,
      padding: "10px 16px", minWidth: 110,
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────────── */
function CenteredSpinner() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
      <div style={{ width: 28, height: 28, border: "3px solid #dcfce7", borderTopColor: "#15803d", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function EmptyState({ msg, retry }: { msg: string; retry?: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, gap: 10 }}>
      <p style={{ fontSize: 13, color: "#6b7280", maxWidth: 400, textAlign: "center" }}>{msg}</p>
      {retry && <button onClick={retry} style={{ fontSize: 12, background: "#15803d", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer" }}>Retry</button>}
    </div>
  );
}
