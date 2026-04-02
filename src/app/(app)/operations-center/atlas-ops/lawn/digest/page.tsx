"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@/lib/userContext";

// ── Types ──────────────────────────────────────────────────────────────────────

type Severity = "good" | "watch" | "bad";

type Finding = {
  severity: Severity;
  category: string;
  message: string;
  detail?: string;
};

type MemberRow = {
  name: string;
  total_payroll_hours: number;
  ot_hours: number;
  down_time_hours: number;
  down_time_pct: number | null;
  revenue: number;
  labor_cost: number;
  labor_pct: number | null;
  revenue_per_manhour: number | null;
};

type CrewPerformance = {
  crew_code: string;
  jobs: number;
  budgeted_hours: number;
  actual_hours: number;
  revenue: number;
  labor_cost: number;
  labor_pct: number | null;
  revenue_per_manhour: number | null;
  efficiency: number | null;
};

type ServiceBreakdown = {
  service: string;
  jobs: number;
  actual_hours: number;
  budgeted_hours: number;
  revenue: number;
  labor_cost: number;
  labor_pct: number | null;
  revenue_per_manhour: number | null;
  hours_efficiency: number | null;
};

type JobFlag = {
  job_id: string;
  client_name: string | null;
  service: string | null;
  crew_code: string | null;
  budgeted_hours: number;           // primary = real (or SAP if real null)
  real_budgeted_hours: number | null;
  proposed_budgeted_hours: number | null;
  sap_budgeted_hours: number;       // SAP Est. (secondary)
  actual_hours: number;
  variance_pct: number;
  revenue: number;
  revenue_per_manhour: number | null;
  labor_pct: number | null;
  dollar_impact: number;
};

type MemberTime = {
  member_id: string;
  employee_id?: string | null;
  resource_name: string;
  actual_hours: number;
  pay_rate: number;
  reg_hours: number;
  ot_hours: number;
  dispatch_time_id: string | null;
  dispatch_job_id: string | null;
  time_varies: boolean;
  start_time: string | null;
  end_time: string | null;
};

type JobTimeData = {
  job: {
    id: string; work_order: string; service_date: string;
    actual_hours: number; budgeted_hours: number;
    dispatch_job_id: string | null; time_varies: boolean;
  };
  members: MemberTime[];
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
  total_real_budgeted_hours: number;
  total_on_job_hours: number;
  total_down_time_hours: number;
  total_ot_hours: number;
  days_in_range: number;
  reports_count: number;
  field_labor_goal: number | null;
  total_labor_goal: number | null;
  prorated_budget_revenue: number;
  prorated_budget_labor: number;
  prorated_budget_admin: number;
};

type DigestData = {
  scorecard: Scorecard;
  findings: Finding[];
  member_leaderboard: MemberRow[];
  crew_performance: CrewPerformance[];
  service_breakdown: ServiceBreakdown[];
  job_flags: JobFlag[];
};

type Preset = "yesterday" | "lastMonth" | "thisWeek" | "lastWeek" | "thisMonth" | "custom";

