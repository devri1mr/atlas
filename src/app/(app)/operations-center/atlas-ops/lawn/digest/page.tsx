"use client";

import { useEffect, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

type Severity = "good" | "watch" | "bad";

type Finding = {
  severity: Severity;
  category: string;
  message: string;
  detail?: string;
};

type CrewRow = {
  crew_code: string;
  jobs: number;
  budgeted_hours: number;
  actual_hours: number;
  actual_amount: number;
  efficiency: number | null;
};

type JobFlag = {
  work_order: string | null;
  client_name: string | null;
  service: string | null;
  crew_code: string | null;
  budgeted_hours: number;
  actual_hours: number;
  variance_pct: number;
};

type Scorecard = {
  revenue: number;
  budgeted_revenue: number;
  total_payroll: number;
  field_payroll: number;
  on_job_payroll: number;
  down_time_payroll: number;
  admin_payroll: number;
  field_labor_pct: number | null;
  admin_burden_pct: number | null;
  total_labor_pct: number | null;
  on_job_pct: number | null;
  down_time_pct: number | null;
  ot_pct: number | null;
  hours_efficiency: number | null;
  revenue_vs_budget: number | null;
  total_clocked_hours: number;
  total_on_job_hours: number;
  total_down_time_hours: number;
  total_ot_hours: number;
  days_in_range: number;
  reports_count: number;
};

type DigestData = {
  scorecard: Scorecard;
  findings: Finding[];
  crew_performance: CrewRow[];
  job_flags: JobFlag[];
};

type Preset = "last7" | "thisWeek" | "lastWeek" | "thisMonth";

// ── Date helpers ───────────────────────────────────────────────────────────────

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getPresetRange(preset: Preset): { start: string; end: string } {
  const now   = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

  if (preset === "last7") {
    const s = new Date(today);
    s.setUTCDate(today.getUTCDate() - 6);
    return { start: toIsoDate(s), end: toIsoDate(today) };
  }

  if (preset === "thisWeek") {
    const dow  = today.getUTCDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    const mon  = new Date(today);
    mon.setUTCDate(today.getUTCDate() + diff);
    return { start: toIsoDate(mon), end: toIsoDate(today) };
  }

  if (preset === "lastWeek") {
    const dow     = today.getUTCDay();
    const diff    = dow === 0 ? -6 : 1 - dow;
    const thisMon = new Date(today);
    thisMon.setUTCDate(today.getUTCDate() + diff);
    const lastMon = new Date(thisMon);
    lastMon.setUTCDate(thisMon.getUTCDate() - 7);
    const lastSun = new Date(thisMon);
    lastSun.setUTCDate(thisMon.getUTCDate() - 1);
    return { start: toIsoDate(lastMon), end: toIsoDate(lastSun) };
  }

  // thisMonth
  const firstOfMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  return { start: toIsoDate(firstOfMonth), end: toIsoDate(today) };
}

function fmtDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  const s = new Date(start + "T12:00:00Z").toLocaleDateString("en-US", opts);
  const e = new Date(end   + "T12:00:00Z").toLocaleDateString("en-US", { ...opts, year: "numeric" });
  return `${s} – ${e}`;
}

// ── Formatters ─────────────────────────────────────────────────────────────────

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function fmtMoney(n: number): string {
  return money.format(n);
}

function fmtPct(n: number | null): string {
  if (n === null) return "—";
  return (n * 100).toFixed(1) + "%";
}

function fmtHrs(n: number): string {
  return n.toFixed(1) + "h";
}

// ── Color helpers ──────────────────────────────────────────────────────────────

function fieldLaborColor(v: number | null): string {
  if (v === null) return "text-white";
  if (v <= 0.36) return "text-emerald-400";
  if (v <= 0.42) return "text-amber-400";
  return "text-red-400";
}

function downTimeColor(v: number | null): string {
  if (v === null) return "text-white";
  if (v <= 0.10) return "text-emerald-400";
  if (v <= 0.18) return "text-amber-400";
  return "text-red-400";
}

