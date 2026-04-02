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
  photo_url: string | null;
  health_care_plan: string | null;
  drivers_license_expiration: string | null;
  dot_card_expiration: string | null;
  fert_license_expiration: string | null;
  cpr_expiration: string | null;
  first_aid_expiration: string | null;
  at_departments: { id: string; name: string } | null;
  divisions: { id: string; name: string } | null;
};

type PunchStatus = { is_clocked_in: boolean; last_active: string | null };

const CERT_LABELS: Record<string, string> = {
  drivers_license_expiration: "Driver License",
  dot_card_expiration: "DOT Card",
  fert_license_expiration: "Fert License",
  cpr_expiration: "CPR",
  first_aid_expiration: "First Aid",
};
const CERT_KEYS = Object.keys(CERT_LABELS) as (keyof Employee)[];

function certAlerts(emp: Employee): { label: string; daysLeft: number }[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return CERT_KEYS
    .filter(k => emp[k])
    .map(k => {
      const exp = new Date(emp[k] as string); exp.setHours(0, 0, 0, 0);
      return { label: CERT_LABELS[k], daysLeft: Math.ceil((exp.getTime() - today.getTime()) / 86_400_000) };
    })
    .filter(a => a.daysLeft <= 60)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

function relativeDate(iso: string | null): string {
  if (!iso) return "—";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(iso + "T00:00:00"); d.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days <= 6) return `${days}d ago`;
  if (days <= 30) return `${Math.floor(days / 7)}w ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

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

const DEFAULT_COLS = {
  job_title: true, department: true, division: true,
  clock_status: true, last_active: true, cert_alerts: true,
  hire_date: true, pay_rate: true, health_plan: true, phone: false, email: false,
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
  const [revealedPins, setRevealedPins] = useState<Set<string>>(new Set());
  const [punchStatus, setPunchStatus] = useState<Record<string, PunchStatus>>({});
  const [certPopupFor, setCertPopupFor] = useState<string | null>(null);
  const cols = useTeamCols();
  const menuRef = useRef<HTMLDivElement>(null);
  const certPopupRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      setLoading(true);
      setError("");
      const [empRes, psRes] = await Promise.all([
        fetch("/api/atlas-time/employees", { cache: "no-store" }),
        fetch("/api/atlas-time/employees/punch-status", { cache: "no-store" }),
      ]);
      const empJson = await empRes.json().catch(() => null);
      const psJson  = await psRes.json().catch(() => ({}));
      if (!empRes.ok) throw new Error(empJson?.error ?? "Failed to load employees");
      setEmployees(empJson.employees ?? []);
      setPunchStatus(psJson.status ?? {});
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

  // Close cert popup on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (certPopupRef.current && !certPopupRef.current.contains(e.target as Node)) {
        setCertPopupFor(null);
      }
    }
    if (certPopupFor) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [certPopupFor]);

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
            <span className="text-white/80">Roster</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Roster</h1>
              <p className="text-white/50 text-sm mt-1">{counts.active} active · {employees.length} total</p>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              <Link
                href="/operations-center/atlas-time/import"
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors border border-white/20"
                title="Import Team Members"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <span className="hidden sm:inline">Import</span>
              </Link>
              <Link
                href="/operations-center/atlas-time/employees/photo-round"
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors border border-white/20"
                title="Photo Round"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                <span className="hidden sm:inline">Photos</span>
              </Link>
              <Link
                href="/operations-center/atlas-time/employees/rate-setup"
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors border border-white/20"
                title="Rate Setup"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                <span className="hidden sm:inline">Rates</span>
              </Link>
              <Link
                href="/operations-center/atlas-time/employees/new"
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors border border-white/20"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                <span className="hidden sm:inline">Add Member</span>
                <span className="sm:hidden">Add</span>
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
          <div className="flex flex-wrap gap-1 bg-white border border-gray-200 rounded-xl p-1">
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
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        ref={el => { if (el) el.indeterminate = someChecked; }}
                        onChange={toggleAll}
                        className="w-4 h-4 rounded accent-[#123b1f] cursor-pointer"
                      />
                    </th>
                    <th className="px-3 py-3 w-12"></th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Name</th>
                    {cols.job_title    && <th className="hidden sm:table-cell text-center px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Title</th>}
                    {cols.department   && <th className="hidden lg:table-cell text-center px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Dept</th>}
                    {cols.division     && <th className="hidden sm:table-cell text-center px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Division</th>}
                    {cols.clock_status && <th className="text-center px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Clock</th>}
                    {cols.last_active  && <th className="hidden md:table-cell text-center px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Last Active</th>}
                    {cols.cert_alerts  && <th className="text-center px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Cert Alerts</th>}
                    {cols.pay_rate     && <th className="hidden md:table-cell text-center px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Pay Rate</th>}
                    {cols.hire_date    && <th className="hidden md:table-cell text-center px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Hired</th>}
                    {cols.health_plan  && <th className="hidden md:table-cell text-center px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Benefits</th>}
                    <th className="hidden sm:table-cell text-center px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">PIN</th>
                    {cols.phone        && <th className="hidden lg:table-cell text-left px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Phone</th>}
                    {cols.email        && <th className="hidden lg:table-cell text-left px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Email</th>}
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
                            <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0 bg-[#123b1f]/10 flex items-center justify-center">
                              {emp.photo_url
                                ? <img src={emp.photo_url} alt={initials(emp)} className="w-full h-full object-cover" />
                                : <span className="text-[#123b1f] font-bold text-xs">{initials(emp)}</span>
                              }
                            </div>
                          </Link>
                        </td>

                        {/* Name */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          <Link href={`/operations-center/atlas-time/employees/${emp.id}`} className="font-semibold text-gray-900 group-hover:text-[#123b1f] transition-colors">
                            {displayName(emp)}
                          </Link>
                        </td>

                        {cols.job_title  && <td className="hidden sm:table-cell px-3 py-3 whitespace-nowrap text-center text-gray-600 text-xs">{emp.job_title ?? <span className="text-gray-300">—</span>}</td>}
                        {cols.department && <td className="hidden lg:table-cell px-3 py-3 whitespace-nowrap text-center text-gray-500 text-xs">{emp.at_departments?.name ?? <span className="text-gray-300">—</span>}</td>}
                        {cols.division   && <td className="hidden sm:table-cell px-3 py-3 whitespace-nowrap text-center text-gray-500 text-xs">{emp.divisions?.name ?? <span className="text-gray-300">—</span>}</td>}

                        {/* Clock Status */}
                        {cols.clock_status && (
                          <td className="px-3 py-3 whitespace-nowrap text-center">
                            {punchStatus[emp.id]?.is_clocked_in
                              ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />Live
                                </span>
                              : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                        )}

                        {/* Last Active */}
                        {cols.last_active && (
                          <td className="hidden md:table-cell px-3 py-3 whitespace-nowrap text-center text-xs text-gray-500">
                            {relativeDate(punchStatus[emp.id]?.last_active ?? null)}
                          </td>
                        )}

                        {/* Cert Alerts */}
                        {cols.cert_alerts && (() => {
                          const alerts = certAlerts(emp);
                          if (alerts.length === 0) return <td className="px-3 py-3 text-center"><span className="text-gray-300 text-xs">—</span></td>;
                          const hasExpired = alerts.some(a => a.daysLeft < 0);
                          const badgeColor = hasExpired
                            ? "bg-red-100 text-red-600 hover:bg-red-200 border border-red-200"
                            : "bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200";
                          return (
                            <td className="px-3 py-3 whitespace-nowrap text-center" onClick={e => e.stopPropagation()}>
                              <div className="relative inline-block" ref={certPopupFor === emp.id ? certPopupRef : undefined}>
                                <button
                                  onClick={() => setCertPopupFor(certPopupFor === emp.id ? null : emp.id)}
                                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full transition-colors ${badgeColor}`}
                                >
                                  {alerts.length}
                                </button>
                                {certPopupFor === emp.id && (
                                  <div className="absolute z-50 right-0 mt-1.5 w-[85vw] sm:w-64 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden">
                                    <div className="px-3 py-2 border-b border-gray-50 bg-gray-50/60">
                                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Cert Alerts</p>
                                    </div>
                                    <ul className="divide-y divide-gray-50">
                                      {alerts.map(a => (
                                        <li key={a.label} className="flex items-center justify-between px-3 py-2 gap-2">
                                          <span className="text-xs font-medium text-gray-700">{a.label}</span>
                                          <div className="flex items-center gap-1.5 shrink-0">
                                            <span className="text-[11px] text-gray-400 tabular-nums">
                                              {fmtDate(
                                                (() => {
                                                  const k = CERT_KEYS.find(k => CERT_LABELS[k] === a.label);
                                                  return k ? emp[k] as string : null;
                                                })()
                                              )}
                                            </span>
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                              a.daysLeft < 0
                                                ? "bg-red-100 text-red-600"
                                                : a.daysLeft <= 30
                                                  ? "bg-red-50 text-red-500"
                                                  : "bg-amber-50 text-amber-600"
                                            }`}>
                                              {a.daysLeft < 0 ? `${Math.abs(a.daysLeft)}d ago` : `${a.daysLeft}d`}
                                            </span>
                                          </div>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })()}
                        {cols.pay_rate   && (
                          <td className="hidden md:table-cell px-3 py-3 whitespace-nowrap text-center">
                            {emp.default_pay_rate != null
                              ? <span className="font-semibold text-gray-700 text-xs tabular-nums">${Number(emp.default_pay_rate).toFixed(2)}<span className="text-gray-400 font-normal">/hr</span></span>
                              : <span className="text-gray-300 text-xs">—</span>
                            }
                          </td>
                        )}
                        {cols.hire_date  && <td className="hidden md:table-cell px-3 py-3 whitespace-nowrap text-center text-xs text-gray-500 tabular-nums">{fmtDate(emp.hire_date)}</td>}
                        {cols.health_plan && (
                          <td className="hidden md:table-cell px-3 py-3 whitespace-nowrap text-center">
                            {emp.health_care_plan === "PPO"
                              ? <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">PPO</span>
                              : emp.health_care_plan === "HMO"
                              ? <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">HMO</span>
                              : <span className="text-gray-300 text-xs">—</span>
                            }
                          </td>
                        )}
                        <td className="hidden sm:table-cell px-3 py-3 whitespace-nowrap text-center" onClick={e => e.stopPropagation()}>
                          {emp.kiosk_pin ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <span className="text-xs font-mono tracking-widest text-gray-700">
                                {revealedPins.has(emp.id) ? emp.kiosk_pin : "••••"}
                              </span>
                              <button
                                onClick={() => setRevealedPins(prev => { const n = new Set(prev); n.has(emp.id) ? n.delete(emp.id) : n.add(emp.id); return n; })}
                                className="text-gray-300 hover:text-gray-500 transition-colors"
                                title={revealedPins.has(emp.id) ? "Hide PIN" : "Show PIN"}
                              >
                                {revealedPins.has(emp.id)
                                  ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                  : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                }
                              </button>
                            </div>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        {cols.phone      && <td className="hidden lg:table-cell px-3 py-3 whitespace-nowrap text-xs text-gray-500">{emp.phone ?? <span className="text-gray-300">—</span>}</td>}
                        {cols.email      && <td className="hidden lg:table-cell px-3 py-3 whitespace-nowrap text-xs text-gray-500 truncate max-w-[160px]">{emp.work_email ?? <span className="text-gray-300">—</span>}</td>}

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
