"use client";

import { Suspense } from "react";
import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AccessGate from "@/components/AccessGate";
import {
  HRSettings, PayPeriod, PunchOut,
  computePeriodPunches, getPayPeriodContaining, shiftPayPeriod, isoDate,
} from "@/lib/atHours";

const DEFAULT_SETTINGS: HRSettings = {
  pay_cycle: "weekly", pay_period_start_day: 1, pay_period_anchor_date: null,
  ot_weekly_threshold: 40, ot_daily_threshold: null, ot_multiplier: 1.5,
  dt_daily_threshold: null, dt_multiplier: 2.0,
  lunch_auto_deduct: false, lunch_deduct_after_hours: 6, lunch_deduct_minutes: 30,
  punch_rounding_minutes: 0,
};

type RawPunch = {
  id: string; employee_id: string; clock_in_at: string; clock_out_at: string | null;
  date_for_payroll: string; punch_method: string; status: string; is_manual: boolean | null;
  division_id: string | null; at_division_id: string | null; employee_note: string | null; manager_note: string | null;
  regular_hours: number | null; ot_hours: number | null; dt_hours: number | null;
  lunch_deducted_mins: number | null; approved_at: string | null; locked: boolean | null;
  at_employees: { id: string; first_name: string; last_name: string; preferred_name: string | null; job_title: string | null; default_pay_rate: number | null; pay_type: string; at_departments: { name: string } | null } | null;
  divisions: { id: string; name: string; qb_class_name: string | null } | null;
  at_divisions: { id: string; name: string; division_id: string | null; divisions: { id: string; name: string } | null } | null;
};

type Division = { id: string; name: string; active: boolean; source?: string };

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}
function fmtDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  const [y, m, day] = iso.split("-");
  return `${weekday} ${m}/${day}/${y}`;
}
function empName(e: RawPunch["at_employees"]) {
  if (!e) return "Unknown";
  return `${e.last_name}, ${e.preferred_name ?? e.first_name}`;
}
function initials(e: RawPunch["at_employees"]) {
  if (!e) return "?";
  return `${e.first_name[0] ?? ""}${e.last_name[0] ?? ""}`.toUpperCase();
}
function h(n: number) { return n.toFixed(2); }

const inputCls = "border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-green-500";

