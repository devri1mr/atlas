"use client";

import React, { useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Member = {
  resource_name: string;
  resource_code: string;
  employee_id: string | null;
  employee_name: string | null;
  actual_hours: number;
  earned_amount: number;
};

type Job = {
  id?: string;
  work_order: string;
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

// ── Formatters ────────────────────────────────────────────────────────────────

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const hrs = (n: number) => n == null ? "—" : Number(n).toFixed(2);
const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const varColor = (v: number) => v >= 0 ? "text-emerald-700" : "text-red-600";

// ── Sub-components ────────────────────────────────────────────────────────────

function MemberRow({ m }: { m: Member }) {
  const matched = !!m.employee_id;
  return (
    <tr className="border-t border-gray-100 bg-gray-50/40">
      <td className="pl-12 pr-3 py-2 text-xs text-gray-700">
        <span className={`inline-flex items-center gap-1.5 ${matched ? "text-emerald-700" : "text-red-600"}`}>
          {matched ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          )}
          {m.resource_name}
          {!matched && <span className="text-gray-400 font-normal">(unmatched)</span>}
        </span>
      </td>
      <td className="px-3 py-2 text-xs text-gray-500">{m.resource_code ?? ""}</td>
      <td className="px-3 py-2 text-xs text-gray-700 text-right">{hrs(m.actual_hours)}</td>
      <td className="px-3 py-2 text-xs text-gray-700 text-right" colSpan={4}>{money.format(m.earned_amount)}</td>
    </tr>
  );
}

function JobRow({ job, expanded, onToggle }: { job: Job; expanded: boolean; onToggle: () => void }) {
  const members: Member[] = job.members ?? job.lawn_production_members ?? [];
  const hasUnmatched = members.some(m => !m.employee_id);
  const variance = Number(job.variance_hours);

  return (
    <>
      <tr
        className="border-t border-emerald-100 hover:bg-emerald-50/30 cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
              className={`shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            <div>
              <div className="text-sm font-medium text-emerald-950">{job.client_name}</div>
              <div className="text-xs text-gray-400">{job.client_address}</div>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5 text-sm text-gray-700">{job.service}</td>
        <td className="px-3 py-2.5">
          <span className="inline-block rounded px-1.5 py-0.5 text-xs font-mono bg-gray-100 text-gray-600">{job.crew_code}</span>
        </td>
        <td className="px-3 py-2.5 text-sm text-right text-gray-700">{hrs(job.budgeted_hours)}</td>
        <td className="px-3 py-2.5 text-sm text-right text-gray-700">{hrs(job.actual_hours)}</td>
        <td className={`px-3 py-2.5 text-sm text-right font-medium ${varColor(variance)}`}>
          {variance >= 0 ? "+" : ""}{hrs(variance)}
        </td>
        <td className="px-3 py-2.5 text-sm text-right text-gray-700">{money.format(job.budgeted_amount)}</td>
        <td className="px-3 py-2.5 text-right">
          <div className="flex items-center justify-end gap-1">
            {hasUnmatched && (
              <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                {members.filter(m => !m.employee_id).length} unmatched
              </span>
            )}
            <span className="text-xs text-gray-400">{members.length}</span>
          </div>
        </td>
      </tr>
      {expanded && members.map((m, i) => <MemberRow key={i} m={m} />)}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LawnPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [reports, setReports]       = useState<Report[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  // Preview state
  const [preview, setPreview]       = useState<{ jobs: Job[]; file_name: string } | null>(null);
  const [parsing, setParsing]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [saveFile, setSaveFile]     = useState<File | null>(null);

  // Expanded rows
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());
  const [expandedRep, setExpandedRep] = useState<string | null>(null);
  const [repDetail, setRepDetail]   = useState<Report | null>(null);
  const [loadingRep, setLoadingRep] = useState(false);

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
    setExpanded(new Set());
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
    if (expandedRep === id) {
      setExpandedRep(null);
      setRepDetail(null);
      return;
    }
    setExpandedRep(id);
    setRepDetail(null);
    setLoadingRep(true);
    const res = await fetch(`/api/operations-center/atlas-ops/lawn/reports?id=${id}`, { cache: "no-store" });
    const d = await res.json();
    setRepDetail(d.data ?? null);
    setLoadingRep(false);
  }

  async function deleteReport(id: string) {
    if (!confirm("Delete this report? This cannot be undone.")) return;
    await fetch(`/api/operations-center/atlas-ops/lawn/reports?id=${id}`, { method: "DELETE" });
    if (expandedRep === id) { setExpandedRep(null); setRepDetail(null); }
    await loadReports();
  }

  function toggleJob(key: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const previewJobs = preview?.jobs ?? [];
  const unmatchedCount = previewJobs.flatMap(j => j.members).filter(m => !m.employee_id).length;
  const repJobs: Job[] = (repDetail?.lawn_production_jobs ?? []).map(j => ({
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

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        {/* Preview */}
        {preview && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-emerald-100 bg-emerald-50/60">
              <div>
                <div className="text-sm font-semibold text-emerald-950">
                  Preview — {preview.file_name}
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-xs text-emerald-900/60">
                  <span>{previewJobs.length} jobs</span>
                  <span>{fmtDate(previewJobs[0]?.service_date ?? "")}</span>
                  {unmatchedCount > 0 && (
                    <span className="text-amber-600 font-medium">{unmatchedCount} unmatched team members</span>
                  )}
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

            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-xs font-semibold text-emerald-900/60 bg-emerald-50/40">
                    <th className="px-4 py-2.5">Client</th>
                    <th className="px-3 py-2.5">Service</th>
                    <th className="px-3 py-2.5">Crew</th>
                    <th className="px-3 py-2.5 text-right">Budg Hrs</th>
                    <th className="px-3 py-2.5 text-right">Act Hrs</th>
                    <th className="px-3 py-2.5 text-right">Variance</th>
                    <th className="px-3 py-2.5 text-right">Revenue</th>
                    <th className="px-3 py-2.5 text-right">Members</th>
                  </tr>
                </thead>
                <tbody>
                  {previewJobs.map((job, i) => (
                    <JobRow
                      key={i}
                      job={job}
                      expanded={expanded.has(`preview-${i}`)}
                      onToggle={() => toggleJob(`preview-${i}`)}
                    />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-emerald-200 bg-emerald-50/60 font-semibold text-emerald-950">
                    <td className="px-4 py-2.5 text-sm" colSpan={3}>Total</td>
                    <td className="px-3 py-2.5 text-sm text-right">{hrs(previewJobs.reduce((s, j) => s + j.budgeted_hours, 0))}</td>
                    <td className="px-3 py-2.5 text-sm text-right">{hrs(previewJobs.reduce((s, j) => s + j.actual_hours, 0))}</td>
                    <td className={`px-3 py-2.5 text-sm text-right ${varColor(previewJobs.reduce((s, j) => s + j.variance_hours, 0))}`}>
                      {(() => { const v = previewJobs.reduce((s, j) => s + j.variance_hours, 0); return `${v >= 0 ? "+" : ""}${hrs(v)}`; })()}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-right">{money.format(previewJobs.reduce((s, j) => s + j.budgeted_amount, 0))}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-xs font-semibold text-emerald-900/60 bg-emerald-50/40">
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-3 py-2.5">File</th>
                    <th className="px-3 py-2.5 text-right">Budg Hrs</th>
                    <th className="px-3 py-2.5 text-right">Act Hrs</th>
                    <th className="px-3 py-2.5 text-right">Variance</th>
                    <th className="px-3 py-2.5 text-right">Revenue</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {reports.map(r => {
                    const isOpen = expandedRep === r.id;
                    const variance = Number(r.total_actual_hours) - Number(r.total_budgeted_hours);
                    return (
                      <React.Fragment key={r.id}>
                        <tr className="border-t border-emerald-100 hover:bg-emerald-50/30">
                          <td className="px-4 py-2.5">
                            <button
                              onClick={() => toggleReport(r.id)}
                              className="flex items-center gap-2 text-left"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                                strokeLinecap="round" strokeLinejoin="round"
                                className={`shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}>
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                              <span className="font-medium text-emerald-950">{fmtDate(r.report_date)}</span>
                            </button>
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 text-xs">{r.file_name ?? "—"}</td>
                          <td className="px-3 py-2.5 text-right text-gray-700">{hrs(r.total_budgeted_hours)}</td>
                          <td className="px-3 py-2.5 text-right text-gray-700">{hrs(r.total_actual_hours)}</td>
                          <td className={`px-3 py-2.5 text-right font-medium ${varColor(variance)}`}>
                            {variance >= 0 ? "+" : ""}{hrs(variance)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-700">{money.format(r.total_budgeted_amount)}</td>
                          <td className="px-3 py-2.5 text-right">
                            <button
                              onClick={() => deleteReport(r.id)}
                              className="text-xs text-red-500 hover:text-red-700"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>

                        {/* Expanded jobs */}
                        {isOpen && (
                          <tr>
                            <td colSpan={7} className="px-0 pb-0">
                              {loadingRep ? (
                                <div className="px-6 py-4 text-sm text-emerald-900/50">Loading…</div>
                              ) : repDetail ? (
                                <table className="w-full text-sm border-collapse">
                                  <thead>
                                    <tr className="text-left text-xs font-semibold text-emerald-900/50 bg-gray-50/80">
                                      <th className="px-4 py-2">Client</th>
                                      <th className="px-3 py-2">Service</th>
                                      <th className="px-3 py-2">Crew</th>
                                      <th className="px-3 py-2 text-right">Budg Hrs</th>
                                      <th className="px-3 py-2 text-right">Act Hrs</th>
                                      <th className="px-3 py-2 text-right">Variance</th>
                                      <th className="px-3 py-2 text-right">Act $</th>
                                      <th className="px-3 py-2 text-right">Members</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {repJobs.map((job, i) => (
                                      <JobRow
                                        key={job.id ?? i}
                                        job={job}
                                        expanded={expanded.has(`rep-${r.id}-${i}`)}
                                        onToggle={() => toggleJob(`rep-${r.id}-${i}`)}
                                      />
                                    ))}
                                  </tbody>
                                </table>
                              ) : null}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
