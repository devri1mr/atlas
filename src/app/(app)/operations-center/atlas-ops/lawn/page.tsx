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

const money   = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const moneyDec = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct     = (n: number | null) => n == null ? "—" : `${Math.round(n * 100)}%`;
const MONTHS  = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PAYROLL_BURDEN = 1.15;

function fmtDate(d: string) {
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function laborColor(lp: number | null) {
  if (lp == null) return "text-gray-400";
  return lp > 0.39 ? "text-red-600 font-semibold" : "text-emerald-700 font-semibold";
}

function effColor(ep: number | null) {
  if (ep == null) return "text-gray-400";
  return ep >= 1 ? "text-emerald-700 font-semibold" : "text-red-600 font-semibold";
}

// ── Week Card ─────────────────────────────────────────────────────────────────

function WeekCard({ title, days }: { title: string; days: DayData[] }) {
  const totalRev = days.reduce((s, d) => s + d.revenue, 0);
  const totalPay = days.reduce((s, d) => s + d.payroll_cost, 0);
  const overallLP = totalRev > 0 ? totalPay / totalRev : null;

  return (
    <div className="rounded-xl border border-emerald-100 bg-white shadow-sm overflow-hidden flex-1 min-w-0">
      <div className="border-b border-emerald-100 bg-emerald-50/60 px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-emerald-950">{title}</span>
        {totalRev > 0 && (
          <div className="flex items-center gap-4 text-xs">
            <span className="text-gray-500">{money.format(totalRev)}</span>
            <span className={laborColor(overallLP)}>{pct(overallLP)} labor</span>
          </div>
        )}
      </div>
      <div className="divide-y divide-gray-50">
        {days.map(d => (
          <div key={d.date} className={`grid grid-cols-[3rem_5rem_1fr_5rem] items-center px-4 py-2.5 text-sm ${!d.has_data ? "opacity-40" : ""}`}>
            <span className="text-xs font-semibold text-gray-400 uppercase">{d.day}</span>
            <span className="text-xs text-gray-500">{fmtDate(d.date)}</span>
            <span className={`font-medium ${d.has_data ? "text-emerald-950" : "text-gray-300"}`}>
              {d.has_data ? money.format(d.revenue) : "—"}
            </span>
            <span className={`text-xs text-right ${d.has_data ? laborColor(d.labor_pct) : "text-gray-300"}`}>
              {d.has_data ? pct(d.labor_pct) : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Monthly Table ─────────────────────────────────────────────────────────────

function MonthlyTable({ data }: { data: MonthData[] }) {
  const totalRev = data.reduce((s, m) => s + m.revenue, 0);
  const totalPay = data.reduce((s, m) => s + m.payroll_cost, 0);

  return (
    <div className="rounded-xl border border-emerald-100 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-emerald-100 bg-emerald-50/60 px-5 py-3">
        <span className="text-sm font-semibold text-emerald-950">Monthly Overview — {new Date().getFullYear()}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-xs font-semibold text-emerald-900/60 bg-emerald-50/40">
              <th className="px-5 py-2.5 text-left">Month</th>
              <th className="px-4 py-2.5 text-center">Revenue</th>
              <th className="px-4 py-2.5 text-center">Labor %</th>
              <th className="px-4 py-2.5 text-center">Efficiency</th>
            </tr>
          </thead>
          <tbody>
            {data.map(m => (
              <tr key={m.month} className={`border-t border-gray-50 ${m.revenue === 0 ? "opacity-40" : "hover:bg-emerald-50/20"}`}>
                <td className="px-5 py-2.5 font-medium text-emerald-950">{MONTHS[m.month - 1]}</td>
                <td className="px-4 py-2.5 text-center text-gray-700">{m.revenue > 0 ? money.format(m.revenue) : "—"}</td>
                <td className={`px-4 py-2.5 text-center ${m.revenue > 0 ? laborColor(m.labor_pct) : "text-gray-300"}`}>
                  {m.revenue > 0 ? pct(m.labor_pct) : "—"}
                </td>
                <td className={`px-4 py-2.5 text-center ${m.revenue > 0 ? effColor(m.efficiency_pct) : "text-gray-300"}`}>
                  {m.revenue > 0 ? pct(m.efficiency_pct) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-emerald-200 bg-emerald-50/60 font-semibold text-emerald-950">
              <td className="px-5 py-2.5 text-sm">YTD Total</td>
              <td className="px-4 py-2.5 text-center text-sm">{money.format(totalRev)}</td>
              <td className={`px-4 py-2.5 text-center text-sm ${laborColor(totalRev > 0 ? totalPay / totalRev : null)}`}>
                {pct(totalRev > 0 ? totalPay / totalRev : null)}
              </td>
              <td className={`px-4 py-2.5 text-center text-sm ${effColor(totalPay > 0 ? (totalRev * 0.39) / totalPay : null)}`}>
                {pct(totalPay > 0 ? (totalRev * 0.39) / totalPay : null)}
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
  // Get unique week keys sorted desc
  const weekKeys = [...new Set(data.map(d => d.week_key))].sort((a, b) => b.localeCompare(a));
  const [selectedWeek, setSelectedWeek] = useState(weekKeys[0] ?? "");

  const rows = data.filter(d => d.week_key === selectedWeek);
  const totals = rows.reduce((t, r) => ({
    ot_hrs:       t.ot_hrs + r.ot_hrs,
    ot_cost:      t.ot_cost + r.ot_cost,
    total_hrs:    t.total_hrs + r.total_hrs,
    total_payroll:t.total_payroll + r.total_payroll,
    total_revenue:t.total_revenue + r.total_revenue,
  }), { ot_hrs: 0, ot_cost: 0, total_hrs: 0, total_payroll: 0, total_revenue: 0 });

  const weekLabel = rows[0]?.week_label ?? selectedWeek;

  return (
    <div className="rounded-xl border border-emerald-100 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-emerald-100 bg-emerald-50/60 px-5 py-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-emerald-950">Weekly Service Breakdown</span>
        <select
          value={selectedWeek}
          onChange={e => setSelectedWeek(e.target.value)}
          className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-700"
        >
          {weekKeys.map(wk => {
            const label = data.find(d => d.week_key === wk)?.week_label ?? wk;
            return <option key={wk} value={wk}>{label}</option>;
          })}
        </select>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-gray-400">No data for this week</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[700px]">
            <thead>
              <tr className="text-xs font-semibold text-emerald-900/60 bg-emerald-50/40">
                <th className="px-5 py-2.5 text-left">Service</th>
                <th className="px-4 py-2.5 text-center">OT Hrs</th>
                <th className="px-4 py-2.5 text-center">OT Cost</th>
                <th className="px-4 py-2.5 text-center">Total Hrs</th>
                <th className="px-4 py-2.5 text-center">Total Payroll</th>
                <th className="px-4 py-2.5 text-center">Revenue</th>
                <th className="px-4 py-2.5 text-center">Labor %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-gray-50 hover:bg-emerald-50/20">
                  <td className="px-5 py-2.5 font-medium text-emerald-950">{r.service}</td>
                  <td className="px-4 py-2.5 text-center text-gray-700">{r.ot_hrs > 0 ? r.ot_hrs.toFixed(2) : "—"}</td>
                  <td className="px-4 py-2.5 text-center text-gray-700">{r.ot_cost > 0 ? moneyDec.format(r.ot_cost) : "—"}</td>
                  <td className="px-4 py-2.5 text-center text-gray-700">{r.total_hrs.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-center text-gray-700">{moneyDec.format(r.total_payroll)}</td>
                  <td className="px-4 py-2.5 text-center font-medium text-emerald-950">{money.format(r.total_revenue)}</td>
                  <td className={`px-4 py-2.5 text-center ${laborColor(r.labor_pct)}`}>{pct(r.labor_pct)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-emerald-200 bg-emerald-50/60 font-semibold text-emerald-950 text-sm">
                <td className="px-5 py-2.5">Total — {weekLabel}</td>
                <td className="px-4 py-2.5 text-center">{totals.ot_hrs > 0 ? totals.ot_hrs.toFixed(2) : "—"}</td>
                <td className="px-4 py-2.5 text-center">{totals.ot_cost > 0 ? moneyDec.format(totals.ot_cost) : "—"}</td>
                <td className="px-4 py-2.5 text-center">{totals.total_hrs.toFixed(2)}</td>
                <td className="px-4 py-2.5 text-center">{moneyDec.format(totals.total_payroll)}</td>
                <td className="px-4 py-2.5 text-center">{money.format(totals.total_revenue)}</td>
                <td className={`px-4 py-2.5 text-center ${laborColor(totals.total_revenue > 0 ? totals.total_payroll / totals.total_revenue : null)}`}>
                  {pct(totals.total_revenue > 0 ? totals.total_payroll / totals.total_revenue : null)}
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
      // Auto-fill pay rate from employee selection
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
    // Add 30-min lunch if working 6+ hrs
    if (hours >= 6) hours += 0.5;

    // Compute clock-out
    const [hh, mm] = (row.time_in || "07:00").split(":").map(Number);
    const startMin = hh * 60 + mm;
    const endMin   = startMin + Math.round(hours * 60);
    const outH = Math.floor(endMin / 60) % 24;
    const outM = endMin % 60;
    const outStr = `${String(outH).padStart(2, "0")}:${String(outM).padStart(2, "0")}`;
    const outFmt = new Date(`2000-01-01T${outStr}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

    return { hours, time_out: outFmt };
  }

  return (
    <div className="rounded-xl border border-emerald-100 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-emerald-100 bg-emerald-50/60 px-5 py-3 flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-emerald-950">Reverse Revenue Calculator</span>
          <span className="text-xs text-emerald-900/50 ml-2">39% labor target · 15% payroll burden</span>
        </div>
        <button
          onClick={addRow}
          className="text-xs rounded border border-emerald-200 px-2.5 py-1 text-emerald-700 hover:bg-emerald-50 font-medium"
        >
          + Add Row
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[640px]">
          <thead>
            <tr className="text-xs font-semibold text-emerald-900/60 bg-emerald-50/40">
              <th className="px-5 py-2.5 text-left">Team Member</th>
              <th className="px-3 py-2.5 text-center">Target Revenue</th>
              <th className="px-3 py-2.5 text-center">Start Time</th>
              <th className="px-3 py-2.5 text-center">Hrs Needed</th>
              <th className="px-3 py-2.5 text-center">Clock Out</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const { hours, time_out } = calcResult(row);
              return (
                <tr key={row.id} className="border-t border-gray-50">
                  <td className="px-4 py-2">
                    <select
                      value={row.employee_id}
                      onChange={e => update(row.id, "employee_id", e.target.value)}
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs"
                    >
                      <option value="">— Select person —</option>
                      {employees.map(e => (
                        <option key={e.id} value={String(e.id)}>
                          {e.last_name}, {e.first_name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                      <input
                        type="number"
                        value={row.revenue}
                        onChange={e => update(row.id, "revenue", e.target.value)}
                        placeholder="0"
                        className="w-24 border border-gray-200 rounded pl-5 pr-2 py-1.5 text-xs text-center"
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="time"
                      value={row.time_in}
                      onChange={e => update(row.id, "time_in", e.target.value)}
                      className="border border-gray-200 rounded px-2 py-1.5 text-xs w-24"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    {hours != null ? (
                      <span className="font-semibold text-emerald-800">{hours.toFixed(2)}</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {time_out ? (
                      <span className="font-semibold text-emerald-800">{time_out}</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button onClick={() => removeRow(row.id)} className="text-gray-300 hover:text-red-400 text-xs">✕</button>
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

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function LawnDashboard() {
  const [dash, setDash]         = useState<DashData | null>(null);
  const [employees, setEmps]    = useState<Employee[]>([]);
  const [loading, setLoading]   = useState(true);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
        <span className="text-sm text-emerald-900/40">Loading dashboard…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="mx-auto max-w-[1400px] px-4 md:px-6 py-6 md:py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-emerald-950">Lawn Dashboard</h1>
          <p className="text-sm text-emerald-900/60 mt-0.5">Production performance & analytics</p>
        </div>

        {/* Current / Last Week side by side */}
        <div className="flex gap-4">
          <WeekCard title="Current Week" days={dash?.current_week ?? []} />
          <WeekCard title="Last Week"    days={dash?.last_week    ?? []} />
        </div>

        {/* Monthly Table */}
        <MonthlyTable data={dash?.monthly ?? []} />

        {/* Service Breakdown */}
        {(dash?.service_breakdown?.length ?? 0) > 0 && (
          <ServiceBreakdownCard data={dash!.service_breakdown} />
        )}

        {/* Reverse Revenue Calculator */}
        <RevenueCalculator employees={employees} />

      </div>
    </div>
  );
}
