"use client";

import React, { useEffect, useState } from "react";

const PAYROLL_BURDEN = 1.15;

type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  default_pay_rate: number | null;
};

type CalcRow = {
  id: number;
  employee_id: string;
  pay_rate: string;
  time_in: string;
};

function calcResult(row: CalcRow, perPerson: number) {
  const rate = parseFloat(row.pay_rate);
  const rev  = perPerson;
  if (!rate || !rev || rate <= 0 || rev <= 0) return { hours: null, time_out: null, breakdown: null };
  const burdenedRate  = rate * PAYROLL_BURDEN;
  const targetPayroll = rev * 0.39;
  const rawHours      = targetPayroll / burdenedRate;
  const lunchAdded    = rawHours >= 6;
  const hours         = lunchAdded ? rawHours + 0.5 : rawHours;
  const [hh, mm] = (row.time_in || "07:30").split(":").map(Number);
  const startMin = hh * 60 + mm;
  const endMin   = startMin + Math.round(hours * 60);
  const outH = Math.floor(endMin / 60) % 24;
  const outM = endMin % 60;
  const outStr = `${String(outH).padStart(2, "0")}:${String(outM).padStart(2, "0")}`;
  const outFmt = new Date(`2000-01-01T${outStr}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return {
    hours,
    time_out: outFmt,
    breakdown: { rate, burdenedRate, targetPayroll, rawHours, lunchAdded, rev },
  };
}

export default function LawnCalculatorPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [totalRevenue, setTotalRevenue] = useState("");
  const [rows, setRows] = useState<CalcRow[]>(() =>
    Array.from({ length: 4 }, (_, i) => ({ id: i, employee_id: "", pay_rate: "", time_in: "07:30" }))
  );
  const nextId = React.useRef(4);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch("/api/atlas-time/employees", { cache: "no-store" })
      .then(r => r.json())
      .then(d => setEmployees((d.employees ?? []).filter((e: any) => e.default_pay_rate)));
  }, []);

  const total        = parseFloat(totalRevenue) || 0;
  const selectedCount = rows.filter(r => r.employee_id !== "").length;
  const perPerson    = selectedCount > 0 && total > 0 ? total / selectedCount : 0;

  function addRow() {
    setRows(prev => [...prev, { id: nextId.current++, employee_id: "", pay_rate: "", time_in: "07:30" }]);
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

  const fmtMoney = (n: number) =>
    n > 0 ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n) : "—";
  const fmtD = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  return (
    <div className="min-h-screen" style={{ background: "#f4f8f5" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #071a0e 0%, #0d2616 50%, #1a4a28 100%)" }} className="px-6 md:px-10 py-8">
        <div className="mx-auto max-w-[1000px]">
          <div className="flex items-center justify-between">
            <div>
              <a
                href="/operations-center/atlas-ops/lawn"
                className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold mb-2 inline-flex items-center gap-1 transition-colors"
              >
                ← Lawn Dashboard
              </a>
              <h1 className="text-xl font-semibold text-white mt-1">Reverse Revenue Calculator</h1>
              <p className="text-xs text-white/40 mt-0.5">
                39% labor target · 15% payroll burden · +30 min lunch if ≥ 6 hrs
              </p>
            </div>
            <button
              onClick={addRow}
              className="text-xs rounded-lg border border-white/25 bg-white/10 hover:bg-white/20 text-white px-4 py-2 font-semibold transition-colors"
            >
              + Add Person
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1000px] px-4 md:px-6 py-7">
        <div className="rounded-2xl overflow-hidden shadow-md bg-white" style={{ border: "1px solid rgba(16,64,32,0.12)" }}>

          {/* Revenue input */}
          <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-6 flex-wrap bg-gray-50/50">
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Total Crew Revenue</div>
              <div className="inline-flex items-center border-2 border-emerald-400 rounded-xl bg-emerald-50 focus-within:border-emerald-500 overflow-hidden shadow-sm">
                <span className="pl-3 text-emerald-700 font-bold text-sm select-none">$</span>
                <input
                  type="number"
                  value={totalRevenue}
                  onChange={e => setTotalRevenue(e.target.value)}
                  placeholder="0"
                  className="w-36 pr-3 py-2.5 text-sm font-bold bg-transparent text-emerald-900 focus:outline-none"
                />
              </div>
            </div>
            {total > 0 && selectedCount > 0 && (
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span className="text-gray-300">÷</span>
                <span><span className="font-bold text-gray-700">{selectedCount}</span> {selectedCount === 1 ? "person" : "people"}</span>
                <span className="text-gray-300">=</span>
                <span>
                  <span className="font-semibold text-emerald-700 text-base">{fmtMoney(perPerson)}</span>
                  <span className="text-gray-400 text-xs ml-1">/ person</span>
                </span>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[520px]">
              <thead>
                <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/70">
                  <th className="px-5 py-3 text-center">Team Member</th>
                  <th className="px-4 py-3 text-center">Revenue Share</th>
                  <th className="px-4 py-3 text-center">Start Time</th>
                  <th className="px-4 py-3 text-center">Hrs Needed</th>
                  <th className="px-4 py-3 text-center">Clock Out</th>
                  <th className="px-4 py-3 w-12" />
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const { hours, time_out, breakdown } = calcResult(row, perPerson);
                  const hasResult  = hours != null;
                  const isExpanded = expanded.has(row.id);
                  return (
                    <React.Fragment key={row.id}>
                      <tr className={`border-t border-gray-50 transition-colors ${hasResult ? "hover:bg-emerald-50/20" : ""}`}>
                        <td className="px-4 py-2.5 text-center">
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
                        <td className="px-3 py-2.5 text-center">
                          <span className={`font-semibold text-sm ${row.employee_id && perPerson > 0 ? "text-gray-700" : "text-gray-300"}`}>
                            {row.employee_id && perPerson > 0 ? fmtMoney(perPerson) : "—"}
                          </span>
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
                          <div className="flex items-center justify-center gap-2">
                            {hasResult && (
                              <button
                                onClick={() => setExpanded(prev => {
                                  const next = new Set(prev);
                                  next.has(row.id) ? next.delete(row.id) : next.add(row.id);
                                  return next;
                                })}
                                className={`text-xs rounded transition-colors px-1.5 py-0.5 ${isExpanded ? "text-emerald-600 bg-emerald-50" : "text-gray-300 hover:text-emerald-500"}`}
                                title="Show breakdown"
                              >
                                {isExpanded ? "▲" : "▼"}
                              </button>
                            )}
                            <button onClick={() => removeRow(row.id)} className="text-gray-200 hover:text-red-400 transition-colors">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && breakdown && (
                        <tr className="border-t border-emerald-100 bg-emerald-50/40">
                          <td colSpan={6} className="px-6 py-3">
                            <div className="text-xs text-gray-600 space-y-1 font-mono">
                              <div className="font-sans font-semibold text-emerald-800 text-[11px] uppercase tracking-wide mb-2">Calculation Breakdown</div>
                              <div><span className="text-gray-400 w-52 inline-block">Revenue share</span> {fmtD(breakdown.rev)}</div>
                              <div><span className="text-gray-400 w-52 inline-block">× Labor target (39%)</span> {fmtD(breakdown.rev)} × 0.39 = <span className="font-bold text-gray-800">{fmtD(breakdown.targetPayroll)}</span> target payroll</div>
                              <div><span className="text-gray-400 w-52 inline-block">Pay rate</span> {fmtD(breakdown.rate)}/hr</div>
                              <div><span className="text-gray-400 w-52 inline-block">× Payroll burden (1.15)</span> {fmtD(breakdown.rate)} × 1.15 = <span className="font-bold text-gray-800">{fmtD(breakdown.burdenedRate)}/hr</span></div>
                              <div><span className="text-gray-400 w-52 inline-block">Raw hours</span> {fmtD(breakdown.targetPayroll)} ÷ {fmtD(breakdown.burdenedRate)} = <span className="font-bold text-gray-800">{breakdown.rawHours.toFixed(2)} hrs</span></div>
                              {breakdown.lunchAdded
                                ? <div><span className="text-gray-400 w-52 inline-block">+ Lunch (≥ 6 hrs)</span> {breakdown.rawHours.toFixed(2)} + 0.5 = <span className="font-bold text-emerald-700">{(breakdown.rawHours + 0.5).toFixed(2)} hrs total</span></div>
                                : <div><span className="text-gray-400 w-52 inline-block">Lunch</span> <span className="text-gray-400">not added (&lt; 6 hrs)</span></div>
                              }
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* How it works */}
        <div className="mt-6 rounded-xl bg-white border border-[#d7e6db] px-6 py-5 shadow-sm">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">How This Works</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
            <div>
              <div className="font-semibold text-gray-800 mb-1">39% Labor Target</div>
              <div className="text-xs text-gray-500">Your annual field labor goal. Revenue × 39% = max payroll budget for the job.</div>
            </div>
            <div>
              <div className="font-semibold text-gray-800 mb-1">15% Payroll Burden</div>
              <div className="text-xs text-gray-500">Employer costs on top of base pay (FICA, workers comp, etc.). Base rate × 1.15 = true hourly cost.</div>
            </div>
            <div>
              <div className="font-semibold text-gray-800 mb-1">Lunch Deduction</div>
              <div className="text-xs text-gray-500">If the calculated work window is ≥ 6 hours, 30 min lunch is added to the total time needed.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
