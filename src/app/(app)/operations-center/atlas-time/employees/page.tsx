"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  hire_date: string;
  job_title: string | null;
  pay_type: string;
  default_pay_rate: number | null;
  status: string;
  phone: string | null;
  work_email: string | null;
  at_departments: { id: string; name: string } | null;
  at_divisions: { id: string; name: string } | null;
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-50 text-green-700 border-green-200",
  inactive: "bg-gray-100 text-gray-500 border-gray-200",
  terminated: "bg-red-50 text-red-700 border-red-200",
  on_leave: "bg-amber-50 text-amber-700 border-amber-200",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  terminated: "Terminated",
  on_leave: "On Leave",
};

function initials(emp: Employee) {
  return `${emp.first_name[0] ?? ""}${emp.last_name[0] ?? ""}`.toUpperCase();
}

function displayName(emp: Employee) {
  return `${emp.first_name}${emp.preferred_name ? ` "${emp.preferred_name}"` : ""} ${emp.last_name}`;
}

export default function EmployeesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("active");

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

  const filtered = employees.filter((e) => {
    const matchesStatus = filterStatus === "all" || e.status === filterStatus;
    const q = search.toLowerCase();
    const matchesSearch = !q ||
      e.first_name.toLowerCase().includes(q) ||
      e.last_name.toLowerCase().includes(q) ||
      (e.preferred_name?.toLowerCase().includes(q)) ||
      (e.job_title?.toLowerCase().includes(q)) ||
      (e.at_departments?.name.toLowerCase().includes(q)) ||
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

  return (
    <div className="min-h-screen bg-[#f0f4f0]">
      {/* Header */}
      <div
        className="px-4 md:px-8 py-6 md:py-8"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}
      >
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 text-white/50 text-xs mb-2">
            <Link href="/operations-center" className="hover:text-white/80 transition-colors">Operations Center</Link>
            <span>/</span>
            <Link href="/operations-center/atlas-time" className="hover:text-white/80 transition-colors">Atlas Time</Link>
            <span>/</span>
            <span className="text-white/80">Team Members</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Team Members</h1>
              <p className="text-white/50 text-sm mt-1">{counts.active} active · {employees.length} total</p>
            </div>
            <Link
              href="/operations-center/atlas-time/employees/new"
              className="shrink-0 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors flex items-center gap-2 border border-white/20"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Team Member
            </Link>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-5 max-w-5xl mx-auto space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search by name, title, department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1">
            {(["all","active","inactive","on_leave","terminated"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  filterStatus === s
                    ? "bg-[#123b1f] text-white"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {s === "all" ? "All" : STATUS_LABELS[s]} {counts[s] > 0 && <span className="opacity-60">({counts[s]})</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Employee list */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-10 h-10 bg-gray-100 rounded-xl animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-gray-100 rounded w-1/3 animate-pulse" />
                  <div className="h-3 bg-gray-100 rounded w-1/4 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-12 text-center">
            <p className="text-sm text-gray-400">
              {search ? "No team members match your search." : "No team members yet."}
            </p>
            {!search && (
              <Link
                href="/operations-center/atlas-time/employees/new"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#123b1f] hover:underline"
              >
                Add your first team member
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="divide-y divide-gray-50">
              {filtered.map((emp) => (
                <Link
                  key={emp.id}
                  href={`/operations-center/atlas-time/employees/${emp.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/70 transition-colors group"
                >
                  {/* Avatar */}
                  <div className="shrink-0 w-10 h-10 rounded-xl bg-[#123b1f]/10 flex items-center justify-center text-[#123b1f] font-bold text-sm">
                    {initials(emp)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-gray-900 group-hover:text-[#123b1f] transition-colors">
                        {displayName(emp)}
                      </span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${STATUS_COLORS[emp.status] ?? "bg-gray-100 text-gray-500"}`}>
                        {STATUS_LABELS[emp.status] ?? emp.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {emp.job_title && <span className="text-xs text-gray-500">{emp.job_title}</span>}
                      {emp.at_departments && (
                        <span className="text-xs text-gray-400">{emp.at_departments.name}{emp.at_divisions ? ` · ${emp.at_divisions.name}` : ""}</span>
                      )}
                    </div>
                  </div>

                  {/* Rate + hire */}
                  <div className="hidden sm:flex flex-col items-end shrink-0 text-right">
                    {emp.default_pay_rate != null && (
                      <span className="text-sm font-semibold text-gray-700">
                        ${Number(emp.default_pay_rate).toFixed(2)}<span className="text-xs text-gray-400 font-normal">{emp.pay_type === "hourly" ? "/hr" : "/yr"}</span>
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      Hired {new Date(emp.hire_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>

                  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-gray-300 group-hover:text-gray-500 transition-colors">
                    <path d="M3 9L9 3M9 3H5M9 3v4"/>
                  </svg>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
