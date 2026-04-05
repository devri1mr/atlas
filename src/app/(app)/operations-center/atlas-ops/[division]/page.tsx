"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

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

type DashData = {
  current_week: DayData[];
  last_week: DayData[];
  monthly: MonthData[];
};

type CogsMonth = {
  month: number;
  revenue: number;
  labor: number;
  job_materials: number;
  fuel: number;
  equipment: number;
  gross_profit: number;
  margin_pct: number | null;
  budget_revenue: number;
  budget_labor: number;
};

// ── Formatters ─────────────────────────────────────────────────────────────────

const money    = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct      = (n: number | null) => n == null ? "—" : `${Math.round(n * 100)}%`;
const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function fmtDate(d: string) {
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function laborBadge(lp: number | null, size: "sm" | "lg" = "sm") {
  if (lp == null) return <span className="text-white/30">—</span>;
  const good = lp <= 0.39;
  const base = size === "lg" ? "text-base font-bold" : "text-xs font-semibold";
  return <span className={`${base} ${good ? "text-emerald-300" : "text-red-400"}`}>{pct(lp)}</span>;
}

function laborColorClass(lp: number | null) {
  if (lp == null) return "text-gray-400";
  return lp > 0.39 ? "text-red-500 font-semibold" : "text-emerald-600 font-semibold";
}

// ── Pace helpers ───────────────────────────────────────────────────────────────

function countRemainingDays(year: number, month: number, fromDay: number) {
  const daysInMonth = new Date(year, month, 0).getDate();
  let weekdays = 0, weekends = 0;
  for (let d = fromDay; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow === 0 || dow === 6) weekends++; else weekdays++;
  }
  return { weekdays, weekends };
}

