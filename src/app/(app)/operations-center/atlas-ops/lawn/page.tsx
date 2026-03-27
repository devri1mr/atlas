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
  dt_hours: number | null;
};

type Report = {
  id: string;
  report_date: string;
  file_name: string | null;
  imported_at: string;
  total_budgeted_hours: number;
  total_actual_hours: number;
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

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const dec2 = (n: number | null | undefined) => Number(n ?? 0).toFixed(2);
const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtTime = (iso: string | null | undefined) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
};

// "First Last" → "Last, First"
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
      // Payroll data is day-level — take from first occurrence
      if (p.reg_hours === null && m.reg_hours != null) p.reg_hours = m.reg_hours;
      if (p.ot_hours === null && m.ot_hours != null)   p.ot_hours = m.ot_hours;
      if (p.total_payroll_hours === null && m.total_payroll_hours != null) p.total_payroll_hours = m.total_payroll_hours;
      if (p.payroll_cost === null && m.payroll_cost != null) p.payroll_cost = m.payroll_cost;
      p.jobs.push({ client_name: job.client_name, service: job.service, actual_hours: m.actual_hours, earned_amount: m.earned_amount });
    }
  }

  // Attach punch records to each person
  for (const punch of punches) {
    const entry = punch.employee_id
      ? [...map.values()].find(p => p.employee_id === punch.employee_id)
      : map.get(punch.resource_name);
    if (entry) entry.punches.push(punch);
  }

  return [...map.values()].sort((a, b) => formatName(a.resource_name).localeCompare(formatName(b.resource_name)));
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PunchStatus }) {
  if (status === "matched") return (
    <span className="inline-flex items-center gap-1 text-emerald-700">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
    </span>
  );
  if (status === "no_punch") return (
    <span className="inline-flex items-center gap-1 text-amber-500" title="No Lawn punch found for this date">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-red-500" title="Not found in Atlas">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </span>
  );
}

// ── Person table ──────────────────────────────────────────────────────────────