function efficiencyColor(v: number | null, dark = false): string {
  const base = dark ? "" : "";
  if (v === null) return dark ? "text-gray-400" : "text-gray-500";
  if (v >= 0.95) return "text-emerald-600";
  if (v >= 0.85) return "text-amber-500";
  return "text-red-500";
}

function otColor(v: number | null): string {
  if (v === null) return "text-gray-600";
  if (v <= 0.08) return "text-emerald-600";
  if (v <= 0.15) return "text-amber-500";
  return "text-red-500";
}

function onJobColor(v: number | null): string {
  if (v === null) return "text-gray-600";
  if (v >= 0.88) return "text-emerald-600";
  if (v >= 0.80) return "text-amber-500";
  return "text-red-500";
}

function varianceCellColor(v: number): string {
  if (v > 0.05) return "text-red-600 font-semibold";
  if (v < -0.05) return "text-emerald-600 font-semibold";
  return "text-gray-700";
}

function crewEffColor(v: number | null): string {
  if (v === null) return "text-gray-400";
  if (v >= 0.95) return "text-emerald-700 bg-emerald-50";
  if (v >= 0.85) return "text-amber-700 bg-amber-50";
  return "text-red-700 bg-red-50";
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function SkeletonCard({ dark = false, h = "h-28" }: { dark?: boolean; h?: string }) {
  return (
    <div
      className={`rounded-xl ${h} animate-pulse ${dark ? "bg-white/10" : "bg-gray-200"}`}
    />
  );
}

// ── Severity icon ──────────────────────────────────────────────────────────────

function SeverityIcon({ s }: { s: Severity }) {
  if (s === "bad")   return <span className="text-red-500 text-base leading-none">●</span>;
  if (s === "watch") return <span className="text-amber-500 text-base leading-none">▲</span>;
  return <span className="text-emerald-500 text-base leading-none">✓</span>;
}

function severityBg(s: Severity): string {
  if (s === "bad")   return "bg-red-50 border-red-200";
  if (s === "watch") return "bg-amber-50 border-amber-200";
  return "bg-emerald-50 border-emerald-200";
}

function severityBadge(s: Severity): string {
  if (s === "bad")   return "bg-red-100 text-red-700";
  if (s === "watch") return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div
      className="rounded-t-xl px-5 py-3.5 flex items-baseline gap-3"
      style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 100%)" }}
    >
      <span className="text-sm font-semibold text-white tracking-wide">{title}</span>
      {sub && <span className="text-xs text-white/40">{sub}</span>}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

const PRESETS: { key: Preset; label: string }[] = [
  { key: "last7",     label: "Last 7 Days" },
  { key: "thisWeek",  label: "This Week"   },
  { key: "lastWeek",  label: "Last Week"   },
  { key: "thisMonth", label: "This Month"  },
];

export default function DigestPage() {
  const [preset,  setPreset]  = useState<Preset>("last7");
  const [range,   setRange]   = useState<{ start: string; end: string }>(getPresetRange("last7"));
  const [data,    setData]    = useState<DigestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  async function fetchDigest(r: { start: string; end: string }) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/operations-center/atlas-ops/lawn/digest?start=${r.start}&end=${r.end}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `HTTP ${res.status}`);
      }
      const d: DigestData = await res.json();
      setData(d);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  // Auto-fetch on mount
  useEffect(() => {
    fetchDigest(range);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function selectPreset(p: Preset) {
    const r = getPresetRange(p);
    setPreset(p);
    setRange(r);
    fetchDigest(r);
  }

  const sc = data?.scorecard;

  // Sort findings: bad → watch → good
  const sortedFindings = (data?.findings ?? []).slice().sort((a, b) => {
    const order = { bad: 0, watch: 1, good: 2 };
    return order[a.severity] - order[b.severity];
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Top header bar ── */}
      <div
        className="px-6 py-5 border-b border-white/10"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}
      >
        <div className="mx-auto max-w-[1300px]">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
            <div>
              <h1 className="text-xl font-semibold text-white tracking-tight">Lawn Digest</h1>
              <p className="text-xs text-white/40 mt-0.5">
                Operational performance summary — payroll, labor efficiency, crew results
              </p>
            </div>
            {sc && (
              <div className="text-right">
                <div className="text-xs text-white/40">{sc.reports_count} complete reports</div>
                <div className="text-xs text-white/40">{sc.days_in_range} calendar days</div>
              </div>
            )}
          </div>

          {/* Preset selector */}
          <div className="mt-4 flex items-center gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => selectPreset(p.key)}
                className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  preset === p.key
                    ? "bg-emerald-500 text-white shadow-sm shadow-emerald-900/40"
                    : "text-white/50 hover:text-white/80 hover:bg-white/10"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-1.5 text-[11px] text-white/30 tabular-nums">
            {fmtDateRange(range.start, range.end)}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="mx-auto max-w-[1300px] px-4 md:px-6 py-6 space-y-6">

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-5 py-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ── Row 1: Hero metrics (dark cards) ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-xl h-32 animate-pulse bg-[#0d2616]/60" />
            ))
          ) : sc ? (
            <>
              {/* Revenue */}
              <div
                className="rounded-xl px-5 py-4 flex flex-col justify-between"
                style={{ background: "linear-gradient(145deg, #0d2616, #123b1f)" }}
              >
                <div className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">Revenue</div>
                <div>
                  <div
                    className={`text-2xl font-semibold tabular-nums ${
                      sc.revenue_vs_budget !== null && sc.revenue_vs_budget >= 1
                        ? "text-emerald-400"
                        : "text-amber-400"
                    }`}
                  >
                    {fmtMoney(sc.revenue)}
                  </div>
                  <div className="text-[11px] text-white/35 mt-1 tabular-nums">
                    vs {fmtMoney(sc.budgeted_revenue)} budgeted
                  </div>
                </div>
              </div>

              {/* Total Payroll */}
              <div
                className="rounded-xl px-5 py-4 flex flex-col justify-between"
                style={{ background: "linear-gradient(145deg, #0d2616, #123b1f)" }}
              >
                <div className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">Total Payroll</div>
                <div>
                  <div className="text-2xl font-semibold text-white tabular-nums">
                    {fmtMoney(sc.total_payroll)}
                  </div>
                  <div className="text-[11px] text-white/35 mt-1 tabular-nums">
                    Field {fmtMoney(sc.field_payroll)} + Admin {fmtMoney(sc.admin_payroll)}
                  </div>
                </div>
              </div>

              {/* Field Labor % */}
              <div
                className="rounded-xl px-5 py-4 flex flex-col justify-between"
                style={{ background: "linear-gradient(145deg, #0d2616, #123b1f)" }}
              >
                <div className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">Field Labor</div>
                <div>
                  <div className={`text-2xl font-semibold tabular-nums ${fieldLaborColor(sc.field_labor_pct)}`}>
                    {fmtPct(sc.field_labor_pct)}
                  </div>
                  <div className="text-[11px] text-white/35 mt-1">of revenue</div>
                </div>
              </div>

              {/* Admin Burden % */}
              <div
                className="rounded-xl px-5 py-4 flex flex-col justify-between"
                style={{ background: "linear-gradient(145deg, #0d2616, #123b1f)" }}
              >
                <div className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">Admin Burden</div>
                <div>
                  <div className="text-2xl font-semibold text-white/80 tabular-nums">
                    {fmtPct(sc.admin_burden_pct)}
                  </div>
                  <div className="text-[11px] text-white/35 mt-1">of revenue</div>
                </div>
              </div>

              {/* Down Time % */}
              <div
                className="rounded-xl px-5 py-4 flex flex-col justify-between"
                style={{ background: "linear-gradient(145deg, #0d2616, #123b1f)" }}
              >
                <div className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">Down Time</div>
                <div>
                  <div className={`text-2xl font-semibold tabular-nums ${downTimeColor(sc.down_time_pct)}`}>
                    {fmtPct(sc.down_time_pct)}
                  </div>
                  <div className="text-[11px] text-white/35 mt-1">of clocked hours</div>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* ── Row 2: Secondary metrics (white cards) ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} h="h-24" />
            ))
          ) : sc ? (
            <>
              {/* Hours Efficiency */}
              <div className="rounded-xl bg-white border border-[#d7e6db] px-5 py-4 shadow-sm">
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Hours Efficiency</div>
                <div className={`text-3xl font-semibold tabular-nums ${efficiencyColor(sc.hours_efficiency)}`}>
                  {sc.hours_efficiency !== null ? fmtPct(sc.hours_efficiency) : "—"}
                </div>
                <div className="text-xs text-gray-400 mt-1 tabular-nums">
                  budgeted {fmtHrs(sc.total_on_job_hours > 0 ? sc.total_on_job_hours * (sc.hours_efficiency ?? 1) : 0)} / actual {fmtHrs(sc.total_on_job_hours)}
                </div>
              </div>

              {/* OT Exposure */}
              <div className="rounded-xl bg-white border border-[#d7e6db] px-5 py-4 shadow-sm">
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">OT Exposure</div>
                <div className={`text-3xl font-semibold tabular-nums ${otColor(sc.ot_pct)}`}>
                  {fmtPct(sc.ot_pct)}
                </div>
                <div className="text-xs text-gray-400 mt-1 tabular-nums">
                  {fmtHrs(sc.total_ot_hours)} OT hrs
                </div>
              </div>

              {/* On-Job Time */}
              <div className="rounded-xl bg-white border border-[#d7e6db] px-5 py-4 shadow-sm">
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">On-Job Time</div>
                <div className={`text-3xl font-semibold tabular-nums ${onJobColor(sc.on_job_pct)}`}>
                  {fmtPct(sc.on_job_pct)}
                </div>
                <div className="text-xs text-gray-400 mt-1 tabular-nums">
                  {fmtHrs(sc.total_on_job_hours)} of {fmtHrs(sc.total_clocked_hours)} clocked
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* ── Findings ── */}
        <div className="rounded-xl bg-white border border-[#d7e6db] shadow-sm overflow-hidden">
          <SectionHeader title="What Happened" sub={loading ? "" : `${sortedFindings.length} findings`} />
          <div className="divide-y divide-gray-100">
            {loading ? (
              <div className="px-5 py-4 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-8 rounded-lg bg-gray-100 animate-pulse" />
                ))}
              </div>
            ) : sortedFindings.length === 0 ? (
              <div className="px-5 py-8 text-sm text-gray-400 text-center">
                Nothing flagged — clean run.
              </div>
            ) : (
              sortedFindings.map((f, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 px-5 py-3.5 border-l-4 ${severityBg(f.severity)}`}
                  style={{
                    borderLeftColor:
                      f.severity === "bad" ? "#ef4444" :
                      f.severity === "watch" ? "#f59e0b" : "#10b981",
                  }}
                >
                  <div className="mt-0.5">
                    <SeverityIcon s={f.severity} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${severityBadge(f.severity)}`}>
                        {f.category}
                      </span>
                      <span className="text-sm text-gray-800">{f.message}</span>
                    </div>
                    {f.detail && (
                      <div className="mt-0.5 text-xs text-gray-500">{f.detail}</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Payroll Breakdown ── */}
        <div className="rounded-xl bg-white border border-[#d7e6db] shadow-sm overflow-hidden">
          <SectionHeader title="Payroll Breakdown" />
          <div className="px-5 py-5">
            {loading ? (
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />
                ))}
              </div>
            ) : sc ? (
              <>
                {/* Stacked bar */}
                {sc.total_payroll > 0 && (
                  <div className="mb-5 h-5 rounded-full overflow-hidden flex">
                    <div
                      className="bg-emerald-600 h-full transition-all"
                      style={{ width: `${(sc.on_job_payroll / sc.total_payroll) * 100}%` }}
                      title="On-Job"
                    />
                    <div
                      className="bg-amber-400 h-full transition-all"
                      style={{ width: `${(sc.down_time_payroll / sc.total_payroll) * 100}%` }}
                      title="Down Time"
                    />
                    <div
                      className="bg-slate-400 h-full transition-all"
                      style={{ width: `${(sc.admin_payroll / sc.total_payroll) * 100}%` }}
                      title="Admin"
                    />
                  </div>
                )}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                      <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wide">On-Job</span>
                    </div>
                    <div className="text-lg font-semibold text-emerald-900 tabular-nums">{fmtMoney(sc.on_job_payroll)}</div>
                    <div className="text-xs text-emerald-700/60 tabular-nums">
                      {sc.total_payroll > 0 ? ((sc.on_job_payroll / sc.total_payroll) * 100).toFixed(1) : "—"}% of payroll
                    </div>
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                      <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wide">Down Time</span>
                    </div>
                    <div className="text-lg font-semibold text-amber-900 tabular-nums">{fmtMoney(sc.down_time_payroll)}</div>
                    <div className="text-xs text-amber-700/60 tabular-nums">
                      {sc.total_payroll > 0 ? ((sc.down_time_payroll / sc.total_payroll) * 100).toFixed(1) : "—"}% of payroll
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                      <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Admin</span>
                    </div>
                    <div className="text-lg font-semibold text-slate-800 tabular-nums">{fmtMoney(sc.admin_payroll)}</div>
                    <div className="text-xs text-slate-500/70 tabular-nums">
                      {sc.total_payroll > 0 ? ((sc.admin_payroll / sc.total_payroll) * 100).toFixed(1) : "—"}% of payroll
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>

        {/* ── Crew Leaderboard ── */}
        <div className="rounded-xl bg-white border border-[#d7e6db] shadow-sm overflow-hidden">
          <SectionHeader title="Crew Leaderboard" sub="sorted by efficiency" />
          <div className="overflow-x-auto">
            {loading ? (
              <div className="px-5 py-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-9 rounded-lg bg-gray-100 animate-pulse" />
                ))}
              </div>
            ) : !data?.crew_performance?.length ? (
              <div className="px-5 py-8 text-sm text-gray-400 text-center">No crew data for this period.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/70">
                    <th className="text-left px-5 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Crew</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Jobs</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Budget Hrs</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Actual Hrs</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Revenue</th>
                    <th className="text-right px-5 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Efficiency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.crew_performance.map((row) => (
                    <tr key={row.crew_code} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-5 py-3 font-semibold text-gray-900">{row.crew_code}</td>
                      <td className="px-4 py-3 text-right text-gray-600 tabular-nums">{row.jobs}</td>
                      <td className="px-4 py-3 text-right text-gray-600 tabular-nums">{row.budgeted_hours.toFixed(1)}</td>
                      <td className="px-4 py-3 text-right text-gray-600 tabular-nums">{row.actual_hours.toFixed(1)}</td>
                      <td className="px-4 py-3 text-right text-gray-600 tabular-nums">{fmtMoney(row.actual_amount)}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-semibold tabular-nums ${crewEffColor(row.efficiency)}`}>
                          {row.efficiency !== null ? fmtPct(row.efficiency) : "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Flagged Jobs ── */}
        {!loading && data?.job_flags && data.job_flags.length > 0 && (
          <div className="rounded-xl bg-white border border-[#d7e6db] shadow-sm overflow-hidden">
            <SectionHeader title="Jobs Needing Attention" sub={`${data.job_flags.length} flagged — ≥30% variance`} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/70">
                    <th className="text-left px-5 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Work Order</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Client</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Service</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Crew</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Budget</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Actual</th>
                    <th className="text-right px-5 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.job_flags.map((job, i) => (
                    <tr key={i} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-5 py-3 font-mono text-xs text-gray-700">{job.work_order ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-800 max-w-[160px] truncate">{job.client_name ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{job.service ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{job.crew_code ?? "—"}</td>
                      <td className="px-4 py-3 text-right text-gray-600 tabular-nums">{job.budgeted_hours.toFixed(1)}h</td>
                      <td className="px-4 py-3 text-right text-gray-600 tabular-nums">{job.actual_hours.toFixed(1)}h</td>
                      <td className={`px-5 py-3 text-right tabular-nums ${varianceCellColor(job.variance_pct)}`}>
                        {job.variance_pct > 0 ? "+" : ""}{(job.variance_pct * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Bottom spacer */}
        <div className="h-6" />
      </div>
    </div>
  );
}
