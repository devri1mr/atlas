"use client";

import React, { useEffect, useRef, useState } from "react";
import { useUser } from "@/lib/userContext";

// ── Types ─────────────────────────────────────────────────────────────────────

type PunchStatus = "matched" | "no_punch" | "unrecognized";

type Member = {
  id?: string;
  resource_name: string;
  resource_code: string;
  employee_id: string | null;
  punch_status?: PunchStatus;
  actual_hours: number;
  earned_amount: number;
  reg_hours?: number | null;
  ot_hours?: number | null;
  total_payroll_hours?: number | null;
  pay_rate?: number | null;
  payroll_cost?: number | null;
  fert_production_members?: Member[];
};

type Job = {
  id?: string;
  client_name: string;
  client_address: string;
  service: string;
  service_date: string;
  crew_code: string;
  status?: string;
  budgeted_hours: number;
  real_budgeted_hours?: number | null;
  actual_hours: number;
  variance_hours: number;
  budgeted_amount: number;
  actual_amount: number;
  members: Member[];
  fert_production_members?: Member[];
};

type ReportPunch = {
  employee_id: string | null;
  resource_name: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
  regular_hours: number | null;
  ot_hours: number | null;
};

type DispatchJobTime = {
  id: string;
  employee_id: string | null;
  resource_name: string | null;
  start_time: string;
  end_time: string | null;
  notes: string | null;
};

type DispatchJob = {
  id: string;
  work_order: string | null;
  client_name: string;
  address: string | null;
  city: string | null;
  zip: string | null;
  service: string | null;
  crew_code: string | null;
  personnel_count: number | null;
  start_time: string | null;
  end_time: string | null;
  time_varies: boolean;
  fert_dispatch_job_times?: DispatchJobTime[];
};

type UsageEntry = {
  id: string;
  material_id: string;
  name: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  notes: string | null;
  employee_id: string | null;
  assigned_member_name: string | null;
};

type NonProdDay = {
  id: string;
  employee_id: string | null;
  resource_name: string;
  reason: string | null;
  notes: string | null;
  clock_in_at: string | null;
  clock_out_at: string | null;
  reg_hours: number | null;
  ot_hours: number | null;
  total_hours: number | null;
  pay_rate: number | null;
  payroll_cost: number | null;
};

type UnmatchedPunch = {
  employee_id: string;
  resource_name: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
  reg_hours: number;
  ot_hours: number;
  total_hours: number;
  pay_rate: number;
  payroll_cost: number;
};

type Report = {
  id: string;
  report_date: string;
  file_name: string | null;
  imported_at: string;
  is_complete: boolean;
  total_budgeted_hours: number;
  total_actual_hours: number;
  total_payroll_cost?: number;
  total_earned_amount?: number;
  total_material_cost?: number;
  total_non_prod_cost?: number;
  total_budgeted_amount: number;
  total_actual_amount: number;
  fert_production_jobs?: Job[];
};

type RepDetail = {
  report: Report;
  punches: ReportPunch[];
  dispatchJobs: DispatchJob[];
  usage: UsageEntry[];
  nonProdDays: NonProdDay[];
  unmatchedPunches: UnmatchedPunch[];
  adminPay: number;
};

type PersonJob = {
  client_name: string;
  service: string;
  actual_hours: number;
  earned_amount: number;
};

type PersonEntry = {
  resource_name: string;
  employee_id: string | null;
  punch_status: PunchStatus;
  crew_codes: string[];
  total_hours: number;
  total_revenue: number;
  reg_hours: number | null;
  ot_hours: number | null;
  total_payroll_hours: number | null;
  payroll_cost: number | null;
  punches: ReportPunch[];
  jobs: PersonJob[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const money   = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const pct     = (n: number) => `${Math.round(n * 100)}%`;
const dec2    = (n: number | null | undefined) => Number(n ?? 0).toFixed(2);
const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtTime = (iso: string | null | undefined) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York" });
};
const fmtHrs = (ms: number) => {
  const h = ms / 3600000;
  return h < 0.005 ? "0.00" : h.toFixed(2);
};

const NAME_SUFFIX = /^(I{1,3}|IV|VI{0,3}|IX|Jr\.?|Sr\.?)$/i;
function formatName(raw: string): string {
  const parts = raw.trim().split(/\s+/);
  if (parts.length < 2) return raw;
  const hasSuffix = parts.length >= 3 && NAME_SUFFIX.test(parts[parts.length - 1]);
  if (hasSuffix) {
    const suffix = parts[parts.length - 1];
    const last   = parts[parts.length - 2];
    const first  = parts.slice(0, -2).join(" ");
    return `${last}, ${first} ${suffix}`;
  }
  const last = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(" ");
  return `${last}, ${first}`;
}

function buildPersonView(jobs: Job[], punches: ReportPunch[]): PersonEntry[] {
  const map = new Map<string, PersonEntry>();
  for (const job of jobs) {
    const members: Member[] = job.members?.length ? job.members : (job.fert_production_members ?? []);
    for (const m of members) {
      const key = m.resource_name;
      if (!map.has(key)) {
        map.set(key, {
          resource_name:       m.resource_name,
          employee_id:         m.employee_id ?? null,
          punch_status:        (m.punch_status as PunchStatus) ?? (m.employee_id ? "matched" : "unrecognized"),
          crew_codes:          [],
          total_hours:         0,
          total_revenue:       0,
          reg_hours:           m.reg_hours ?? null,
          ot_hours:            m.ot_hours ?? null,
          total_payroll_hours: m.total_payroll_hours ?? null,
          payroll_cost:        m.payroll_cost ?? null,
          punches:             [],
          jobs:                [],
        });
      }
      const p = map.get(key)!;
      p.total_hours   = Math.round((p.total_hours   + m.actual_hours)  * 10000) / 10000;
      p.total_revenue = Math.round((p.total_revenue + m.earned_amount) * 100)   / 100;
      if (p.reg_hours           === null && m.reg_hours           != null) p.reg_hours           = m.reg_hours;
      if (p.ot_hours            === null && m.ot_hours            != null) p.ot_hours            = m.ot_hours;
      if (p.total_payroll_hours === null && m.total_payroll_hours != null) p.total_payroll_hours = m.total_payroll_hours;
      if (p.payroll_cost        === null && m.payroll_cost        != null) p.payroll_cost        = m.payroll_cost;
      for (const code of (job.crew_code ?? "").split(",").map(c => c.trim()).filter(Boolean)) {
        if (!p.crew_codes.includes(code)) p.crew_codes.push(code);
      }
      p.jobs.push({ client_name: job.client_name, service: job.service, actual_hours: m.actual_hours, earned_amount: m.earned_amount });
    }
  }
  for (const punch of punches) {
    const entry = punch.employee_id
      ? [...map.values()].find(p => p.employee_id === punch.employee_id)
      : map.get(punch.resource_name);
    if (entry) entry.punches.push(punch);
  }
  return [...map.values()].sort((a, b) => formatName(a.resource_name).localeCompare(formatName(b.resource_name)));
}

type DownSegment = { from: string; to: string; label: string; ms: number };
type DownTimeResult = { totalMs: number; segments: DownSegment[] };

function calcDownTime(person: PersonEntry, dispatchJobs: DispatchJob[]): DownTimeResult | null {
  const crewDispatch = dispatchJobs.filter(j =>
    j.crew_code && j.crew_code.split(",").map(c => c.trim()).some(c => person.crew_codes.includes(c))
  );
  type Seg = { label: string; startMs: number; endMs: number; startISO: string; endISO: string };
  const allSegs: Seg[] = [];
  for (const j of crewDispatch) {
    if (!j.time_varies && j.start_time && j.end_time) {
      allSegs.push({ label: j.client_name, startMs: new Date(j.start_time).getTime(), endMs: new Date(j.end_time).getTime(), startISO: j.start_time, endISO: j.end_time });
    } else if (j.time_varies && j.fert_dispatch_job_times?.length) {
      const myTimes = j.fert_dispatch_job_times.filter(t =>
        (person.employee_id && t.employee_id === person.employee_id) ||
        (!person.employee_id && t.resource_name === person.resource_name)
      );
      for (const t of myTimes) {
        if (t.start_time && t.end_time)
          allSegs.push({ label: j.client_name, startMs: new Date(t.start_time).getTime(), endMs: new Date(t.end_time).getTime(), startISO: t.start_time, endISO: t.end_time });
      }
    }
  }
  allSegs.sort((a, b) => a.startMs - b.startMs);
  if (!allSegs.length) return null;
  const punchPeriods = person.punches
    .filter(p => p.clock_in_at && p.clock_out_at)
    .map(p => ({ startMs: new Date(p.clock_in_at!).getTime(), endMs: new Date(p.clock_out_at!).getTime(), inISO: p.clock_in_at!, outISO: p.clock_out_at! }))
    .sort((a, b) => a.startMs - b.startMs);
  if (!punchPeriods.length) return null;
  const segments: DownSegment[] = [];
  for (const punch of punchPeriods) {
    const inWindow = allSegs.filter(s => s.endMs > punch.startMs && s.startMs < punch.endMs);
    if (!inWindow.length) continue;
    if (inWindow[0].startMs > punch.startMs)
      segments.push({ from: punch.inISO, to: inWindow[0].startISO, label: `Clock in → ${inWindow[0].label}`, ms: inWindow[0].startMs - punch.startMs });
    for (let i = 0; i < inWindow.length - 1; i++) {
      const gapMs = inWindow[i + 1].startMs - inWindow[i].endMs;
      if (gapMs > 0)
        segments.push({ from: inWindow[i].endISO, to: inWindow[i + 1].startISO, label: `${inWindow[i].label} → ${inWindow[i + 1].label}`, ms: gapMs });
    }
    const last = inWindow[inWindow.length - 1];
    if (last.endMs < punch.endMs)
      segments.push({ from: last.endISO, to: punch.outISO, label: `${last.label} → Clock out`, ms: punch.endMs - last.endMs });
  }
  const totalMs = segments.reduce((s, g) => s + g.ms, 0);
  return totalMs > 0 ? { totalMs, segments } : null;
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PunchStatus }) {
  if (status === "matched") return (
    <span className="inline-flex items-center text-emerald-700">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
    </span>
  );
  if (status === "no_punch") return (
    <span className="inline-flex items-center text-amber-500">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    </span>
  );
  return (
    <span className="inline-flex items-center text-red-500">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </span>
  );
}