function PersonTable({ jobs, punches }: { jobs: Job[]; punches: ReportPunch[] }) {
  const persons = buildPersonView(jobs, punches);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(name: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  const totalProdHrs  = persons.reduce((s, p) => s + p.total_hours, 0);
  const totalRev      = persons.reduce((s, p) => s + p.total_revenue, 0);
  const totalPayHrs   = persons.reduce((s, p) => s + (p.total_payroll_hours ?? 0), 0);
  const totalPayCost  = persons.reduce((s, p) => s + (p.payroll_cost ?? 0), 0);
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
        <table className="w-full text-sm border-collapse min-w-[900px]">
          <thead>
            <tr className="text-left text-xs font-semibold text-emerald-900/60 bg-emerald-50/40">
              <th className="px-4 py-2.5">Team Member</th>
              <th className="px-3 py-2.5 text-right">Prod Hrs</th>
              <th className="px-3 py-2.5 text-right">Revenue</th>
              <th className="px-3 py-2.5 text-right border-l border-emerald-100">Clock In</th>
              <th className="px-3 py-2.5 text-right">Clock Out</th>
              <th className="px-3 py-2.5 text-right border-l border-emerald-100">Reg Hrs</th>
              <th className="px-3 py-2.5 text-right">OT Hrs</th>
              <th className="px-3 py-2.5 text-right">Total Hrs</th>
              <th className="px-3 py-2.5 text-right">Pay Cost</th>
            </tr>
          </thead>
          <tbody>
            {persons.map(p => {
              const isOpen = expanded.has(p.resource_name);
              // For clock times: show earliest in / latest out across all punches
              const clockIns  = p.punches.map(x => x.clock_in_at).filter(Boolean) as string[];
              const clockOuts = p.punches.map(x => x.clock_out_at).filter(Boolean) as string[];
              const firstIn   = clockIns.length  ? clockIns.sort()[0]                        : null;
              const lastOut   = clockOuts.length ? clockOuts.sort().reverse()[0]              : null;
              const multiPunch = p.punches.length > 1;

              return (
                <React.Fragment key={p.resource_name}>
                  <tr
                    className="border-t border-emerald-100 hover:bg-emerald-50/30 cursor-pointer"
                    onClick={() => toggle(p.resource_name)}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                          strokeLinecap="round" strokeLinejoin="round"
                          className={`shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                        <StatusBadge status={p.punch_status} />
                        <span className="font-medium text-emerald-950">{formatName(p.resource_name)}</span>
                        {p.punch_status === "no_punch" && (
                          <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">No punch</span>
                        )}
                        {p.punch_status === "unrecognized" && (
                          <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Unrecognized</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-emerald-950">{dec2(p.total_hours)}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-emerald-950">{money.format(p.total_revenue)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-600 border-l border-emerald-100">
                      <span>{fmtTime(firstIn)}</span>
                      {multiPunch && <span className="ml-1 text-xs text-gray-400">+{p.punches.length - 1}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{fmtTime(lastOut)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700 border-l border-emerald-100">{p.reg_hours != null ? dec2(p.reg_hours) : "—"}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700">{p.ot_hours != null ? dec2(p.ot_hours) : "—"}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-emerald-950">{p.total_payroll_hours != null ? dec2(p.total_payroll_hours) : "—"}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-emerald-950">{p.payroll_cost != null ? money.format(p.payroll_cost) : "—"}</td>
                  </tr>
                  {isOpen && (
                    <>
                      {/* Individual punch rows if multiple */}
                      {multiPunch && p.punches.map((punch, pi) => (
                        <tr key={`punch-${pi}`} className="border-t border-blue-50 bg-blue-50/30">
                          <td className="pl-12 pr-3 py-1.5 text-xs text-blue-600" colSpan={2}>
                            Punch {pi + 1}
                          </td>
                          <td className="px-3 py-1.5" />
                          <td className="px-3 py-1.5 text-xs text-right text-blue-600 border-l border-emerald-100">{fmtTime(punch.clock_in_at)}</td>
                          <td className="px-3 py-1.5 text-xs text-right text-blue-600">{fmtTime(punch.clock_out_at)}</td>
                          <td className="px-3 py-1.5 text-xs text-right text-blue-600 border-l border-emerald-100">{dec2(punch.regular_hours)}</td>
                          <td className="px-3 py-1.5 text-xs text-right text-blue-600">{dec2(punch.ot_hours)}</td>
                          <td className="px-3 py-1.5" colSpan={2} />
                        </tr>
                      ))}
                      {/* Job sub-rows */}
                      {p.jobs.map((j, i) => (
                        <tr key={`job-${i}`} className="border-t border-gray-100 bg-gray-50/50">
                          <td className="pl-12 pr-3 py-2 text-xs text-gray-700">
                            <span className="font-medium">{j.client_name}</span>
                            <span className="text-gray-400 mx-1.5">·</span>
                            <span>{j.service}</span>
                          </td>
                          <td className="px-3 py-2 text-xs text-right text-gray-600">{dec2(j.actual_hours)}</td>
                          <td className="px-3 py-2 text-xs text-right text-gray-600">{money.format(j.earned_amount)}</td>
                          <td colSpan={6} />
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
              <td className="px-3 py-2.5 border-l border-emerald-100" colSpan={2} />
              <td className="px-3 py-2.5 border-l border-emerald-100" />
              <td className="px-3 py-2.5" />
              <td className="px-3 py-2.5 text-sm text-right">{dec2(totalPayHrs)}</td>
              <td className="px-3 py-2.5 text-sm text-right">{money.format(totalPayCost)}</td>
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
  const [preview, setPreview]         = useState<{ jobs: Job[]; file_name: string; debug?: Record<string, unknown> } | null>(null);
  const [parsing, setParsing]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [saveFile, setSaveFile]       = useState<File | null>(null);
  const [expandedRep, setExpandedRep] = useState<string | null>(null);
  const [repDetail, setRepDetail]     = useState<{ report: Report; punches: ReportPunch[] } | null>(null);
  const [loadingRep, setLoadingRep]   = useState(false);

  async function loadReports() {
    setLoading(true);
    const res = await fetch("/api/operations-center/atlas-ops/lawn/reports", { cache: "no-store" });
    const d = await res.json();
    setReports(d.data ?? []);
    setLoading(false);
  }

  useEffect(() => { loadReports(); }, []);

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
      const res = await fetch("/api/operations-center/atlas-ops/lawn/import", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Import failed");
      setPreview(null);
      setSaveFile(null);
      await loadReports();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleReport(id: string) {
    if (expandedRep === id) { setExpandedRep(null); setRepDetail(null); return; }
    setExpandedRep(id);
    setRepDetail(null);
    setLoadingRep(true);
    const res = await fetch(`/api/operations-center/atlas-ops/lawn/reports?id=${id}`, { cache: "no-store" });
    const d = await res.json();
    setRepDetail(d.data ? { report: d.data, punches: d.punches ?? [] } : null);
    setLoadingRep(false);
  }

  async function deleteReport(id: string) {
    if (!confirm("Delete this report? This cannot be undone.")) return;
    await fetch(`/api/operations-center/atlas-ops/lawn/reports?id=${id}`, { method: "DELETE" });
    if (expandedRep === id) { setExpandedRep(null); setRepDetail(null); }
    await loadReports();
  }

  const previewJobs = preview?.jobs ?? [];
  const repJobs: Job[] = (repDetail?.report.lawn_production_jobs ?? []).map(j => ({
    ...j,
    members: (j.lawn_production_members ?? []) as Member[],
  }));

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="mx-auto max-w-6xl px-4 md:px-6 py-6 md:py-8">

        {/* Header */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-emerald-950">Lawn Operations</h1>
            <p className="text-sm text-emerald-900/60 mt-0.5">SAP Daily Production Reports</p>
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={handleFile} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={parsing || saving}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-60"
            >
              {parsing ? "Parsing…" : "Import SAP Report"}
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
                <div className="text-sm font-semibold text-emerald-950">Preview — {preview.file_name}</div>
                <div className="mt-0.5 text-xs text-emerald-900/60">
                  {fmtDate(previewJobs[0]?.service_date ?? "")} · {previewJobs.length} jobs
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setPreview(null); setSaveFile(null); }}
                  className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmImport}
                  disabled={saving}
                  className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Confirm Import"}
                </button>
              </div>
            </div>
            <PersonTable jobs={previewJobs} punches={[]} />
            {preview.debug && (
              <div className="px-5 py-3 border-t border-emerald-100 bg-gray-50 text-xs font-mono text-gray-500 space-y-0.5">
                <div>Total row found: <strong>{String(preview.debug.totalRowFound)}</strong></div>
                <div>SAP grand total hrs: <strong>{String(preview.debug.grandTotalHrs)}</strong></div>
                <div>Sum of job summary hrs: <strong>{String(preview.debug.sumJobHrs)}</strong></div>
                <div>Total row cols: <strong>{JSON.stringify(preview.debug.totalRowCols)}</strong></div>
              </div>
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
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-xs font-semibold text-emerald-900/60 bg-emerald-50/40">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-3 py-2.5">File</th>
                  <th className="px-3 py-2.5 text-right">Total Hrs</th>
                  <th className="px-3 py-2.5 text-right">Revenue</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {reports.map(r => {
                  const isOpen = expandedRep === r.id;
                  return (
                    <React.Fragment key={r.id}>
                      <tr className="border-t border-emerald-100 hover:bg-emerald-50/30">
                        <td className="px-4 py-2.5">
                          <button onClick={() => toggleReport(r.id)} className="flex items-center gap-2 text-left">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                              strokeLinecap="round" strokeLinejoin="round"
                              className={`shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}>
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                            <span className="font-medium text-emerald-950">{fmtDate(r.report_date)}</span>
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-500">{r.file_name ?? "—"}</td>
                        <td className="px-3 py-2.5 text-right text-gray-700">{dec2(r.total_actual_hours)}</td>
                        <td className="px-3 py-2.5 text-right text-gray-700">{money.format(r.total_budgeted_amount)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <button onClick={() => deleteReport(r.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={5} className="px-0 pb-0 border-t border-emerald-100">
                            {loadingRep ? (
                              <div className="px-6 py-4 text-sm text-emerald-900/50">Loading…</div>
                            ) : repDetail ? (
                              <PersonTable jobs={repJobs} punches={repDetail.punches} />
                            ) : null}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  );
}
