"use client";

import React, { useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type PunchStatus = "matched" | "no_punch" | "unrecognized";

type Member = {
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
  lawn_production_members?: Member[];
};

type Job = {
  id?: string;
  client_name: string;
  client_address: string;
  service: string;
  service_date: string;
  crew_code: string;
  budgeted_hours: number;
  actual_hours: number;
  variance_hours: number;
  budgeted_amount: number;
  actual_amount: number;
  members: Member[];
  lawn_production_members?: Member[];
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
  lawn_dispatch_job_times?: DispatchJobTime[];
};

type Report = {
  id: string;
  report_date: string;
  file_name: string | null;
  imported_at: string;
  total_budgeted_hours: number;
  total_actual_hours: number;
  total_payroll_cost?: number;
  total_budgeted_amount: number;
  total_actual_amount: number;
  lawn_production_jobs?: Job[];
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

const money  = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const pct    = (n: number) => `${Math.round(n * 100)}%`;
const dec2   = (n: number | null | undefined) => Number(n ?? 0).toFixed(2);
const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtTime = (iso: string | null | undefined) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
};
const fmtHrs = (ms: number) => {
  const h = ms / 3600000;
  return h < 0.005 ? "0.00" : h.toFixed(2);
};

function formatName(raw: string): string {
  const parts = raw.trim().split(/\s+/);
  if (parts.length < 2) return raw;
  const last = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(" ");
  return `${last}, ${first}`;
}

function buildPersonView(jobs: Job[], punches: ReportPunch[]): PersonEntry[] {
  const map = new Map<string, PersonEntry>();

  for (const job of jobs) {
    const members: Member[] = job.members?.length ? job.members : (job.lawn_production_members ?? []);
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
      if (job.crew_code && !p.crew_codes.includes(job.crew_code)) p.crew_codes.push(job.crew_code);
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

// Calculate down time for a person given their crew's dispatch jobs.
// Works per-punch-period so punch-out gaps are never counted as down time.
function calcDownTime(person: PersonEntry, dispatchJobs: DispatchJob[]): DownTimeResult | null {
  const crewDispatch = dispatchJobs.filter(j => j.crew_code && person.crew_codes.includes(j.crew_code));

  type Seg = { label: string; startMs: number; endMs: number; startISO: string; endISO: string };
  const allSegs: Seg[] = [];

  for (const j of crewDispatch) {
    if (!j.time_varies && j.start_time && j.end_time) {
      allSegs.push({ label: j.client_name, startMs: new Date(j.start_time).getTime(), endMs: new Date(j.end_time).getTime(), startISO: j.start_time, endISO: j.end_time });
    } else if (j.time_varies && j.lawn_dispatch_job_times?.length) {
      const myTimes = j.lawn_dispatch_job_times.filter(t =>
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

  // Build punch periods — down time only accumulates while clocked in
  const punchPeriods = person.punches
    .filter(p => p.clock_in_at && p.clock_out_at)
    .map(p => ({ startMs: new Date(p.clock_in_at!).getTime(), endMs: new Date(p.clock_out_at!).getTime(), inISO: p.clock_in_at!, outISO: p.clock_out_at! }))
    .sort((a, b) => a.startMs - b.startMs);

  if (!punchPeriods.length) return null;

  const segments: DownSegment[] = [];

  for (const punch of punchPeriods) {
    // Job segments that overlap this punch window
    const inWindow = allSegs.filter(s => s.endMs > punch.startMs && s.startMs < punch.endMs);
    if (!inWindow.length) continue;

    // Clock in → first job
    if (inWindow[0].startMs > punch.startMs) {
      segments.push({ from: punch.inISO, to: inWindow[0].startISO, label: `Clock in → ${inWindow[0].label}`, ms: inWindow[0].startMs - punch.startMs });
    }

    // Between consecutive jobs within this punch window
    for (let i = 0; i < inWindow.length - 1; i++) {
      const gapMs = inWindow[i + 1].startMs - inWindow[i].endMs;
      if (gapMs > 0)
        segments.push({ from: inWindow[i].endISO, to: inWindow[i + 1].startISO, label: `${inWindow[i].label} → ${inWindow[i + 1].label}`, ms: gapMs });
    }

    // Last job → clock out
    const last = inWindow[inWindow.length - 1];
    if (last.endMs < punch.endMs) {
      segments.push({ from: last.endISO, to: punch.outISO, label: `${last.label} → Clock out`, ms: punch.endMs - last.endMs });
    }
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
    <span className="inline-flex items-center text-amber-500" title="No Lawn punch found for this date">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    </span>
  );
  return (
    <span className="inline-flex items-center text-red-500" title="Not found in Atlas">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </span>
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
  const [forms, setForms] = useState<Record<string, { employee_id: string; resource_name: string; start: string; end: string; notes: string }[]>>({});
  const [saving, setSaving] = useState<string | null>(null);
  // Start jobs with existing time entries as dismissed — user already handled them
  const [dismissed, setDismissed] = useState<Set<string>>(
    () => new Set(variesJobs.filter(j => (j.lawn_dispatch_job_times?.length ?? 0) > 0).map(j => j.id))
  );

  const visibleJobs = variesJobs.filter(j => !dismissed.has(j.id));
  if (!visibleJobs.length) return null;

  function addRow(jobId: string, empId: string | null, name: string) {
    setForms(prev => ({
      ...prev,
      [jobId]: [...(prev[jobId] ?? []), { employee_id: empId ?? "", resource_name: name, start: "", end: "", notes: "" }],
    }));
  }

  function updateRow(jobId: string, idx: number, field: string, val: string) {
    setForms(prev => {
      const rows = [...(prev[jobId] ?? [])];
      rows[idx] = { ...rows[idx], [field]: val };
      return { ...prev, [jobId]: rows };
    });
  }

  async function saveRow(jobId: string, idx: number) {
    const row = forms[jobId]?.[idx];
    if (!row?.start) return;
    setSaving(`${jobId}-${idx}`);
    try {
      // Build timestamps in local time so they store correctly as UTC in Supabase
      const toISO = (t: string) => new Date(`${reportDate}T${t}:00`).toISOString();
      await fetch("/api/operations-center/atlas-ops/lawn/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dispatch_job_id: jobId,
          employee_id: row.employee_id || null,
          resource_name: row.resource_name,
          start_time: toISO(row.start),
          end_time: row.end ? toISO(row.end) : null,
          notes: row.notes || null,
        }),
      });
      setForms(prev => {
        const rows = [...(prev[jobId] ?? [])];
        rows.splice(idx, 1);
        return { ...prev, [jobId]: rows };
      });
      onSaved();
    } finally {
      setSaving(null);
    }
  }

  async function deleteTime(id: string) {
    await fetch(`/api/operations-center/atlas-ops/lawn/dispatch?id=${id}`, { method: "DELETE" });
    onSaved();
  }

  return (
    <div className="border-t-2 border-amber-200 bg-amber-50/40 px-5 py-4">
      <div className="flex items-center gap-2 mb-3">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span className="text-sm font-semibold text-amber-800">Time Entry Required — {variesJobs.length} job{variesJobs.length > 1 ? "s" : ""} show "Varies"</span>
      </div>
      <div className="space-y-4">
        {visibleJobs.map(job => {
          const crewPersons = persons.filter(p => p.crew_codes.includes(job.crew_code ?? ""));
          const pendingRows = forms[job.id] ?? [];
          const savedTimes  = job.lawn_dispatch_job_times ?? [];
          return (
            <div key={job.id} className="rounded-lg border border-amber-200 bg-white overflow-hidden">
              <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
                <div>
                  <span className="font-medium text-sm text-amber-900">{job.client_name}</span>
                  {job.service && <span className="text-xs text-amber-700 ml-2">· {job.service}</span>}
                  <span className="text-xs text-amber-600 ml-2">Crew {job.crew_code}</span>
                </div>
                <button
                  onClick={() => setDismissed(prev => new Set([...prev, job.id]))}
                  className="text-xs rounded border border-amber-300 px-2.5 py-1 text-amber-700 hover:bg-amber-100 font-medium"
                >
                  Done
                </button>
              </div>
              <div className="p-4 space-y-3">
                {/* Saved entries */}
                {savedTimes.length > 0 && (
                  <div className="space-y-1">
                    {savedTimes.map(t => (
                      <div key={t.id} className="flex items-center gap-3 text-xs text-gray-700">
                        <span className="w-36 font-medium">{t.resource_name ? formatName(t.resource_name) : "—"}</span>
                        <span>{fmtTime(t.start_time)} → {fmtTime(t.end_time)}</span>
                        {t.notes && <span className="text-gray-400">{t.notes}</span>}
                        <button onClick={() => deleteTime(t.id)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Pending input rows */}
                {pendingRows.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <select
                      value={row.employee_id}
                      onChange={e => {
                        const p = persons.find(cp => cp.employee_id === e.target.value);
                        updateRow(job.id, idx, "employee_id", e.target.value);
                        if (p) updateRow(job.id, idx, "resource_name", p.resource_name);
                      }}
                      className="border border-gray-200 rounded px-2 py-1 text-xs w-44"
                    >
                      <option value="">— Person —</option>
                      {persons.map(p => (
                        <option key={p.employee_id ?? p.resource_name} value={p.employee_id ?? ""}>
                          {formatName(p.resource_name)}
                        </option>
                      ))}
                    </select>
                    <input
                      type="time"
                      value={row.start}
                      onChange={e => updateRow(job.id, idx, "start", e.target.value)}
                      className="border border-gray-200 rounded px-2 py-1 text-xs w-28"
                      placeholder="Start"
                    />
                    <span className="text-gray-400">→</span>
                    <input
                      type="time"
                      value={row.end}
                      onChange={e => updateRow(job.id, idx, "end", e.target.value)}
                      className="border border-gray-200 rounded px-2 py-1 text-xs w-28"
                      placeholder="End"
                    />
                    <input
                      type="text"
                      value={row.notes}
                      onChange={e => updateRow(job.id, idx, "notes", e.target.value)}
                      className="border border-gray-200 rounded px-2 py-1 text-xs flex-1"
                      placeholder="Notes (optional)"
                    />
                    <button
                      onClick={() => saveRow(job.id, idx)}
                      disabled={!row.start || saving === `${job.id}-${idx}`}
                      className="rounded bg-emerald-700 text-white px-2.5 py-1 text-xs font-medium hover:bg-emerald-800 disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                ))}
                {/* Add row buttons: crew members + anyone dropdown */}
                <div className="flex flex-wrap gap-2 pt-1 items-center">
                  {crewPersons.map(p => (
                    <button
                      key={p.resource_name}
                      onClick={() => addRow(job.id, p.employee_id, p.resource_name)}
                      className="text-xs rounded border border-emerald-200 px-2.5 py-1 text-emerald-700 hover:bg-emerald-50 whitespace-nowrap"
                    >
                      + {formatName(p.resource_name)}
                    </button>
                  ))}
                  <select
                    value=""
                    onChange={e => {
                      const p = persons.find(cp => cp.employee_id === e.target.value || cp.resource_name === e.target.value);
                      if (p) addRow(job.id, p.employee_id, p.resource_name);
                    }}
                    className="text-xs rounded border border-gray-200 px-2 py-1 text-gray-500 hover:border-gray-300"
                  >
                    <option value="">+ Other member…</option>
                    {persons.filter(p => !crewPersons.includes(p)).map(p => (
                      <option key={p.employee_id ?? p.resource_name} value={p.employee_id ?? p.resource_name}>
                        {formatName(p.resource_name)}
                      </option>
                    ))}
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

// ── Person table ──────────────────────────────────────────────────────────────

function PersonTable({ jobs, punches, dispatchJobs }: {
  jobs: Job[];
  punches: ReportPunch[];
  dispatchJobs: DispatchJob[];
}) {
  const persons = buildPersonView(jobs, punches);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [downPopover, setDownPopover] = useState<string | null>(null);

  function toggle(name: string) {
    setDownPopover(null);
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  const hasDispatch     = dispatchJobs.length > 0;
  const totalProdHrs   = persons.reduce((s, p) => s + p.total_hours, 0);
  const totalRev       = persons.reduce((s, p) => s + p.total_revenue, 0);
  const totalPayHrs    = persons.reduce((s, p) => s + (p.total_payroll_hours ?? 0), 0);
  const totalPayCost   = persons.reduce((s, p) => s + (p.payroll_cost ?? 0), 0);
  const totalDtCost    = persons.reduce((s, p) => {
    const dr = hasDispatch ? calcDownTime(p, dispatchJobs) : null;
    const downHrs = dr ? dr.totalMs / 3600000 : null;
    const dtc = (p.payroll_cost && p.total_payroll_hours && downHrs != null)
      ? (p.payroll_cost / p.total_payroll_hours) * downHrs : 0;
    return s + dtc;
  }, 0);
  const unmatchedCount = persons.filter(p => p.punch_status !== "matched").length;

  return (
    <div>
      {unmatchedCount > 0 && (
        <div className="flex items-center gap-4 px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs">
          {persons.filter(p => p.punch_status === "no_punch").length > 0 && (
            <span className="text-amber-700 font-medium flex items-center gap-1">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              {persons.filter(p => p.punch_status === "no_punch").length} missing Lawn punch
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
        <table className="w-full text-sm border-collapse min-w-[1100px]">
          <thead>
            <tr className="text-left text-xs font-semibold text-emerald-900/60 bg-emerald-50/40">
              <th className="px-4 py-2.5">Team Member</th>
              <th className="px-3 py-2.5 text-right">Prod Hrs</th>
              <th className="px-3 py-2.5 text-right">Revenue</th>
              <th className="px-3 py-2.5 text-right border-l border-emerald-100">Clock In</th>
              <th className="px-3 py-2.5 text-right">Clock Out</th>
              <th className="px-3 py-2.5 text-right border-l border-emerald-100">Reg Hrs</th>
              <th className="px-3 py-2.5 text-right">OT Hrs</th>
              <th className="px-3 py-2.5 text-right">Pay Hrs</th>
              <th className="px-3 py-2.5 text-right">Pay Cost</th>
              <th className="px-3 py-2.5 text-right border-l border-emerald-100">Down Time</th>
              <th className="px-3 py-2.5 text-right">DT Cost</th>
              <th className="px-3 py-2.5 text-right">DT %</th>
              <th className="px-3 py-2.5 text-right border-l border-emerald-100">Labor %</th>
              <th className="px-3 py-2.5 text-right">Efficiency</th>
            </tr>
          </thead>
          <tbody>
            {persons.map(p => {
              const isOpen     = expanded.has(p.resource_name);
              const clockIns   = p.punches.map(x => x.clock_in_at).filter(Boolean) as string[];
              const clockOuts  = p.punches.map(x => x.clock_out_at).filter(Boolean) as string[];
              const firstIn    = clockIns.length  ? [...clockIns].sort()[0]           : null;
              const lastOut    = clockOuts.length ? [...clockOuts].sort().reverse()[0] : null;
              const multiPunch = p.punches.length > 1;
              const downResult = hasDispatch ? calcDownTime(p, dispatchJobs) : null;
              const downMs     = downResult?.totalMs ?? null;

              const laborPct      = (p.payroll_cost && p.total_revenue > 0) ? p.payroll_cost / p.total_revenue : null;
              const efficiencyPct = (p.payroll_cost && p.total_revenue > 0) ? (p.total_revenue * 0.39) / p.payroll_cost : null;
              // DT cost = (payroll_cost / total_payroll_hours) * down_time_hrs — incorporates OT blended rate
              const downHrs    = downMs != null ? downMs / 3600000 : null;
              const dtCost     = (p.payroll_cost && p.total_payroll_hours && downHrs != null)
                ? (p.payroll_cost / p.total_payroll_hours) * downHrs : null;
              const dtPct      = (downHrs != null && p.total_payroll_hours)
                ? downHrs / p.total_payroll_hours : null;

              return (
                <React.Fragment key={p.resource_name}>
                  <tr className="border-t border-emerald-100 hover:bg-emerald-50/30 cursor-pointer" onClick={() => toggle(p.resource_name)}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                          strokeLinecap="round" strokeLinejoin="round"
                          className={`shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                        <StatusBadge status={p.punch_status} />
                        <span className="font-medium text-emerald-950">{formatName(p.resource_name)}</span>
                        {p.punch_status === "no_punch" && <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">No punch</span>}
                        {p.punch_status === "unrecognized" && <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Unrecognized</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-emerald-950">{dec2(p.total_hours)}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-emerald-950">{money.format(p.total_revenue)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-600 border-l border-emerald-100">
                      {fmtTime(firstIn)}{multiPunch && <span className="ml-1 text-xs text-gray-400">+{p.punches.length - 1}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{fmtTime(lastOut)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700 border-l border-emerald-100">{p.reg_hours != null ? dec2(p.reg_hours) : "—"}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700">{p.ot_hours != null && p.ot_hours > 0 ? dec2(p.ot_hours) : "—"}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-emerald-950">{p.total_payroll_hours != null ? dec2(p.total_payroll_hours) : "—"}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-emerald-950">{p.payroll_cost != null ? money.format(p.payroll_cost) : "—"}</td>
                    <td className="px-3 py-2.5 text-right border-l border-emerald-100 relative" onClick={e => { e.stopPropagation(); setDownPopover(downResult ? (downPopover === p.resource_name ? null : p.resource_name) : null); }}>
                      {downMs !== null ? (
                        <span className={`cursor-pointer underline decoration-dotted ${downMs > 3600000 ? "text-amber-600 font-medium" : "text-gray-700"}`}>{fmtHrs(downMs)}</span>
                      ) : <span className="text-gray-300 text-xs italic">—</span>}
                      {downPopover === p.resource_name && downResult && (
                        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-gray-200 bg-white shadow-lg text-left text-xs">
                          <div className="px-3 py-2 border-b border-gray-100 font-semibold text-gray-700">Down Time Breakdown</div>
                          {downResult.segments.map((seg, si) => (
                            <div key={si} className="px-3 py-2 border-b border-gray-50 last:border-0">
                              <div className="font-medium text-gray-800">{seg.label}</div>
                              <div className="text-gray-500 mt-0.5">{fmtTime(seg.from)} → {fmtTime(seg.to)} <span className="ml-2 text-gray-700 font-medium">{fmtHrs(seg.ms)} hrs</span></div>
                            </div>
                          ))}
                          <div className="px-3 py-2 bg-gray-50 rounded-b-lg font-semibold text-gray-700 flex justify-between">
                            <span>Total</span><span>{fmtHrs(downResult.totalMs)} hrs</span>
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700">
                      {dtCost != null ? money.format(dtCost) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700">
                      {dtPct != null ? pct(dtPct) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right border-l border-emerald-100">
                      {laborPct != null ? (
                        <span className={laborPct > 0.39 ? "text-red-600 font-medium" : "text-emerald-700 font-medium"}>{pct(laborPct)}</span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {efficiencyPct != null ? (
                        <span className={efficiencyPct >= 1 ? "text-emerald-700 font-medium" : "text-red-600 font-medium"}>{pct(efficiencyPct)}</span>
                      ) : "—"}
                    </td>
                  </tr>
                  {isOpen && (
                    <>
                      {multiPunch && p.punches.map((punch, pi) => (
                        <tr key={`punch-${pi}`} className="border-t border-blue-50 bg-blue-50/30">
                          <td className="pl-12 pr-3 py-1.5 text-xs text-blue-600" colSpan={2}>Punch {pi + 1}</td>
                          <td />
                          <td className="px-3 py-1.5 text-xs text-right text-blue-600 border-l border-emerald-100">{fmtTime(punch.clock_in_at)}</td>
                          <td className="px-3 py-1.5 text-xs text-right text-blue-600">{fmtTime(punch.clock_out_at)}</td>
                          <td className="px-3 py-1.5 text-xs text-right text-blue-600 border-l border-emerald-100">{dec2(punch.regular_hours)}</td>
                          <td className="px-3 py-1.5 text-xs text-right text-blue-600">{dec2(punch.ot_hours)}</td>
                          <td colSpan={7} />
                        </tr>
                      ))}
                      {p.jobs.map((j, i) => (
                        <tr key={`job-${i}`} className="border-t border-gray-100 bg-gray-50/50">
                          <td className="pl-12 pr-3 py-2 text-xs text-gray-700">
                            <span className="font-medium">{j.client_name}</span>
                            <span className="text-gray-400 mx-1.5">·</span>
                            <span>{j.service}</span>
                          </td>
                          <td className="px-3 py-2 text-xs text-right text-gray-600">{dec2(j.actual_hours)}</td>
                          <td className="px-3 py-2 text-xs text-right text-gray-600">{money.format(j.earned_amount)}</td>
                          <td colSpan={11} />
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
              <td className="px-3 py-2.5 text-sm text-right">{dec2(totalProdHrs)}</td>
              <td className="px-3 py-2.5 text-sm text-right">{money.format(totalRev)}</td>
              <td className="border-l border-emerald-100" colSpan={2} />
              <td className="border-l border-emerald-100" /><td />
              <td className="px-3 py-2.5 text-sm text-right">{dec2(totalPayHrs)}</td>
              <td className="px-3 py-2.5 text-sm text-right">{money.format(totalPayCost)}</td>
              <td className="border-l border-emerald-100" />
              <td className="px-3 py-2.5 text-sm text-right">{totalDtCost > 0 ? money.format(totalDtCost) : "—"}</td>
              <td />
              <td className="px-3 py-2.5 text-sm text-right border-l border-emerald-100">
                {totalRev > 0 ? <span className={totalPayCost / totalRev > 0.39 ? "text-red-600" : "text-emerald-700"}>{pct(totalPayCost / totalRev)}</span> : "—"}
              </td>
              <td className="px-3 py-2.5 text-sm text-right">
                {totalPayCost > 0 ? <span className={(totalRev * 0.39) / totalPayCost >= 1 ? "text-emerald-700" : "text-red-600"}>{pct((totalRev * 0.39) / totalPayCost)}</span> : "—"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LawnPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [reports, setReports]         = useState<Report[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [preview, setPreview]         = useState<any>(null);
  const [parsing, setParsing]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [saveFile, setSaveFile]       = useState<File | null>(null);
  const [expandedRep, setExpandedRep] = useState<string | null>(null);
  const [repDetail, setRepDetail]     = useState<{ report: Report; punches: ReportPunch[]; dispatchJobs: DispatchJob[] } | null>(null);
  const [loadingRep, setLoadingRep]   = useState(false);
  const [repDtCache, setRepDtCache]   = useState<Record<string, number>>({});

  async function loadReports() {
    setLoading(true);
    const res = await fetch("/api/operations-center/atlas-ops/lawn/reports", { cache: "no-store" });
    const d = await res.json();
    setReports(d.data ?? []);
    setLoading(false);
  }

  useEffect(() => { loadReports(); }, []);

  // Cache DT cost per report once dispatch data is loaded
  useEffect(() => {
    if (!repDetail) return;
    const jobs: Job[] = (repDetail.report.lawn_production_jobs ?? []).map(j => ({
      ...j,
      members: (j.lawn_production_members ?? []) as Member[],
    }));
    const persons = buildPersonView(jobs, repDetail.punches);
    if (persons.length === 0) return;
    const total = persons.reduce((s, p) => {
      const dr = repDetail.dispatchJobs.length ? calcDownTime(p, repDetail.dispatchJobs) : null;
      const downHrs = dr ? dr.totalMs / 3600000 : null;
      return s + ((p.payroll_cost && p.total_payroll_hours && downHrs != null) ? (p.payroll_cost / p.total_payroll_hours) * downHrs : 0);
    }, 0);
    setRepDtCache(prev => ({ ...prev, [repDetail.report.id]: total }));
  }, [repDetail]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaveFile(file);
    setPreview(null);
    setError(null);
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("dry_run", "true");
      fd.append("tz_offset", String(new Date().getTimezoneOffset()));
      const res = await fetch("/api/operations-center/atlas-ops/lawn/import", { method: "POST", body: fd });
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
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", saveFile);
      fd.append("dry_run", "false");
      fd.append("tz_offset", String(new Date().getTimezoneOffset()));
      const res = await fetch("/api/operations-center/atlas-ops/lawn/import", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Import failed");
      setPreview(null);
      setSaveFile(null);
      await loadReports();
      // If dispatch, refresh expanded report if date matches
      if (d.report_type === "dispatch" && expandedRep && repDetail) {
        void loadDispatch(repDetail.report.report_date);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function loadDispatch(date: string): Promise<DispatchJob[]> {
    const res = await fetch(`/api/operations-center/atlas-ops/lawn/dispatch?date=${date}`, { cache: "no-store" });
    const d = await res.json();
    return d.data ?? [];
  }

  async function toggleReport(id: string, date: string) {
    if (expandedRep === id) { setExpandedRep(null); setRepDetail(null); return; }
    setExpandedRep(id);
    setRepDetail(null);
    setLoadingRep(true);
    const [repRes, dispatchJobs] = await Promise.all([
      fetch(`/api/operations-center/atlas-ops/lawn/reports?id=${id}`, { cache: "no-store" }).then(r => r.json()),
      loadDispatch(date),
    ]);
    setRepDetail(repRes.data ? { report: repRes.data, punches: repRes.punches ?? [], dispatchJobs } : null);
    setLoadingRep(false);
  }

  async function deleteReport(id: string) {
    if (!confirm("Delete this report? This cannot be undone.")) return;
    await fetch(`/api/operations-center/atlas-ops/lawn/reports?id=${id}`, { method: "DELETE" });
    if (expandedRep === id) { setExpandedRep(null); setRepDetail(null); }
    await loadReports();
  }

  async function refreshDispatch() {
    if (!repDetail) return;
    const jobs = await loadDispatch(repDetail.report.report_date);
    setRepDetail(prev => prev ? { ...prev, dispatchJobs: jobs } : null);
  }

  const isDispatchPreview = preview?.report_type === "dispatch";
  const previewJobs  = preview?.jobs ?? [];
  const repJobs: Job[] = (repDetail?.report.lawn_production_jobs ?? []).map(j => ({
    ...j,
    members: (j.lawn_production_members ?? []) as Member[],
  }));
  const repPersons = repDetail ? buildPersonView(repJobs, repDetail.punches) : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="mx-auto max-w-[1400px] px-4 md:px-6 py-6 md:py-8">

        {/* Header */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-emerald-950">Lawn Operations</h1>
            <p className="text-sm text-emerald-900/60 mt-0.5">SAP Daily Production · Service AutoPilot Dispatch</p>
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={handleFile} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={parsing || saving}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-60"
            >
              {parsing ? "Parsing…" : "Import Report"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        {/* Preview */}
        {preview && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-emerald-100 bg-emerald-50/60">
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-emerald-950">
                    {isDispatchPreview ? "Dispatch Board Preview" : "Production Report Preview"} — {preview.file_name}
                  </div>
                  {isDispatchPreview && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">Dispatch</span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-emerald-900/60">
                  {fmtDate(preview.report_date ?? previewJobs[0]?.service_date ?? "")}
                  {isDispatchPreview
                    ? ` · ${previewJobs.length} jobs · ${preview.varies_count} varies`
                    : ` · ${previewJobs.length} jobs`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setPreview(null); setSaveFile(null); }}
                  className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-50">
                  Cancel
                </button>
                <button onClick={confirmImport} disabled={saving}
                  className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
                  {saving ? "Saving…" : "Confirm Import"}
                </button>
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
                      <th className="px-3 py-2.5 text-right">Start</th>
                      <th className="px-3 py-2.5 text-right">End</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(previewJobs as DispatchJob[]).map((j, i) => (
                      <tr key={i} className={`border-t border-emerald-100 ${j.time_varies ? "bg-amber-50/40" : ""}`}>
                        <td className="px-4 py-2 font-medium text-emerald-950">{j.client_name}</td>
                        <td className="px-3 py-2 text-gray-600">{j.city}</td>
                        <td className="px-3 py-2 text-gray-600">{j.service}</td>
                        <td className="px-3 py-2 text-gray-600">{j.crew_code}</td>
                        <td className="px-3 py-2 text-right text-gray-600">
                          {j.time_varies ? <span className="text-amber-600 font-medium text-xs">Varies ⚠</span> : fmtTime(j.start_time)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600">
                          {j.time_varies ? "—" : fmtTime(j.end_time)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <>
                <PersonTable jobs={previewJobs} punches={preview.punches ?? []} dispatchJobs={[]} />
                {preview.debug && (
                  <div className="px-5 py-3 border-t border-emerald-100 bg-gray-50 text-xs font-mono text-gray-500">
                    Punches found: <strong>{String(preview.debug.punchRowsFound ?? 0)}</strong> &nbsp;|&nbsp;
                    Matched employees: <strong>{String(preview.debug.matchedEmpIds ?? 0)}</strong>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Reports list */}
        <div className="rounded-xl border border-emerald-100 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-emerald-100 bg-emerald-50/60 px-5 py-3">
            <div className="text-sm font-semibold text-emerald-950">Imported Reports</div>
          </div>

          {loading ? (
            <div className="px-5 py-10 text-center text-sm text-emerald-900/50">Loading…</div>
          ) : reports.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-emerald-900/50">No reports imported yet.</div>
          ) : (
            <div className="divide-y divide-emerald-100">
              {/* Header — grid must match data row grid exactly */}
              <div className="grid grid-cols-[1fr_5rem_7rem_6rem_5rem_6rem_4rem] items-center text-xs font-semibold text-emerald-900/60 bg-emerald-50/40 px-4 py-2.5">
                <div>Date</div>
                <div className="text-right">Total Hrs</div>
                <div className="text-right">Revenue</div>
                <div className="text-right">DT Cost</div>
                <div className="text-right">Labor %</div>
                <div className="text-right">Efficiency</div>
                <div />
              </div>
              {reports.map(r => {
                const isOpen = expandedRep === r.id;
                const payForMetrics = (isOpen && repDetail) ? repPersons.reduce((s, p) => s + (p.payroll_cost ?? 0), 0) : (r.total_payroll_cost ?? 0);
                const revForMetrics = (isOpen && repDetail) ? repPersons.reduce((s, p) => s + p.total_revenue, 0) : (r.total_budgeted_amount ?? 0);
                const laborPct = (payForMetrics > 0 && revForMetrics > 0) ? payForMetrics / revForMetrics : null;
                const effPct   = (payForMetrics > 0 && revForMetrics > 0) ? (revForMetrics * 0.39) / payForMetrics : null;
                // Live when expanded, cached after collapse
                const liveDtCost = (isOpen && repDetail) ? repPersons.reduce((s, p) => {
                  const dr = repDetail.dispatchJobs.length ? calcDownTime(p, repDetail.dispatchJobs) : null;
                  const downHrs = dr ? dr.totalMs / 3600000 : null;
                  return s + ((p.payroll_cost && p.total_payroll_hours && downHrs != null) ? (p.payroll_cost / p.total_payroll_hours) * downHrs : 0);
                }, 0) : null;
                const dtCost = liveDtCost ?? repDtCache[r.id] ?? null;

                return (
                  <div key={r.id}>
                    {/* Summary row — same grid as header */}
                    <div className={`grid grid-cols-[1fr_5rem_7rem_6rem_5rem_6rem_4rem] items-center text-sm px-4 py-2.5 hover:bg-emerald-50/30 ${isOpen ? "bg-emerald-50/20" : ""}`}>
                      <div className="min-w-0">
                        <button onClick={() => toggleReport(r.id, r.report_date)} className="flex items-center gap-2 text-left">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round"
                            className={`shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}>
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                          <span className="font-medium text-emerald-950">{fmtDate(r.report_date)}</span>
                        </button>
                      </div>
                      <div className="text-right text-gray-700">{dec2(r.total_actual_hours)}</div>
                      <div className="text-right text-gray-700">{money.format(r.total_budgeted_amount)}</div>
                      <div className="text-right text-gray-700">{dtCost != null && dtCost > 0 ? money.format(dtCost) : "—"}</div>
                      <div className="text-right">
                        {laborPct != null ? <span className={laborPct > 0.39 ? "text-red-600 font-medium" : "text-emerald-700 font-medium"}>{pct(laborPct)}</span> : "—"}
                      </div>
                      <div className="text-right">
                        {effPct != null ? <span className={effPct >= 1 ? "text-emerald-700 font-medium" : "text-red-600 font-medium"}>{pct(effPct)}</span> : "—"}
                      </div>
                      <div className="text-right">
                        <button onClick={() => deleteReport(r.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
                      </div>
                    </div>
                    {/* Expanded detail */}
                    {isOpen && (
                      <div className="border-t border-emerald-100 overflow-x-auto">
                        {loadingRep ? (
                          <div className="px-6 py-4 text-sm text-emerald-900/50">Loading…</div>
                        ) : repDetail ? (
                          <>
                            <PersonTable jobs={repJobs} punches={repDetail.punches} dispatchJobs={repDetail.dispatchJobs} />
                            <VariesPanel
                              dispatchJobs={repDetail.dispatchJobs}
                              persons={repPersons}
                              reportDate={repDetail.report.report_date}
                              onSaved={refreshDispatch}
                            />
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
