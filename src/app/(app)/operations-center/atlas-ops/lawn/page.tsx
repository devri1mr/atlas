"use client";

import React, { useEffect, useState, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

type DayData = {
  date: string;
  day: string;
  revenue: number;
  payroll_cost: number;
  labor_pct: number | null;
  has_data: boolean;
};

type MonthData = {
  month: number;
  revenue: number;
  payroll_cost: number;
  efficiency_pct: number | null;
  labor_pct: number | null;
};

type ServiceBreakdown = {
  week_key: string;
  week_label: string;
  service: string;
  ot_hrs: number;
  ot_cost: number;
  total_hrs: number;
  total_payroll: number;
  total_revenue: number;
  labor_pct: number | null;
};

type DashData = {
  current_week: DayData[];
  last_week: DayData[];
  monthly: MonthData[];
  service_breakdown: ServiceBreakdown[];
};

type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  default_pay_rate: number | null;
};

// ── Formatters ─────────────────────────────────────────────────────────────────

const money    = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const moneyDec = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct      = (n: number | null) => n == null ? "—" : `${Math.round(n * 100)}%`;
const MONTHS   = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const PAYROLL_BURDEN = 1.15;

function fmtDate(d: string) {
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function laborBadge(lp: number | null, size: "sm" | "lg" = "sm") {
  if (lp == null) return <span className="text-white/30">—</span>;
  const good = lp <= 0.39;
  const base = size === "lg" ? "text-base font-bold" : "text-xs font-semibold";
  return (
    <span className={`${base} ${good ? "text-emerald-300" : "text-red-400"}`}>
      {pct(lp)}
    </span>
  );
}

function laborColorClass(lp: number | null) {
  if (lp == null) return "text-gray-400";
  return lp > 0.39 ? "text-red-500 font-semibold" : "text-emerald-600 font-semibold";
}

function effColorClass(ep: number | null) {
  if (ep == null) return "text-gray-400";
  return ep >= 1 ? "text-emerald-600 font-semibold" : "text-red-500 font-semibold";
}

// ── Section header (dark green, matches nav) ──────────────────────────────────

function SectionHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-between px-5 py-3.5"
      style={{ background: "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)" }}
    >
      <div>
        <div className="text-sm font-semibold text-white">{title}</div>
        {subtitle && <div className="text-xs text-white/40 mt-0.5">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

// ── Week Card ─────────────────────────────────────────────────────────────────

function WeekCard({ title, days, isCurrent }: { title: string; days: DayData[]; isCurrent?: boolean }) {
  const totalRev = days.reduce((s, d) => s + d.revenue, 0);
  const totalPay = days.reduce((s, d) => s + d.payroll_cost, 0);
  const overallLP = totalRev > 0 ? totalPay / totalRev : null;
  const maxRev = Math.max(...days.map(d => d.revenue), 1);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-2xl overflow-hidden shadow-md flex-1 min-w-0" style={{ border: "1px solid rgba(16,64,32,0.12)" }}>
      {/* Card header */}
      <div style={{ background: "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)" }} className="px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-0.5">{title}</div>
            {totalRev > 0
              ? <div className="text-2xl font-bold text-white">{money.format(totalRev)}</div>
              : <div className="text-lg text-white/30 font-medium">No data yet</div>
            }
          </div>
          {totalRev > 0 && (
            <div className="text-right">
              <div className="text-xs text-white/40 mb-0.5">Labor</div>
              {laborBadge(overallLP, "lg")}
            </div>
          )}
        </div>
      </div>

      {/* Day rows */}
      <div className="bg-white divide-y divide-gray-50">
        {days.map(d => {
          const barWidth = d.has_data ? (d.revenue / maxRev) * 100 : 0;
          const isToday = d.date === today;
          const isWeekend = d.day === "Sat" || d.day === "Sun";
          return (
            <div
              key={d.date}
              className={`relative grid grid-cols-[2.5rem_4rem_1fr_4.5rem] items-center px-4 py-2.5 gap-2 ${
                isToday ? "bg-emerald-50" : isWeekend ? "bg-gray-50/60" : ""
              }`}
            >
              {/* Revenue bar background */}
              {d.has_data && (
                <div
                  className="absolute inset-y-0 left-0 bg-emerald-500/6 pointer-events-none"
                  style={{ width: `${barWidth}%` }}
                />
              )}
              <span className={`text-xs font-bold uppercase relative z-10 ${
                isToday ? "text-emerald-700" : isWeekend ? "text-gray-300" : "text-gray-400"
              }`}>{d.day}</span>
              <span className={`text-xs relative z-10 ${isWeekend ? "text-gray-300" : "text-gray-400"}`}>{fmtDate(d.date)}</span>
              <span className={`font-semibold text-sm relative z-10 ${
                !d.has_data ? "text-gray-200" : isToday ? "text-emerald-800" : "text-gray-800"
              }`}>
                {d.has_data ? money.format(d.revenue) : "—"}
              </span>
              <span className={`text-xs text-right relative z-10 font-semibold ${
                !d.has_data ? "text-gray-200" :
                d.labor_pct != null && d.labor_pct > 0.39 ? "text-red-500" : "text-emerald-600"
              }`}>
                {d.has_data ? pct(d.labor_pct) : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Monthly Table ─────────────────────────────────────────────────────────────

const MONTHLY_BUDGET = 25_000;

function MonthlyTable({ data }: { data: MonthData[] }) {
  const totalRev = data.reduce((s, m) => s + m.revenue, 0);
  const totalPay = data.reduce((s, m) => s + m.payroll_cost, 0);
  const curMonth = new Date().getMonth();

  return (
    <div className="rounded-2xl overflow-hidden shadow-md" style={{ border: "1px solid rgba(16,64,32,0.12)" }}>
      <SectionHeader
        title={`Monthly Overview — ${new Date().getFullYear()}`}
        subtitle="Revenue · Labor % · Efficiency"
      />
      <div className="bg-white overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
              <th className="px-5 py-3 text-left">Month</th>
              <th className="px-4 py-3 text-left w-48">Budget Progress</th>
              <th className="px-4 py-3 text-right">Revenue</th>
              <th className="px-4 py-3 text-center">Labor %</th>
              <th className="px-4 py-3 text-center">Efficiency</th>
            </tr>
          </thead>
          <tbody>
            {data.map((m, i) => {
              const isCur = i === curMonth;
              const fillPct  = Math.min((m.revenue / MONTHLY_BUDGET) * 100, 100);
              const donePct  = Math.round(fillPct);
              const exceeded = m.revenue >= MONTHLY_BUDGET;
              return (
                <tr
                  key={m.month}
                  className={`border-t border-gray-50 transition-colors ${
                    m.revenue === 0 ? "opacity-35" :
                    isCur ? "bg-emerald-50/60" : "hover:bg-gray-50/60"
                  }`}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {isCur && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />}
                      <span className={`font-semibold ${isCur ? "text-emerald-800" : "text-gray-700"}`}>
                        {MONTHS_FULL[m.month - 1]}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {m.revenue > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="relative h-2 rounded-full bg-gray-100 overflow-hidden flex-1 min-w-0">
                          <div
                            className={`h-full rounded-full transition-all ${exceeded ? "bg-emerald-500" : isCur ? "bg-emerald-500" : "bg-emerald-400"}`}
                            style={{ width: `${fillPct}%` }}
                          />
                        </div>
                        <span className={`text-xs font-semibold shrink-0 ${exceeded ? "text-emerald-600" : isCur ? "text-emerald-700" : "text-gray-500"}`}>
                          {donePct}%
                        </span>
                      </div>
                    ) : (
                      <div className="h-2 rounded-full bg-gray-100 w-full" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-800">
                    {m.revenue > 0 ? money.format(m.revenue) : "—"}
                  </td>
                  <td className={`px-4 py-3 text-center ${m.revenue > 0 ? laborColorClass(m.labor_pct) : "text-gray-300"}`}>
                    {m.revenue > 0 ? pct(m.labor_pct) : "—"}
                  </td>
                  <td className={`px-4 py-3 text-center ${m.revenue > 0 ? effColorClass(m.efficiency_pct) : "text-gray-300"}`}>
                    {m.revenue > 0 ? pct(m.efficiency_pct) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)" }}>
              <td className="px-5 py-3 text-sm font-bold text-white">YTD Total</td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3 text-right text-sm font-bold text-white">{money.format(totalRev)}</td>
              <td className="px-4 py-3 text-center">
                {laborBadge(totalRev > 0 ? totalPay / totalRev : null)}
              </td>
              <td className="px-4 py-3 text-center">
                {(() => {
                  const ep = totalPay > 0 ? (totalRev * 0.39) / totalPay : null;
                  if (ep == null) return <span className="text-white/30">—</span>;
                  return <span className={`text-xs font-semibold ${ep >= 1 ? "text-emerald-300" : "text-red-400"}`}>{pct(ep)}</span>;
                })()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Service Breakdown ─────────────────────────────────────────────────────────

function ServiceBreakdownCard({ data }: { data: ServiceBreakdown[] }) {
  const weekKeys = [...new Set(data.map(d => d.week_key))].sort((a, b) => b.localeCompare(a));
  const [selectedWeek, setSelectedWeek] = useState(weekKeys[0] ?? "");

  const rows = data.filter(d => d.week_key === selectedWeek);
  const totals = rows.reduce((t, r) => ({
    ot_hrs:        t.ot_hrs + r.ot_hrs,
    ot_cost:       t.ot_cost + r.ot_cost,
    total_hrs:     t.total_hrs + r.total_hrs,
    total_payroll: t.total_payroll + r.total_payroll,
    total_revenue: t.total_revenue + r.total_revenue,
  }), { ot_hrs: 0, ot_cost: 0, total_hrs: 0, total_payroll: 0, total_revenue: 0 });

  const weekLabel = rows[0]?.week_label ?? selectedWeek;

  return (
    <div className="rounded-2xl overflow-hidden shadow-md" style={{ border: "1px solid rgba(16,64,32,0.12)" }}>
      <SectionHeader
        title="Weekly Service Breakdown"
        subtitle={weekLabel}
        right={
          <select
            value={selectedWeek}
            onChange={e => setSelectedWeek(e.target.value)}
            className="text-xs rounded-lg border border-white/20 bg-white/10 text-white px-3 py-1.5 focus:outline-none"
          >
            {weekKeys.map(wk => {
              const label = data.find(d => d.week_key === wk)?.week_label ?? wk;
              return <option key={wk} value={wk} className="text-gray-900 bg-white">{label}</option>;
            })}
          </select>
        }
      />
      {rows.length === 0 ? (
        <div className="bg-white px-5 py-10 text-center text-sm text-gray-400">No data for this week</div>
      ) : (
        <div className="bg-white overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[700px]">
            <thead>
              <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                <th className="px-5 py-3 text-left">Service</th>
                <th className="px-4 py-3 text-center">OT Hrs</th>
                <th className="px-4 py-3 text-center">OT Cost</th>
                <th className="px-4 py-3 text-center">Total Hrs</th>
                <th className="px-4 py-3 text-center">Total Payroll</th>
                <th className="px-4 py-3 text-center">Revenue</th>
                <th className="px-4 py-3 text-center">Labor %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-gray-50 hover:bg-emerald-50/30 transition-colors">
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                      <span className="font-semibold text-gray-800">{r.service}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-500">{r.ot_hrs > 0 ? r.ot_hrs.toFixed(2) : "—"}</td>
                  <td className="px-4 py-3 text-center text-gray-500">{r.ot_cost > 0 ? moneyDec.format(r.ot_cost) : "—"}</td>
                  <td className="px-4 py-3 text-center text-gray-700 font-medium">{r.total_hrs.toFixed(2)}</td>
                  <td className="px-4 py-3 text-center text-gray-700">{moneyDec.format(r.total_payroll)}</td>
                  <td className="px-4 py-3 text-center font-bold text-gray-900">{money.format(r.total_revenue)}</td>
                  <td className={`px-4 py-3 text-center ${laborColorClass(r.labor_pct)}`}>{pct(r.labor_pct)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)" }}>
                <td className="px-5 py-3 text-sm font-bold text-white">Total — {weekLabel}</td>
                <td className="px-4 py-3 text-center text-white/60 text-xs">{totals.ot_hrs > 0 ? totals.ot_hrs.toFixed(2) : "—"}</td>
                <td className="px-4 py-3 text-center text-white/60 text-xs">{totals.ot_cost > 0 ? moneyDec.format(totals.ot_cost) : "—"}</td>
                <td className="px-4 py-3 text-center text-white/80 font-semibold text-xs">{totals.total_hrs.toFixed(2)}</td>
                <td className="px-4 py-3 text-center text-white/80 font-semibold text-xs">{moneyDec.format(totals.total_payroll)}</td>
                <td className="px-4 py-3 text-center text-white font-bold">{money.format(totals.total_revenue)}</td>
                <td className="px-4 py-3 text-center">
                  {laborBadge(totals.total_revenue > 0 ? totals.total_payroll / totals.total_revenue : null)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Reverse Revenue Calculator ────────────────────────────────────────────────

type CalcRow = {
  id: number;
  employee_id: string;
  pay_rate: string;
  revenue: string;
  time_in: string;
};

function RevenueCalculator({ employees }: { employees: Employee[] }) {
  const [rows, setRows] = useState<CalcRow[]>(() =>
    Array.from({ length: 4 }, (_, i) => ({ id: i, employee_id: "", pay_rate: "", revenue: "", time_in: "07:30" }))
  );
  const nextId = React.useRef(4);

  function addRow() {
    setRows(prev => [...prev, { id: nextId.current++, employee_id: "", pay_rate: "", revenue: "", time_in: "07:30" }]);
  }

  function removeRow(id: number) {
    setRows(prev => prev.filter(r => r.id !== id));
  }

  function update(id: number, field: keyof CalcRow, val: string) {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, [field]: val };
      if (field === "employee_id" && val) {
        const emp = employees.find(e => String(e.id) === val);
        if (emp?.default_pay_rate) updated.pay_rate = String(emp.default_pay_rate);
      }
      return updated;
    }));
  }

  function calcResult(row: CalcRow): { hours: number | null; time_out: string | null } {
    const rate = parseFloat(row.pay_rate);
    const rev  = parseFloat(row.revenue);
    if (!rate || !rev || rate <= 0 || rev <= 0) return { hours: null, time_out: null };
    let hours = (rev * 0.39) / (rate * PAYROLL_BURDEN);
    if (hours >= 6) hours += 0.5;
    const [hh, mm] = (row.time_in || "07:30").split(":").map(Number);
    const startMin = hh * 60 + mm;
    const endMin   = startMin + Math.round(hours * 60);
    const outH = Math.floor(endMin / 60) % 24;
    const outM = endMin % 60;
    const outStr = `${String(outH).padStart(2, "0")}:${String(outM).padStart(2, "0")}`;
    const outFmt = new Date(`2000-01-01T${outStr}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return { hours, time_out: outFmt };
  }

  return (
    <div className="rounded-2xl overflow-hidden shadow-md" style={{ border: "1px solid rgba(16,64,32,0.12)" }}>
      <SectionHeader
        title="Reverse Revenue Calculator"
        subtitle="39% labor target · 15% payroll burden · +30 min lunch if ≥ 6 hrs"
        right={
          <button
            onClick={addRow}
            className="text-xs rounded-lg border border-white/25 bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 font-semibold transition-colors"
          >
            + Add Row
          </button>
        }
      />
      <div className="bg-white overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[540px]">
          <thead>
            <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
              <th className="px-5 py-3 text-left">Team Member</th>
              <th className="px-4 py-3 text-center">Target Revenue</th>
              <th className="px-4 py-3 text-center">Start Time</th>
              <th className="px-4 py-3 text-center">Hrs Needed</th>
              <th className="px-4 py-3 text-center">Clock Out</th>
              <th className="px-4 py-3 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const { hours, time_out } = calcResult(row);
              const hasResult = hours != null;
              return (
                <tr key={row.id} className={`border-t border-gray-50 transition-colors ${hasResult ? "hover:bg-emerald-50/20" : ""}`}>
                  <td className="px-4 py-2.5">
                    <select
                      value={row.employee_id}
                      onChange={e => update(row.id, "employee_id", e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 focus:outline-none focus:border-emerald-400 bg-gray-50"
                    >
                      <option value="">— Select person —</option>
                      {employees.map(e => (
                        <option key={e.id} value={String(e.id)}>
                          {e.last_name}, {e.first_name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="relative flex items-center justify-center">
                      <span className="absolute left-3 text-gray-400 text-xs pointer-events-none">$</span>
                      <input
                        type="number"
                        value={row.revenue}
                        onChange={e => update(row.id, "revenue", e.target.value)}
                        placeholder="0"
                        className="w-28 border border-gray-200 rounded-lg pl-6 pr-3 py-2 text-xs text-center focus:outline-none focus:border-emerald-400 bg-gray-50"
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <input
                      type="time"
                      value={row.time_in}
                      onChange={e => update(row.id, "time_in", e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-emerald-400 bg-gray-50 w-28"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {hasResult ? (
                      <span className="inline-flex items-center justify-center bg-emerald-50 text-emerald-800 font-bold text-sm rounded-lg px-3 py-1.5 min-w-[4rem]">
                        {hours!.toFixed(2)}
                      </span>
                    ) : <span className="text-gray-200 text-lg">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {time_out ? (
                      <span
                        className="inline-flex items-center justify-center text-white font-bold text-sm rounded-lg px-3 py-1.5 min-w-[5rem]"
                        style={{ background: "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)" }}
                      >
                        {time_out}
                      </span>
                    ) : <span className="text-gray-200 text-lg">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <button onClick={() => removeRow(row.id)} className="text-gray-200 hover:text-red-400 transition-colors">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Stat chip ─────────────────────────────────────────────────────────────────

function StatChip({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">{label}</span>
      <span className="text-2xl font-black text-white mt-0.5 leading-none">{value}</span>
      {sub && <span className="text-xs text-white/50 mt-1">{sub}</span>}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function LawnDashboard() {
  const [dash, setDash]       = useState<DashData | null>(null);
  const [employees, setEmps]  = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [dashRes, empRes] = await Promise.all([
      fetch("/api/operations-center/atlas-ops/lawn/dashboard", { cache: "no-store" }).then(r => r.json()),
      fetch("/api/atlas-time/employees", { cache: "no-store" }).then(r => r.json()),
    ]);
    setDash(dashRes);
    setEmps((empRes.employees ?? []).filter((e: any) => e.default_pay_rate));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Hero stats
  const ytdRev  = dash?.monthly.reduce((s, m) => s + m.revenue, 0) ?? 0;
  const ytdPay  = dash?.monthly.reduce((s, m) => s + m.payroll_cost, 0) ?? 0;
  const ytdLP   = ytdRev > 0 ? ytdPay / ytdRev : null;
  const curWeekRev = dash?.current_week.reduce((s, d) => s + d.revenue, 0) ?? 0;
  const curWeekPay = dash?.current_week.reduce((s, d) => s + d.payroll_cost, 0) ?? 0;
  const curWeekLP  = curWeekRev > 0 ? curWeekPay / curWeekRev : null;

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(160deg, #0d2616 0%, #1a4a28 60%, #f0f7f2 100%)" }}
      >
        <div className="flex items-center gap-3 text-white/50 text-sm">
          <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          Loading dashboard…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#f4f8f5" }}>

      {/* ── Hero banner ──────────────────────────────────────────────── */}
      <div style={{ background: "linear-gradient(135deg, #071a0e 0%, #0d2616 50%, #1a4a28 100%)" }} className="px-6 md:px-10 py-8">
        <div className="mx-auto max-w-[1400px]">
          {/* Title row */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-3 mb-1">
                {/* Leaf icon */}
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/>
                    <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
                  </svg>
                </div>
                <h1 className="text-xl font-black text-white tracking-tight">Lawn Operations</h1>
              </div>
              <p className="text-sm text-white/40 ml-11">Production performance & analytics · {new Date().getFullYear()}</p>
            </div>
            <div className="text-right">
              <div className="text-xs text-white/30 font-medium uppercase tracking-wider">
                {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </div>
            </div>
          </div>

          {/* Stat chips */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-2 border-t border-white/10">
            <StatChip label="YTD Revenue" value={money.format(ytdRev)} />
            <StatChip
              label="YTD Labor"
              value={ytdLP != null ? pct(ytdLP) : "—"}
              sub={ytdLP != null ? (ytdLP <= 0.39 ? "On target ✓" : "Above target") : undefined}
            />
            <StatChip label="This Week" value={money.format(curWeekRev)} />
            <StatChip
              label="Week Labor"
              value={curWeekLP != null ? pct(curWeekLP) : "—"}
              sub={curWeekLP != null ? (curWeekLP <= 0.39 ? "On target ✓" : "Above target") : undefined}
            />
          </div>
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-[1400px] px-4 md:px-6 py-7 space-y-6">

        {/* Current / Last Week */}
        <div className="flex gap-4">
          <WeekCard title="Current Week" days={dash?.current_week ?? []} isCurrent />
          <WeekCard title="Last Week"    days={dash?.last_week    ?? []} />
        </div>

        {/* Monthly */}
        <MonthlyTable data={dash?.monthly ?? []} />

        {/* Service Breakdown */}
        {(dash?.service_breakdown?.length ?? 0) > 0 && (
          <ServiceBreakdownCard data={dash!.service_breakdown} />
        )}

        {/* Calculator */}
        <RevenueCalculator employees={employees} />

      </div>
    </div>
  );
}
