"use client";

import { useEffect, useMemo, useState } from "react";
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
  division_id: string | null; employee_note: string | null; manager_note: string | null;
  at_employees: {
    id: string; first_name: string; last_name: string; preferred_name: string | null;
    job_title: string | null; default_pay_rate: number | null; pay_type: string;
    at_departments: { id: string; name: string } | null;
  } | null;
  divisions: { id: string; name: string; qb_class_name: string | null } | null;
};

type EmpOption  = { id: string; name: string };
type DivOption  = { id: string; name: string };
type DeptOption = { id: string; name: string };
type SortDir    = "asc" | "desc";

const QUICK_FILTERS = [
  { label: "Today",             value: "today" },
  { label: "Yesterday",         value: "yesterday" },
  { label: "This Week",         value: "this_week" },
  { label: "Last Week",         value: "last_week" },
  { label: "This Pay Period",   value: "this_period" },
  { label: "Last Pay Period",   value: "last_period" },
  { label: "Custom",            value: "custom" },
];

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}
function fmtDay(iso: string) {
  const d = new Date(iso + "T12:00:00");
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  const [y, m, day] = iso.split("-");
  return `${weekday} ${m}/${day}/${y}`;
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}
function h(n: number) { return n.toFixed(2); }
function empName(e: RawPunch["at_employees"]) {
  if (!e) return "Unknown";
  return `${e.last_name}, ${e.preferred_name ?? e.first_name}`;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      className={`inline ml-1 ${active ? "text-[#123b1f]" : "text-gray-300"}`}>
      {active && dir === "asc"
        ? <polyline points="18 15 12 9 6 15"/>
        : <polyline points="6 9 12 15 18 9"/>}
    </svg>
  );
}

function Th({ label, col, sort, onSort }: { label: string; col: string; sort: [string, SortDir]; onSort: (c: string) => void }) {
  return (
    <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:text-gray-600"
      onClick={() => onSort(col)}>
      {label}<SortIcon active={sort[0] === col} dir={sort[1]} />
    </th>
  );
}
function ThC({ label, col, sort, onSort }: { label: string; col: string; sort: [string, SortDir]; onSort: (c: string) => void }) {
  return (
    <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:text-gray-600"
      onClick={() => onSort(col)}>
      {label}<SortIcon active={sort[0] === col} dir={sort[1]} />
    </th>
  );
}

