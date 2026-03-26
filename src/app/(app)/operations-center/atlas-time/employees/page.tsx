"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AccessGate from "@/components/AccessGate";

type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  middle_initial: string | null;
  preferred_name: string | null;
  hire_date: string;
  job_title: string | null;
  pay_type: string;
  default_pay_rate: number | null;
  status: string;
  phone: string | null;
  work_email: string | null;
  kiosk_pin: string | null;
  at_departments: { id: string; name: string } | null;
  divisions: { id: string; name: string } | null;
};

const STATUS_COLORS: Record<string, string> = {
  active:     "bg-green-50 text-green-700 border-green-200",
  inactive:   "bg-gray-100 text-gray-500 border-gray-200",
  terminated: "bg-red-50 text-red-600 border-red-200",
  on_leave:   "bg-amber-50 text-amber-700 border-amber-200",
};
const STATUS_LABELS: Record<string, string> = {
  active: "Active", inactive: "Inactive", terminated: "Terminated", on_leave: "On Leave",
};
const STATUSES = ["active", "inactive", "on_leave", "terminated"] as const;

function initials(emp: Employee) {
  return `${emp.first_name[0] ?? ""}${emp.last_name[0] ?? ""}`.toUpperCase();
}
function displayName(emp: Employee) {
  const mi = emp.middle_initial ? ` ${emp.middle_initial}.` : "";
  return `${emp.last_name}, ${emp.first_name}${mi}`;
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}
function yearsService(hireDate: string): string {
  const hire = new Date(hireDate);
  const now = new Date();
  const yrs = (now.getTime() - hire.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  if (yrs < 1) return `${Math.floor(yrs * 12)}mo`;
  return `${Math.floor(yrs)}yr`;
}

const DEFAULT_COLS = {
  status: true, job_title: true, department: true, division: true,
  hire_date: true, years: true, pay_rate: true, phone: false, email: false,
};
type ColKey = keyof typeof DEFAULT_COLS;

function useTeamCols() {
  const [cols, setCols] = useState(DEFAULT_COLS);
  useEffect(() => {
    function read() {
      try {
        const saved = localStorage.getItem("tm-list-cols");
        if (saved) setCols({ ...DEFAULT_COLS, ...JSON.parse(saved) });
      } catch {}
    }
    read();
    function onStorage(e: StorageEvent) { if (e.key === "tm-list-cols") read(); }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return cols;
}

export default function EmployeesPage() {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("active");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [statusMenuFor, setStatusMenuFor] = useState<string | null>(null);
  const [showPins, setShowPins] = useState(false);
  const cols = useTeamCols();
  const menuRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/atlas-time/employees", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to load employees");
      setEmployees(json.employees ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load employees");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Close inline status menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setStatusMenuFor(null);
      }
    }
    if (statusMenuFor) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [statusMenuFor]);

  const filtered = employees.filter((e) => {
    const matchesStatus = filterStatus === "all" || e.status === filterStatus;
    const q = search.toLowerCase();
    const matchesSearch = !q ||
      e.first_name.toLowerCase().includes(q) ||
      e.last_name.toLowerCase().includes(q) ||
      (e.preferred_name?.toLowerCase().includes(q)) ||
      (e.job_title?.toLowerCase().includes(q)) ||
      (e.at_departments?.name.toLowerCase().includes(q)) ||
      (e.divisions?.name.toLowerCase().includes(q)) ||
      (e.phone?.includes(q));
    return matchesStatus && matchesSearch;
  });

  const counts = {
    all: employees.length,
    active: employees.filter(e => e.status === "active").length,
    inactive: employees.filter(e => e.status === "inactive").length,
    terminated: employees.filter(e => e.status === "terminated").length,
    on_leave: employees.filter(e => e.status === "on_leave").length,
  };

  const allFilteredIds = filtered.map(e => e.id);
  const allChecked = allFilteredIds.length > 0 && allFilteredIds.every(id => selected.has(id));
  const someChecked = !allChecked && allFilteredIds.some(id => selected.has(id));

  function toggleAll() {
    if (allChecked) {
      setSelected(prev => { const n = new Set(prev); allFilteredIds.forEach(id => n.delete(id)); return n; });
    } else {
      setSelected(prev => new Set([...prev, ...allFilteredIds]));
    }
  }
  function toggleOne(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function bulkSetStatus(status: string) {
    const ids = [...selected];
    setBulkLoading(true);
    try {
      const res = await fetch("/api/atlas-time/employees/bulk-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action: status }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Failed");
      setEmployees(prev => prev.map(e => selected.has(e.id) ? { ...e, status } : e));
      setSelected(new Set());
    } catch (e: any) {
      setError(e?.message ?? "Bulk update failed");
    } finally {
      setBulkLoading(false);
    }
  }

  async function setSingleStatus(id: string, status: string) {
    setStatusMenuFor(null);
    try {
      const res = await fetch("/api/atlas-time/employees/bulk-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id], action: status }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Failed");
      setEmployees(prev => prev.map(e => e.id === id ? { ...e, status } : e));
    } catch (e: any) {
      setError(e?.message ?? "Update failed");
    }
  }

  return (
    <AccessGate permKey="hr_team_view">
    <div className="min-h-screen bg-[#f0f4f0] pb-28">

      {/* Header */}
      <div className="px-4 md:px-8 py-6 md:py-8" style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 text-white/50 text-xs mb-2">
            <Link href="/operations-center" className="hover:text-white/80 transition-colors">Operations Center</Link>
            <span>/</span>
            <Link href="/operations-center/atlas-time" className="hover:text-white/80 transition-colors">Atlas HR</Link>
            <span>/</span>
            <span className="text-white/80">Team Members</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Team Members</h1>
              <p className="text-white/50 text-sm mt-1">{counts.active} active · {employees.length} total</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowPins(v => !v)}
                title={showPins ? "Hide PINs" : "Reveal PINs"}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-xl border transition-colors ${showPins ? "bg-white/20 text-white border-white/30" : "bg-white/10 hover:bg-white/20 text-white/70 border-white/20"}`}
              >
                {showPins
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
                PINs
              </button>
              <Link
                href="/operations-center/atlas-time/employees/new"
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors border border-white/20"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add Team Member
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-5 max-w-7xl mx-auto space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
            {error}
            <button onClick={() => setError("")} className="text-red-400 hover:text-red-600 ml-4">✕</button>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search name, title, department, division…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 shrink-0">
            {(["all","active","inactive","on_leave","terminated"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  filterStatus === s ? "bg-[#123b1f] text-white" : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {s === "all" ? "All" : STATUS_LABELS[s]} {counts[s] > 0 && <span className="opacity-60">({counts[s]})</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-4 h-4 bg-gray-100 rounded animate-pulse shrink-0" />
                <div className="w-10 h-10 bg-gray-100 rounded-xl animate-pulse shrink-0" />
                <div className="flex-1 grid grid-cols-5 gap-3">
                  {[1,2,3,4,5].map(j => <div key={j} className="h-3.5 bg-gray-100 rounded animate-pulse" />)}
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-12 text-center">
            <p className="text-sm text-gray-400">{search ? "No team members match your search." : "No team members yet."}</p>
            {!search && (
              <Link href="/operations-center/atlas-time/employees/new" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#123b1f] hover:underline">
                Add your first team member
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        ref={el => { if (el) el.indeterminate = someChecked; }}
                        onChange={toggleAll}
                        className="w-4 h-4 rounded accent-[#123b1f] cursor-pointer"
                      />
                    </th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap w-12"></th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Name</th>
                    {cols.status     && <th className="text-left px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Status</th>}
                    {cols.job_title  && <th className="text-left px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Title</th>}
                    {cols.department && <th className="text-left px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Dept</th>}
                    {cols.division   && <th className="text-left px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Division</th>}
                    {showPins        && <th className="text-left px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">PIN</th>}
                    {cols.pay_rate   && <th className="text-right px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Pay Rate</th>}
                    {cols.hire_date  && <th className="text-right px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Hired</th>}
                    {cols.years      && <th className="text-right px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Tenure</th>}
                    {cols.phone      && <th className="text-left px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Phone</th>}
                    {cols.email      && <th className="text-left px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Email</th>}
                    <th className="w-12 px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((emp) => {
                    const isSelected = selected.has(emp.id);
                    return (
                      <tr
                        key={emp.id}
                        className={`group transition-colors ${isSelected ? "bg-green-50/40" : "hover:bg-gray-50/60"}`}
                      >
                        {/* Checkbox */}
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleOne(emp.id)}
                            className="w-4 h-4 rounded accent-[#123b1f] cursor-pointer"
                          />
                        </td>

                        {/* Avatar */}
                        <td className="px-3 py-3">
                          <Link href={`/operations-center/atlas-time/employees/${emp.id}`} className="block">
                            <div className="w-9 h-9 rounded-xl bg-[#123b1f]/10 flex items-center justify-center text-[#123b1f] font-bold text-xs shrink-0">
                              {initials(emp)}
                            </div>
                          </Link>
                        </td>

                        {/* Name */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          <Link href={`/operations-center/atlas-time/employees/${emp.id}`} className="font-semibold text-gray-900 group-hover:text-[#123b1f] transition-colors">
                            {displayName(emp)}
                          </Link>
                        </td>

                        {/* Status — clickable dropdown */}
                        {cols.status && (
                          <td className="px-3 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                            <div className="relative inline-block">
                              <button
                                onClick={() => setStatusMenuFor(statusMenuFor === emp.id ? null : emp.id)}
                                className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-all hover:opacity-80 ${STATUS_COLORS[emp.status] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}
                              >
                                {STATUS_LABELS[emp.status] ?? emp.status}
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                              </button>
                              {statusMenuFor === emp.id && (
                                <div ref={menuRef} className="absolute left-0 top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-gray-100 py-1 min-w-[140px]">
                                  {STATUSES.map(s => (
                                    <button
                                      key={s}
                                      onClick={() => setSingleStatus(emp.id, s)}
                                      className={`w-full text-left px-3.5 py-2 text-xs font-semibold hover:bg-gray-50 transition-colors flex items-center gap-2 ${emp.status === s ? "opacity-40 cursor-default" : ""}`}
                                      disabled={emp.status === s}
                                    >
                                      <span className={`w-2 h-2 rounded-full ${s === "active" ? "bg-green-500" : s === "inactive" ? "bg-gray-400" : s === "on_leave" ? "bg-amber-400" : "bg-red-400"}`} />
                                      {STATUS_LABELS[s]}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        )}

                        {cols.job_title  && <td className="px-3 py-3 whitespace-nowrap text-gray-600 text-xs">{emp.job_title ?? <span className="text-gray-300">—</span>}</td>}
                        {cols.department && <td className="px-3 py-3 whitespace-nowrap text-gray-500 text-xs">{emp.at_departments?.name ?? <span className="text-gray-300">—</span>}</td>}
                        {cols.division   && <td className="px-3 py-3 whitespace-nowrap text-gray-500 text-xs">{emp.divisions?.name ?? <span className="text-gray-300">—</span>}</td>}
                        {showPins        && <td className="px-3 py-3 whitespace-nowrap text-xs font-mono">{emp.kiosk_pin ?? <span className="text-gray-300">—</span>}</td>}
                        {cols.pay_rate   && (
                          <td className="px-3 py-3 whitespace-nowrap text-right">
                            {emp.default_pay_rate != null
                              ? <span className="font-semibold text-gray-700 text-xs tabular-nums">${Number(emp.default_pay_rate).toFixed(2)}<span className="text-gray-400 font-normal">{emp.pay_type === "hourly" ? "/hr" : "/yr"}</span></span>
                              : <span className="text-gray-300 text-xs">—</span>
                            }
                          </td>
                        )}
                        {cols.hire_date  && <td className="px-3 py-3 whitespace-nowrap text-right text-xs text-gray-500 tabular-nums">{fmtDate(emp.hire_date)}</td>}
                        {cols.years      && <td className="px-3 py-3 whitespace-nowrap text-right text-xs text-gray-400 tabular-nums">{emp.hire_date ? yearsService(emp.hire_date) : "—"}</td>}
                        {cols.phone      && <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500">{emp.phone ?? <span className="text-gray-300">—</span>}</td>}
                        {cols.email      && <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500 truncate max-w-[160px]">{emp.work_email ?? <span className="text-gray-300">—</span>}</td>}

                        <td className="px-3 py-3 text-right">
                          <Link href={`/operations-center/atlas-time/employees/${emp.id}`} className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                            <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9L9 3M9 3H5M9 3v4"/></svg>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Table footer */}
            <div className="px-5 py-3 border-t border-gray-50 flex items-center justify-between text-xs text-gray-400 bg-gray-50/40">
              <span>{filtered.length} {filtered.length === 1 ? "member" : "members"}{filterStatus !== "all" ? ` · ${STATUS_LABELS[filterStatus] ?? filterStatus} filter` : ""}</span>
              {selected.size > 0 && (
                <button onClick={() => setSelected(new Set())} className="text-[#123b1f] font-semibold hover:underline">
                  Clear {selected.size} selected
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Floating bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-[#0d2616] text-white rounded-2xl shadow-2xl px-4 py-3 border border-white/10">
          <span className="text-sm font-semibold text-white/80 pr-2 border-r border-white/15 mr-1">
            {selected.size} selected
          </span>

          <span className="text-xs text-white/50 hidden sm:block">Set status:</span>

          {STATUSES.map(s => (
            <button
              key={s}
              onClick={() => bulkSetStatus(s)}
              disabled={bulkLoading}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 ${
                s === "active"     ? "bg-green-600 hover:bg-green-500 text-white" :
                s === "inactive"   ? "bg-gray-600 hover:bg-gray-500 text-white" :
                s === "on_leave"   ? "bg-amber-600 hover:bg-amber-500 text-white" :
                                     "bg-red-700 hover:bg-red-600 text-white"
              }`}
            >
              {bulkLoading ? (
                <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" /></svg>
              ) : (
                <span className={`w-1.5 h-1.5 rounded-full ${s === "active" ? "bg-green-300" : s === "inactive" ? "bg-gray-300" : s === "on_leave" ? "bg-amber-300" : "bg-red-300"}`} />
              )}
              {STATUS_LABELS[s]}
            </button>
          ))}

          <button
            onClick={() => setSelected(new Set())}
            className="ml-1 pl-3 border-l border-white/15 text-white/40 hover:text-white transition-colors"
            title="Clear selection"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}
    </div>
    </AccessGate>
  );
}