function TimesheetsInner() {
  const searchParams = useSearchParams();

  const [settings, setSettings] = useState<HRSettings>(DEFAULT_SETTINGS);
  const [period, setPeriod]     = useState<PayPeriod | null>(null);
  const [punches, setPunches]   = useState<RawPunch[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing]   = useState<Record<string, Partial<RawPunch>>>({});
  const [saving, setSaving]     = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [search, setSearch]     = useState("");
  const [sortBy, setSortBy]     = useState<"name_asc" | "name_desc" | "hours_desc" | "hours_asc" | "ot_desc" | "status">("name_asc");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "open">("all");

  // Load settings once — initialise period from ?date= URL param if present
  useEffect(() => {
    const dateParam = searchParams.get("date");
    const anchor    = dateParam ? new Date(dateParam + "T12:00:00") : new Date();
    fetch("/api/atlas-time/settings")
      .then(r => r.json())
      .then(j => {
        const s: HRSettings = { ...DEFAULT_SETTINGS, ...j.settings };
        setSettings(s);
        setPeriod(getPayPeriodContaining(anchor, s));
      }).catch(() => {
        setPeriod(getPayPeriodContaining(anchor, DEFAULT_SETTINGS));
      });
    fetch("/api/atlas-time/divisions")
      .then(r => r.json())
      .then(j => setDivisions((j.divisions ?? []).filter((d: Division) => d.active)));
  }, []);

  const loadPunches = useCallback(async (p: PayPeriod) => {
    setLoading(true); setError("");
    try {
      const res  = await fetch(`/api/atlas-time/punches?date_from=${isoDate(p.start)}&date_to=${isoDate(p.end)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load");
      setPunches(json.punches ?? []);
    } catch (e: any) { setError(e?.message ?? "Failed to load"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (period) loadPunches(period); }, [period, loadPunches]);

  // Keep ?date= URL param in sync so hard-refresh restores the same period
  useEffect(() => {
    if (!period) return;
    window.history.replaceState(null, "", `?date=${isoDate(period.start)}`);
  }, [period]);

  function nav(delta: number) { if (period) setPeriod(shiftPayPeriod(period, delta, settings)); }

  // Group punches by employee, compute OT
  const byEmployee = new Map<string, RawPunch[]>();
  for (const p of punches) {
    if (!byEmployee.has(p.employee_id)) byEmployee.set(p.employee_id, []);
    byEmployee.get(p.employee_id)!.push(p);
  }

  const computed = new Map<string, Map<string, PunchOut>>();
  for (const [empId, eps] of byEmployee.entries()) {
    const results = computePeriodPunches(eps, settings);
    const m = new Map<string, PunchOut>();
    for (const r of results) m.set(r.id, r);
    computed.set(empId, m);
  }

  // Precompute per-employee totals for sort/filter (single pass)
  type EmpSummary = { totHrs: number; totOT: number; allApproved: boolean; hasOpen: boolean; hasPending: boolean };
  const empSummary = new Map<string, EmpSummary>();
  for (const [empId, eps] of byEmployee.entries()) {
    const closed     = eps.filter(p => p.clock_out_at);
    const totHrs     = closed.reduce((s, p) => s + (p.regular_hours ?? 0) + (p.ot_hours ?? 0) + (p.dt_hours ?? 0), 0);
    const totOT      = closed.reduce((s, p) => s + (p.ot_hours ?? 0), 0);
    const allApproved = closed.length > 0 && closed.every(p => p.status === "approved" || p.locked);
    const hasOpen    = eps.some(p => !p.clock_out_at);
    const hasPending = eps.some(p => p.clock_out_at && p.status === "pending" && !p.locked);
    empSummary.set(empId, { totHrs, totOT, allApproved, hasOpen, hasPending });
  }

  // Filter by search + status, then sort
  const employees = [...byEmployee.entries()]
    .filter(([empId, eps]) => {
      const e = eps[0]?.at_employees;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!empName(e).toLowerCase().includes(q) && !e?.job_title?.toLowerCase().includes(q)) return false;
      }
      const s = empSummary.get(empId)!;
      if (statusFilter === "pending")  return s.hasPending;
      if (statusFilter === "approved") return s.allApproved;
      if (statusFilter === "open")     return s.hasOpen;
      return true;
    })
    .sort(([aId, aEps], [bId, bEps]) => {
      const sa = empSummary.get(aId)!;
      const sb = empSummary.get(bId)!;
      if (sortBy === "name_asc")   return empName(aEps[0]?.at_employees).localeCompare(empName(bEps[0]?.at_employees));
      if (sortBy === "name_desc")  return empName(bEps[0]?.at_employees).localeCompare(empName(aEps[0]?.at_employees));
      if (sortBy === "hours_desc") return sb.totHrs - sa.totHrs;
      if (sortBy === "hours_asc")  return sa.totHrs - sb.totHrs;
      if (sortBy === "ot_desc")    return sb.totOT - sa.totOT;
      if (sortBy === "status") {
        const w = (s: EmpSummary) => s.hasPending ? 0 : s.hasOpen ? 1 : s.allApproved ? 3 : 2;
        return w(sa) - w(sb);
      }
      return 0;
    });

  function toggleExpand(empId: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(empId) ? n.delete(empId) : n.add(empId); return n; });
  }

  function startEdit(p: RawPunch) {
    // Use at_division_id as the dropdown key when present (at_divisions have their own UUID in the list)
    const divKey = p.at_division_id ?? p.division_id ?? "";
    setEditing(prev => ({ ...prev, [p.id]: {
      clock_in_at:  p.clock_in_at.slice(0, 16),
      clock_out_at: p.clock_out_at?.slice(0, 16) ?? "",
      division_id:  divKey,
      employee_note: p.employee_note ?? "",
      manager_note: p.manager_note ?? "",
      lunch_deducted_mins: p.lunch_deducted_mins ?? 0,
    }}));
  }

  async function savePunch(punchId: string) {
    setSaving(punchId);
    const draft = editing[punchId];
    try {
      const origPunch = [...byEmployee.values()].flat().find(p => p.id === punchId);
      const origLunch = origPunch?.lunch_deducted_mins ?? 0;
      const newLunch  = (draft?.lunch_deducted_mins as number) ?? origLunch;
      // Determine if selected division is an at_division (time_clock_only) or a main division
      const selectedDivKey = (draft?.division_id as string) || null;
      const selectedDiv = selectedDivKey ? divisions.find(d => d.id === selectedDivKey) : null;
      const isAtDiv = selectedDiv?.source === "time_clock";

      const res = await fetch(`/api/atlas-time/punches/${punchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clock_in_at:        draft?.clock_in_at  ? new Date(draft.clock_in_at!  as string).toISOString() : undefined,
          clock_out_at:       draft?.clock_out_at ? new Date(draft.clock_out_at! as string).toISOString() : null,
          // at_divisions: omit division_id so PATCH auto-populates it from the at_division's parent
          ...(isAtDiv
            ? { at_division_id: selectedDivKey }
            : { division_id: selectedDivKey || null, at_division_id: null }
          ),
          employee_note:      draft?.employee_note,
          manager_note:       draft?.manager_note,
          ...(newLunch !== origLunch ? { lunch_deducted_mins: newLunch } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Save failed");
      setEditing(prev => { const n = { ...prev }; delete n[punchId]; return n; });
      if (period) await loadPunches(period);
    } catch (e: any) { setError(e?.message ?? "Save failed"); }
    finally { setSaving(null); }
  }

  async function deletePunch(punchId: string) {
    if (!confirm("Delete this punch? This cannot be undone.")) return;
    const res = await fetch(`/api/atlas-time/punches/${punchId}`, { method: "DELETE" });
    if (!res.ok) { const j = await res.json(); setError(j?.error ?? "Delete failed"); return; }
    if (period) await loadPunches(period);
  }

  async function approveEmployee(empId: string) {
    setApproving(empId);
    const empPunches = byEmployee.get(empId) ?? [];
    const compMap    = computed.get(empId) ?? new Map();
    try {
      await Promise.all(
        empPunches
          .filter(p => p.clock_out_at && !p.locked)
          .map(p => {
            const c = compMap.get(p.id);
            return fetch(`/api/atlas-time/punches/${p.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                status:               "approved",
                regular_hours:        c?.regular_hours ?? p.regular_hours,
                ot_hours:             c?.ot_hours      ?? 0,
                dt_hours:             c?.dt_hours      ?? 0,
                lunch_deducted_mins:  c?.lunch_deducted_mins ?? 0,
                approved_at:          new Date().toISOString(),
              }),
            });
          })
      );
      if (period) await loadPunches(period);
    } catch (e: any) { setError(e?.message ?? "Approve failed"); }
    finally { setApproving(null); }
  }

  return (
    <AccessGate permKey="hr_timesheets_view">
    <div className="min-h-screen bg-[#f0f4f0] print:bg-white">
      <div className="px-4 md:px-8 py-6 md:py-8 print:hidden"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 text-white/50 text-xs mb-2">
            <Link href="/operations-center/atlas-time" className="hover:text-white/80">Atlas HR</Link>
            <span>/</span><span className="text-white/80">Timesheets</span>
          </div>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Timesheets</h1>
              <p className="text-white/50 text-sm mt-1">Review, correct, and approve team member time cards.</p>
            </div>
            <Link href="/operations-center/atlas-time/reports"
              className="shrink-0 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors border border-white/20">
              View Reports →
            </Link>
          </div>
          {/* Pay period nav */}
          <div className="mt-5 flex items-center gap-3">
            <button onClick={() => nav(-1)} className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center text-white transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span className="text-white font-semibold text-sm min-w-[220px] text-center">{period?.label ?? "Loading…"}</span>
            <button onClick={() => nav(1)} className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center text-white transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            <button onClick={() => setPeriod(getPayPeriodContaining(new Date(), settings))}
              className="ml-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white/70 hover:text-white text-xs font-semibold rounded-lg transition-colors">
              Current
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-5 max-w-7xl mx-auto space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
            {error}<button onClick={() => setError("")} className="ml-4 text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {/* Search + sort + filter */}
        <div className="flex flex-wrap gap-2 items-center print:hidden">
          {/* Search */}
          <div className="relative">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search team member…"
              className="w-52 border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>

          {/* Sort */}
          <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500">
            <option value="name_asc">Name A → Z</option>
            <option value="name_desc">Name Z → A</option>
            <option value="hours_desc">Most Hours First</option>
            <option value="hours_asc">Fewest Hours First</option>
            <option value="ot_desc">Most OT First</option>
            <option value="status">Needs Approval First</option>
          </select>

          {/* Status filter pills */}
          <div className="flex gap-1">
            {(["all", "pending", "approved", "open"] as const).map(f => (
              <button key={f} onClick={() => setStatusFilter(f)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors border ${
                  statusFilter === f
                    ? f === "pending"  ? "bg-amber-500 text-white border-amber-500"
                    : f === "approved" ? "bg-green-700 text-white border-green-700"
                    : f === "open"     ? "bg-blue-500 text-white border-blue-500"
                    :                   "bg-[#123b1f] text-white border-[#123b1f]"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}>
                {f === "all" ? "All" : f === "pending" ? "Needs Approval" : f === "approved" ? "Approved" : "Open Punch"}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-3">
            {[1,2,3,4].map(i => <div key={i} className="h-12 bg-gray-50 rounded-xl animate-pulse" />)}
          </div>
        ) : employees.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-12 text-center text-sm text-gray-400">
            No punches found for this period.
          </div>
        ) : (
          <div className="space-y-2">
            {employees.map(([empId, eps]) => {
              const emp     = eps[0]?.at_employees;
              const compMap = computed.get(empId) ?? new Map<string, PunchOut>();
              // Use DB-stored values when recalced (regular_hours non-null), else computed fallback.
              const totReg  = eps.filter(p => p.clock_out_at).reduce((s, p) => s + (p.regular_hours !== null ? (p.regular_hours ?? 0) : (compMap.get(p.id)?.regular_hours ?? 0)), 0);
              const totOT   = eps.filter(p => p.clock_out_at).reduce((s, p) => s + (p.regular_hours !== null ? (p.ot_hours      ?? 0) : (compMap.get(p.id)?.ot_hours      ?? 0)), 0);
              const totDT   = eps.filter(p => p.clock_out_at).reduce((s, p) => s + (p.regular_hours !== null ? (p.dt_hours      ?? 0) : (compMap.get(p.id)?.dt_hours      ?? 0)), 0);
              const totHrs  = totReg + totOT + totDT;
              const isOpen  = expanded.has(empId);
              const allApproved = eps.filter(p => p.clock_out_at).every(p => p.status === "approved" || p.locked);
              const sortedPunches = [...eps].sort((a, b) => a.clock_in_at.localeCompare(b.clock_in_at));

              return (
                <div key={empId} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  {/* Employee summary row */}
                  <div className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50/60 transition-colors"
                    onClick={() => toggleExpand(empId)}>
                    <div className="w-9 h-9 rounded-xl bg-[#123b1f]/10 flex items-center justify-center text-[#123b1f] font-bold text-xs shrink-0">
                      {initials(emp)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-gray-900">{empName(emp)}</div>
                      <div className="text-xs text-gray-400">{emp?.job_title ?? ""}</div>
                    </div>
                    <div className="hidden sm:flex gap-6 text-xs tabular-nums">
                      <div className="text-center">
                        <div className="font-bold text-gray-800">{h(totReg)}</div>
                        <div className="text-gray-400">Reg</div>
                      </div>
                      {totOT > 0 && (
                        <div className="text-center">
                          <div className="font-bold text-amber-600">{h(totOT)}</div>
                          <div className="text-gray-400">OT</div>
                        </div>
                      )}
                      {totDT > 0 && (
                        <div className="text-center">
                          <div className="font-bold text-red-600">{h(totDT)}</div>
                          <div className="text-gray-400">DT</div>
                        </div>
                      )}
                      <div className="text-center">
                        <div className="font-bold text-gray-900">{h(totHrs)}</div>
                        <div className="text-gray-400">Total</div>
                      </div>
                    </div>
                    {allApproved ? (
                      <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 print:hidden">Approved</span>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); approveEmployee(empId); }}
                        disabled={approving === empId}
                        className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#123b1f] text-white hover:bg-[#1a5c2e] disabled:opacity-60 transition-colors print:hidden">
                        {approving === empId ? "Approving…" : "Approve"}
                      </button>
                    )}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      className={`shrink-0 text-gray-400 transition-transform print:hidden ${isOpen ? "rotate-180" : ""}`}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </div>

                  {/* Expanded punch rows */}
                  {(isOpen || true) && (
                    <div className={`border-t border-gray-50 ${!isOpen ? "hidden print:block" : ""}`}>
                      <div className="overflow-x-auto">
                      <table className="w-full text-xs min-w-[640px]">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-gray-50 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                            <th className="px-4 py-2 text-left">Date</th>
                            <th className="px-3 py-2 text-center">In</th>
                            <th className="px-3 py-2 text-center">Out</th>
                            <th className="px-3 py-2 text-center">Lunch</th>
                            <th className="px-3 py-2 text-center">Reg</th>
                            <th className="px-3 py-2 text-center">OT</th>
                            <th className="px-3 py-2 text-center">Total</th>
                            <th className="px-3 py-2 text-center">Punch Item</th>
                            <th className="px-3 py-2 text-center">Division</th>
                            <th className="px-3 py-2 text-center">Status</th>
                            <th className="px-3 py-2 text-center print:hidden">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {sortedPunches.map(p => {
                            const c      = compMap.get(p.id);
                            const isEdit = p.id in editing;
                            const draft  = editing[p.id] ?? {};
                            // If regular_hours is stored, the punch has been recalced — trust DB values
                            // (null lunch_deducted_mins means no deduction, not "unknown").
                            // Only fall back to client-computed values for unrecalced punches.
                            const recalced = p.regular_hours !== null;
                            const reg    = recalced ? (p.regular_hours ?? 0) : (c?.regular_hours ?? 0);
                            const ot     = recalced ? (p.ot_hours     ?? 0) : (c?.ot_hours     ?? 0);
                            const dt     = recalced ? (p.dt_hours     ?? 0) : (c?.dt_hours     ?? 0);
                            const lunch  = recalced ? (p.lunch_deducted_mins ?? 0) : (c?.lunch_deducted_mins ?? 0);
                            const total  = reg + ot + dt;

                            if (isEdit) return (
                              <tr key={p.id} className="bg-amber-50/40">
                                <td className="px-4 py-2 text-gray-500">{fmtDate(p.date_for_payroll)}</td>
                                <td className="px-3 py-2">
                                  <input type="datetime-local" value={(draft.clock_in_at as string) ?? ""}
                                    onChange={e => setEditing(prev => ({ ...prev, [p.id]: { ...prev[p.id], clock_in_at: e.target.value }}))}
                                    className={inputCls} />
                                </td>
                                <td className="px-3 py-2">
                                  <input type="datetime-local" value={(draft.clock_out_at as string) ?? ""}
                                    onChange={e => setEditing(prev => ({ ...prev, [p.id]: { ...prev[p.id], clock_out_at: e.target.value }}))}
                                    className={inputCls} />
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {(draft.lunch_deducted_mins as number ?? 0) > 0 ? (
                                    <button
                                      onClick={() => setEditing(prev => ({ ...prev, [p.id]: { ...prev[p.id], lunch_deducted_mins: 0 }}))}
                                      className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-red-500 transition-colors group" title="Remove lunch deduction">
                                      {draft.lunch_deducted_mins as number}m
                                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
                                    </button>
                                  ) : <span className="text-gray-300 text-xs">—</span>}
                                </td>
                                <td className="px-3 py-2 text-center font-semibold">{h(reg)}</td>
                                <td className={`px-3 py-2 text-center font-semibold ${ot > 0 ? "text-amber-600" : "text-gray-300"}`}>{h(ot)}</td>
                                <td className="px-3 py-2 text-center font-bold">{h(total)}</td>
                                <td className="px-3 py-2">
                                  <select value={(draft.division_id as string) ?? ""}
                                    onChange={e => setEditing(prev => ({ ...prev, [p.id]: { ...prev[p.id], division_id: e.target.value }}))}
                                    className={inputCls}>
                                    <option value="">— None —</option>
                                    {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                  </select>
                                </td>
                                <td className="px-3 py-2 text-center text-gray-400 text-xs">auto</td>
                                <td className="px-3 py-2"><span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Editing</span></td>
                                <td className="px-3 py-2 text-right print:hidden">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button onClick={() => savePunch(p.id)} disabled={saving === p.id}
                                      className="text-[10px] font-bold px-2 py-1 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-60">
                                      {saving === p.id ? "…" : "Save"}
                                    </button>
                                    <button onClick={() => setEditing(prev => { const n={...prev}; delete n[p.id]; return n; })}
                                      className="text-[10px] font-bold px-2 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">
                                      Cancel
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );

                            return (
                              <tr key={p.id} className={p.status === "approved" ? "bg-green-50/20" : ""}>
                                <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                                  {fmtDate(p.date_for_payroll)}
                                  {p.is_manual && <span className="ml-1.5 text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700">M</span>}
                                </td>
                                <td className="px-3 py-2.5 text-center text-gray-700 tabular-nums whitespace-nowrap">{fmtTime(p.clock_in_at)}</td>
                                <td className="px-3 py-2.5 text-center text-gray-700 tabular-nums whitespace-nowrap">
                                  {p.clock_out_at ? fmtTime(p.clock_out_at) : <span className="text-red-400 font-semibold">Open</span>}
                                </td>
                                <td className="px-3 py-2.5 text-center text-gray-400 tabular-nums">{lunch > 0 ? `${lunch}m` : "—"}</td>
                                <td className="px-3 py-2.5 text-center font-semibold tabular-nums">{h(reg)}</td>
                                <td className={`px-3 py-2.5 text-center font-semibold tabular-nums ${ot > 0 ? "text-amber-600" : "text-gray-300"}`}>{h(ot)}</td>
                                <td className="px-3 py-2.5 text-center font-bold tabular-nums">{h(total)}</td>
                                <td className="px-3 py-2.5 text-center text-gray-500 whitespace-nowrap">{p.at_divisions?.name ?? p.divisions?.name ?? "—"}</td>
                                <td className="px-3 py-2.5 text-center text-gray-400 whitespace-nowrap">{p.divisions?.name ?? p.at_divisions?.divisions?.name ?? "—"}</td>
                                <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                  {p.locked
                                    ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Locked</span>
                                    : p.status === "approved"
                                      ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-700">Approved</span>
                                      : p.clock_out_at
                                        ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">Pending</span>
                                        : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">Active</span>}
                                </td>
                                <td className="px-3 py-2.5 text-center print:hidden">
                                  {!p.locked && (
                                    <div className="flex items-center justify-end gap-1">
                                      <button onClick={() => startEdit(p)} title="Edit"
                                        className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                      </button>
                                      <button onClick={() => deletePunch(p.id)} title="Delete"
                                        className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-gray-50/80 font-semibold text-xs">
                            <td colSpan={4} className="px-4 py-2.5 text-gray-500">Period Total</td>
                            <td className="px-3 py-2.5 text-center tabular-nums">{h(totReg)}</td>
                            <td className={`px-3 py-2.5 text-center tabular-nums ${totOT > 0 ? "text-amber-600" : "text-gray-400"}`}>{h(totOT)}</td>
                            <td className="px-3 py-2.5 text-center tabular-nums font-bold">{h(totHrs)}</td>
                            <td colSpan={3} />
                          </tr>
                        </tfoot>
                      </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
    </AccessGate>
  );
}

export default function TimesheetsPage() {
  return (
    <Suspense>
      <TimesheetsInner />
    </Suspense>
  );
}
