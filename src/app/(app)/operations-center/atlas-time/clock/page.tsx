"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  job_title: string | null;
  department_id: string | null;
  at_departments: { name: string } | null;
};

type Punch = {
  id: string;
  employee_id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  date_for_payroll: string;
  punch_method: string;
  status: string;
  at_employees: Employee | null;
};

function elapsed(clockIn: string): string {
  const ms = Date.now() - new Date(clockIn).getTime();
  const totalMins = Math.floor(ms / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function fmtHours(clockIn: string, clockOut: string): string {
  const diff = (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 3_600_000;
  return diff.toFixed(2) + " hrs";
}

function initials(e: Employee) {
  return `${e.first_name[0] ?? ""}${e.last_name[0] ?? ""}`.toUpperCase();
}

function displayName(e: Employee) {
  return e.preferred_name ? `${e.preferred_name} ${e.last_name}` : `${e.first_name} ${e.last_name}`;
}

export default function ClockPage() {
  const [now, setNow] = useState(new Date());
  const [punches, setPunches] = useState<Punch[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Clock-in search
  const [search, setSearch] = useState("");
  const [acting, setActing] = useState<string | null>(null); // employee id being actioned

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick clock every second
  useEffect(() => {
    timerRef.current = setInterval(() => setNow(new Date()), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  async function load() {
    try {
      setLoading(true);
      setError("");
      const [punchRes, empRes] = await Promise.all([
        fetch("/api/atlas-time/punches", { cache: "no-store" }),
        fetch("/api/atlas-time/employees", { cache: "no-store" }),
      ]);
      const punchJson = await punchRes.json().catch(() => null);
      const empJson = await empRes.json().catch(() => null);
      if (!punchRes.ok) throw new Error(punchJson?.error ?? "Failed to load");
      setPunches(punchJson.punches ?? []);
      setEmployees(empJson.employees ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function clockIn(employeeId: string) {
    try {
      setActing(employeeId);
      const res = await fetch("/api/atlas-time/punches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: employeeId, punch_method: "admin" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to clock in");
      await load();
      setSearch("");
    } catch (e: any) {
      setError(e?.message ?? "Clock in failed");
    } finally {
      setActing(null);
    }
  }

  async function clockOut(punchId: string, employeeId: string) {
    try {
      setActing(employeeId);
      const res = await fetch(`/api/atlas-time/punches/${punchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clock_out: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to clock out");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Clock out failed");
    } finally {
      setActing(null);
    }
  }

  useEffect(() => { load(); }, []);

  const openPunches = punches.filter((p) => !p.clock_out_at);
  const closedPunches = punches.filter((p) => p.clock_out_at);
  const clockedInIds = new Set(openPunches.map((p) => p.employee_id));

  const searchResults = search.trim()
    ? employees.filter((e) => {
        const q = search.toLowerCase();
        return (
          e.first_name.toLowerCase().includes(q) ||
          e.last_name.toLowerCase().includes(q) ||
          (e.preferred_name?.toLowerCase().includes(q)) ||
          (e.job_title?.toLowerCase().includes(q))
        );
      }).slice(0, 6)
    : [];

  const totalHoursToday = closedPunches.reduce((acc, p) => {
    if (!p.clock_out_at) return acc;
    return acc + (new Date(p.clock_out_at).getTime() - new Date(p.clock_in_at).getTime()) / 3_600_000;
  }, 0);

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
            <span className="text-white/80">Time Clock</span>
          </div>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Time Clock</h1>
              <p className="text-white/50 text-sm mt-1">
                {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </p>
            </div>
            {/* Live clock */}
            <div className="text-right">
              <div className="text-3xl md:text-4xl font-mono font-bold text-white tracking-tight">
                {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })}
              </div>
            </div>
          </div>

          {/* Stats bar */}
          <div className="mt-5 flex gap-4 flex-wrap">
            <div className="bg-white/10 rounded-xl px-4 py-2.5 text-center min-w-[80px]">
              <div className="text-2xl font-bold text-white">{openPunches.length}</div>
              <div className="text-xs text-white/60">Clocked In</div>
            </div>
            <div className="bg-white/10 rounded-xl px-4 py-2.5 text-center min-w-[80px]">
              <div className="text-2xl font-bold text-white">{closedPunches.length}</div>
              <div className="text-xs text-white/60">Clocked Out</div>
            </div>
            <div className="bg-white/10 rounded-xl px-4 py-2.5 text-center min-w-[80px]">
              <div className="text-2xl font-bold text-white">{totalHoursToday.toFixed(1)}</div>
              <div className="text-xs text-white/60">Total Hrs Today</div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-5 max-w-5xl mx-auto space-y-5">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
            {error}
            <button onClick={() => setError("")} className="text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {/* Clock-in search */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-visible">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-gray-800">Clock In an Employee</h2>
          </div>
          <div className="px-5 py-4 relative">
            <div className="relative">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                placeholder="Search employee name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            {searchResults.length > 0 && (
              <div className="absolute left-5 right-5 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
                {searchResults.map((emp) => {
                  const isIn = clockedInIds.has(emp.id);
                  return (
                    <button
                      key={emp.id}
                      disabled={isIn || acting === emp.id}
                      onClick={() => !isIn && clockIn(emp.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-gray-50 last:border-0
                        ${isIn ? "opacity-50 cursor-not-allowed bg-gray-50" : "hover:bg-green-50/60 cursor-pointer"}`}
                    >
                      <div className="shrink-0 w-9 h-9 rounded-xl bg-[#123b1f]/10 flex items-center justify-center text-[#123b1f] font-bold text-xs">
                        {initials(emp)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900">{displayName(emp)}</div>
                        <div className="text-xs text-gray-400">{emp.job_title ?? emp.at_departments?.name ?? ""}</div>
                      </div>
                      {isIn ? (
                        <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">In</span>
                      ) : acting === emp.id ? (
                        <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <span className="text-xs font-semibold text-[#123b1f] bg-green-50 px-2.5 py-1 rounded-lg border border-green-200">Clock In</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Currently clocked in */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">Currently Clocked In</h2>
            <button onClick={load} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Refresh</button>
          </div>

          {loading ? (
            <div className="p-5 space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-gray-100 rounded-xl animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-gray-100 rounded w-1/3 animate-pulse" />
                    <div className="h-3 bg-gray-100 rounded w-1/4 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : openPunches.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-gray-400">Nobody is clocked in right now.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {openPunches.map((p) => {
                const emp = p.at_employees;
                if (!emp) return null;
                return (
                  <div key={p.id} className="flex items-center gap-4 px-5 py-3.5">
                    {/* Avatar */}
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-700 font-bold text-sm">
                      {initials(emp)}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-gray-900">{displayName(emp)}</span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">● Live</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        In at {fmtTime(p.clock_in_at)}
                        {emp.at_departments && <span> · {emp.at_departments.name}</span>}
                      </div>
                    </div>
                    {/* Elapsed */}
                    <div className="hidden sm:block text-right shrink-0">
                      <div className="text-sm font-bold text-gray-800 tabular-nums">{elapsed(p.clock_in_at)}</div>
                      <div className="text-xs text-gray-400">{p.punch_method}</div>
                    </div>
                    {/* Clock out button */}
                    <button
                      onClick={() => clockOut(p.id, emp.id)}
                      disabled={acting === emp.id}
                      className="shrink-0 ml-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold px-3.5 py-2 rounded-xl border border-red-200 transition-colors disabled:opacity-60"
                    >
                      {acting === emp.id ? (
                        <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                      ) : "Clock Out"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Completed punches today */}
        {closedPunches.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <h2 className="text-sm font-semibold text-gray-800">Completed Today</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {closedPunches.map((p) => {
                const emp = p.at_employees;
                if (!emp) return null;
                return (
                  <div key={p.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="shrink-0 w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 font-bold text-xs">
                      {initials(emp)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-700">{displayName(emp)}</span>
                      <div className="text-xs text-gray-400">
                        {fmtTime(p.clock_in_at)} → {fmtTime(p.clock_out_at!)}
                        {emp.at_departments && <span> · {emp.at_departments.name}</span>}
                      </div>
                    </div>
                    <div className="shrink-0 text-sm font-semibold text-gray-600 tabular-nums">
                      {fmtHours(p.clock_in_at, p.clock_out_at!)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-3 border-t border-gray-50 flex justify-end">
              <span className="text-xs text-gray-500">Total today: <strong>{totalHoursToday.toFixed(2)} hrs</strong></span>
            </div>
          </div>
        )}

        <p className="text-xs text-gray-400 pb-4 text-center">
          Kiosk (PIN) mode and mobile punch coming in Phase 2.{" "}
          <Link href="/operations-center/atlas-time/employees" className="underline hover:text-gray-600">Manage employees →</Link>
        </p>
      </div>
    </div>
  );
}