// ── Unmatched Punches section ─────────────────────────────────────────────────

const REASONS = ["Training", "Shop / Admin", "Maintenance", "Meeting", "Other"];

function UnmatchedSection({
  reportId, reportDate, unmatched, nonProdDays, onSaved,
}: {
  reportId: string;
  reportDate: string;
  unmatched: UnmatchedPunch[];
  nonProdDays: NonProdDay[];
  onSaved: () => void;
}) {
  const { can } = useUser();
  const [signOffForms, setSignOffForms] = useState<Record<string, { reason: string; notes: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (unmatched.length === 0 && nonProdDays.length === 0) return null;

  async function signOff(p: UnmatchedPunch) {
    const form = signOffForms[p.employee_id] ?? { reason: "Training", notes: "" };
    setSaving(p.employee_id);
    try {
      await fetch("/api/operations-center/atlas-ops/fertilization/non-production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_id:     reportId,
          report_date:   reportDate,
          employee_id:   p.employee_id,
          resource_name: p.resource_name,
          reason:        form.reason,
          notes:         form.notes || null,
          clock_in_at:   p.clock_in_at,
          clock_out_at:  p.clock_out_at,
          reg_hours:     p.reg_hours,
          ot_hours:      p.ot_hours,
          total_hours:   p.total_hours,
          pay_rate:      p.pay_rate,
        }),
      });
      onSaved();
    } finally { setSaving(null); }
  }

  async function removeSignOff(id: string) {
    setDeletingId(id);
    try {
      await fetch(`/api/operations-center/atlas-ops/fertilization/non-production?id=${id}`, { method: "DELETE" });
      onSaved();
    } finally { setDeletingId(null); }
  }

  return (
    <div className="border-t border-orange-200 bg-orange-50/30 px-5 py-4">
      <div className="flex items-center gap-2 mb-3">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-orange-500"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span className="text-sm font-semibold text-orange-900">
          Non-Production Time
          {unmatched.length > 0 && <span className="ml-2 text-xs font-medium bg-orange-200 text-orange-800 px-1.5 py-0.5 rounded">{unmatched.length} need sign-off</span>}
        </span>
      </div>

      <div className="space-y-2">
        {/* Already signed off */}
        {nonProdDays.map(d => (
          <div key={d.id} className="flex items-center gap-3 text-xs rounded-lg border border-emerald-200 bg-white px-3 py-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
            <span className="font-semibold text-gray-800 w-36">{formatName(d.resource_name)}</span>
            <span className="text-gray-500">{fmtTime(d.clock_in_at)} → {fmtTime(d.clock_out_at)}</span>
            <span className="text-gray-600">{dec2(d.total_hours)} hrs</span>
            {can("hr_labor_cost") && <span className="text-gray-600">{money.format(d.payroll_cost ?? 0)}</span>}
            <span className="ml-2 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[11px] font-medium">{d.reason ?? "Acknowledged"}</span>
            {d.notes && <span className="text-gray-400 italic">{d.notes}</span>}
            <button
              onClick={() => removeSignOff(d.id)}
              disabled={deletingId === d.id}
              className="ml-auto text-gray-300 hover:text-red-400 transition-colors text-xs"
            >✕</button>
          </div>
        ))}

        {/* Unmatched — need sign-off */}
        {unmatched.map(p => {
          const form = signOffForms[p.employee_id] ?? { reason: "Training", notes: "" };
          const isSaving = saving === p.employee_id;
          return (
            <div key={p.employee_id} className="rounded-lg border border-orange-200 bg-white overflow-hidden">
              <div className="flex items-center gap-3 px-3 py-2 text-xs">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-orange-400 shrink-0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span className="font-semibold text-gray-800 w-36">{formatName(p.resource_name)}</span>
                <span className="text-gray-500">{fmtTime(p.clock_in_at)} → {fmtTime(p.clock_out_at)}</span>
                <span className="text-gray-600">{dec2(p.total_hours)} hrs</span>
                {can("hr_labor_cost") && <span className="text-gray-600">{money.format(p.payroll_cost)}</span>}
              </div>
              <div className="flex items-center gap-2 px-3 py-2 bg-orange-50/50 border-t border-orange-100">
                <select
                  value={form.reason}
                  onChange={e => setSignOffForms(prev => ({ ...prev, [p.employee_id]: { ...form, reason: e.target.value } }))}
                  className="border border-gray-200 rounded px-2 py-1 text-xs w-36"
                >
                  {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <input
                  type="text"
                  placeholder="Notes (optional)"
                  value={form.notes}
                  onChange={e => setSignOffForms(prev => ({ ...prev, [p.employee_id]: { ...form, notes: e.target.value } }))}
                  className="border border-gray-200 rounded px-2 py-1 text-xs flex-1"
                />
                <button
                  onClick={() => signOff(p)}
                  disabled={isSaving}
                  className="rounded bg-emerald-700 text-white px-3 py-1 text-xs font-semibold hover:bg-emerald-800 disabled:opacity-50"
                >
                  {isSaving ? "Saving…" : "Sign Off"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Materials tab ─────────────────────────────────────────────────────────────

type MaterialSearchResult = {
  id: string;
  display_name: string | null;
  name: string;
  unit: string;
  inventory_unit: string | null;
  unit_cost: number | null;
};

function MaterialsTab({
  reportId,
  reportDate,
  usage,
  members,
  onSaved,
}: {
  reportId: string;
  reportDate: string;
  usage: UsageEntry[];
  members: PersonEntry[];
  onSaved: () => void;
}) {
  const { can } = useUser();
  const FERT_DIVISION_ID = "e710c6f9-d290-4004-8e55-303392eeb826";

  const [adding, setAdding]               = useState(false);
  const [search, setSearch]               = useState("");
  const [results, setResults]             = useState<MaterialSearchResult[]>([]);
  const [selected, setSelected]           = useState<MaterialSearchResult | null>(null);
  const [qty, setQty]                     = useState("");
  const [unitCost, setUnitCost]           = useState("");
  const [notes, setNotes]                 = useState("");
  const [assignedEmpId, setAssignedEmpId] = useState("");
  const [searching, setSearching]         = useState(false);
  const [saving, setSaving]               = useState(false);
  const [deletingId, setDeletingId]       = useState<string | null>(null);
  const searchRef                         = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalCost = usage.reduce((s, u) => s + u.total_cost, 0);

  function resetForm() {
    setSearch(""); setResults([]); setSelected(null);
    setQty(""); setUnitCost(""); setNotes(""); setAssignedEmpId(""); setAdding(false);
  }

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/materials-search?q=${encodeURIComponent(search)}&division_id=${FERT_DIVISION_ID}&limit=20`);
        const d = await res.json();
        setResults(d.data ?? []);
      } finally { setSearching(false); }
    }, 250);
  }, [search]);

  function selectMaterial(m: MaterialSearchResult) {
    setSelected(m);
    setSearch(m.display_name || m.name);
    setResults([]);
    setUnitCost(m.unit_cost != null ? Number(m.unit_cost).toFixed(2) : "");
  }

  async function saveUsage() {
    if (!selected || !qty || Number(qty) <= 0) return;
    setSaving(true);
    try {
      await fetch("/api/operations-center/atlas-ops/fertilization/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_id:   reportId,
          report_date: reportDate,
          material_id: selected.id,
          quantity:    Number(qty),
          unit_cost:   unitCost ? Number(unitCost) : undefined,
          notes:       notes || null,
          employee_id: assignedEmpId || null,
        }),
      });
      resetForm();
      onSaved();
    } finally { setSaving(false); }
  }

  async function deleteUsage(id: string) {
    setDeletingId(id);
    try {
      await fetch(`/api/operations-center/atlas-ops/fertilization/usage?id=${id}`, { method: "DELETE" });
      onSaved();
    } finally { setDeletingId(null); }
  }

  return (
    <div className="px-5 py-4">
      {/* Usage table */}
      {usage.length > 0 && (
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-xs font-semibold text-emerald-900/60 bg-emerald-50/40">
                <th className="px-3 py-2 text-left">Material</th>
                <th className="px-3 py-2 text-center">Assigned To</th>
                <th className="px-3 py-2 text-center">Qty</th>
                <th className="px-3 py-2 text-center">Unit</th>
                {can("hr_labor_cost") && <th className="px-3 py-2 text-center">Unit Cost</th>}
                {can("hr_labor_cost") && <th className="px-3 py-2 text-center">Total Cost</th>}
                <th className="px-3 py-2 text-center">Notes</th>
                <th className="px-3 py-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {usage.map(u => (
                <tr key={u.id} className="border-t border-emerald-50 hover:bg-emerald-50/20">
                  <td className="px-3 py-2 font-medium text-emerald-950">{u.name}</td>
                  <td className="px-3 py-2 text-center text-xs text-gray-600">
                    {u.assigned_member_name ? formatName(u.assigned_member_name) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">{u.quantity}</td>
                  <td className="px-3 py-2 text-center text-gray-500">{u.unit}</td>
                  {can("hr_labor_cost") && <td className="px-3 py-2 text-center tabular-nums text-gray-600">{money.format(u.unit_cost)}</td>}
                  {can("hr_labor_cost") && <td className="px-3 py-2 text-center tabular-nums font-semibold text-emerald-950">{money.format(u.total_cost)}</td>}
                  <td className="px-3 py-2 text-center text-gray-400 text-xs">{u.notes ?? "—"}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => deleteUsage(u.id)}
                      disabled={deletingId === u.id}
                      className="text-red-400 hover:text-red-600 text-xs disabled:opacity-40"
                    >✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
            {can("hr_labor_cost") && (
              <tfoot>
                <tr className="border-t-2 border-emerald-200 bg-emerald-50/40 font-semibold text-sm text-emerald-950">
                  <td className="px-3 py-2">Total — {usage.length} item{usage.length !== 1 ? "s" : ""}</td>
                  <td /><td /><td />
                  <td className="px-3 py-2 text-center text-gray-400 text-xs">product cost</td>
                  <td className="px-3 py-2 text-center tabular-nums">{money.format(totalCost)}</td>
                  <td /><td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {usage.length === 0 && !adding && (
        <div className="py-6 text-center text-sm text-emerald-900/40">No materials logged for this day.</div>
      )}

      {/* Add form — single row */}
      {adding ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Material search */}
            <div className="relative w-52">
              <input
                type="text"
                placeholder="Search material…"
                value={search}
                onChange={e => { setSearch(e.target.value); setSelected(null); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-400"
              />
              {(results.length > 0 || searching) && !selected && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                  {searching && <div className="px-3 py-2 text-xs text-gray-400">Searching…</div>}
                  {results.map(r => (
                    <button key={r.id} onClick={() => selectMaterial(r)} className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 border-b border-gray-50 last:border-0">
                      <span className="font-medium text-emerald-950">{r.display_name || r.name}</span>
                      <span className="ml-2 text-xs text-gray-400">{r.inventory_unit || r.unit}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Team member */}
            <select
              value={assignedEmpId}
              onChange={e => setAssignedEmpId(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-40 focus:outline-none focus:border-emerald-400 bg-white"
            >
              <option value="">— Unassigned —</option>
              {members.map(m => (
                <option key={m.employee_id ?? m.resource_name} value={m.employee_id ?? ""}>{formatName(m.resource_name)}</option>
              ))}
            </select>

            {/* Qty */}
            <input
              type="number" step="0.1" min="0"
              placeholder="Qty"
              value={qty}
              onChange={e => setQty(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-20 focus:outline-none focus:border-emerald-400"
            />

            {/* Unit (read-only) */}
            {selected && (
              <div className="border border-gray-100 rounded-lg px-3 py-1.5 text-sm w-16 bg-gray-50 text-gray-500 text-center">
                {selected.inventory_unit || selected.unit}
              </div>
            )}

            {/* Unit cost */}
            {selected && (
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                <input
                  type="number" step="0.01" min="0"
                  placeholder="Cost"
                  value={unitCost}
                  onChange={e => setUnitCost(e.target.value)}
                  className="border border-gray-200 rounded-lg pl-6 pr-2 py-1.5 text-sm w-24 focus:outline-none focus:border-emerald-400"
                />
              </div>
            )}

            {/* Computed total */}
            {selected && qty && unitCost && (
              <div className="border border-gray-100 rounded-lg px-3 py-1.5 text-sm w-24 bg-gray-50 text-emerald-800 font-semibold text-center">
                {money.format(Number(qty) * Number(unitCost))}
              </div>
            )}

            {/* Notes */}
            <input
              type="text"
              placeholder="Notes (optional)"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-24 focus:outline-none focus:border-emerald-400"
            />

            <button
              onClick={saveUsage}
              disabled={saving || !selected || !qty || Number(qty) <= 0}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#123b1f] hover:bg-[#0d2616] disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={resetForm}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-900 border border-dashed border-emerald-300 hover:border-emerald-500 rounded-lg px-4 py-2 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Material
        </button>
      )}
    </div>
  );
}

// ── Varies time entry panel ───────────────────────────────────────────────────

function VariesPanel({ dispatchJobs, persons, reportDate, onSaved }: {
  dispatchJobs: DispatchJob[];
  persons: PersonEntry[];
  reportDate: string;
  onSaved: () => void;
}) {
  const variesJobs = dispatchJobs.filter(j => j.time_varies);
  const groupMap = new Map<string, { key: string; ids: string[]; client_name: string; service: string | null; crews: string[]; savedTimes: DispatchJobTime[] }>();
  for (const j of variesJobs) {
    const key = `${j.client_name}__${j.service ?? ""}`;
    if (!groupMap.has(key)) groupMap.set(key, { key, ids: [], client_name: j.client_name, service: j.service, crews: [], savedTimes: [] });
    const g = groupMap.get(key)!;
    g.ids.push(j.id);
    if (j.crew_code && !g.crews.includes(j.crew_code)) g.crews.push(j.crew_code);
    for (const t of j.fert_dispatch_job_times ?? []) {
      if (!g.savedTimes.find(st => st.id === t.id)) g.savedTimes.push(t);
    }
  }
  const groups = [...groupMap.values()];
  const [forms, setForms] = useState<Record<string, { employee_id: string; resource_name: string; start: string; end: string; notes: string }[]>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(
    () => new Set(groups.filter(g => g.savedTimes.length > 0).map(g => g.key))
  );
  const [showDismissed, setShowDismissed] = useState(false);

  const dismissedGroups = groups.filter(g => dismissed.has(g.key));
  const visibleGroups   = groups.filter(g => !dismissed.has(g.key) || showDismissed);
  if (!visibleGroups.length && !dismissedGroups.length) return null;

  function addRow(groupKey: string, empId: string | null, name: string) {
    setForms(prev => ({ ...prev, [groupKey]: [...(prev[groupKey] ?? []), { employee_id: empId ?? "", resource_name: name, start: "", end: "", notes: "" }] }));
  }
  function updateRow(groupKey: string, idx: number, field: string, val: string) {
    setForms(prev => { const rows = [...(prev[groupKey] ?? [])]; rows[idx] = { ...rows[idx], [field]: val }; return { ...prev, [groupKey]: rows }; });
  }
  async function saveRow(group: typeof groups[0], idx: number) {
    const row = forms[group.key]?.[idx];
    if (!row?.start) return;
    setSaving(`${group.key}-${idx}`);
    try {
      const toISO = (t: string) => new Date(`${reportDate}T${t}:00`).toISOString();
      await Promise.all(group.ids.map(jobId =>
        fetch("/api/operations-center/atlas-ops/fertilization/dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dispatch_job_id: jobId, employee_id: row.employee_id || null, resource_name: row.resource_name, start_time: toISO(row.start), end_time: row.end ? toISO(row.end) : null, notes: row.notes || null }),
        })
      ));
      setForms(prev => { const rows = [...(prev[group.key] ?? [])]; rows.splice(idx, 1); return { ...prev, [group.key]: rows }; });
      onSaved();
    } finally { setSaving(null); }
  }
  async function deleteTime(id: string) {
    await fetch(`/api/operations-center/atlas-ops/fertilization/dispatch?id=${id}`, { method: "DELETE" });
    onSaved();
  }

  return (
    <div className="border-t-2 border-amber-200 bg-amber-50/40 px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span className="text-sm font-semibold text-amber-800">Time Entry Required — {groups.length} job{groups.length > 1 ? "s" : ""} show "Varies"</span>
        </div>
        {dismissedGroups.length > 0 && (
          <button onClick={() => setShowDismissed(v => !v)} className="text-xs text-amber-700 hover:text-amber-900 underline decoration-dotted">
            {showDismissed ? "Hide" : "Show"} {dismissedGroups.length} closed job{dismissedGroups.length > 1 ? "s" : ""}
          </button>
        )}
      </div>
      <div className="space-y-4">
        {visibleGroups.map(group => {
          const crewPersons = persons.filter(p => group.crews.some(c => p.crew_codes.includes(c)));
          const pendingRows = forms[group.key] ?? [];
          const uniqueSaved = group.savedTimes.filter((t, i) =>
            group.savedTimes.findIndex(s => s.employee_id === t.employee_id && s.start_time === t.start_time && s.resource_name === t.resource_name) === i
          );
          return (
            <div key={group.key} className="rounded-lg border border-amber-200 bg-white overflow-hidden">
              <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
                <div>
                  <span className="font-medium text-sm text-amber-900">{group.client_name}</span>
                  {group.service && <span className="text-xs text-amber-700 ml-2">· {group.service}</span>}
                  <span className="text-xs text-amber-600 ml-2">Crew {group.crews.join(", ")}</span>
                </div>
                {dismissed.has(group.key) ? (
                  <button onClick={() => setDismissed(prev => { const s = new Set(prev); s.delete(group.key); return s; })} className="text-xs rounded border border-emerald-300 px-2.5 py-1 text-emerald-700 hover:bg-emerald-50 font-medium">Re-open</button>
                ) : (
                  <button onClick={() => setDismissed(prev => new Set([...prev, group.key]))} className="text-xs rounded border border-amber-300 px-2.5 py-1 text-amber-700 hover:bg-amber-100 font-medium">Done</button>
                )}
              </div>
              <div className="p-4 space-y-3">
                {uniqueSaved.length > 0 && (
                  <div className="space-y-1">
                    {uniqueSaved.map(t => (
                      <div key={t.id} className="flex items-center gap-3 text-xs text-gray-700">
                        <span className="w-36 font-medium">{t.resource_name ? formatName(t.resource_name) : "—"}</span>
                        <span>{fmtTime(t.start_time)} → {fmtTime(t.end_time)}</span>
                        {t.notes && <span className="text-gray-400">{t.notes}</span>}
                        <button onClick={() => deleteTime(t.id)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                {pendingRows.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <select value={row.employee_id} onChange={e => { const p = persons.find(cp => cp.employee_id === e.target.value); updateRow(group.key, idx, "employee_id", e.target.value); if (p) updateRow(group.key, idx, "resource_name", p.resource_name); }} className="border border-gray-200 rounded px-2 py-1 text-xs w-44">
                      <option value="">— Person —</option>
                      {persons.map(p => <option key={p.employee_id ?? p.resource_name} value={p.employee_id ?? ""}>{formatName(p.resource_name)}</option>)}
                    </select>
                    <input type="time" value={row.start} onChange={e => updateRow(group.key, idx, "start", e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-xs w-28" />
                    <span className="text-gray-400">→</span>
                    <input type="time" value={row.end} onChange={e => updateRow(group.key, idx, "end", e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-xs w-28" />
                    <input type="text" value={row.notes} onChange={e => updateRow(group.key, idx, "notes", e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-xs flex-1" placeholder="Notes (optional)" />
                    <button onClick={() => saveRow(group, idx)} disabled={!row.start || saving === `${group.key}-${idx}`} className="rounded bg-emerald-700 text-white px-2.5 py-1 text-xs font-medium hover:bg-emerald-800 disabled:opacity-50">Save</button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2 pt-1 items-center">
                  {crewPersons.map(p => (
                    <button key={p.resource_name} onClick={() => addRow(group.key, p.employee_id, p.resource_name)} className="text-xs rounded border border-emerald-200 px-2.5 py-1 text-emerald-700 hover:bg-emerald-50 whitespace-nowrap">+ {formatName(p.resource_name)}</button>
                  ))}
                  <select value="" onChange={e => { const p = persons.find(cp => cp.employee_id === e.target.value || cp.resource_name === e.target.value); if (p) addRow(group.key, p.employee_id, p.resource_name); }} className="text-xs rounded border border-gray-200 px-2 py-1 text-gray-500 hover:border-gray-300">
                    <option value="">+ Other member…</option>
                    {persons.filter(p => !crewPersons.includes(p)).map(p => <option key={p.employee_id ?? p.resource_name} value={p.employee_id ?? p.resource_name}>{formatName(p.resource_name)}</option>)}
                  </select>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Client table ──────────────────────────────────────────────────────────────

type EditableMember = { id: string; resource_name: string; actual_hours: number; pay_rate: number; dispatch_time_id: string | null; dispatch_job_id: string | null; time_varies: boolean; start_time: string | null; end_time: string | null };

function ClientTable({ jobs, onSaved }: { jobs: Job[]; onSaved: () => void }) {
  const { can } = useUser();
  const BURDEN = 1.15;
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set());
  const [membersCache, setMembersCache] = useState<Record<string, EditableMember[]>>({});
  const [edited,       setEdited]       = useState<Record<string, EditableMember[]>>({});
  const [loadingJob,   setLoadingJob]   = useState<string | null>(null);
  const [saving,       setSaving]       = useState<string | null>(null);
  const [saveError,    setSaveError]    = useState<Record<string, string>>({});
  const sorted = [...jobs].sort((a, b) => (a.client_name || "").localeCompare(b.client_name || ""));

  function jobLaborCost(job: Job) {
    const members: Member[] = job.members?.length ? job.members : (job.fert_production_members ?? []);
    return members.reduce((s, m) => s + Number(m.actual_hours ?? 0) * Number(m.pay_rate ?? 0) * BURDEN, 0);
  }

  async function toggleJob(jobId: string) {
    const next = new Set(expanded);
    if (next.has(jobId)) { next.delete(jobId); setExpanded(next); return; }
    next.add(jobId);
    setExpanded(next);
    if (!membersCache[jobId]) {
      setLoadingJob(jobId);
      try {
        const res = await fetch(`/api/operations-center/atlas-ops/fertilization/job-time?job_id=${jobId}`);
        const d = await res.json();
        const members = (d.members ?? []) as EditableMember[];
        setMembersCache(prev => ({ ...prev, [jobId]: members }));
        setEdited(prev => ({ ...prev, [jobId]: members.map(m => ({ ...m })) }));
      } finally { setLoadingJob(null); }
    }
  }

  function updateHours(jobId: string, idx: number, val: number) {
    setEdited(prev => { const rows = [...(prev[jobId] ?? [])]; rows[idx] = { ...rows[idx], actual_hours: val }; return { ...prev, [jobId]: rows }; });
  }

  async function saveJob(jobId: string) {
    const members = edited[jobId];
    if (!members) return;
    setSaving(jobId); setSaveError(prev => ({ ...prev, [jobId]: "" }));
    try {
      const res = await fetch("/api/operations-center/atlas-ops/fertilization/job-time", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job_id: jobId, members }) });
      if (!res.ok) { const d = await res.json(); setSaveError(prev => ({ ...prev, [jobId]: d.error ?? "Save failed" })); return; }
      setMembersCache(prev => ({ ...prev, [jobId]: members.map(m => ({ ...m })) }));
      setExpanded(prev => { const next = new Set(prev); next.delete(jobId); return next; });
      onSaved();
    } finally { setSaving(null); }
  }

  const totalActual  = sorted.reduce((s, j) => s + Number(j.actual_hours ?? 0), 0);
  const totalBudget  = sorted.reduce((s, j) => s + Number(j.real_budgeted_hours ?? j.budgeted_hours ?? 0), 0);
  const totalRevenue = sorted.reduce((s, j) => s + Number(j.budgeted_amount ?? 0), 0);
  const totalLabor   = sorted.reduce((s, j) => s + jobLaborCost(j), 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-xs font-semibold text-emerald-900/60 bg-emerald-50/40">
            <th className="px-4 py-2.5">Client</th>
            <th className="px-3 py-2.5 hidden sm:table-cell">Service</th>
            <th className="px-3 py-2.5 text-center hidden sm:table-cell">Crew</th>
            <th className="px-3 py-2.5 text-center">Actual Hrs</th>
            <th className="px-3 py-2.5 text-center hidden md:table-cell">Real Bud Hrs</th>
            <th className="px-3 py-2.5 text-center">Labor %</th>
            <th className="px-3 py-2.5 text-center hidden sm:table-cell">Revenue</th>
            <th className="px-3 py-2.5 w-8" />
          </tr>
        </thead>
        <tbody>
          {sorted.map(job => {
            const jobId = job.id!;
            const isOpen = expanded.has(jobId);
            const labor = jobLaborCost(job);
            const revenue = Number(job.budgeted_amount ?? 0);
            const laborPct = revenue > 0 ? labor / revenue : null;
            const realBudH = Number(job.real_budgeted_hours ?? job.budgeted_hours ?? 0);
            const editRows = edited[jobId];
            const isDispatched = (job.status ?? "") === "dispatched";
            return (
              <React.Fragment key={jobId}>
                <tr className={`border-t border-emerald-50 hover:bg-emerald-50/30 cursor-pointer ${isOpen ? "bg-emerald-50/20" : ""}`} onClick={() => toggleJob(jobId)}>
                  <td className="px-4 py-2.5 font-medium text-emerald-950">
                    <span className="flex items-center gap-1.5">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}><polyline points="6 9 12 15 18 9" /></svg>
                      {job.client_name}
                      {isDispatched && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-semibold ml-1">Dispatched</span>}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 hidden sm:table-cell">{job.service}</td>
                  <td className="px-3 py-2.5 text-center text-gray-500 hidden sm:table-cell">{job.crew_code}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-gray-700">{dec2(job.actual_hours)}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-gray-500 hidden md:table-cell">{dec2(realBudH)}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums">
                    {laborPct != null ? <span className={laborPct > 0.39 ? "text-red-600 font-medium" : "text-emerald-700 font-medium"}>{pct(laborPct)}</span> : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-gray-700 hidden sm:table-cell">{revenue > 0 ? money.format(revenue) : "—"}</td>
                  <td />
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={8} className="bg-emerald-50/30 border-t border-emerald-100 px-6 py-3">
                      {loadingJob === jobId ? (
                        <div className="text-xs text-emerald-900/50 py-2">Loading…</div>
                      ) : editRows ? (
                        <div>
                          <table className="text-xs w-full max-w-lg">
                            <thead>
                              <tr className="text-emerald-900/50 text-left">
                                <th className="pb-1.5 pr-4">Team Member</th>
                                <th className="pb-1.5 px-3 text-center">Actual Hrs</th>
                                {can("hr_labor_cost") && <th className="pb-1.5 px-3 text-center">Rate</th>}
                                {can("hr_labor_cost") && <th className="pb-1.5 px-3 text-center">Est. Cost</th>}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-emerald-100">
                              {editRows.map((m, idx) => (
                                <tr key={m.resource_name}>
                                  <td className="py-1.5 pr-4 font-medium text-gray-700">{formatName(m.resource_name)}</td>
                                  <td className="py-1.5 px-3 text-center">
                                    <input type="number" step="0.25" min="0" value={m.actual_hours} onChange={e => updateHours(jobId, idx, parseFloat(e.target.value) || 0)} onClick={e => e.stopPropagation()} className="border border-gray-200 rounded px-2 py-0.5 w-20 text-center focus:outline-none focus:border-emerald-400 bg-white" />
                                  </td>
                                  {can("hr_labor_cost") && <td className="py-1.5 px-3 text-center text-gray-500">${m.pay_rate.toFixed(2)}/hr</td>}
                                  {can("hr_labor_cost") && <td className="py-1.5 px-3 text-center tabular-nums text-gray-700">${(m.actual_hours * m.pay_rate * BURDEN).toFixed(2)}</td>}
                                </tr>
                              ))}
                              <tr className="border-t border-emerald-200 font-semibold text-gray-700">
                                <td className="pt-1.5 pr-4">Total</td>
                                <td className="pt-1.5 px-3 text-center">{editRows.reduce((s, m) => s + m.actual_hours, 0).toFixed(2)}</td>
                                {can("hr_labor_cost") && <td className="pt-1.5 px-3 text-center text-gray-400 text-[10px]">×{BURDEN} burden</td>}
                                {can("hr_labor_cost") && <td className="pt-1.5 px-3 text-center">${editRows.reduce((s, m) => s + m.actual_hours * m.pay_rate * BURDEN, 0).toFixed(2)}</td>}
                              </tr>
                            </tbody>
                          </table>
                          {saveError[jobId] && <p className="text-xs text-red-600 mt-1">{saveError[jobId]}</p>}
                          <div className="flex gap-2 mt-2.5" onClick={e => e.stopPropagation()}>
                            <button onClick={() => saveJob(jobId)} disabled={saving === jobId} className="px-3 py-1 rounded-lg text-xs font-semibold text-white bg-[#123b1f] hover:bg-[#0d2616] disabled:opacity-40 transition-colors">{saving === jobId ? "Saving…" : "Save Changes"}</button>
                            <button onClick={() => { setExpanded(prev => { const n = new Set(prev); n.delete(jobId); return n; }); setEdited(prev => ({ ...prev, [jobId]: (membersCache[jobId] ?? []).map(m => ({ ...m })) })); }} className="px-3 py-1 rounded-lg text-xs font-semibold text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 transition-colors">Cancel</button>
                          </div>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-emerald-200 bg-emerald-50/40 font-semibold text-sm text-emerald-950">
            <td className="px-4 py-2.5">Total — {sorted.length} job{sorted.length !== 1 ? "s" : ""}</td>
            <td className="hidden sm:table-cell" /><td className="hidden sm:table-cell" />
            <td className="px-3 py-2.5 text-center tabular-nums">{dec2(totalActual)}</td>
            <td className="px-3 py-2.5 text-center tabular-nums text-gray-500 hidden md:table-cell">{dec2(totalBudget)}</td>
            <td className="px-3 py-2.5 text-center tabular-nums">
              {totalRevenue > 0 ? <span className={totalLabor / totalRevenue > 0.39 ? "text-red-600" : "text-emerald-700"}>{pct(totalLabor / totalRevenue)}</span> : "—"}
            </td>
            <td className="px-3 py-2.5 text-center tabular-nums hidden sm:table-cell">{money.format(totalRevenue)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Person table ──────────────────────────────────────────────────────────────

function PersonTable({ jobs, punches, dispatchJobs }: { jobs: Job[]; punches: ReportPunch[]; dispatchJobs: DispatchJob[] }) {
  const { can } = useUser();
  const persons = buildPersonView(jobs, punches);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [downPopover, setDownPopover] = useState<string | null>(null);

  function toggle(name: string) {
    setDownPopover(null);
    setExpanded(prev => { const next = new Set(prev); next.has(name) ? next.delete(name) : next.add(name); return next; });
  }

  const hasDispatch   = dispatchJobs.length > 0;
  const totalProdHrs  = persons.reduce((s, p) => s + p.total_hours, 0);
  const totalRev      = persons.reduce((s, p) => s + p.total_revenue, 0);
  const totalPayHrs   = persons.reduce((s, p) => s + (p.total_payroll_hours ?? 0), 0);
  const totalPayCost  = persons.reduce((s, p) => s + (p.payroll_cost ?? 0), 0);
  const totalDtCost   = persons.reduce((s, p) => {
    const dr = hasDispatch ? calcDownTime(p, dispatchJobs) : null;
    const downHrs = dr ? dr.totalMs / 3600000 : null;
    return s + ((p.payroll_cost && p.total_payroll_hours && downHrs != null) ? (p.payroll_cost / p.total_payroll_hours) * downHrs : 0);
  }, 0);
  const unmatchedCount = persons.filter(p => p.punch_status !== "matched").length;

  return (
    <div>
      {unmatchedCount > 0 && (
        <div className="flex items-center gap-4 px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs">
          {persons.filter(p => p.punch_status === "no_punch").length > 0 && (
            <span className="text-amber-700 font-medium flex items-center gap-1">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              {persons.filter(p => p.punch_status === "no_punch").length} missing Fertilization punch
            </span>
          )}
          {persons.filter(p => p.punch_status === "unrecognized").length > 0 && (
            <span className="text-red-600 font-medium flex items-center gap-1">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              {persons.filter(p => p.punch_status === "unrecognized").length} unrecognized
            </span>
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs font-semibold text-emerald-900/60 bg-emerald-50/40">
              <th className="px-4 py-2.5">Team Member</th>
              <th className="px-3 py-2.5 text-center">Prod Hrs</th>
              <th className="px-3 py-2.5 text-center hidden md:table-cell">Revenue</th>
              <th className="px-3 py-2.5 text-center border-l border-emerald-100 hidden sm:table-cell">Clock In</th>
              <th className="px-3 py-2.5 text-center hidden sm:table-cell">Clock Out</th>
              <th className="px-3 py-2.5 text-center border-l border-emerald-100 hidden sm:table-cell">Reg Hrs</th>
              <th className="px-3 py-2.5 text-center hidden sm:table-cell">OT Hrs</th>
              <th className="px-3 py-2.5 text-center hidden md:table-cell">Pay Hrs</th>
              {can("hr_labor_cost") && <th className="px-3 py-2.5 text-center hidden md:table-cell">Pay Cost</th>}
              <th className="px-3 py-2.5 text-center border-l border-emerald-100 hidden lg:table-cell">Down Time</th>
              <th className="px-3 py-2.5 text-center hidden lg:table-cell">DT Cost</th>
              <th className="px-3 py-2.5 text-center hidden lg:table-cell">DT %</th>
              <th className="px-3 py-2.5 text-center border-l border-emerald-100">Labor %</th>
            </tr>
          </thead>
          <tbody>
            {persons.map(p => {
              const isOpen    = expanded.has(p.resource_name);
              const clockIns  = p.punches.map(x => x.clock_in_at).filter(Boolean) as string[];
              const clockOuts = p.punches.map(x => x.clock_out_at).filter(Boolean) as string[];
              const firstIn   = clockIns.length  ? [...clockIns].sort()[0]           : null;
              const lastOut   = clockOuts.length ? [...clockOuts].sort().reverse()[0] : null;
              const multiPunch = p.punches.length > 1;
              const downResult = hasDispatch ? calcDownTime(p, dispatchJobs) : null;
              const downMs     = downResult?.totalMs ?? null;
              const laborPct  = (p.payroll_cost && p.total_revenue > 0) ? p.payroll_cost / p.total_revenue : null;
              const downHrs   = downMs != null ? downMs / 3600000 : null;
              const dtCost    = (p.payroll_cost && p.total_payroll_hours && downHrs != null) ? (p.payroll_cost / p.total_payroll_hours) * downHrs : null;
              const dtPct     = (downHrs != null && p.total_payroll_hours) ? downHrs / p.total_payroll_hours : null;

              return (
                <React.Fragment key={p.resource_name}>
                  <tr className="border-t border-emerald-100 hover:bg-emerald-50/30 cursor-pointer" onClick={() => toggle(p.resource_name)}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}><polyline points="6 9 12 15 18 9" /></svg>
                        <StatusBadge status={p.punch_status} />
                        <span className="font-medium text-emerald-950">{formatName(p.resource_name)}</span>
                        {p.punch_status === "no_punch" && <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">No punch</span>}
                        {p.punch_status === "unrecognized" && <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Unrecognized</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center font-medium text-emerald-950">{dec2(p.total_hours)}</td>
                    <td className="px-3 py-2.5 text-center font-medium text-emerald-950 hidden md:table-cell">{money.format(p.total_revenue)}</td>
                    <td className="px-3 py-2.5 text-center text-gray-600 border-l border-emerald-100 hidden sm:table-cell">{fmtTime(firstIn)}{multiPunch && <span className="ml-1 text-xs text-gray-400">+{p.punches.length - 1}</span>}</td>
                    <td className="px-3 py-2.5 text-center text-gray-600 hidden sm:table-cell">{fmtTime(lastOut)}</td>
                    <td className="px-3 py-2.5 text-center text-gray-700 border-l border-emerald-100 hidden sm:table-cell">{p.reg_hours != null ? dec2(p.reg_hours) : "—"}</td>
                    <td className="px-3 py-2.5 text-center text-gray-700 hidden sm:table-cell">{p.ot_hours != null && p.ot_hours > 0 ? dec2(p.ot_hours) : "—"}</td>
                    <td className="px-3 py-2.5 text-center font-medium text-emerald-950 hidden md:table-cell">{p.total_payroll_hours != null ? dec2(p.total_payroll_hours) : "—"}</td>
                    {can("hr_labor_cost") && <td className="px-3 py-2.5 text-center font-medium text-emerald-950 hidden md:table-cell">{p.payroll_cost != null ? money.format(p.payroll_cost) : "—"}</td>}
                    <td className="px-3 py-2.5 text-center border-l border-emerald-100 relative hidden lg:table-cell" onClick={e => { e.stopPropagation(); setDownPopover(downResult ? (downPopover === p.resource_name ? null : p.resource_name) : null); }}>
                      {downMs !== null ? <span className={`cursor-pointer underline decoration-dotted ${downMs > 3600000 ? "text-amber-600 font-medium" : "text-gray-700"}`}>{fmtHrs(downMs)}</span> : <span className="text-gray-300 text-xs italic">—</span>}
                      {downPopover === p.resource_name && downResult && (
                        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-gray-200 bg-white shadow-lg text-left text-xs">
                          <div className="px-3 py-2 border-b border-gray-100 font-semibold text-gray-700">Down Time Breakdown</div>
                          {downResult.segments.map((seg, si) => (
                            <div key={si} className="px-3 py-2 border-b border-gray-50 last:border-0">
                              <div className="font-medium text-gray-800">{seg.label}</div>
                              <div className="text-gray-500 mt-0.5">{fmtTime(seg.from)} → {fmtTime(seg.to)} <span className="ml-2 text-gray-700 font-medium">{fmtHrs(seg.ms)} hrs</span></div>
                            </div>
                          ))}
                          <div className="px-3 py-2 bg-gray-50 rounded-b-lg font-semibold text-gray-700 flex justify-between"><span>Total</span><span>{fmtHrs(downResult.totalMs)} hrs</span></div>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center text-gray-700 hidden lg:table-cell">{dtCost != null ? money.format(dtCost) : "—"}</td>
                    <td className="px-3 py-2.5 text-center text-gray-700 hidden lg:table-cell">{dtPct != null ? pct(dtPct) : "—"}</td>
                    <td className="px-3 py-2.5 text-center border-l border-emerald-100">
                      {laborPct != null ? <span className={laborPct > 0.39 ? "text-red-600 font-medium" : "text-emerald-700 font-medium"}>{pct(laborPct)}</span> : "—"}
                    </td>
                  </tr>
                  {isOpen && (
                    <>
                      {multiPunch && p.punches.map((punch, pi) => (
                        <tr key={`punch-${pi}`} className="border-t border-blue-50 bg-blue-50/30">
                          <td className="pl-12 pr-3 py-1.5 text-xs text-blue-600" colSpan={2}>Punch {pi + 1}</td>
                          <td />
                          <td className="px-3 py-1.5 text-xs text-center text-blue-600 border-l border-emerald-100">{fmtTime(punch.clock_in_at)}</td>
                          <td className="px-3 py-1.5 text-xs text-center text-blue-600">{fmtTime(punch.clock_out_at)}</td>
                          <td className="px-3 py-1.5 text-xs text-center text-blue-600 border-l border-emerald-100">{dec2(punch.regular_hours)}</td>
                          <td className="px-3 py-1.5 text-xs text-center text-blue-600">{dec2(punch.ot_hours)}</td>
                          <td colSpan={6} />
                        </tr>
                      ))}
                      {p.jobs.map((j, i) => (
                        <tr key={`job-${i}`} className="border-t border-gray-100 bg-gray-50/50">
                          <td className="pl-12 pr-3 py-2 text-xs text-gray-700"><span className="font-medium">{j.client_name}</span><span className="text-gray-400 mx-1.5">·</span><span>{j.service}</span></td>
                          <td className="px-3 py-2 text-xs text-center text-gray-600">{dec2(j.actual_hours)}</td>
                          <td className="px-3 py-2 text-xs text-center text-gray-600">{money.format(j.earned_amount)}</td>
                          <td colSpan={10} />
                        </tr>
                      ))}
                    </>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-emerald-200 bg-emerald-50/60 font-semibold text-emerald-950">
              <td className="px-4 py-2.5 text-sm">Total — {persons.length} team members</td>
              <td className="px-3 py-2.5 text-sm text-center">{dec2(totalProdHrs)}</td>
              <td className="px-3 py-2.5 text-sm text-center hidden md:table-cell">{money.format(totalRev)}</td>
              <td className="border-l border-emerald-100 hidden sm:table-cell" /><td className="hidden sm:table-cell" />
              <td className="border-l border-emerald-100 hidden sm:table-cell" /><td className="hidden sm:table-cell" />
              <td className="px-3 py-2.5 text-sm text-center hidden md:table-cell">{dec2(totalPayHrs)}</td>
              <td className="px-3 py-2.5 text-sm text-center hidden md:table-cell">{money.format(totalPayCost)}</td>
              <td className="border-l border-emerald-100 hidden lg:table-cell" />
              <td className="px-3 py-2.5 text-sm text-center hidden lg:table-cell">{totalDtCost > 0 ? money.format(totalDtCost) : "—"}</td>
              <td className="hidden lg:table-cell" />
              <td className="px-3 py-2.5 text-sm text-center border-l border-emerald-100">
                {totalRev > 0 ? <span className={totalPayCost / totalRev > 0.39 ? "text-red-600" : "text-emerald-700"}>{pct(totalPayCost / totalRev)}</span> : "—"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FertilizationImportsPage() {
  const { can } = useUser();
  const fileRef = useRef<HTMLInputElement>(null);
  const [reports, setReports]         = useState<Report[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [preview, setPreview]         = useState<any>(null);
  const [parsing, setParsing]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [saveFile, setSaveFile]       = useState<File | null>(null);
  const [expandedRep, setExpandedRep] = useState<string | null>(null);
  const [repDetail, setRepDetail]     = useState<RepDetail | null>(null);
  const [loadingRep, setLoadingRep]   = useState(false);
  const [repTab, setRepTab]           = useState<"team" | "client" | "materials">("team");
  const [rateFormId, setRateFormId]   = useState<string | null>(null);
  const [rateAmt, setRateAmt]         = useState("");
  const [rateSaving, setRateSaving]   = useState(false);

  async function loadReports() {
    setLoading(true);
    const res = await fetch("/api/operations-center/atlas-ops/fertilization/reports", { cache: "no-store" });
    const d = await res.json();
    setReports(d.data ?? []);
    setLoading(false);
  }

  useEffect(() => { loadReports(); }, []);

  async function refreshPreview(file?: File) {
    const f = file ?? saveFile;
    if (!f) return;
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("dry_run", "true");
      fd.append("tz_offset", String(new Date().getTimezoneOffset()));
      const res = await fetch("/api/operations-center/atlas-ops/fertilization/import", { method: "POST", body: fd });
      const d = await res.json();
      if (res.ok) setPreview(d);
    } catch { } finally { setParsing(false); }
  }

  async function saveInlineRate(employeeId: string, rateDollars: number, effectiveDate: string) {
    setRateSaving(true);
    try {
      const res = await fetch(`/api/atlas-time/employees/${employeeId}/pay-rates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate: rateDollars, is_default: true, effective_date: effectiveDate }),
      });
      if (res.ok) { setRateFormId(null); setRateAmt(""); await refreshPreview(); }
    } finally { setRateSaving(false); }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaveFile(file); setPreview(null); setError(null); setParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("dry_run", "true");
      fd.append("tz_offset", String(new Date().getTimezoneOffset()));
      const res = await fetch("/api/operations-center/atlas-ops/fertilization/import", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Parse failed");
      setPreview(d);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function confirmImport() {
    if (!saveFile) return;
    setSaving(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", saveFile);
      fd.append("dry_run", "false");
      fd.append("tz_offset", String(new Date().getTimezoneOffset()));
      const res = await fetch("/api/operations-center/atlas-ops/fertilization/import", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Import failed");
      setPreview(null); setSaveFile(null);
      await loadReports();
      if (d.report_type === "dispatch" && expandedRep && repDetail) void loadDispatch(repDetail.report.report_date);
    } catch (err: any) {
      setError(err.message);
    } finally { setSaving(false); }
  }

  async function loadDispatch(date: string): Promise<DispatchJob[]> {
    const res = await fetch(`/api/operations-center/atlas-ops/fertilization/dispatch?date=${date}`, { cache: "no-store" });
    const d = await res.json();
    return d.data ?? [];
  }

  async function fetchAdminPay(date: string): Promise<number> {
    try {
      const year = date.slice(0, 4);
      const res  = await fetch(`/api/operations-center/atlas-ops/fertilization/admin-pay?year=${year}`, { cache: "no-store" });
      const d    = await res.json();
      const day  = (d.days ?? []).find((x: any) => x.date === date);
      if (!day) return 0;
      if (day.override_cost !== undefined && day.override_cost !== null) return Number(day.override_cost);
      return Number(day.computed_cost ?? 0);
    } catch { return 0; }
  }

  async function toggleReport(id: string, date: string) {
    if (expandedRep === id) { setExpandedRep(null); setRepDetail(null); return; }
    setExpandedRep(id);
    setRepTab("team");
    setRepDetail(null);
    setLoadingRep(true);
    const [repRes, dispatchJobs, adminPay] = await Promise.all([
      fetch(`/api/operations-center/atlas-ops/fertilization/reports?id=${id}`, { cache: "no-store" }).then(r => r.json()),
      loadDispatch(date),
      fetchAdminPay(date),
    ]);
    setRepDetail(repRes.data ? {
      report:           repRes.data,
      punches:          repRes.punches          ?? [],
      dispatchJobs,
      usage:            repRes.usage            ?? [],
      nonProdDays:      repRes.non_production   ?? [],
      unmatchedPunches: repRes.unmatched_punches ?? [],
      adminPay,
    } : null);
    setLoadingRep(false);
  }

  async function toggleComplete(id: string, current: boolean) {
    setReports(prev => prev.map(r => r.id === id ? { ...r, is_complete: !current } : r));
    await fetch("/api/operations-center/atlas-ops/fertilization/reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_complete: !current }),
    });
  }

  async function deleteReport(id: string) {
    if (!confirm("Delete this report? This cannot be undone.")) return;
    await fetch(`/api/operations-center/atlas-ops/fertilization/reports?id=${id}`, { method: "DELETE" });
    if (expandedRep === id) { setExpandedRep(null); setRepDetail(null); }
    await loadReports();
  }

  async function refreshDispatch() {
    if (!repDetail) return;
    const jobs = await loadDispatch(repDetail.report.report_date);
    setRepDetail(prev => prev ? { ...prev, dispatchJobs: jobs } : null);
  }

  async function refreshReport() {
    if (!repDetail) return;
    const id   = repDetail.report.id;
    const date = repDetail.report.report_date;
    const [repRes, adminPay] = await Promise.all([
      fetch(`/api/operations-center/atlas-ops/fertilization/reports?id=${id}`, { cache: "no-store" }).then(r => r.json()),
      fetchAdminPay(date),
    ]);
    if (repRes.data) setRepDetail(prev => prev ? {
      ...prev,
      report:           repRes.data,
      punches:          repRes.punches          ?? [],
      usage:            repRes.usage            ?? [],
      nonProdDays:      repRes.non_production   ?? [],
      unmatchedPunches: repRes.unmatched_punches ?? [],
      adminPay,
    } : null);
    await loadReports();
  }

  const isDispatchPreview = preview?.report_type === "dispatch";
  const previewJobs       = preview?.jobs ?? [];
  const repJobs: Job[]    = (repDetail?.report.fert_production_jobs ?? []).map(j => ({
    ...j,
    members: (j.fert_production_members ?? []) as Member[],
  }));
  const repPersons = repDetail ? buildPersonView(repJobs, repDetail.punches) : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="mx-auto max-w-[1400px] px-4 md:px-6 py-6 md:py-8">

        {/* Header */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-emerald-950">Fertilization Operations</h1>
            <p className="text-sm text-emerald-900/60 mt-0.5">SAP Daily Production · Service AutoPilot Dispatch</p>
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={handleFile} />
            <button onClick={() => fileRef.current?.click()} disabled={parsing || saving} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-60">
              {parsing ? "Parsing…" : "Import Report"}
            </button>
          </div>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

        {/* Preview */}
        {preview && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-emerald-100 bg-emerald-50/60">
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-emerald-950">
                    {isDispatchPreview ? "Dispatch Board Preview" : "Production Report Preview"} — {preview.file_name}
                  </div>
                  {isDispatchPreview && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">Dispatch</span>}
                </div>
                <div className="mt-0.5 text-xs text-emerald-900/60">
                  {fmtDate(preview.report_date ?? previewJobs[0]?.service_date ?? "")}
                  {isDispatchPreview ? ` · ${previewJobs.length} jobs · ${preview.varies_count} varies` : ` · ${previewJobs.length} jobs`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setPreview(null); setSaveFile(null); }} className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-50">Cancel</button>
                <button onClick={confirmImport} disabled={saving} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">{saving ? "Saving…" : "Confirm Import"}</button>
              </div>
            </div>

            {isDispatchPreview ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-emerald-900/60 bg-emerald-50/40">
                      <th className="px-4 py-2.5">Client</th>
                      <th className="px-3 py-2.5">City</th>
                      <th className="px-3 py-2.5">Service</th>
                      <th className="px-3 py-2.5">Crew</th>
                      <th className="px-3 py-2.5 text-center">Start</th>
                      <th className="px-3 py-2.5 text-center">End</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(previewJobs as DispatchJob[]).map((j, i) => (
                      <tr key={i} className={`border-t border-emerald-100 ${j.time_varies ? "bg-amber-50/40" : ""}`}>
                        <td className="px-4 py-2 font-medium text-emerald-950">{j.client_name}</td>
                        <td className="px-3 py-2 text-gray-600">{j.city}</td>
                        <td className="px-3 py-2 text-gray-600">{j.service}</td>
                        <td className="px-3 py-2 text-gray-600">{j.crew_code}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{j.time_varies ? <span className="text-amber-600 font-medium text-xs">Varies ⚠</span> : fmtTime(j.start_time)}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{j.time_varies ? "—" : fmtTime(j.end_time)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <>
                {preview.revenue_ok === false && (
                  <div className="mx-5 mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
                    <span className="text-amber-500 text-base leading-none mt-0.5">⚠</span>
                    <div>
                      <span className="font-semibold text-amber-900">Revenue mismatch — some jobs may be missing from this import.</span>
                      <div className="mt-1 text-amber-800">Imported: <strong>{money.format(preview.revenue_imported ?? 0)}</strong> &nbsp;·&nbsp; Expected: <strong>{money.format(preview.revenue_expected ?? 0)}</strong> &nbsp;·&nbsp; Missing: <strong className="text-red-600">{money.format(Math.abs((preview.revenue_expected ?? 0) - (preview.revenue_imported ?? 0)))}</strong></div>
                      <div className="mt-1 text-xs text-amber-700">Check the XLS for jobs whose crew code format couldn&apos;t be detected, then re-import.</div>
                    </div>
                  </div>
                )}
                {can("hr_labor_cost") && (() => {
                  const seen = new Set<string>();
                  const missing: { employee_id: string; resource_name: string }[] = [];
                  for (const j of previewJobs) {
                    for (const m of (j.members ?? [])) {
                      if (m.employee_id && m.reg_hours != null && m.pay_rate == null && !seen.has(m.employee_id)) {
                        seen.add(m.employee_id); missing.push({ employee_id: m.employee_id, resource_name: m.resource_name });
                      }
                    }
                  }
                  if (!missing.length) return null;
                  const reportDate = preview.report_date ?? previewJobs[0]?.service_date ?? "";
                  return (
                    <div className="mx-5 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                      <div className="flex items-start gap-3">
                        <span className="text-amber-500 text-base leading-none mt-0.5">⚠</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-amber-900 text-sm">{missing.length === 1 ? "1 team member has" : `${missing.length} team members have`} no pay rate — payroll will import as $0.00</div>
                          <div className="mt-2 space-y-2">
                            {missing.map(p => (
                              <div key={p.employee_id} className="flex items-center flex-wrap gap-2">
                                <span className="text-sm text-amber-800 font-medium">{formatName(p.resource_name)}</span>
                                {rateFormId === p.employee_id ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-amber-700 font-medium">$</span>
                                    <input type="number" step="0.01" min="0" placeholder="0.00" value={rateAmt} onChange={e => setRateAmt(e.target.value)} className="w-20 border border-amber-300 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-400" />
                                    <span className="text-xs text-amber-600">/hr</span>
                                    <button onClick={() => { const r = parseFloat(rateAmt); if (r > 0) saveInlineRate(p.employee_id, r, reportDate); }} disabled={rateSaving || !parseFloat(rateAmt)} className="text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1 rounded disabled:opacity-50">{rateSaving ? "Saving…" : "Save Rate"}</button>
                                    <button onClick={() => { setRateFormId(null); setRateAmt(""); }} className="text-xs text-amber-600 hover:text-amber-800">Cancel</button>
                                  </div>
                                ) : (
                                  <button onClick={() => { setRateFormId(p.employee_id); setRateAmt(""); }} className="text-xs font-semibold text-amber-700 hover:text-amber-900 underline decoration-dotted">+ Set Rate</button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                <PersonTable jobs={previewJobs} punches={preview.punches ?? []} dispatchJobs={[]} />
                {preview.debug && (
                  <div className="px-5 py-3 border-t border-emerald-100 bg-gray-50 text-xs font-mono text-gray-500">
                    Punches found: <strong>{String(preview.debug.punchRowsFound ?? 0)}</strong> &nbsp;|&nbsp; Matched employees: <strong>{String(preview.debug.matchedEmpIds ?? 0)}</strong>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Reports list */}
        <div className="rounded-xl border border-emerald-100 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-emerald-100 bg-emerald-50/60 px-5 py-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-emerald-950">Imported Reports</div>
            {reports.length > 0 && (() => {
              const complete = reports.filter(r => r.is_complete).length;
              const total = reports.length;
              return (
                <div className="flex items-center gap-1.5 text-xs">
                  <div className="flex gap-0.5">{reports.map(r => <div key={r.id} className={`w-2 h-2 rounded-full ${r.is_complete ? "bg-emerald-500" : "bg-gray-200"}`} />)}</div>
                  <span className={`font-semibold ${complete === total ? "text-emerald-600" : "text-gray-500"}`}>{complete} of {total} complete</span>
                </div>
              );
            })()}
          </div>

          {loading ? (
            <div className="px-5 py-10 text-center text-sm text-emerald-900/50">Loading…</div>
          ) : reports.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-emerald-900/50">No reports imported yet.</div>
          ) : (
            <div className="divide-y divide-emerald-100">
              {/* Header */}
              <div className="grid grid-cols-[1fr_5rem_7rem_5rem_7rem_6rem_7rem_4rem] items-center text-xs font-semibold text-emerald-900/60 bg-emerald-50/40 px-4 py-2.5">
                <div>Date</div>
                <div className="text-center">Total Hrs</div>
                <div className="text-center">Revenue</div>
                <div className="text-center">Labor %</div>
                <div className="text-center">Mat. Cost</div>
                <div className="text-center">GP%</div>
                <div className="text-center">Status</div>
                <div />
              </div>
              {reports.map(r => {
                const isOpen       = expandedRep === r.id;
                const payCost      = r.total_payroll_cost    ?? 0;
                const nonProdCost  = r.total_non_prod_cost   ?? 0;
                const matCost      = r.total_material_cost   ?? 0;
                const revenue      = r.total_budgeted_amount ?? 0;
                const totalCost    = payCost + nonProdCost + matCost;
                const laborPct     = (payCost > 0 && revenue > 0) ? payCost / revenue : null;
                const gpPct        = revenue > 0 ? (revenue - totalCost) / revenue : null;
                const hasUnmatched = false; // shown in expanded detail

                return (
                  <div key={r.id}>
                    <div className={`grid grid-cols-[1fr_5rem_7rem_5rem_7rem_6rem_7rem_4rem] items-center text-sm px-4 py-2.5 hover:bg-emerald-50/30 ${isOpen ? "bg-emerald-50/20" : ""}`}>
                      <div className="min-w-0">
                        <button onClick={() => toggleReport(r.id, r.report_date)} className="flex items-center gap-2 text-left">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}><polyline points="6 9 12 15 18 9" /></svg>
                          <span className="font-medium text-emerald-950">{fmtDate(r.report_date)}</span>
                        </button>
                      </div>
                      <div className="text-center text-gray-700">{dec2(r.total_actual_hours)}</div>
                      <div className="text-center text-gray-700">{money.format(revenue)}</div>
                      <div className="text-center">
                        {laborPct != null ? <span className={laborPct > 0.39 ? "text-red-600 font-medium" : "text-emerald-700 font-medium"}>{pct(laborPct)}</span> : "—"}
                      </div>
                      <div className="text-center text-gray-700">{matCost > 0 ? money.format(matCost) : <span className="text-gray-300 text-xs">—</span>}</div>
                      <div className="text-center">
                        {gpPct != null && totalCost > 0
                          ? <span className={gpPct < 0.30 ? "text-red-600 font-semibold" : gpPct < 0.45 ? "text-amber-600 font-semibold" : "text-emerald-700 font-semibold"}>{pct(gpPct)}</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </div>
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => toggleComplete(r.id, r.is_complete)}
                          className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all ${r.is_complete ? "bg-emerald-500 border-emerald-500 text-white shadow-sm" : "bg-white border-gray-200 text-gray-400 hover:border-emerald-400 hover:text-emerald-600"}`}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                          {r.is_complete ? "Official" : "Complete"}
                        </button>
                      </div>
                      <div className="text-center">
                        <button onClick={() => deleteReport(r.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="border-t border-emerald-100">
                        {loadingRep ? (
                          <div className="px-6 py-4 text-sm text-emerald-900/50">Loading…</div>
                        ) : repDetail ? (
                          <>
                            {/* GP summary bar */}
                            {can("hr_labor_cost") && (() => {
                              const rev    = repDetail.report.total_budgeted_amount ?? 0;
                              const prod   = repDetail.report.total_payroll_cost    ?? 0;
                              const np     = (repDetail.nonProdDays ?? []).reduce((s, d) => s + (d.payroll_cost ?? 0), 0);
                              const mat    = (repDetail.usage ?? []).reduce((s, u) => s + u.total_cost, 0);
                              const admin  = repDetail.adminPay ?? 0;
                              const gp     = rev - prod - np - mat - admin;
                              const gpP    = rev > 0 ? gp / rev : null;
                              return (
                                <div className="flex flex-wrap items-center gap-4 px-5 py-3 bg-emerald-950/5 border-b border-emerald-100 text-xs">
                                  <span className="text-gray-500">Revenue <strong className="text-gray-800">{money.format(rev)}</strong></span>
                                  <span className="text-gray-300">−</span>
                                  <span className="text-gray-500">Prod Labor <strong className="text-gray-800">{money.format(prod)}</strong></span>
                                  {np > 0 && <><span className="text-gray-300">−</span><span className="text-gray-500">Non-Prod <strong className="text-gray-800">{money.format(np)}</strong></span></>}
                                  {mat > 0 && <><span className="text-gray-300">−</span><span className="text-gray-500">Materials <strong className="text-gray-800">{money.format(mat)}</strong></span></>}
                                  {admin > 0 && <><span className="text-gray-300">−</span><span className="text-gray-500">Admin <strong className="text-gray-800">{money.format(admin)}</strong></span></>}
                                  <span className="text-gray-300">=</span>
                                  <span className="font-semibold text-sm">
                                    GP <span className={gpP != null ? (gpP < 0.30 ? "text-red-600" : gpP < 0.45 ? "text-amber-600" : "text-emerald-700") : "text-gray-400"}>
                                      {money.format(gp)}{gpP != null ? ` (${pct(gpP)})` : ""}
                                    </span>
                                  </span>
                                  {mat === 0 && (
                                    <span className="text-gray-400 italic">— log materials to complete GP</span>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Tab bar */}
                            <div className="flex gap-0 border-b border-emerald-100 bg-emerald-50/40">
                              {(["team", "client", "materials"] as const).map(tab => (
                                <button key={tab} onClick={() => setRepTab(tab)}
                                  className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors capitalize ${repTab === tab ? "border-emerald-500 text-emerald-900" : "border-transparent text-emerald-900/40 hover:text-emerald-900/70"}`}>
                                  {tab === "team" ? "Team Members" : tab === "client" ? "By Client" : "Materials Used"}
                                  {tab === "materials" && (repDetail.usage ?? []).length > 0 && (
                                    <span className="ml-1.5 bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">{(repDetail.usage ?? []).length}</span>
                                  )}
                                  {tab === "team" && (repDetail.unmatchedPunches ?? []).length > 0 && (
                                    <span className="ml-1.5 bg-orange-100 text-orange-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">{(repDetail.unmatchedPunches ?? []).length}</span>
                                  )}
                                </button>
                              ))}
                            </div>

                            {repTab === "team" && (
                              <>
                                <PersonTable jobs={repJobs} punches={repDetail.punches} dispatchJobs={repDetail.dispatchJobs} />
                                <VariesPanel dispatchJobs={repDetail.dispatchJobs} persons={repPersons} reportDate={repDetail.report.report_date} onSaved={refreshDispatch} />
                                <UnmatchedSection
                                  reportId={repDetail.report.id}
                                  reportDate={repDetail.report.report_date}
                                  unmatched={repDetail.unmatchedPunches ?? []}
                                  nonProdDays={repDetail.nonProdDays ?? []}
                                  onSaved={refreshReport}
                                />
                              </>
                            )}

                            {repTab === "client" && (
                              <ClientTable jobs={repJobs} onSaved={refreshReport} />
                            )}

                            {repTab === "materials" && (
                              <MaterialsTab
                                reportId={repDetail.report.id}
                                reportDate={repDetail.report.report_date}
                                usage={repDetail.usage ?? []}
                                members={repPersons}
                                onSaved={refreshReport}
                              />
                            )}
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