export default function ReportsPage() {
  const [settings, setSettings]     = useState<HRSettings>(DEFAULT_SETTINGS);
  const [punches, setPunches]       = useState<RawPunch[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [tab, setTab]               = useState<"summary" | "detail">("summary");

  // Filter state
  const [quick, setQuick]           = useState("this_period");
  const [dateFrom, setDateFrom]     = useState("");
  const [dateTo, setDateTo]         = useState("");
  const [empFilter, setEmpFilter]   = useState<Set<string>>(new Set());
  const [divFilter, setDivFilter]   = useState<Set<string>>(new Set());
  const [deptFilter, setDeptFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Options for multi-selects
  const [empOptions, setEmpOptions]   = useState<EmpOption[]>([]);
  const [divOptions, setDivOptions]   = useState<DivOption[]>([]);
  const [deptOptions, setDeptOptions] = useState<DeptOption[]>([]);
  const [currentPeriod, setCurrentPeriod] = useState<PayPeriod | null>(null);

  // Sort
  const [summarySort, setSummarySort] = useState<[string, SortDir]>(["name", "asc"]);
  const [detailSort,  setDetailSort]  = useState<[string, SortDir]>(["date", "asc"]);

  // Load settings + option lists
  useEffect(() => {
    fetch("/api/atlas-time/settings")
      .then(r => r.json())
      .then(j => {
        const s = { ...DEFAULT_SETTINGS, ...j.settings };
        setSettings(s);
        setCurrentPeriod(getPayPeriodContaining(new Date(), s));
      }).catch(() => setCurrentPeriod(getPayPeriodContaining(new Date(), DEFAULT_SETTINGS)));

    fetch("/api/atlas-time/employees")
      .then(r => r.json())
      .then(j => {
        const emps: EmpOption[] = (j.employees ?? []).map((e: any) => ({
          id: e.id,
          name: `${e.last_name}, ${e.preferred_name ?? e.first_name}`,
        }));
        emps.sort((a, b) => a.name.localeCompare(b.name));
        setEmpOptions(emps);
      });

    fetch("/api/atlas-time/divisions")
      .then(r => r.json())
      .then(j => setDivOptions((j.divisions ?? []).filter((d: any) => d.active).map((d: any) => ({ id: d.id, name: d.name }))));

    fetch("/api/atlas-time/departments")
      .then(r => r.json())
      .then(j => setDeptOptions((j.departments ?? []).map((d: any) => ({ id: d.id, name: d.name }))));
  }, []);

  // Compute resolved date range from quick filter
  const resolvedRange = useMemo((): [string, string] => {
    const today  = new Date();
    const todayS = isoDate(today);
    if (quick === "today") return [todayS, todayS];
    if (quick === "yesterday") {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      const s = isoDate(y); return [s, s];
    }
    if (quick === "this_week") {
      const ws = new Date(today);
      ws.setDate(today.getDate() - ((today.getDay() - (settings.pay_period_start_day ?? 1) + 7) % 7));
      const we = new Date(ws); we.setDate(ws.getDate() + 6);
      return [isoDate(ws), isoDate(we)];
    }
    if (quick === "last_week") {
      const ws = new Date(today);
      ws.setDate(today.getDate() - ((today.getDay() - (settings.pay_period_start_day ?? 1) + 7) % 7) - 7);
      const we = new Date(ws); we.setDate(ws.getDate() + 6);
      return [isoDate(ws), isoDate(we)];
    }
    if (quick === "this_period" && currentPeriod) return [isoDate(currentPeriod.start), isoDate(currentPeriod.end)];
    if (quick === "last_period" && currentPeriod) {
      const prev = shiftPayPeriod(currentPeriod, -1, settings);
      return [isoDate(prev.start), isoDate(prev.end)];
    }
    if (quick === "custom") return [dateFrom, dateTo];
    return [isoDate(currentPeriod?.start ?? today), isoDate(currentPeriod?.end ?? today)];
  }, [quick, dateFrom, dateTo, settings, currentPeriod]);

  async function runReport() {
    const [from, to] = resolvedRange;
    if (!from || !to) return;
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ date_from: from, date_to: to });
      if (empFilter.size > 0) params.set("employee_ids", [...empFilter].join(","));
      if (divFilter.size > 0) params.set("division_ids", [...divFilter].join(","));
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res  = await fetch(`/api/atlas-time/punches?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed");
      setPunches(json.punches ?? []);
    } catch (e: any) { setError(e?.message ?? "Failed to load"); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (currentPeriod && resolvedRange[0] && resolvedRange[1]) runReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedRange, empFilter, divFilter, statusFilter, currentPeriod]);

  // Compute OT for all punches
  const computedMap = useMemo(() => {
    const byEmp = new Map<string, RawPunch[]>();
    for (const p of punches) {
      if (!byEmp.has(p.employee_id)) byEmp.set(p.employee_id, []);
      byEmp.get(p.employee_id)!.push(p);
    }
    const m = new Map<string, PunchOut>();
    for (const eps of byEmp.values()) {
      for (const r of computePeriodPunches(eps, settings)) m.set(r.id, r);
    }
    return m;
  }, [punches, settings]);

  // Apply dept filter (client-side only since API doesn't filter by dept yet)
  const filteredPunches = useMemo(() =>
    deptFilter
      ? punches.filter(p => p.at_employees?.at_departments?.id === deptFilter)
      : punches,
    [punches, deptFilter]);

  // ── Summary data ─────────────────────────────────────────────────────────────
  type SummaryRow = {
    empId: string; name: string; jobTitle: string; div: string;
    reg: number; ot: number; dt: number; total: number; lunch: number; punches: number;
  };
  const summaryRows = useMemo((): SummaryRow[] => {
    const byEmp = new Map<string, RawPunch[]>();
    for (const p of filteredPunches) {
      if (!byEmp.has(p.employee_id)) byEmp.set(p.employee_id, []);
      byEmp.get(p.employee_id)!.push(p);
    }
    return [...byEmp.entries()].map(([empId, eps]) => {
      const e    = eps[0]?.at_employees;
      const comp = eps.map(p => computedMap.get(p.id)).filter(Boolean) as PunchOut[];
      // Primary division = most-used division across the employee's punches in period
      const divCounts = new Map<string, number>();
      for (const p of eps) {
        const dn = p.divisions?.name;
        if (dn) divCounts.set(dn, (divCounts.get(dn) ?? 0) + 1);
      }
      const div = divCounts.size > 0 ? [...divCounts.entries()].sort((a, b) => b[1] - a[1])[0][0] : "";
      return {
        empId,
        name:     empName(e),
        jobTitle: e?.job_title ?? "",
        div,
        reg:      comp.reduce((s, c) => s + c.regular_hours, 0),
        ot:       comp.reduce((s, c) => s + c.ot_hours, 0),
        dt:       comp.reduce((s, c) => s + c.dt_hours, 0),
        total:    comp.reduce((s, c) => s + c.regular_hours + c.ot_hours + c.dt_hours, 0),
        lunch:    comp.reduce((s, c) => s + c.lunch_deducted_mins, 0),
        punches:  eps.filter(p => p.clock_out_at).length,
      };
    });
  }, [filteredPunches, computedMap]);

  function sortFn<T>(rows: T[], key: string, dir: SortDir, getters: Record<string, (r: T) => any>): T[] {
    return [...rows].sort((a, b) => {
      const av = getters[key]?.(a) ?? 0;
      const bv = getters[key]?.(b) ?? 0;
      const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
      return dir === "asc" ? cmp : -cmp;
    });
  }

  const sortedSummary = useMemo(() => sortFn(summaryRows, summarySort[0], summarySort[1], {
    name: r => r.name, div: r => r.div, reg: r => r.reg, ot: r => r.ot, total: r => r.total, punches: r => r.punches,
  }), [summaryRows, summarySort]);

  function toggleSummarySort(col: string) {
    setSummarySort(prev => prev[0] === col ? [col, prev[1] === "asc" ? "desc" : "asc"] : [col, "asc"]);
  }

  // ── Detail data ───────────────────────────────────────────────────────────────
  const sortedDetail = useMemo(() => {
    const rows = filteredPunches.map(p => {
      const c = computedMap.get(p.id);
      return {
        ...p,
        _name:  empName(p.at_employees),
        _date:  p.date_for_payroll,
        _in:    p.clock_in_at,
        _reg:   c?.regular_hours ?? 0,
        _ot:    c?.ot_hours      ?? 0,
        _total: (c?.regular_hours ?? 0) + (c?.ot_hours ?? 0) + (c?.dt_hours ?? 0),
        _lunch: c?.lunch_deducted_mins ?? 0,
        _div:   p.divisions?.name ?? "",
        _class: p.divisions?.qb_class_name ?? "",
      };
    });
    return sortFn(rows, detailSort[0], detailSort[1], {
      name:  r => r._name,
      date:  r => r._date + r._in,
      in:    r => r._in,
      reg:   r => r._reg,
      ot:    r => r._ot,
      total: r => r._total,
      div:   r => r._div,
    });
  }, [filteredPunches, computedMap, detailSort]);

  function toggleDetailSort(col: string) {
    setDetailSort(prev => prev[0] === col ? [col, prev[1] === "asc" ? "desc" : "asc"] : [col, "asc"]);
  }

  // ── Totals ───────────────────────────────────────────────────────────────────
  const totals = useMemo(() => ({
    reg:   summaryRows.reduce((s, r) => s + r.reg,   0),
    ot:    summaryRows.reduce((s, r) => s + r.ot,    0),
    dt:    summaryRows.reduce((s, r) => s + r.dt,    0),
    total: summaryRows.reduce((s, r) => s + r.total, 0),
  }), [summaryRows]);

  // ── CSV export ───────────────────────────────────────────────────────────────
  function exportCSV() {
    let csv = "";
    if (tab === "summary") {
      csv = "Team Member,Job Title,Division,Reg Hrs,OT Hrs,DT Hrs,Total Hrs,Lunch Deducted (min),Punches\n";
      for (const r of sortedSummary) {
        csv += `"${r.name}","${r.jobTitle}","${r.div}",${h(r.reg)},${h(r.ot)},${h(r.dt)},${h(r.total)},${r.lunch},${r.punches}\n`;
      }
    } else {
      csv = "Team Member,Date,Clock In,Clock Out,Lunch (min),Reg Hrs,OT Hrs,Total Hrs,Division,QB Class,Status,Manual,Note\n";
      for (const r of sortedDetail) {
        const c = computedMap.get(r.id);
        csv += `"${r._name}","${r._date}","${r.clock_in_at ? fmtTime(r.clock_in_at) : ""}","${r.clock_out_at ? fmtTime(r.clock_out_at) : "Open"}",${r._lunch},${h(r._reg)},${h(r._ot)},${h(r._total)},"${r._div}","${r._class}","${r.status}","${r.is_manual ? "Yes" : "No"}","${r.employee_note ?? ""}"\n`;
      }
    }
    const blob = new Blob([csv], { type: "text/csv" });
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = `atlas-hr-report-${resolvedRange[0]}-to-${resolvedRange[1]}.csv`;
    a.click();
  }

  function toggleMulti(set: Set<string>, setFn: (s: Set<string>) => void, id: string) {
    const n = new Set(set);
    n.has(id) ? n.delete(id) : n.add(id);
    setFn(n);
  }

  const [from, to] = resolvedRange;
  const rangeLabel = from && to
    ? from === to ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(to)}`
    : "Select range";

  return (
    <AccessGate permKey="hr_reports">
    <div className="min-h-screen bg-[#f0f4f0] print:bg-white">

      {/* Header */}
      <div className="px-4 md:px-8 py-6 md:py-8 print:hidden"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 text-white/50 text-xs mb-2">
            <Link href="/operations-center/atlas-time" className="hover:text-white/80">Atlas HR</Link>
            <span>/</span><span className="text-white/80">Reports</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Reports</h1>
              <p className="text-white/50 text-sm mt-1">{rangeLabel} · {filteredPunches.length} punches · {summaryRows.length} team members</p>
            </div>
            <div className="flex gap-2">
              <button onClick={exportCSV}
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-semibold px-3 py-2.5 rounded-xl transition-colors">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                CSV
              </button>
              <button onClick={() => window.print()}
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-semibold px-3 py-2.5 rounded-xl transition-colors">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Print
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-5 max-w-7xl mx-auto space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between print:hidden">
            {error}<button onClick={() => setError("")} className="ml-4 text-red-400">✕</button>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3 print:hidden">
          {/* Quick filters */}
          <div className="flex flex-wrap gap-1.5">
            {QUICK_FILTERS.map(f => (
              <button key={f.value} onClick={() => setQuick(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${quick === f.value ? "bg-[#123b1f] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Custom date range */}
          {quick === "custom" && (
            <div className="flex items-center gap-2 flex-wrap">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500" />
              <span className="text-gray-400 text-sm">to</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          )}

          {/* Filter dropdowns */}
          <div className="flex flex-wrap gap-2">
            {/* Employee multi-select */}
            <div className="relative group">
              <button className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${empFilter.size > 0 ? "border-green-500 bg-green-50 text-green-800" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                {empFilter.size > 0 ? `${empFilter.size} Team Member${empFilter.size > 1 ? "s" : ""}` : "All Team Members"}
              </button>
              <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl w-[90vw] sm:w-auto sm:min-w-[200px] max-h-60 overflow-y-auto hidden group-focus-within:block hover:block">
                <div className="p-2 space-y-0.5">
                  {empOptions.map(e => (
                    <label key={e.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-xs">
                      <input type="checkbox" checked={empFilter.has(e.id)} onChange={() => toggleMulti(empFilter, setEmpFilter, e.id)} className="accent-[#123b1f]" />
                      {e.name}
                    </label>
                  ))}
                </div>
                {empFilter.size > 0 && (
                  <div className="border-t border-gray-100 p-2">
                    <button onClick={() => setEmpFilter(new Set())} className="text-xs text-red-500 hover:underline w-full text-left px-2">Clear</button>
                  </div>
                )}
              </div>
            </div>

            {/* Division multi-select */}
            <div className="relative group">
              <button className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${divFilter.size > 0 ? "border-blue-500 bg-blue-50 text-blue-800" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                {divFilter.size > 0 ? `${divFilter.size} Division${divFilter.size > 1 ? "s" : ""}` : "All Divisions"}
              </button>
              <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl w-[90vw] sm:w-auto sm:min-w-[180px] max-h-60 overflow-y-auto hidden group-focus-within:block hover:block">
                <div className="p-2 space-y-0.5">
                  {divOptions.map(d => (
                    <label key={d.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-xs">
                      <input type="checkbox" checked={divFilter.has(d.id)} onChange={() => toggleMulti(divFilter, setDivFilter, d.id)} className="accent-[#123b1f]" />
                      {d.name}
                    </label>
                  ))}
                </div>
                {divFilter.size > 0 && (
                  <div className="border-t border-gray-100 p-2">
                    <button onClick={() => setDivFilter(new Set())} className="text-xs text-red-500 hover:underline w-full text-left px-2">Clear</button>
                  </div>
                )}
              </div>
            </div>

            {/* Department */}
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-600">
              <option value="">All Departments</option>
              {deptOptions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>

            {/* Status */}
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-600">
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
            </select>

            {/* Clear all */}
            {(empFilter.size > 0 || divFilter.size > 0 || deptFilter || statusFilter !== "all") && (
              <button onClick={() => { setEmpFilter(new Set()); setDivFilter(new Set()); setDeptFilter(""); setStatusFilter("all"); }}
                className="px-3 py-2 rounded-xl text-xs font-semibold border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Print header (hidden on screen) */}
        <div className="hidden print:block mb-4 pb-4 border-b">
          <h2 className="text-xl font-bold">Atlas HR — {tab === "summary" ? "Payroll Summary" : "Time Card Detail"}</h2>
          <p className="text-sm text-gray-600 mt-1">Period: {rangeLabel} · Generated {new Date().toLocaleString()}</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 bg-white rounded-xl border border-gray-200 w-full sm:w-fit overflow-hidden print:hidden">
          {(["summary", "detail"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 sm:flex-none px-5 py-2.5 text-sm font-semibold transition-colors text-center ${tab === t ? "bg-[#123b1f] text-white" : "text-gray-600 hover:bg-gray-50"}`}>
              {t === "summary" ? "Payroll Summary" : "Time Card Detail"}
            </button>
          ))}
        </div>

        {/* ── Summary Tab ──────────────────────────────────────────────────────── */}
        {tab === "summary" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-6 space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-gray-50 rounded-xl animate-pulse" />)}</div>
            ) : sortedSummary.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-gray-400">No data for the selected filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[600px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <Th  label="Team Member" col="name"    sort={summarySort} onSort={toggleSummarySort} />
                      <ThC label="Division"   col="div"     sort={summarySort} onSort={toggleSummarySort} />
                      <ThC label="Reg Hrs"    col="reg"     sort={summarySort} onSort={toggleSummarySort} />
                      <ThC label="OT Hrs"     col="ot"      sort={summarySort} onSort={toggleSummarySort} />
                      <ThC label="DT Hrs"     col="dt"      sort={summarySort} onSort={toggleSummarySort} />
                      <ThC label="Total Hrs"  col="total"   sort={summarySort} onSort={toggleSummarySort} />
                      <ThC label="Lunch (min)" col="lunch"  sort={summarySort} onSort={toggleSummarySort} />
                      <ThC label="# Punches"  col="punches" sort={summarySort} onSort={toggleSummarySort} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sortedSummary.map(r => (
                      <tr key={r.empId} className="hover:bg-gray-50/40">
                        <td className="px-3 py-3 font-semibold text-gray-900 whitespace-nowrap">{r.name}</td>
                        <td className="px-3 py-3 text-center text-gray-500 text-xs whitespace-nowrap">{r.div || "—"}</td>
                        <td className="px-3 py-3 text-center tabular-nums font-semibold">{h(r.reg)}</td>
                        <td className={`px-3 py-3 text-center tabular-nums font-semibold ${r.ot > 0 ? "text-amber-600" : "text-gray-300"}`}>{h(r.ot)}</td>
                        <td className={`px-3 py-3 text-center tabular-nums font-semibold ${r.dt > 0 ? "text-red-600" : "text-gray-300"}`}>{h(r.dt)}</td>
                        <td className="px-3 py-3 text-center tabular-nums font-bold text-gray-900">{h(r.total)}</td>
                        <td className="px-3 py-3 text-center tabular-nums text-gray-400 text-xs">{r.lunch > 0 ? r.lunch : "—"}</td>
                        <td className="px-3 py-3 text-center tabular-nums text-gray-500">{r.punches}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold text-sm">
                      <td className="px-3 py-3" colSpan={2}>Totals — {summaryRows.length} team members</td>
                      <td className="px-3 py-3 text-center tabular-nums">{h(totals.reg)}</td>
                      <td className={`px-3 py-3 text-center tabular-nums ${totals.ot > 0 ? "text-amber-600" : "text-gray-400"}`}>{h(totals.ot)}</td>
                      <td className={`px-3 py-3 text-center tabular-nums ${totals.dt > 0 ? "text-red-600" : "text-gray-400"}`}>{h(totals.dt)}</td>
                      <td className="px-3 py-3 text-center tabular-nums text-gray-900">{h(totals.total)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Time Card Detail Tab ─────────────────────────────────────────────── */}
        {tab === "detail" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-6 space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-gray-50 rounded-xl animate-pulse" />)}</div>
            ) : sortedDetail.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-gray-400">No data for the selected filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <Th  label="Team Member" col="name"  sort={detailSort} onSort={toggleDetailSort} />
                      <ThC label="Date"       col="date"  sort={detailSort} onSort={toggleDetailSort} />
                      <ThC label="In"         col="in"    sort={detailSort} onSort={toggleDetailSort} />
                      <ThC label="Out"        col="out"   sort={detailSort} onSort={toggleDetailSort} />
                      <ThC label="Lunch"      col="lunch" sort={detailSort} onSort={toggleDetailSort} />
                      <ThC label="Reg Hrs"    col="reg"   sort={detailSort} onSort={toggleDetailSort} />
                      <ThC label="OT Hrs"     col="ot"    sort={detailSort} onSort={toggleDetailSort} />
                      <ThC label="Total"      col="total" sort={detailSort} onSort={toggleDetailSort} />
                      <ThC label="Division"   col="div"   sort={detailSort} onSort={toggleDetailSort} />
                      <ThC label="Class"      col="class" sort={detailSort} onSort={toggleDetailSort} />
                      <ThC label="Status"     col="status" sort={detailSort} onSort={toggleDetailSort} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sortedDetail.map((p, i) => {
                      const prevEmp = i > 0 ? sortedDetail[i-1].employee_id : null;
                      const newEmp  = p.employee_id !== prevEmp;
                      return (
                        <tr key={p.id} className={`${newEmp && i > 0 ? "border-t-2 border-gray-100" : ""} hover:bg-gray-50/40`}>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {newEmp ? (
                              <span className="font-semibold text-gray-900">{p._name}</span>
                            ) : (
                              <span className="text-gray-300 text-xs pl-2">↳</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center text-gray-600 whitespace-nowrap text-xs">
                            {fmtDay(p.date_for_payroll)}
                          </td>
                          <td className="px-3 py-2.5 text-center tabular-nums text-gray-700 whitespace-nowrap text-xs">{fmtTime(p.clock_in_at)}</td>
                          <td className="px-3 py-2.5 text-center tabular-nums text-gray-700 whitespace-nowrap text-xs">
                            {p.clock_out_at ? fmtTime(p.clock_out_at) : <span className="text-red-400 font-semibold">Open</span>}
                          </td>
                          <td className="px-3 py-2.5 text-center tabular-nums text-xs text-gray-400">
                            {p._lunch > 0 ? `${p._lunch}m` : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-center tabular-nums font-semibold text-xs">{h(p._reg)}</td>
                          <td className={`px-3 py-2.5 text-center tabular-nums font-semibold text-xs ${p._ot > 0 ? "text-amber-600" : "text-gray-300"}`}>{h(p._ot)}</td>
                          <td className="px-3 py-2.5 text-center tabular-nums font-bold text-xs">{h(p._total)}</td>
                          <td className="px-3 py-2.5 text-center text-xs text-gray-500 whitespace-nowrap">{p._div || "—"}</td>
                          <td className="px-3 py-2.5 text-center text-xs text-gray-400 whitespace-nowrap">{p._class || "—"}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              {p.status === "approved"
                                ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-700">Approved</span>
                                : p.clock_out_at
                                  ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">Pending</span>
                                  : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">Active</span>}
                              {p.is_manual && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-gray-100 text-gray-500">M</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @media print {
          body { font-size: 11px; }
          .print\\:hidden { display: none !important; }
          .print\\:block  { display: block  !important; }
          table { page-break-inside: auto; }
          tr    { page-break-inside: avoid; }
        }
      `}</style>
    </div>
    </AccessGate>
  );
}
