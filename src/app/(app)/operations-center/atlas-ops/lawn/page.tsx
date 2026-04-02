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
  week_payroll_total: number;
};

type DashData = {
  current_week: DayData[];
  last_week: DayData[];
  monthly: MonthData[];
  service_breakdown: ServiceBreakdown[];
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

function MonthlyTable({ data }: { data: CogsMonth[] }) {
  const totalRev = data.reduce((s, m) => s + (m.revenue ?? 0), 0);
  const totalPay = data.reduce((s, m) => s + (m.labor   ?? 0), 0);
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
              const isCur    = i === curMonth;
              const hasBudget = m.budget_revenue > 0;
              const budget   = hasBudget ? m.budget_revenue : MONTHLY_BUDGET;
              const fillPct  = !hasBudget && m.revenue > 0
                ? 100
                : Math.min((m.revenue / budget) * 100, 100);
              const donePct  = Math.round(fillPct);
              const exceeded = !hasBudget ? m.revenue > 0 : m.revenue >= budget;
              const laborPct = m.revenue > 0 ? m.labor / m.revenue : null;
              const effPct   = m.labor   > 0 ? (m.revenue * 0.39) / m.labor : null;
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
                  <td className={`px-4 py-3 text-center ${m.revenue > 0 ? laborColorClass(laborPct) : "text-gray-300"}`}>
                    {m.revenue > 0 ? pct(laborPct) : "—"}
                  </td>
                  <td className={`px-4 py-3 text-center ${m.revenue > 0 ? effColorClass(effPct) : "text-gray-300"}`}>
                    {m.revenue > 0 ? pct(effPct) : "—"}
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
  // Full week payroll including downtime (not just production-hours portion)
  const fullWeekPayroll = rows[0]?.week_payroll_total ?? totals.total_payroll;

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
                <td className="px-4 py-3 text-center text-white/80 font-semibold text-xs">{moneyDec.format(fullWeekPayroll)}</td>
                <td className="px-4 py-3 text-center text-white font-bold">{money.format(totals.total_revenue)}</td>
                <td className="px-4 py-3 text-center">
                  {laborBadge(totals.total_revenue > 0 ? fullWeekPayroll / totals.total_revenue : null)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}


// ── COGS Widget ───────────────────────────────────────────────────────────────

type CogsMonth = {
  month: number;
  revenue: number; labor: number; job_materials: number; fuel: number; equipment: number;
  gross_profit: number; margin_pct: number | null;
  budget_revenue: number; budget_labor: number; budget_job_materials: number; budget_fuel: number; budget_equipment: number;
};

function CogsWidget() {
  const [data, setData] = useState<CogsMonth | null>(null);
  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear  = now.getFullYear();
  const monthName = MONTHS_FULL[curMonth - 1];

  useEffect(() => {
    fetch(`/api/operations-center/atlas-ops/lawn/cogs?year=${curYear}`)
      .then(r => r.ok ? r.json() : null)
      .then((rows: CogsMonth[] | null) => {
        if (!rows) return;
        setData(rows.find(r => r.month === curMonth) ?? null);
      });
  }, [curYear, curMonth]);

  function marginColor(m: number | null) {
    if (m == null) return "text-white/20";
    if (m >= 0.35) return "text-emerald-400";
    if (m >= 0.20) return "text-yellow-400";
    return "text-red-400";
  }
  function profitColor(p: number) {
    if (p > 0) return "text-emerald-300";
    if (p < 0) return "text-red-400";
    return "text-white/20";
  }

  const BG      = "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)";
  const BG_FOOT = "#0f3a1e";

  const fields: { label: string; key: keyof CogsMonth; isRev?: boolean }[] = [
    { label: "Revenue",       key: "revenue",       isRev: true },
    { label: "Labor",         key: "labor" },
    { label: "Job Materials", key: "job_materials" },
    { label: "Fuel",          key: "fuel" },
    { label: "Equipment",     key: "equipment" },
  ];

  return (
    <div className="rounded-2xl overflow-hidden shadow-md" style={{ border: "1px solid rgba(16,64,32,0.12)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5" style={{ background: BG }}>
        <div>
          <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">Lawn</span>
          <div className="text-sm font-bold text-white mt-0.5">COGS — {monthName} {curYear}</div>
        </div>
        <a href="/operations-center/atlas-ops/lawn/cogs"
          className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold transition-colors">
          Full view →
        </a>
      </div>

      {!data ? (
        <div className="bg-white px-5 py-6 text-center text-sm text-gray-400">No data yet for {monthName}</div>
      ) : (
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <tbody>
            {fields.map((f, fi) => {
              const val = data[f.key] as number;
              const pct = !f.isRev && data.revenue > 0 ? val / data.revenue : null;
              const bg  = fi % 2 === 0 ? "#fff" : "#f9fafb";
              return (
                <tr key={f.key} style={{ background: bg }}>
                  <td className="px-5 py-2.5 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${f.isRev ? "bg-sky-400" : "bg-emerald-400"}`} />
                      <span className={`text-xs font-semibold ${f.isRev ? "text-sky-700" : "text-gray-600"}`}>{f.label}</span>
                    </div>
                  </td>
                  <td className="px-5 py-2.5 text-right border-b border-gray-100">
                    <span className={`text-sm font-bold ${f.isRev ? "text-sky-700" : val > 0 ? "text-gray-800" : "text-gray-300"}`}>
                      {val > 0 ? money.format(val) : "—"}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-right border-b border-gray-100 w-16">
                    <span className="text-xs text-gray-400">
                      {pct !== null ? `${Math.round(pct * 100)}%` : ""}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: BG_FOOT }}>
              <td className="px-5 py-3">
                <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">Gross Profit</span>
              </td>
              <td className="px-5 py-3 text-right">
                <span className={`text-sm font-bold ${profitColor(data.gross_profit)}`}>
                  {money.format(data.gross_profit)}
                </span>
              </td>
              <td className="px-5 py-3 text-right w-16">
                <span className={`text-xs font-bold ${marginColor(data.margin_pct)}`}>
                  {data.margin_pct != null ? `${(data.margin_pct * 100).toFixed(1)}%` : "—"}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

// ── Pace Intelligence Card ────────────────────────────────────────────────────

/** Count weekdays (Mon–Fri) and weekend days from `fromDay` through end of month, inclusive. */
function countRemainingDays(year: number, month: number, fromDay: number) {
  const daysInMonth = new Date(year, month, 0).getDate();
  let weekdays = 0;
  let weekends = 0;
  for (let d = fromDay; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow === 0 || dow === 6) weekends++;
    else weekdays++;
  }
  return { weekdays, weekends };
}

/** Count weekdays in a full month. */
function weekdaysInFullMonth(year: number, month: number) {
  return countRemainingDays(year, month, 1).weekdays;
}

function PaceCard({ cogs }: { cogs: CogsMonth[] }) {
  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear  = now.getFullYear();
  const today    = now.getDate();
  const daysInMonth = new Date(curYear, curMonth, 0).getDate();

  const curMonthData = cogs.find(m => m.month === curMonth);
  const monthBudget  = curMonthData?.budget_revenue ?? 0;
  const actualMTD    = curMonthData?.revenue ?? 0;

  // YTD
  const ytdBudget  = cogs.filter(m => m.month <= curMonth).reduce((s, m) => s + (m.budget_revenue ?? 0), 0);
  const actualYTD  = cogs.reduce((s, m) => s + (m.revenue ?? 0), 0);
  const annualGoal = cogs.reduce((s, m) => s + (m.budget_revenue ?? 0), 0);
  const fullMonthsRemaining = 12 - curMonth;
  const requiredMonthlyAvg  = fullMonthsRemaining > 0 ? (annualGoal - actualYTD) / fullMonthsRemaining : null;

  // ── Weekday-aware monthly pace ──────────────────────────────────────────────
  // Count weekdays elapsed so far (days 1..today) to prorate against budget
  const { weekdays: wdElapsed } = countRemainingDays(curYear, curMonth, 1);
  const totalWeekdaysInMonth    = weekdaysInFullMonth(curYear, curMonth);
  // Elapsed is days 1..today; remaining is days today..end (today still counts as available)
  const { weekdays: wdRemaining, weekends: weRemaining } = countRemainingDays(curYear, curMonth, today);
  // Prorated budget: budget / weekdays-in-month * weekdays-elapsed-before-today
  const wdElapsedBefore = wdElapsed - wdRemaining; // weekdays strictly before today
  const proratedBudget  = totalWeekdaysInMonth > 0
    ? monthBudget * (wdElapsedBefore / totalWeekdaysInMonth)
    : 0;

  const monthRemaining   = monthBudget - actualMTD;
  const monthGap         = proratedBudget - actualMTD; // positive = behind prorated pace
  const onPaceMTD        = actualMTD >= proratedBudget;

  // Normal daily rate = budget / weekdays in month (baseline expectation per workday)
  const normalDailyRate  = totalWeekdaysInMonth > 0 ? monthBudget / totalWeekdaysInMonth : 0;

  // Required rate: weekdays only
  const reqPerWeekday    = wdRemaining > 0 && monthRemaining > 0 ? monthRemaining / wdRemaining : null;
  // Required rate: if weekends are also used (all remaining days)
  const totalDaysLeft    = wdRemaining + weRemaining;
  const reqWithWeekends  = totalDaysLeft > 0 && monthRemaining > 0 ? monthRemaining / totalDaysLeft : null;
  // "Required per week" = weekday-only rate × 5 (a normal 5-day production week)
  const reqPerWeek       = reqPerWeekday != null ? reqPerWeekday * 5 : null;

  // Flag: weekday rate is >20% above normal — weekends should be considered
  const isOverpace       = reqPerWeekday != null && normalDailyRate > 0 && reqPerWeekday > normalDailyRate * 1.20;

  // Progress bar: based on weekdays elapsed (prorated marker) vs calendar progress (bar fill)
  const calendarMarkerPct = Math.min((today / daysInMonth) * 100, 100);
  const mtdPct            = monthBudget > 0 ? Math.min(actualMTD / monthBudget, 1) : 0;
  const ytdPct            = ytdBudget  > 0 ? Math.min(actualYTD  / ytdBudget,  1) : 0;
  const onPaceYTD         = actualYTD >= ytdBudget;

  if (monthBudget === 0 && ytdBudget === 0) return null;

  const MO_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  return (
    <div className="rounded-2xl overflow-hidden shadow-md" style={{ border: "1px solid rgba(16,64,32,0.12)" }}>
      <SectionHeader
        title="Pace Intelligence"
        subtitle={`${MONTHS_FULL[curMonth - 1]} ${curYear} · Targets based on weekday production days — auto-adjusting`}
      />
      <div className="bg-white divide-y divide-gray-100">

        {/* ── Monthly pace ─────────────────────────────────────────────── */}
        <div className="px-5 py-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Monthly Pace — {MONTHS_FULL[curMonth - 1]}</div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xl font-bold text-gray-900">{money.format(actualMTD)}</span>
                <span className="text-sm text-gray-400">earned of {money.format(monthBudget)}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                  onPaceMTD
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-red-50 text-red-600 border-red-200"
                }`}>
                  {onPaceMTD
                    ? `${money.format(actualMTD - proratedBudget)} ahead of weekday pace`
                    : `${money.format(Math.abs(monthGap))} behind weekday pace`}
                </span>
              </div>
            </div>
            <div className="text-right shrink-0 ml-4">
              <div className="text-xs text-gray-400">{wdRemaining} weekday{wdRemaining !== 1 ? "s" : ""} left</div>
              <div className="text-xs text-gray-400 mt-0.5">{weRemaining} weekend day{weRemaining !== 1 ? "s" : ""} available</div>
            </div>
          </div>

          {/* Progress bar — fill = actual earned, amber tick = weekday-prorated target */}
          <div className="relative h-3 rounded-full bg-gray-100 overflow-visible mb-1.5">
            <div
              className={`h-full rounded-full transition-all ${onPaceMTD ? "bg-emerald-500" : "bg-red-400"}`}
              style={{ width: `${mtdPct * 100}%` }}
            />
            {/* Amber tick = where you "should be" based on weekdays elapsed */}
            {totalWeekdaysInMonth > 0 && (
              <div
                className="absolute top-1/2 -translate-y-1/2 w-0.5 h-5 bg-amber-400 rounded-full z-10"
                style={{ left: `${calendarMarkerPct}%` }}
              />
            )}
          </div>
          <div className="flex justify-between text-xs text-gray-400 mb-4">
            <span>{Math.round(mtdPct * 100)}% of monthly goal earned</span>
            <span className="text-amber-600 font-medium">↑ weekday pace target</span>
          </div>

          {/* Target chips */}
          {monthRemaining > 0 && reqPerWeekday != null ? (
            <div className="space-y-3">
              {/* Primary: weekdays-only targets */}
              <div className="grid grid-cols-2 gap-3">
                <div className={`rounded-xl px-4 py-3 ${isOverpace ? "bg-amber-50 border border-amber-200" : "bg-gray-50"}`}>
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Required / Weekday</div>
                  <div className={`text-lg font-bold ${isOverpace ? "text-amber-700" : "text-gray-900"}`}>
                    {money.format(reqPerWeekday)}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    over {wdRemaining} remaining weekday{wdRemaining !== 1 ? "s" : ""}
                  </div>
                </div>
                <div className={`rounded-xl px-4 py-3 ${isOverpace ? "bg-amber-50 border border-amber-200" : "bg-gray-50"}`}>
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Required / Week</div>
                  <div className={`text-lg font-bold ${isOverpace ? "text-amber-700" : "text-gray-900"}`}>
                    {money.format(reqPerWeek!)}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">standard 5-day week</div>
                </div>
              </div>

              {/* Weekend relief scenario — shown when behind or overpace */}
              {weRemaining > 0 && reqWithWeekends != null && (
                <div className={`rounded-xl px-4 py-3 border ${
                  isOverpace
                    ? "bg-blue-50 border-blue-200"
                    : "bg-gray-50 border-gray-100"
                }`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                        {isOverpace ? "Weekend Recovery Option" : "If Working Weekends"}
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-lg font-bold ${isOverpace ? "text-blue-700" : "text-gray-700"}`}>
                          {money.format(reqWithWeekends)}
                        </span>
                        <span className="text-xs text-gray-400">/ day if all {totalDaysLeft} days used</span>
                      </div>
                      {isOverpace && (
                        <div className="text-xs text-blue-600 mt-1 font-medium">
                          Reduces daily target by {money.format(reqPerWeekday - reqWithWeekends)} vs weekdays only
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-gray-400">{weRemaining} weekend</div>
                      <div className="text-xs text-gray-400">{weRemaining === 1 ? "day" : "days"} available</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Overpace warning */}
              {isOverpace && (
                <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <svg className="shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <div className="text-xs text-amber-800">
                    <span className="font-semibold">Required weekday rate is {Math.round((reqPerWeekday / normalDailyRate - 1) * 100)}% above normal pace</span>
                    {weRemaining > 0
                      ? ` — consider scheduling weekend work to distribute the load. ${weRemaining} weekend day${weRemaining !== 1 ? "s" : ""} remain this month.`
                      : " — no weekend days remain. Push weekday production."}
                  </div>
                </div>
              )}
            </div>
          ) : monthRemaining <= 0 ? (
            <div className="text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-4 py-2.5 rounded-xl">
              Monthly goal achieved — {money.format(Math.abs(monthRemaining))} over budget
            </div>
          ) : null}
        </div>

        {/* ── YTD pace ─────────────────────────────────────────────────── */}
        <div className="px-5 py-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">YTD Pace — {curYear}</div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xl font-bold text-gray-900">{money.format(actualYTD)}</span>
                <span className="text-sm text-gray-400">of {money.format(ytdBudget)} thru {MO_SHORT[curMonth - 1]}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                  onPaceYTD
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-amber-50 text-amber-700 border-amber-200"
                }`}>
                  {onPaceYTD
                    ? `${pct(actualYTD / ytdBudget - 1)} above YTD pace`
                    : `${money.format(ytdBudget - actualYTD)} behind YTD`}
                </span>
              </div>
            </div>
            <div className="text-right shrink-0 ml-4">
              <div className="text-xs text-gray-400">Annual Goal</div>
              <div className="text-sm font-bold text-gray-700">{money.format(annualGoal)}</div>
            </div>
          </div>

          {/* YTD progress bar */}
          <div className="relative h-3 rounded-full bg-gray-100 overflow-hidden mb-1.5">
            <div
              className={`h-full rounded-full ${onPaceYTD ? "bg-emerald-500" : "bg-amber-400"}`}
              style={{ width: `${ytdPct * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mb-4">
            <span>{Math.round(ytdPct * 100)}% of YTD budget earned</span>
            <span>{annualGoal > 0 ? Math.round((actualYTD / annualGoal) * 100) : 0}% of annual goal</span>
          </div>

          {/* Required monthly avg */}
          {requiredMonthlyAvg != null && fullMonthsRemaining > 0 && (
            <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Needed Avg / Month</div>
                <div className={`text-lg font-bold ${requiredMonthlyAvg > (annualGoal / 12) * 1.1 ? "text-amber-600" : "text-gray-900"}`}>
                  {money.format(requiredMonthlyAvg)}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  over {fullMonthsRemaining} remaining {fullMonthsRemaining === 1 ? "month" : "months"} to reach {money.format(annualGoal)} annual goal
                </div>
              </div>
              {requiredMonthlyAvg > (annualGoal / 12) && annualGoal > 0 && (
                <div className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center shrink-0">
                  {pct(requiredMonthlyAvg / (annualGoal / 12) - 1)} above<br />avg monthly goal
                </div>
              )}
            </div>
          )}
          {(requiredMonthlyAvg == null || requiredMonthlyAvg <= 0) && actualYTD >= annualGoal && (
            <div className="text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-4 py-2.5 rounded-xl">
              Annual goal achieved — {money.format(actualYTD - annualGoal)} over target
            </div>
          )}
        </div>

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
  const [cogs, setCogs]       = useState<CogsMonth[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const year = new Date().getFullYear();
    const [dashRes, cogsRes] = await Promise.all([
      fetch("/api/operations-center/atlas-ops/lawn/dashboard", { cache: "no-store" }).then(r => r.json()),
      fetch(`/api/operations-center/atlas-ops/lawn/cogs?year=${year}`, { cache: "no-store" }).then(r => r.ok ? r.json() : []),
    ]);
    setDash(dashRes);
    setCogs(cogsRes ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Hero stats — use COGS as source of truth for revenue and labor
  const ytdRev  = cogs.reduce((s, m) => s + (m.revenue ?? 0), 0);
  const ytdPay  = cogs.reduce((s, m) => s + (m.labor   ?? 0), 0);
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

        {/* Pace Intelligence */}
        <PaceCard cogs={cogs} />

        {/* Calculator link */}
        <a
          href="/operations-center/atlas-ops/lawn/calculator"
          className="flex items-center justify-between rounded-2xl px-6 py-4 shadow-md transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)", border: "1px solid rgba(16,64,32,0.12)" }}
        >
          <div>
            <div className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-0.5">Planning Tool</div>
            <div className="text-base font-semibold text-white">Reverse Revenue Calculator</div>
            <div className="text-xs text-white/40 mt-0.5">Calculate required hours & clock-out time from crew revenue → 39% target</div>
          </div>
          <div className="text-white/40 text-xl ml-4">→</div>
        </a>

      </div>
    </div>
  );
}