function weekdaysInFullMonth(year: number, month: number) {
  return countRemainingDays(year, month, 1).weekdays;
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5"
      style={{ background: "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)" }}>
      <div>
        <div className="text-sm font-semibold text-white">{title}</div>
        {subtitle && <div className="text-xs text-white/40 mt-0.5">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

// ── Week Card ──────────────────────────────────────────────────────────────────

function WeekCard({ title, days }: { title: string; days: DayData[] }) {
  const totalRev = days.reduce((s, d) => s + d.revenue, 0);
  const totalPay = days.reduce((s, d) => s + d.payroll_cost, 0);
  const overallLP = totalRev > 0 ? totalPay / totalRev : null;
  const maxRev = Math.max(...days.map(d => d.revenue), 1);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  return (
    <div className="rounded-2xl overflow-hidden shadow-md flex-1 min-w-0" style={{ border: "1px solid rgba(16,64,32,0.12)" }}>
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
      <div className="bg-white divide-y divide-gray-50">
        {days.map(d => {
          const barWidth = d.has_data ? (d.revenue / maxRev) * 100 : 0;
          const isToday = d.date === today;
          const isWeekend = d.day === "Sat" || d.day === "Sun";
          return (
            <div key={d.date} className={`relative grid grid-cols-[2.5rem_4rem_1fr_4.5rem] items-center px-4 py-2.5 gap-2 ${isToday ? "bg-emerald-50" : isWeekend ? "bg-gray-50/60" : ""}`}>
              {d.has_data && (
                <div className="absolute inset-y-0 left-0 bg-emerald-500/6 pointer-events-none" style={{ width: `${barWidth}%` }} />
              )}
              <span className={`text-xs font-bold uppercase relative z-10 ${isToday ? "text-emerald-700" : isWeekend ? "text-gray-300" : "text-gray-400"}`}>{d.day}</span>
              <span className={`text-xs relative z-10 ${isWeekend ? "text-gray-300" : "text-gray-400"}`}>{fmtDate(d.date)}</span>
              <span className={`font-semibold text-sm relative z-10 ${!d.has_data ? "text-gray-200" : isToday ? "text-emerald-800" : "text-gray-800"}`}>
                {d.has_data ? money.format(d.revenue) : "—"}
              </span>
              <span className={`text-xs relative z-10 font-semibold text-center ${!d.has_data ? "text-gray-200" : d.labor_pct != null && d.labor_pct > 0.39 ? "text-red-500" : "text-emerald-600"}`}>
                {d.has_data ? pct(d.labor_pct) : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Monthly Table ──────────────────────────────────────────────────────────────

function MonthlyTable({ data, cogsData }: { data: MonthData[]; cogsData: CogsMonth[] }) {
  const curMonth = new Date().getMonth();
  const totalRev = data.reduce((s, m) => s + (m.revenue ?? 0), 0);
  const totalPay = data.reduce((s, m) => s + (m.payroll_cost ?? 0), 0);

  return (
    <div className="rounded-2xl overflow-hidden shadow-md" style={{ border: "1px solid rgba(16,64,32,0.12)" }}>
      <SectionHeader title={`Monthly Overview — ${new Date().getFullYear()}`} subtitle="Revenue · Labor % · Budget progress" />
      <div className="bg-white overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
              <th className="px-5 py-3 text-center">Month</th>
              <th className="px-4 py-3 text-center w-48">Budget Progress</th>
              <th className="px-4 py-3 text-center">Revenue</th>
              <th className="px-4 py-3 text-center">Labor %</th>
              <th className="px-4 py-3 text-center">GP %</th>
            </tr>
          </thead>
          <tbody>
            {data.map((m, i) => {
              const isCur    = i === curMonth;
              const cogs     = cogsData.find(c => c.month === m.month);
              const budget   = cogs?.budget_revenue ?? 0;
              const fillPct  = budget > 0 ? Math.min((m.revenue / budget) * 100, 100) : (m.revenue > 0 ? 100 : 0);
              const exceeded = budget > 0 ? m.revenue >= budget : m.revenue > 0;
              const laborPct = m.revenue > 0 ? m.payroll_cost / m.revenue : null;
              const gpPct    = cogs && cogs.revenue > 0 ? cogs.margin_pct : null;
              return (
                <tr key={m.month} className={`border-t border-gray-50 transition-colors ${m.revenue === 0 ? "opacity-35" : isCur ? "bg-emerald-50/60" : "hover:bg-gray-50/60"}`}>
                  <td className="px-5 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      {isCur && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />}
                      <span className={`font-semibold ${isCur ? "text-emerald-800" : "text-gray-700"}`}>{MONTHS_FULL[m.month - 1]}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {m.revenue > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="relative h-2 rounded-full bg-gray-100 overflow-hidden flex-1 min-w-0">
                          <div className={`h-full rounded-full transition-all ${exceeded ? "bg-emerald-500" : isCur ? "bg-emerald-500" : "bg-emerald-400"}`} style={{ width: `${fillPct}%` }} />
                        </div>
                        <span className={`text-xs font-semibold shrink-0 ${exceeded ? "text-emerald-600" : isCur ? "text-emerald-700" : "text-gray-500"}`}>{Math.round(fillPct)}%</span>
                      </div>
                    ) : (
                      <div className="h-2 rounded-full bg-gray-100 w-full" />
                    )}
                  </td>
                  <td className={`px-4 py-3 text-center font-semibold text-gray-800 ${m.revenue === 0 ? "text-gray-300" : ""}`}>{m.revenue > 0 ? money.format(m.revenue) : "—"}</td>
                  <td className={`px-4 py-3 text-center ${m.revenue > 0 ? laborColorClass(laborPct) : "text-gray-300"}`}>{m.revenue > 0 ? pct(laborPct) : "—"}</td>
                  <td className={`px-4 py-3 text-center font-semibold ${gpPct == null ? "text-gray-300" : gpPct >= 0.45 ? "text-emerald-600" : gpPct >= 0.30 ? "text-amber-600" : "text-red-500"}`}>
                    {gpPct != null ? pct(gpPct) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)" }}>
              <td className="px-5 py-3 text-sm font-bold text-white text-center">YTD Total</td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3 text-center text-sm font-bold text-white">{money.format(totalRev)}</td>
              <td className="px-4 py-3 text-center">{laborBadge(totalRev > 0 ? totalPay / totalRev : null)}</td>
              <td className="px-4 py-3" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── COGS Widget ────────────────────────────────────────────────────────────────

function CogsWidget() {
  const [data, setData] = useState<CogsMonth | null>(null);
  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear  = now.getFullYear();
  const monthName = MONTHS_FULL[curMonth - 1];

  useEffect(() => {
    fetch(`/api/operations-center/atlas-ops/fertilization/cogs?year=${curYear}`)
      .then(r => r.ok ? r.json() : null)
      .then((rows: CogsMonth[] | null) => {
        if (!rows) return;
        setData(rows.find(r => r.month === curMonth) ?? null);
      });
  }, [curYear, curMonth]);

  const fields: { label: string; key: keyof CogsMonth; isRev?: boolean }[] = [
    { label: "Revenue",       key: "revenue",       isRev: true },
    { label: "Labor",         key: "labor" },
    { label: "Materials",     key: "job_materials" },
    { label: "Fuel",          key: "fuel" },
    { label: "Equipment",     key: "equipment" },
  ];

  return (
    <div className="rounded-2xl overflow-hidden shadow-md" style={{ border: "1px solid rgba(16,64,32,0.12)" }}>
      <div className="flex items-center justify-between px-5 py-3.5" style={{ background: "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)" }}>
        <div>
          <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">Fertilization</span>
          <div className="text-sm font-bold text-white mt-0.5">COGS — {monthName} {curYear}</div>
        </div>
        <a href="/operations-center/atlas-ops/fertilization/cogs" className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold transition-colors">Full view →</a>
      </div>
      {!data ? (
        <div className="bg-white px-5 py-6 text-center text-sm text-gray-400">No data yet for {monthName}</div>
      ) : (
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <tbody>
            {fields.map((f, fi) => {
              const val = data[f.key] as number;
              const p   = !f.isRev && data.revenue > 0 ? val / data.revenue : null;
              const bg  = fi % 2 === 0 ? "#fff" : "#f9fafb";
              return (
                <tr key={f.key} style={{ background: bg }}>
                  <td className="px-5 py-2.5 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${f.isRev ? "bg-sky-400" : "bg-emerald-400"}`} />
                      <span className={`text-xs font-semibold ${f.isRev ? "text-sky-700" : "text-gray-600"}`}>{f.label}</span>
                    </div>
                  </td>
                  <td className="px-5 py-2.5 text-center border-b border-gray-100">
                    <span className={`text-sm font-bold ${f.isRev ? "text-sky-700" : val > 0 ? "text-gray-800" : "text-gray-300"}`}>{val > 0 ? money.format(val) : "—"}</span>
                  </td>
                  <td className="px-5 py-2.5 text-center border-b border-gray-100 w-16">
                    <span className="text-xs text-gray-400">{p !== null ? `${Math.round(p * 100)}%` : ""}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: "#0f3a1e" }}>
              <td className="px-5 py-3 text-xs font-bold text-emerald-300 uppercase tracking-wider">Gross Profit</td>
              <td className="px-5 py-3 text-center">
                <span className={`text-sm font-bold ${data.gross_profit > 0 ? "text-emerald-300" : data.gross_profit < 0 ? "text-red-400" : "text-white/20"}`}>{money.format(data.gross_profit)}</span>
              </td>
              <td className="px-5 py-3 text-center w-16">
                <span className={`text-xs font-bold ${data.margin_pct == null ? "text-white/20" : data.margin_pct >= 0.35 ? "text-emerald-400" : data.margin_pct >= 0.20 ? "text-yellow-400" : "text-red-400"}`}>
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

// ── Pace Intelligence ──────────────────────────────────────────────────────────

function PaceCard({ cogs }: { cogs: CogsMonth[] }) {
  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear  = now.getFullYear();
  const today    = now.getDate();
  const daysInMonth = new Date(curYear, curMonth, 0).getDate();

  const curMonthData = cogs.find(m => m.month === curMonth);
  const monthBudget  = curMonthData?.budget_revenue ?? 0;
  const actualMTD    = curMonthData?.revenue ?? 0;

  const ytdBudget  = cogs.filter(m => m.month <= curMonth).reduce((s, m) => s + (m.budget_revenue ?? 0), 0);
  const actualYTD  = cogs.reduce((s, m) => s + (m.revenue ?? 0), 0);
  const annualGoal = cogs.reduce((s, m) => s + (m.budget_revenue ?? 0), 0);
  const fullMonthsRemaining = 12 - curMonth;
  const requiredMonthlyAvg  = fullMonthsRemaining > 0 ? (annualGoal - actualYTD) / fullMonthsRemaining : null;

  const { weekdays: wdElapsed } = countRemainingDays(curYear, curMonth, 1);
  const totalWeekdaysInMonth    = weekdaysInFullMonth(curYear, curMonth);
  const { weekdays: wdRemaining, weekends: weRemaining } = countRemainingDays(curYear, curMonth, today);
  const wdElapsedBefore = wdElapsed - wdRemaining;
  const proratedBudget  = totalWeekdaysInMonth > 0 ? monthBudget * (wdElapsedBefore / totalWeekdaysInMonth) : 0;

  const monthRemaining = monthBudget - actualMTD;
  const monthGap       = proratedBudget - actualMTD;
  const onPaceMTD      = actualMTD >= proratedBudget;

  const normalDailyRate = totalWeekdaysInMonth > 0 ? monthBudget / totalWeekdaysInMonth : 0;
  const reqPerWeekday   = wdRemaining > 0 && monthRemaining > 0 ? monthRemaining / wdRemaining : null;
  const totalDaysLeft   = wdRemaining + weRemaining;
  const reqWithWeekends = totalDaysLeft > 0 && monthRemaining > 0 ? monthRemaining / totalDaysLeft : null;
  const reqPerWeek      = reqPerWeekday != null ? reqPerWeekday * 5 : null;
  const isOverpace      = reqPerWeekday != null && normalDailyRate > 0 && reqPerWeekday > normalDailyRate * 1.20;

  const dailyRunRate      = wdElapsedBefore >= 3 && actualMTD > 0 ? actualMTD / wdElapsedBefore : null;
  const projectedMonthEnd = dailyRunRate != null ? actualMTD + dailyRunRate * wdRemaining : null;

  const actualLabor    = curMonthData?.labor ?? 0;
  const budgetLabor    = curMonthData?.budget_labor ?? 0;
  const actualLaborPct = actualMTD > 0 && actualLabor > 0 ? actualLabor / actualMTD : null;
  const budgetLaborPct = monthBudget > 0 && budgetLabor > 0 ? budgetLabor / monthBudget : null;

  const mtdPct = monthBudget > 0 ? Math.min(actualMTD / monthBudget, 1) : 0;
  const ytdPct = ytdBudget  > 0 ? Math.min(actualYTD  / ytdBudget,  1) : 0;
  const onPaceYTD = actualYTD >= ytdBudget;

  if (monthBudget === 0 && ytdBudget === 0) return null;

  return (
    <div className="rounded-2xl overflow-hidden shadow-md" style={{ border: "1px solid rgba(16,64,32,0.12)" }}>
      <SectionHeader
        title="Pace Intelligence"
        subtitle={`${MONTHS_FULL[curMonth - 1]} ${curYear} · Targets based on weekday production days — auto-adjusting`}
      />
      <div className="bg-white divide-y divide-gray-100">

        {/* Monthly pace */}
        <div className="px-5 py-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Monthly Pace — {MONTHS_FULL[curMonth - 1]}</div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xl font-bold text-gray-900">{money.format(actualMTD)}</span>
                <span className="text-sm text-gray-400">earned of {money.format(monthBudget)}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${onPaceMTD ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-600 border-red-200"}`}>
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

          <div className="relative h-3 rounded-full bg-gray-100 overflow-visible mb-1.5">
            <div className={`h-full rounded-full transition-all ${onPaceMTD ? "bg-emerald-500" : "bg-red-400"}`} style={{ width: `${mtdPct * 100}%` }} />
            {totalWeekdaysInMonth > 0 && (
              <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-5 bg-amber-400 rounded-full z-10"
                style={{ left: `${Math.min((today / daysInMonth) * 100, 100)}%` }} />
            )}
          </div>
          <div className="flex justify-between text-xs text-gray-400 mb-3">
            <span>{Math.round(mtdPct * 100)}% of monthly goal earned</span>
            <span className="text-amber-600 font-medium">↑ weekday pace target</span>
          </div>

          {projectedMonthEnd != null && (
            <div className="flex items-center gap-2 text-xs mb-4 bg-gray-50 rounded-lg px-3 py-2">
              <span className="text-gray-500">{money.format(Math.round(dailyRunRate!))}/day run rate</span>
              <span className="text-gray-300">·</span>
              <span className="text-gray-500">Projected month-end:</span>
              <span className={`font-semibold ${projectedMonthEnd >= monthBudget ? "text-emerald-600" : "text-amber-600"}`}>{money.format(Math.round(projectedMonthEnd))}</span>
              {projectedMonthEnd < monthBudget && (
                <span className="text-gray-400">({money.format(Math.round(monthBudget - projectedMonthEnd))} short)</span>
              )}
            </div>
          )}

          {monthRemaining > 0 && reqPerWeekday != null ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className={`rounded-xl px-4 py-3 ${isOverpace ? "bg-amber-50 border border-amber-200" : "bg-gray-50"}`}>
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Required / Weekday</div>
                  <div className={`text-lg font-bold ${isOverpace ? "text-amber-700" : "text-gray-900"}`}>{money.format(reqPerWeekday)}</div>
                  <div className="text-xs text-gray-400 mt-0.5">over {wdRemaining} remaining weekday{wdRemaining !== 1 ? "s" : ""}</div>
                </div>
                <div className={`rounded-xl px-4 py-3 ${isOverpace ? "bg-amber-50 border border-amber-200" : "bg-gray-50"}`}>
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Required / Week</div>
                  <div className={`text-lg font-bold ${isOverpace ? "text-amber-700" : "text-gray-900"}`}>{money.format(reqPerWeek!)}</div>
                  <div className="text-xs text-gray-400 mt-0.5">standard 5-day week</div>
                </div>
              </div>

              {weRemaining > 0 && reqWithWeekends != null && (
                <div className={`rounded-xl px-4 py-3 border ${isOverpace ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-100"}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{isOverpace ? "Weekend Recovery Option" : "If Working Weekends"}</div>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-lg font-bold ${isOverpace ? "text-blue-700" : "text-gray-700"}`}>{money.format(reqWithWeekends)}</span>
                        <span className="text-xs text-gray-400">/ day if all {totalDaysLeft} days used</span>
                      </div>
                      {isOverpace && (
                        <div className="text-xs text-blue-600 mt-1 font-medium">Reduces daily target by {money.format(reqPerWeekday - reqWithWeekends)} vs weekdays only</div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-gray-400">{weRemaining} weekend</div>
                      <div className="text-xs text-gray-400">{weRemaining === 1 ? "day" : "days"} available</div>
                    </div>
                  </div>
                </div>
              )}

              {isOverpace && (
                <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <svg className="shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <div className="text-xs text-amber-800">
                    <span className="font-semibold">Required weekday rate is {Math.round((reqPerWeekday / normalDailyRate - 1) * 100)}% above normal pace</span>
                    {weRemaining > 0 ? ` — consider scheduling weekend work. ${weRemaining} weekend day${weRemaining !== 1 ? "s" : ""} remain this month.` : " — no weekend days remain. Push weekday production."}
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

        {/* Labor % this month */}
        {actualLaborPct !== null && (
          <div className="px-5 py-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Labor % — {MONTHS_FULL[curMonth - 1]}</div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-xl px-4 py-3">
                <div className="text-xs text-gray-400 mb-1">Actual</div>
                <div className={`text-lg font-bold ${actualLaborPct > 0.39 ? "text-red-600" : "text-emerald-700"}`}>{pct(actualLaborPct)}</div>
              </div>
              {budgetLaborPct !== null && (
                <div className="bg-gray-50 rounded-xl px-4 py-3">
                  <div className="text-xs text-gray-400 mb-1">Budget</div>
                  <div className="text-lg font-bold text-gray-700">{pct(budgetLaborPct)}</div>
                </div>
              )}
              <div className="bg-gray-50 rounded-xl px-4 py-3">
                <div className="text-xs text-gray-400 mb-1">vs Budget</div>
                {budgetLaborPct !== null ? (
                  <div className={`text-lg font-bold ${actualLaborPct <= budgetLaborPct ? "text-emerald-700" : "text-red-600"}`}>
                    {actualLaborPct <= budgetLaborPct ? "−" : "+"}{pct(Math.abs(actualLaborPct - budgetLaborPct))}
                  </div>
                ) : <div className="text-lg font-bold text-gray-300">—</div>}
              </div>
            </div>
          </div>
        )}

        {/* YTD pace */}
        {ytdBudget > 0 && (
          <div className="px-5 py-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">YTD Pace</div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-base font-bold text-gray-900">{money.format(actualYTD)}</span>
              <span className="text-sm text-gray-400">of {money.format(ytdBudget)} YTD budget</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${onPaceYTD ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-600 border-red-200"}`}>
                {onPaceYTD ? `${money.format(actualYTD - ytdBudget)} ahead` : `${money.format(ytdBudget - actualYTD)} behind`}
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-gray-100 overflow-hidden mb-2">
              <div className={`h-full rounded-full ${onPaceYTD ? "bg-emerald-500" : "bg-red-400"}`} style={{ width: `${ytdPct * 100}%` }} />
            </div>
            {requiredMonthlyAvg != null && fullMonthsRemaining > 0 && (
              <div className="text-xs text-gray-500">
                Annual goal: <strong>{money.format(annualGoal)}</strong> · Need avg <strong>{money.format(Math.round(requiredMonthlyAvg))}/mo</strong> over {fullMonthsRemaining} remaining month{fullMonthsRemaining !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AtlasOpsDivisionPage() {
  const { division } = useParams<{ division: string }>();

  const [dash, setDash]       = useState<DashData | null>(null);
  const [cogs, setCogs]       = useState<CogsMonth[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (division !== "fertilization") { setLoading(false); return; }
    setLoading(true);
    const year = new Date().getFullYear();
    const [dashRes, cogsRes] = await Promise.all([
      fetch("/api/operations-center/atlas-ops/fertilization/dashboard"),
      fetch(`/api/operations-center/atlas-ops/fertilization/cogs?year=${year}`),
    ]);
    if (dashRes.ok) setDash(await dashRes.json());
    if (cogsRes.ok) setCogs(await cogsRes.json());
    setLoading(false);
  }, [division]);

  useEffect(() => { load(); }, [load]);

  if (division !== "fertilization") {
    const divisionName = division.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
        <div className="mx-auto max-w-5xl px-4 md:px-6 py-6 md:py-8">
          <div className="flex flex-col gap-1 mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-emerald-950">{divisionName}</h1>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-white shadow-sm px-6 py-10 text-center">
            <p className="text-sm text-emerald-900/50">Dashboard coming soon for {divisionName}.</p>
          </div>
        </div>
      </div>
    );
  }

  const BG = "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)";

  return (
    <div className="min-h-screen" style={{ background: "#f0f4f0" }}>

      {/* Hero */}
      <div className="px-6 py-5" style={{ background: BG }}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">Operations Dashboard</span>
            </div>
            <div className="text-2xl font-black text-white">Fertilization</div>
            <div className="text-xs text-white/40 mt-0.5">Production performance · {new Date().getFullYear()}</div>
          </div>
          <button onClick={load} className="text-xs text-white/60 hover:text-white border border-white/20 rounded-lg px-3 py-1.5 transition-colors">Refresh</button>
        </div>
      </div>

      <div className="p-4 space-y-4">

        {loading ? (
          <div className="text-center py-16 text-sm text-gray-400">Loading dashboard…</div>
        ) : !dash ? (
          <div className="text-center py-16 text-sm text-gray-400">No production data yet. Import a report to get started.</div>
        ) : (
          <>
            {/* Week cards */}
            <div className="flex gap-4 flex-col sm:flex-row">
              <WeekCard title="This Week" days={dash.current_week} />
              <WeekCard title="Last Week" days={dash.last_week} />
            </div>

            {/* Pace Intelligence */}
            {cogs.length > 0 && <PaceCard cogs={cogs} />}

            {/* Monthly overview + COGS widget */}
            <div className="flex gap-4 flex-col xl:flex-row">
              <div className="flex-1 min-w-0">
                <MonthlyTable data={dash.monthly} cogsData={cogs} />
              </div>
              <div className="w-full xl:w-80 shrink-0">
                <CogsWidget />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