// ── Date helpers ───────────────────────────────────────────────────────────────

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getPresetRange(preset: Preset): { start: string; end: string } | null {
  if (preset === "custom") return null;

  const now   = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

  if (preset === "yesterday") {
    const y = new Date(today);
    y.setUTCDate(today.getUTCDate() - 1);
    return { start: toIsoDate(y), end: toIsoDate(y) };
  }

  if (preset === "lastMonth") {
    const y = today.getUTCFullYear();
    const m = today.getUTCMonth(); // 0-indexed month of last month
    const first = new Date(Date.UTC(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1, 1));
    const last  = new Date(Date.UTC(y, m, 0)); // day 0 of current month = last day of previous
    return { start: toIsoDate(first), end: toIsoDate(last) };
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
  return start === end ? s + `, ${new Date(end + "T12:00:00Z").getUTCFullYear()}` : `${s} – ${e}`;
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
  return n.toFixed(2) + " hrs";
}

// ── Color helpers ──────────────────────────────────────────────────────────────

function fieldLaborColor(v: number | null, goal: number | null): string {
  if (v === null) return "text-white";
  const g = goal ?? 0.39;
  if (v <= g * 0.95) return "text-emerald-400";
  if (v <= g * 1.05) return "text-amber-400";
  return "text-red-400";
}

function downTimeColor(v: number | null): string {
  if (v === null) return "text-white";
  if (v <= 0.10) return "text-emerald-400";
  if (v <= 0.18) return "text-amber-400";
  return "text-red-400";
}

function efficiencyColor(v: number | null): string {
  if (v === null) return "text-gray-500";
  if (v <= 1.00) return "text-emerald-600";
  if (v <= 1.15) return "text-amber-500";
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

// variance_pct: positive = over budget (bad), negative = under budget (good)
function varianceCellColor(v: number): string {
  if (v > 0.05)  return "text-red-600 font-semibold";
  if (v < -0.05) return "text-emerald-600 font-semibold";
  return "text-gray-700";
}

function memberLaborBadge(v: number | null, goal: number | null): string {
  if (v === null) return "bg-gray-100 text-gray-400";
  const g = goal ?? 0.39;
  if (v <= g)        return "bg-emerald-100 text-emerald-700";
  if (v <= g * 1.10) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

function jobLaborBadge(v: number | null, goal: number | null): string {
  if (v === null) return "bg-gray-100 text-gray-400";
  const g = goal ?? 0.39;
  if (v <= g)         return "bg-emerald-100 text-emerald-700";
  if (v <= g * 1.15)  return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

function effBadge(v: number | null): string {
  if (v === null) return "bg-gray-100 text-gray-400";
  if (v <= 1.00) return "bg-emerald-100 text-emerald-700";
  if (v <= 1.15) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

function laborBadgeColor(v: number | null, goal: number | null): string {
  if (v === null) return "text-gray-400";
  const g = goal ?? 0.39;
  if (v <= g)         return "text-emerald-600 font-semibold";
  if (v <= g * 1.10)  return "text-amber-600 font-semibold";
  return "text-red-600 font-semibold";
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function SkeletonCard({ dark = false, h = "h-28" }: { dark?: boolean; h?: string }) {
  return (
    <div className={`rounded-xl ${h} animate-pulse ${dark ? "bg-white/10" : "bg-gray-200"}`} />
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
  { key: "yesterday",  label: "Yesterday"   },
  { key: "lastMonth",  label: "Last Month"  },
  { key: "thisWeek",   label: "This Week"   },
  { key: "lastWeek",   label: "Last Week"   },
  { key: "thisMonth",  label: "This Month"  },
  { key: "custom",     label: "Custom"      },
];

// ── Calculation Breakdown ─────────────────────────────────────────────────────

function CalcRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="text-right">
        <span className="text-xs font-semibold text-gray-800 tabular-nums">{value}</span>
        {sub && <span className="text-[11px] text-gray-400 ml-2 tabular-nums">{sub}</span>}
      </div>
    </div>
  );
}

function CalcSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1 mt-4 first:mt-0">{title}</div>
      <div className="rounded-lg border border-gray-200 bg-gray-50/50 px-4 divide-y divide-gray-100">
        {children}
      </div>
    </div>
  );
}

export default function DigestPage() {
  const { can } = useUser();
  const canSeePay = can("hr_labor_cost");

  const [preset,      setPreset]      = useState<Preset>("lastMonth");
  const [showCalc,    setShowCalc]    = useState(false);
  const [range,       setRange]       = useState<{ start: string; end: string }>(getPresetRange("lastMonth")!);
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd,   setCustomEnd]   = useState<string>("");
  const [data,        setData]        = useState<DigestData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  // ── Job time editing state ──────────────────────────────────────────────────
  const [expandedJob,    setExpandedJob]    = useState<string | null>(null);
  const [jobTimeData,    setJobTimeData]    = useState<JobTimeData | null>(null);
  const [jobTimeLoading, setJobTimeLoading] = useState(false);
  const [editedMembers,  setEditedMembers]  = useState<MemberTime[]>([]);
  const [saving,         setSaving]         = useState(false);
  const [saveError,      setSaveError]      = useState<string | null>(null);
  const rangeRef = useRef(range);

  // ── Add person state ────────────────────────────────────────────────────────
  const [employees,      setEmployees]      = useState<{ id: string; first_name: string; last_name: string; preferred_name?: string | null; default_pay_rate: number | null }[]>([]);
  const [showAddPerson,  setShowAddPerson]  = useState(false);
  const [addPersonEmpId, setAddPersonEmpId] = useState("");
  const [addPersonHours, setAddPersonHours] = useState("0");

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

  // Keep rangeRef in sync so job-time save can re-fetch with current range
  useEffect(() => { rangeRef.current = range; }, [range]);

  async function openJobTime(jobId: string) {
    if (expandedJob === jobId) { setExpandedJob(null); setJobTimeData(null); return; }
    setExpandedJob(jobId);
    setJobTimeData(null);
    setSaveError(null);
    setShowAddPerson(false);
    setAddPersonEmpId("");
    setAddPersonHours("0");
    setJobTimeLoading(true);
    try {
      const res = await fetch(`/api/operations-center/atlas-ops/lawn/job-time?job_id=${jobId}`, { cache: "no-store" });
      const d: JobTimeData = await res.json();
      setJobTimeData(d);
      setEditedMembers(d.members.map(m => ({ ...m })));
    } catch { /* ignore */ }
    setJobTimeLoading(false);
  }

  function updateMemberTime(idx: number, field: "start_time" | "end_time" | "actual_hours", val: string | number) {
    setEditedMembers(prev => {
      const next = prev.map((m, i) => i === idx ? { ...m, [field]: val } : m);

      // Auto-calculate hours when start or end changes
      if (field === "start_time" || field === "end_time") {
        const m = next[idx];
        if (m.start_time && m.end_time) {
          const diff = (new Date(m.end_time).getTime() - new Date(m.start_time).getTime()) / 3600000;
          if (diff > 0) next[idx] = { ...m, actual_hours: Math.round(diff * 100) / 100 };
        }
        // For shared time (time_varies=false): apply same start/end to all members
        if (!next[idx].time_varies) {
          return next.map(row => ({
            ...row,
            start_time: next[idx].start_time,
            end_time:   next[idx].end_time,
            actual_hours: next[idx].actual_hours,
          }));
        }
      }
      return next;
    });
  }

  const TZ = "America/New_York";

  /** Convert a UTC timestamptz string to HH:MM (Eastern) for a time input. */
  function toTimeInput(ts: string | null): string {
    if (!ts) return "";
    const d = new Date(ts);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(d);
    const h = parts.find(p => p.type === "hour")?.value ?? "00";
    const m = parts.find(p => p.type === "minute")?.value ?? "00";
    return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  }

  /** Return the Eastern local date "YYYY-MM-DD" for a UTC timestamp. */
  function toNYDate(ts: string): string {
    return new Date(ts).toLocaleDateString("en-CA", { timeZone: TZ });
  }

  /** Convert an Eastern HH:MM + Eastern date string into a UTC ISO timestamp. */
  function fromTimeInput(nyDateStr: string, hhmm: string): string {
    const [hh, mm] = hhmm.split(":").map(Number);
    // Determine Eastern UTC offset on this date by probing noon UTC
    const probe = new Date(`${nyDateStr}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, hour: "numeric", minute: "numeric", hour12: false,
    }).formatToParts(probe);
    const nyHour = parseInt(parts.find(p => p.type === "hour")!.value);
    const nyMin  = parseInt(parts.find(p => p.type === "minute")!.value);
    const offsetMin = (nyHour - 12) * 60 + nyMin; // e.g. -240 for EDT, -300 for EST
    const [yr, mo, dy] = nyDateStr.split("-").map(Number);
    const utcMs = Date.UTC(yr, mo - 1, dy, hh, mm, 0) - offsetMin * 60000;
    return new Date(utcMs).toISOString();
  }

  async function saveJobTime() {
    if (!jobTimeData || editedMembers.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/operations-center/atlas-ops/lawn/job-time", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobTimeData.job.id, members: editedMembers }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `HTTP ${res.status}`);
      }
      // Close the editor and re-fetch digest — flag disappears automatically if variance < 30%
      setExpandedJob(null);
      setJobTimeData(null);
      fetchDigest(rangeRef.current);
    } catch (e: any) {
      setSaveError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // Load employee list once for "Add Person" feature
  useEffect(() => {
    fetch("/api/atlas-time/employees")
      .then(r => r.json())
      .then(d => {
        const list = ((d.employees ?? []) as any[])
          .filter((e: any) => e.status === "active")
          .sort((a: any, b: any) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
        setEmployees(list);
      })
      .catch(() => {});
  }, []);

  function handleAddPerson() {
    const emp = employees.find(e => e.id === addPersonEmpId);
    if (!emp) return;
    const hrs = parseFloat(addPersonHours) || 0;
    const resourceName = `${emp.last_name}, ${emp.preferred_name || emp.first_name}`;
    const newMember: MemberTime = {
      member_id:       "",   // empty = new insert on save
      employee_id:     emp.id,
      resource_name:   resourceName,
      actual_hours:    hrs,
      pay_rate:        emp.default_pay_rate ?? 0,
      reg_hours:       hrs,
      ot_hours:        0,
      dispatch_time_id: null,
      dispatch_job_id:  jobTimeData?.job.dispatch_job_id ?? null,
      time_varies:      jobTimeData?.job.time_varies ?? false,
      start_time:       null,
      end_time:         null,
    };
    setEditedMembers(prev => [...prev, newMember]);
    setShowAddPerson(false);
    setAddPersonEmpId("");
    setAddPersonHours("0");
  }

  useEffect(() => {
    fetchDigest(range);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function selectPreset(p: Preset) {
    setPreset(p);
    if (p === "custom") return; // wait for user to fill dates
    const r = getPresetRange(p)!;
    setRange(r);
    fetchDigest(r);
  }

  function applyCustom() {
    if (!customStart || !customEnd || customStart > customEnd) return;
    const r = { start: customStart, end: customEnd };
    setRange(r);
    fetchDigest(r);
  }

  const sc = data?.scorecard;

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
          <div className="mt-4 flex items-center gap-1 flex-wrap">
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

          {/* Custom date inputs */}
          {preset === "custom" && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="rounded-md px-3 py-1.5 text-xs bg-white/10 text-white border border-white/20 focus:outline-none focus:border-emerald-400"
              />
              <span className="text-white/40 text-xs">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded-md px-3 py-1.5 text-xs bg-white/10 text-white border border-white/20 focus:outline-none focus:border-emerald-400"
              />
              <button
                onClick={applyCustom}
                disabled={!customStart || !customEnd || customStart > customEnd}
                className="px-4 py-1.5 rounded-md text-xs font-semibold bg-emerald-500 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-400 transition-colors"
              >
                Apply
              </button>
            </div>
          )}

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
                className="rounded-xl px-5 py-4 flex flex-col items-center justify-between text-center"
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
                className="rounded-xl px-5 py-4 flex flex-col items-center justify-between text-center"
                style={{ background: "linear-gradient(145deg, #0d2616, #123b1f)" }}
              >
                <div className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">Total Payroll</div>
                <div>
                  <div className="text-2xl font-semibold text-white tabular-nums">
                    {fmtMoney(sc.total_payroll)}
                  </div>
                  <div className="text-[11px] text-white/35 mt-1">total payroll</div>
                </div>
              </div>

              {/* Field Labor % */}
              <div
                className="rounded-xl px-5 py-4 flex flex-col items-center justify-between text-center"
                style={{ background: "linear-gradient(145deg, #0d2616, #123b1f)" }}
              >
                <div className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">Field Labor</div>
                <div>
                  <div className={`text-2xl font-semibold tabular-nums ${fieldLaborColor(sc.field_labor_pct, sc.field_labor_goal)}`}>
                    {fmtPct(sc.field_labor_pct)}
                  </div>
                  <div className="text-[11px] text-white/35 mt-1">
                    goal {fmtPct(sc.field_labor_goal)} of rev
                  </div>
                </div>
              </div>

              {/* Admin Burden % */}
              <div
                className="rounded-xl px-5 py-4 flex flex-col items-center justify-between text-center"
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
                className="rounded-xl px-5 py-4 flex flex-col items-center justify-between text-center"
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

        {/* ── Row 2: Secondary metrics (white cards) ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} h="h-24" />
            ))
          ) : sc ? (
            <>
              {/* Hours Efficiency */}
              <div className="rounded-xl bg-white border border-[#d7e6db] px-5 py-4 shadow-sm text-center">
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Hours Efficiency</div>
                <div className={`text-3xl font-semibold tabular-nums ${efficiencyColor(sc.hours_efficiency)}`}>
                  {sc.hours_efficiency !== null ? fmtPct(sc.hours_efficiency) : "—"}
                </div>
                <div className="text-xs text-gray-400 mt-1 tabular-nums">
                  {fmtHrs(sc.total_clocked_hours)} clocked / {fmtHrs(sc.total_real_budgeted_hours)} budgeted
                </div>
              </div>

              {/* OT Exposure */}
              <div className="rounded-xl bg-white border border-[#d7e6db] px-5 py-4 shadow-sm text-center">
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">OT Exposure</div>
                <div className={`text-3xl font-semibold tabular-nums ${otColor(sc.ot_pct)}`}>
                  {fmtPct(sc.ot_pct)}
                </div>
                <div className="text-xs text-gray-400 mt-1 tabular-nums">
                  {fmtHrs(sc.total_ot_hours)} overtime
                </div>
              </div>

              {/* On-Job Time */}
              <div className="rounded-xl bg-white border border-[#d7e6db] px-5 py-4 shadow-sm text-center">
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
                  <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                      <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wide">On-Job</span>
                    </div>
                    <div className="text-2xl font-semibold text-emerald-900 tabular-nums">
                      {sc.total_payroll > 0 ? ((sc.on_job_payroll / sc.total_payroll) * 100).toFixed(1) + "%" : "—"}
                    </div>
                    <div className="text-xs text-emerald-700/60">of payroll</div>
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                      <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wide">Down Time</span>
                    </div>
                    <div className="text-2xl font-semibold text-amber-900 tabular-nums">
                      {sc.total_payroll > 0 ? ((sc.down_time_payroll / sc.total_payroll) * 100).toFixed(1) + "%" : "—"}
                    </div>
                    <div className="text-xs text-amber-700/60">of payroll</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <div className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                      <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Admin</span>
                    </div>
                    <div className="text-2xl font-semibold text-slate-800 tabular-nums">
                      {sc.total_payroll > 0 ? ((sc.admin_payroll / sc.total_payroll) * 100).toFixed(1) + "%" : "—"}
                    </div>
                    <div className="text-xs text-slate-500/70">of payroll</div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>

        {/* ── Service Breakdown ── */}
        {!loading && (data?.service_breakdown?.length ?? 0) > 0 && (
          <div className="rounded-xl bg-white border border-[#d7e6db] shadow-sm overflow-hidden">
            <SectionHeader title="By Service Type" sub="labor % and efficiency by service — worst to best" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/70">
                    <th className="text-left px-5 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Service</th>
                    <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Jobs</th>
                    <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Actual Hrs</th>
                    <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Efficiency</th>
                    <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Revenue</th>
                    <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Rev / Hr</th>
                    <th className="text-center px-5 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Labor %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data!.service_breakdown.map((row) => (
                    <tr key={row.service} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-5 py-3 font-semibold text-gray-800">{row.service}</td>
                      <td className="px-4 py-3 text-center text-gray-500 tabular-nums">{row.jobs}</td>
                      <td className="px-4 py-3 text-center text-gray-600 tabular-nums">{fmtHrs(row.actual_hours)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold tabular-nums ${effBadge(row.hours_efficiency)}`}>
                          {row.hours_efficiency !== null ? (row.hours_efficiency * 100).toFixed(0) + "%" : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-gray-800 tabular-nums">{fmtMoney(row.revenue)}</td>
                      <td className="px-4 py-3 text-center text-gray-600 tabular-nums">
                        {row.revenue_per_manhour !== null ? "$" + row.revenue_per_manhour.toFixed(2) : "—"}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-semibold tabular-nums ${memberLaborBadge(row.labor_pct, sc?.field_labor_goal ?? null)}`}>
                          {row.labor_pct !== null ? fmtPct(row.labor_pct) : "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}


        {/* ── Team Member Leaderboard ── */}
        <div className="rounded-xl bg-white border border-[#d7e6db] shadow-sm overflow-hidden">
          <SectionHeader title="Team Member Leaderboard" sub="sorted by labor % — lowest to highest" />
          <div className="overflow-x-auto">
            {loading ? (
              <div className="px-5 py-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-9 rounded-lg bg-gray-100 animate-pulse" />
                ))}
              </div>
            ) : !data?.member_leaderboard?.length ? (
              <div className="px-5 py-8 text-sm text-gray-400 text-center">No member data for this period.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/70">
                    <th className="text-center px-5 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Name</th>
                    <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Payroll Hrs</th>
                    <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">OT Hrs</th>
                    <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Down Time Hrs</th>
                    <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Down Time %</th>
                    <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Revenue</th>
                    {canSeePay && <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Payroll Cost</th>}
                    <th className="text-center px-5 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Labor %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.member_leaderboard.map((row) => (
                    <tr key={row.name} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-5 py-3 text-center font-semibold text-gray-900">{row.name}</td>
                      <td className="px-4 py-3 text-center text-gray-600 tabular-nums">{fmtHrs(row.total_payroll_hours)}</td>
                      <td className="px-4 py-3 text-center text-gray-600 tabular-nums">{row.ot_hours > 0 ? fmtHrs(row.ot_hours) : <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-center text-gray-600 tabular-nums">{fmtHrs(row.down_time_hours)}</td>
                      <td className="px-4 py-3 text-center text-gray-600 tabular-nums">
                        {row.down_time_pct !== null ? (row.down_time_pct * 100).toFixed(1) + "%" : "—"}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-gray-800 tabular-nums">{fmtMoney(row.revenue)}</td>
                      {canSeePay && <td className="px-4 py-3 text-center text-gray-600 tabular-nums">{fmtMoney(row.labor_cost)}</td>}
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-semibold tabular-nums ${memberLaborBadge(row.labor_pct, sc?.field_labor_goal ?? null)}`}>
                          {row.labor_pct !== null ? fmtPct(row.labor_pct) : "—"}
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
            <SectionHeader title="Jobs Needing Attention" sub={`${data.job_flags.length} flagged — ≥30% variance · click a row to review times`} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/70">
                    <th className="px-3 py-2.5 w-8" />
                    <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Client</th>
                    <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Service</th>
                    <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Crew</th>
                    <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Budgeted Hrs</th>
                    <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Actual</th>
                    <th className="text-center px-5 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Variance</th>
                    <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Revenue</th>
                    <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Rev / Hr</th>
                    <th className="text-center px-5 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Labor %</th>
                  </tr>
                </thead>
                <tbody>
                  {data.job_flags.map((job, i) => {
                    const isOpen = expandedJob === job.job_id;
                    const isThisLoading = isOpen && jobTimeLoading;
                    return (
                      <>
                        {/* ── Main job row ── */}
                        <tr
                          key={`row-${i}`}
                          onClick={() => openJobTime(job.job_id)}
                          className={`border-t border-gray-50 cursor-pointer transition-colors ${isOpen ? "bg-emerald-50/60" : "hover:bg-gray-50/60"}`}
                        >
                          <td className="px-3 py-3 text-center">
                            <span className={`text-xs text-gray-400 transition-transform inline-block ${isOpen ? "rotate-90" : ""}`}>▶</span>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-800 max-w-[160px] truncate">{job.client_name ?? "—"}</td>
                          <td className="px-4 py-3 text-center text-gray-600">{job.service ?? "—"}</td>
                          <td className="px-4 py-3 text-center text-gray-600">{job.crew_code ?? "—"}</td>
                          <td className="px-4 py-3 text-center tabular-nums">
                            <div className="text-gray-700 font-semibold">{job.budgeted_hours.toFixed(2)} hrs</div>
                            {job.proposed_budgeted_hours !== null && (
                              <div className="text-[10px] text-gray-400 leading-tight">Prop: {job.proposed_budgeted_hours.toFixed(2)} hrs</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-600 tabular-nums">{fmtHrs(job.actual_hours)}</td>
                          <td className={`px-5 py-3 text-center tabular-nums ${varianceCellColor(job.variance_pct)}`}>
                            {job.variance_pct > 0 ? "+" : ""}{(job.variance_pct * 100).toFixed(1)}%
                          </td>
                          <td className="px-4 py-3 text-center text-gray-600 tabular-nums">{fmtMoney(job.revenue)}</td>
                          <td className="px-4 py-3 text-center text-gray-600 tabular-nums">
                            {job.revenue_per_manhour !== null ? "$" + job.revenue_per_manhour.toFixed(2) : "—"}
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-semibold tabular-nums ${jobLaborBadge(job.labor_pct, sc?.field_labor_goal ?? null)}`}>
                              {job.labor_pct !== null ? fmtPct(job.labor_pct) : "—"}
                            </span>
                          </td>
                        </tr>

                        {/* ── Expandable time editor ── */}
                        {isOpen && (
                          <tr key={`edit-${i}`} className="border-t border-emerald-100">
                            <td colSpan={10} className="p-0">
                              <div className="bg-emerald-50/40 px-6 py-4">
                                {isThisLoading ? (
                                  <div className="text-xs text-gray-400 py-2">Loading times…</div>
                                ) : !jobTimeData ? (
                                  <div className="text-xs text-red-500 py-2">Could not load time data.</div>
                                ) : (
                                  <>
                                    {/* Header */}
                                    <div className="flex items-center justify-between mb-3">
                                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                        {jobTimeData.job.work_order} · {jobTimeData.job.service_date}
                                        {jobTimeData.job.time_varies
                                          ? " · Per-person times"
                                          : jobTimeData.members[0]?.start_time
                                          ? " · Shared crew time"
                                          : " · Hours only (no dispatch times)"}
                                      </div>
                                      {saveError && <div className="text-xs text-red-500">{saveError}</div>}
                                    </div>

                                    {/* Member rows */}
                                    <table className="w-full text-xs mb-3">
                                      <thead>
                                        <tr className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide border-b border-emerald-100">
                                          <th className="pb-1.5 text-left pr-4">Personnel</th>
                                          {editedMembers[0]?.start_time !== undefined && editedMembers[0]?.start_time !== null || editedMembers[0]?.end_time !== null ? (
                                            <>
                                              <th className="pb-1.5 text-center px-3">Start</th>
                                              <th className="pb-1.5 text-center px-3">End</th>
                                            </>
                                          ) : null}
                                          <th className="pb-1.5 text-center px-3">Actual Hrs</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-emerald-50">
                                        {editedMembers.map((m, idx) => {
                                          const hasDispatch = m.start_time !== null || m.end_time !== null;
                                          const showOnce = !m.time_varies && idx > 0;
                                          return (
                                            <tr key={m.member_id} className="py-1">
                                              <td className="py-2 pr-4 font-semibold text-gray-700">{m.resource_name}</td>

                                              {hasDispatch && !showOnce && (
                                                <>
                                                  <td className="py-2 px-3 text-center">
                                                    <input
                                                      type="time"
                                                      value={toTimeInput(m.start_time)}
                                                      onChange={e => {
                                                        const newTs = m.start_time
                                                          ? fromTimeInput(toNYDate(m.start_time), e.target.value)
                                                          : fromTimeInput(jobTimeData.job.service_date, e.target.value);
                                                        updateMemberTime(idx, "start_time", newTs);
                                                      }}
                                                      className="border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-400 bg-white w-32"
                                                    />
                                                  </td>
                                                  <td className="py-2 px-3 text-center">
                                                    <input
                                                      type="time"
                                                      value={toTimeInput(m.end_time)}
                                                      onChange={e => {
                                                        const newTs = m.end_time
                                                          ? fromTimeInput(toNYDate(m.end_time), e.target.value)
                                                          : fromTimeInput(jobTimeData.job.service_date, e.target.value);
                                                        updateMemberTime(idx, "end_time", newTs);
                                                      }}
                                                      className="border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-400 bg-white w-32"
                                                    />
                                                  </td>
                                                </>
                                              )}
                                              {hasDispatch && showOnce && (
                                                <>
                                                  <td className="py-2 px-3 text-center text-gray-300">—</td>
                                                  <td className="py-2 px-3 text-center text-gray-300">—</td>
                                                </>
                                              )}
                                              {!hasDispatch && (
                                                <td className="py-2 px-3 text-center tabular-nums font-semibold text-gray-700">
                                                  <input
                                                    type="number"
                                                    step="0.25"
                                                    min="0"
                                                    value={m.actual_hours}
                                                    onChange={e => updateMemberTime(idx, "actual_hours", parseFloat(e.target.value) || 0)}
                                                    className="border border-gray-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:border-emerald-400 bg-white w-20 text-center"
                                                  />
                                                </td>
                                              )}
                                              {hasDispatch && (
                                                <td className="py-2 px-3 text-center tabular-nums font-semibold text-gray-700">
                                                  {m.actual_hours.toFixed(2)} hrs
                                                </td>
                                              )}
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                      <tfoot>
                                        <tr className="border-t border-emerald-100 font-semibold text-gray-600">
                                          <td className="pt-2 pr-4">Total</td>
                                          {(editedMembers[0]?.start_time !== null) && <td colSpan={2} />}
                                          <td className="pt-2 px-3 text-center tabular-nums">
                                            {editedMembers.reduce((s, m) => s + m.actual_hours, 0).toFixed(2)} hrs
                                          </td>
                                        </tr>
                                      </tfoot>
                                    </table>

                                    {/* ── Per-member cost breakdown ── */}
                                    {canSeePay && <div className="mt-4 border-t border-emerald-100 pt-3">
                                      <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Cost Breakdown</div>
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide border-b border-emerald-100">
                                            <th className="pb-1.5 text-left pr-4">Personnel</th>
                                            <th className="pb-1.5 text-center px-3">Hours</th>
                                            <th className="pb-1.5 text-center px-3">Rate</th>
                                            <th className="pb-1.5 text-center px-3">OT Day?</th>
                                            <th className="pb-1.5 text-center px-3">Est. Cost</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-emerald-50">
                                          {(() => {
                                            const BURDEN = 1.15;
                                            const totalCost = editedMembers.reduce((s, m) => s + m.actual_hours * (m.pay_rate || 0) * BURDEN, 0);
                                            return editedMembers.map((m, idx) => {
                                              const hrs = m.actual_hours;
                                              const cost = hrs * (m.pay_rate || 0) * BURDEN;
                                              return (
                                                <tr key={m.member_id}>
                                                  <td className="py-1.5 pr-4 font-semibold text-gray-700">{m.resource_name}</td>
                                                  <td className="py-1.5 px-3 text-center tabular-nums text-gray-600">{hrs.toFixed(2)} hrs</td>
                                                  <td className="py-1.5 px-3 text-center tabular-nums text-gray-600">${m.pay_rate.toFixed(2)}/hr</td>
                                                  <td className="py-1.5 px-3 text-center">
                                                    {m.ot_hours > 0
                                                      ? <span className="text-amber-500 font-semibold">{m.ot_hours.toFixed(2)} hrs OT</span>
                                                      : <span className="text-gray-300">—</span>}
                                                  </td>
                                                  <td className="py-1.5 px-3 text-center tabular-nums font-semibold text-gray-800">${cost.toFixed(2)}</td>
                                                </tr>
                                              );
                                            }).concat(
                                              <tr key="total" className="border-t border-emerald-100 font-semibold text-gray-700">
                                                <td className="pt-2 pr-4">Total</td>
                                                <td className="pt-2 px-3 text-center tabular-nums">{editedMembers.reduce((s, m) => s + m.actual_hours, 0).toFixed(2)} hrs</td>
                                                <td className="pt-2 px-3 text-center text-gray-400 text-[10px]">×{BURDEN} burden</td>
                                                <td />
                                                <td className="pt-2 px-3 text-center tabular-nums text-emerald-800">${totalCost.toFixed(2)}</td>
                                              </tr>
                                            );
                                          })()}
                                        </tbody>
                                      </table>
                                      <p className="text-[10px] text-gray-400 mt-2">Est. cost = actual hours × pay rate × 1.15 burden. OT premium applied in full-day digest calculation.</p>
                                    </div>}

                                    {/* ── Add Person ── */}
                                    <div className="mt-3 pt-3 border-t border-emerald-100">
                                      {!showAddPerson ? (
                                        <button
                                          onClick={() => setShowAddPerson(true)}
                                          className="text-xs text-emerald-700 font-semibold hover:text-emerald-900 transition-colors flex items-center gap-1"
                                        >
                                          <span className="text-base leading-none">+</span> Add Person to Job
                                        </button>
                                      ) : (
                                        <div className="flex flex-wrap items-end gap-3">
                                          <div>
                                            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Team Member</label>
                                            <select
                                              value={addPersonEmpId}
                                              onChange={e => setAddPersonEmpId(e.target.value)}
                                              className="border border-emerald-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-500 bg-white min-w-[180px]"
                                            >
                                              <option value="">Select…</option>
                                              {employees
                                                .filter(e => !editedMembers.some(m => m.employee_id === e.id))
                                                .map(e => (
                                                  <option key={e.id} value={e.id}>
                                                    {e.last_name}, {e.preferred_name || e.first_name}
                                                  </option>
                                                ))}
                                            </select>
                                          </div>
                                          <div>
                                            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Hours</label>
                                            <input
                                              type="number" step="0.25" min="0"
                                              value={addPersonHours}
                                              onChange={e => setAddPersonHours(e.target.value)}
                                              className="border border-emerald-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-500 bg-white w-20 text-center"
                                            />
                                          </div>
                                          <div className="flex items-end gap-2">
                                            <button
                                              onClick={handleAddPerson}
                                              disabled={!addPersonEmpId}
                                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 transition-colors"
                                            >
                                              Add
                                            </button>
                                            <button
                                              onClick={() => { setShowAddPerson(false); setAddPersonEmpId(""); setAddPersonHours("0"); }}
                                              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-3 mt-3">
                                      <button
                                        onClick={saveJobTime}
                                        disabled={saving}
                                        className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-50"
                                        style={{ background: "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)" }}
                                      >
                                        {saving ? "Saving…" : "Save Changes"}
                                      </button>
                                      <button
                                        onClick={() => { setExpandedJob(null); setJobTimeData(null); }}
                                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                                      >
                                        Cancel
                                      </button>
                                      <span className="text-xs text-gray-400 ml-auto">
                                        If corrected variance drops below 30%, this job will be removed from the list on save.
                                      </span>
                                    </div>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Calculation Breakdown ── */}
        {sc && (
          <div className="rounded-xl bg-white border border-[#d7e6db] shadow-sm overflow-hidden">
            <button
              onClick={() => setShowCalc((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
              style={{ background: showCalc ? undefined : undefined }}
            >
              <div
                className="flex items-baseline gap-3"
                style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
              >
                <span className="text-sm font-semibold tracking-wide">Calculation Breakdown</span>
                <span className="text-xs opacity-60">show your work</span>
              </div>
              <span className="text-xs text-gray-400 font-semibold">{showCalc ? "▲ Hide" : "▼ Show"}</span>
            </button>

            {showCalc && (
              <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                <CalcSection title="Revenue">
                  <CalcRow label="Revenue (sum of job contract amounts)" value={fmtMoney(sc.revenue)} sub="budgeted_amount — matches COGS" />
                  <CalcRow label="Division budget for period" value={fmtMoney(sc.budgeted_revenue)} sub="prorated from division_budgets" />
                  <CalcRow label="Revenue vs division budget" value={fmtPct(sc.revenue_vs_budget)} sub="revenue ÷ budget" />
                </CalcSection>

                <CalcSection title="Hours">
                  <CalcRow label="Total clocked hours (punches)" value={fmtHrs(sc.total_clocked_hours)} />
                  <CalcRow label="On-job hours (production)" value={fmtHrs(sc.total_on_job_hours)} />
                  <CalcRow label="Down time hours" value={fmtHrs(sc.total_down_time_hours)} sub="clocked − on-job" />
                  <CalcRow label="OT hours" value={fmtHrs(sc.total_ot_hours)} />
                  <CalcRow label="Real budgeted hours" value={fmtHrs(sc.total_real_budgeted_hours)} />
                  <CalcRow label="Hours efficiency" value={fmtPct(sc.hours_efficiency)} sub="clocked ÷ budgeted" />
                  <CalcRow label="On-job %" value={fmtPct(sc.on_job_pct)} sub="on-job ÷ clocked" />
                  <CalcRow label="Down time %" value={fmtPct(sc.down_time_pct)} sub="down time ÷ clocked" />
                  <CalcRow label="OT %" value={fmtPct(sc.ot_pct)} sub="OT ÷ clocked" />
                </CalcSection>

                <CalcSection title="Payroll">
                  <CalcRow label="On-job payroll" value={fmtMoney(sc.on_job_payroll)} sub="from production members" />
                  <CalcRow label="Down time payroll" value={fmtMoney(sc.down_time_payroll)} sub="down hrs × avg rate" />
                  <CalcRow label="Field payroll" value={fmtMoney(sc.field_payroll)} sub="on-job + down time" />
                  <CalcRow label="Admin payroll" value={fmtMoney(sc.admin_payroll)} sub="from admin pay config" />
                  <CalcRow label="Total payroll" value={fmtMoney(sc.total_payroll)} sub="field + admin" />
                </CalcSection>

                <CalcSection title="Labor % (actuals)">
                  <CalcRow label="Field labor %" value={fmtPct(sc.field_labor_pct)} sub="field payroll ÷ revenue" />
                  <CalcRow label="Admin burden %" value={fmtPct(sc.admin_burden_pct)} sub="admin payroll ÷ revenue" />
                  <CalcRow label="Total labor %" value={fmtPct(sc.total_labor_pct)} sub="total payroll ÷ revenue" />
                </CalcSection>

                <CalcSection title="Labor % Goals (from budget)">
                  <CalcRow label="Prorated budget revenue" value={fmtMoney(sc.prorated_budget_revenue)} sub="budget × days_in_range ÷ days_in_month" />
                  <CalcRow label="Prorated budget labor (total)" value={fmtMoney(sc.prorated_budget_labor)} sub="field + admin combined" />
                  <CalcRow label="Prorated budget admin" value={fmtMoney(sc.prorated_budget_admin)} sub="monthly admin total × same ratio" />
                  <CalcRow label="Prorated budget field labor" value={fmtMoney(sc.prorated_budget_labor - sc.prorated_budget_admin)} sub="budget labor − budget admin" />
                  <CalcRow label="Total labor goal" value={fmtPct(sc.total_labor_goal)} sub="budget labor ÷ budget revenue" />
                  <CalcRow label="Field labor goal" value={fmtPct(sc.field_labor_goal)} sub="field labor ÷ budget revenue" />
                  <CalcRow label="Calendar days in range" value={String(sc.days_in_range)} sub="used for pro-rating" />
                  <CalcRow label="Complete reports" value={String(sc.reports_count)} />
                </CalcSection>

              </div>
            )}
          </div>
        )}

        {/* Bottom spacer */}
        <div className="h-6" />
      </div>
    </div>
  );
}
