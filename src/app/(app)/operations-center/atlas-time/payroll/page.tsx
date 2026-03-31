"use client";

import { useEffect, useState } from "react";
import { fmtPaycheckDate } from "@/lib/atPayPeriod";

// ─── Types ────────────────────────────────────────────────────────────────────

type PayAdjustment = {
  id: string;
  type: "deduction" | "reimbursement";
  category: "uniform" | "manual";
  description: string;
  amount: number;
  paycheck_date: string;
  status: "pending" | "applied";
  notes: string | null;
  source_inventory_id: string | null;
  reimburses_adjustment_id: string | null;
  employee_id: string;
  employee: { id: string; first_name: string; last_name: string } | null;
};

type Employee = { id: string; first_name: string; last_name: string };

type PaySettings = {
  pay_cycle: string;
  payday_day_of_week: number;
  pay_period_anchor_date: string | null;
};

const inputCls = "border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#123b1f]/30 focus:border-[#123b1f] transition-all w-full";

function fmt$(n: number) { return `$${Number(n).toFixed(2)}`; }

function empName(e: { first_name: string; last_name: string } | null) {
  return e ? `${e.last_name}, ${e.first_name}` : "—";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PayrollPage() {
  const [subView, setSubView] = useState<"adjustments" | "export">("adjustments");

  // Pay Adjustments state
  const [dates,    setDates]    = useState<string[]>([]);
  const [settings, setSettings] = useState<PaySettings | null>(null);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [adjustments, setAdjustments] = useState<PayAdjustment[]>([]);
  const [employees,   setEmployees]   = useState<Employee[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");

  // New adjustment form
  const [showAdd,        setShowAdd]        = useState(false);
  const [addType,        setAddType]        = useState<"deduction" | "reimbursement">("deduction");
  const [addEmployee,    setAddEmployee]    = useState("");
  const [addDescription, setAddDescription] = useState("");
  const [addAmount,      setAddAmount]      = useState("");
  const [addNotes,       setAddNotes]       = useState("");
  const [addSaving,      setAddSaving]      = useState(false);
  const [addError,       setAddError]       = useState("");

  // Edit state
  const [editId,   setEditId]   = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editAmt,  setEditAmt]  = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // ── Load paycheck dates & employees ─────────────────────────────────────────

  async function loadDates() {
    setLoading(true);
    setError("");
    try {
      const [datesRes, empRes] = await Promise.all([
        fetch("/api/atlas-time/pay-adjustments/paycheck-dates"),
        fetch("/api/atlas-time/employees"),
      ]);
      const [dj, ej] = await Promise.all([datesRes.json(), empRes.json()]);
      const d: string[] = dj.dates ?? [];
      setDates(d);
      setSettings(dj.settings ?? null);
      setEmployees((ej.employees ?? []).map((e: any) => ({ id: e.id, first_name: e.first_name, last_name: e.last_name })).sort((a: Employee, b: Employee) => a.last_name.localeCompare(b.last_name)));
      // Default to the nearest upcoming date
      const today = new Date().toISOString().slice(0, 10);
      const upcoming = d.find(x => x >= today) ?? d[d.length - 1] ?? null;
      setActiveDate(upcoming);
    } catch {
      setError("Failed to load pay periods");
    } finally {
      setLoading(false);
    }
  }

  async function loadAdjustments(date: string) {
    const res  = await fetch(`/api/atlas-time/pay-adjustments?paycheck_date=${date}`);
    const json = await res.json();
    setAdjustments(json.adjustments ?? []);
  }

  useEffect(() => { loadDates(); }, []);

  useEffect(() => {
    if (activeDate) loadAdjustments(activeDate);
    else setAdjustments([]);
  }, [activeDate]);

  // ── Next paycheck date (for "push" button) ──────────────────────────────────
  function nextDate(current: string): string | null {
    const idx = dates.indexOf(current);
    return idx >= 0 && idx < dates.length - 1 ? dates[idx + 1] : null;
  }

  // ── Add adjustment ──────────────────────────────────────────────────────────

  async function submitAdd() {
    if (!addEmployee)    { setAddError("Select a team member"); return; }
    if (!addDescription) { setAddError("Description required"); return; }
    const amount = Number(addAmount);
    if (!amount || amount <= 0) { setAddError("Amount must be > 0"); return; }
    if (!activeDate) return;

    setAddSaving(true);
    setAddError("");
    try {
      const res = await fetch("/api/atlas-time/pay-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id:  addEmployee,
          type:         addType,
          category:     "manual",
          description:  addDescription,
          amount,
          paycheck_date: activeDate,
          notes:        addNotes || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save");
      setShowAdd(false);
      setAddEmployee(""); setAddDescription(""); setAddAmount(""); setAddNotes("");
      loadAdjustments(activeDate);
    } catch (e: any) {
      setAddError(e.message ?? "Failed to save");
    } finally {
      setAddSaving(false);
    }
  }

  // ── Mark applied ─────────────────────────────────────────────────────────────

  async function markApplied(id: string) {
    await fetch(`/api/atlas-time/pay-adjustments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "applied" }),
    });
    if (activeDate) loadAdjustments(activeDate);
  }

  async function markAllApplied() {
    const pending = adjustments.filter(a => a.status === "pending");
    await Promise.all(pending.map(a =>
      fetch(`/api/atlas-time/pay-adjustments/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "applied" }),
      })
    ));
    if (activeDate) loadAdjustments(activeDate);
  }

  // ── Push to next period ──────────────────────────────────────────────────────

  async function pushToNext(id: string) {
    if (!activeDate) return;
    const nd = nextDate(activeDate);
    if (!nd) { alert("No future pay period available."); return; }
    await fetch(`/api/atlas-time/pay-adjustments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paycheck_date: nd }),
    });
    loadAdjustments(activeDate);
  }

  // ── Cancel ────────────────────────────────────────────────────────────────────

  async function cancelAdj(id: string) {
    if (!confirm("Cancel this adjustment? It will be removed.")) return;
    await fetch(`/api/atlas-time/pay-adjustments/${id}`, { method: "DELETE" });
    if (activeDate) loadAdjustments(activeDate);
  }

  // ── Edit inline ───────────────────────────────────────────────────────────────

  function startEdit(a: PayAdjustment) {
    setEditId(a.id);
    setEditDate(a.paycheck_date);
    setEditAmt(String(a.amount));
    setEditDesc(a.description);
    setEditNotes(a.notes ?? "");
  }

  async function saveEdit(id: string) {
    setEditSaving(true);
    try {
      await fetch(`/api/atlas-time/pay-adjustments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: editDesc, amount: Number(editAmt), paycheck_date: editDate, notes: editNotes || null }),
      });
      setEditId(null);
      if (activeDate) loadAdjustments(activeDate);
    } finally {
      setEditSaving(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const deductions     = adjustments.filter(a => a.type === "deduction");
  const reimbursements = adjustments.filter(a => a.type === "reimbursement");
  const deductTotal    = deductions.reduce((s, a) => s + Number(a.amount), 0);
  const reimbTotal     = reimbursements.reduce((s, a) => s + Number(a.amount), 0);
  const pendingCount   = adjustments.filter(a => a.status === "pending").length;
  const today          = new Date().toISOString().slice(0, 10);

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f0f4f0]">
      {/* Header */}
      <div className="px-4 md:px-8 py-6" style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}>
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold text-white tracking-tight">Payroll</h1>
          <p className="text-white/50 text-sm mt-0.5">Pay adjustments, deductions, and QB export</p>
          {/* Sub-nav */}
          <div className="flex gap-1 mt-4 flex-wrap">
            <button onClick={() => setSubView("adjustments")}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${subView === "adjustments" ? "bg-white/20 text-white" : "text-white/40 hover:text-white/70"}`}>
              Pay Adjustments
            </button>
            <a href="/operations-center/atlas-time/timesheets"
              className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors text-white/40 hover:text-white/70">
              Timesheets
            </a>
            <a href="/operations-center/atlas-time/pto"
              className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors text-white/40 hover:text-white/70">
              PTO &amp; Time Off
            </a>
            <a href="/operations-center/atlas-time/reports"
              className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors text-white/40 hover:text-white/70">
              Reports
            </a>
            <button onClick={() => setSubView("export")}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${subView === "export" ? "bg-white/20 text-white" : "text-white/40 hover:text-white/70"}`}>
              QB Export
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">

        {/* ── EXPORT placeholder ── */}
        {subView === "export" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
            <p className="text-gray-400 text-sm">QuickBooks export coming soon.</p>
          </div>
        )}

        {/* ── PAY ADJUSTMENTS ── */}
        {subView === "adjustments" && (
          <div className="space-y-4">

            {error && <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}

            {loading && (
              <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 border-2 border-[#123b1f] border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!loading && (
              <>
                {/* Paycheck date tabs */}
                <div className="flex gap-1 overflow-x-auto pb-1">
                  {(() => {
                    const nextIdx = dates.findIndex(x => x >= today);
                    return dates.map((d, idx) => {
                      const isActive = d === activeDate;
                      const isPast   = d < today;
                      const isNext   = idx === nextIdx;
                      const isFuture = d > today && !isNext;
                      return (
                        <button key={d} onClick={() => setActiveDate(d)}
                          className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-semibold transition-colors border ${
                            isActive
                              ? "bg-[#123b1f] text-white border-[#123b1f]"
                              : isPast
                              ? "bg-white text-gray-400 border-gray-100 hover:border-gray-300"
                              : isNext
                              ? "bg-green-50 text-green-700 border-green-200 hover:border-green-300"
                              : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          {fmtPaycheckDate(d)}
                          {isNext && <span className="ml-1 text-[9px] font-bold text-green-600 uppercase tracking-wide">Next</span>}
                          {isFuture && <span className="ml-1 text-[9px] opacity-60">upcoming</span>}
                        </button>
                      );
                    });
                  })()}
                </div>


                {activeDate && (
                  <div className="space-y-4">

                    {/* Totals bar */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
                        <p className="text-xs text-gray-400">Deductions</p>
                        <p className="text-lg font-bold text-red-600 tabular-nums">{fmt$(deductTotal)}</p>
                      </div>
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
                        <p className="text-xs text-gray-400">Reimbursements</p>
                        <p className="text-lg font-bold text-green-700 tabular-nums">{fmt$(reimbTotal)}</p>
                      </div>
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
                        <p className="text-xs text-gray-400">Net</p>
                        <p className={`text-lg font-bold tabular-nums ${reimbTotal - deductTotal >= 0 ? "text-green-700" : "text-red-600"}`}>
                          {reimbTotal - deductTotal >= 0 ? "+" : ""}{fmt$(reimbTotal - deductTotal)}
                        </p>
                      </div>
                    </div>

                    {/* Actions bar */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {pendingCount > 0 && (
                          <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                            {pendingCount} pending
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {pendingCount > 0 && (
                          <button onClick={markAllApplied}
                            className="px-3 py-1.5 rounded-xl bg-[#123b1f] hover:bg-[#1a5c2e] text-white text-xs font-semibold transition-colors">
                            Mark All Applied
                          </button>
                        )}
                        <button onClick={() => { setShowAdd(true); setAddType("deduction"); }}
                          className="px-3 py-1.5 rounded-xl bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-xs font-semibold transition-colors flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                          Add Manual
                        </button>
                      </div>
                    </div>

                    {/* Add form */}
                    {showAdd && (
                      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                        <h3 className="text-sm font-bold text-gray-800 mb-3">New Manual Adjustment — {fmtPaycheckDate(activeDate)}</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Type</label>
                            <select value={addType} onChange={e => setAddType(e.target.value as "deduction" | "reimbursement")} className={inputCls}>
                              <option value="deduction">Deduction</option>
                              <option value="reimbursement">Reimbursement</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Team Member *</label>
                            <select value={addEmployee} onChange={e => setAddEmployee(e.target.value)} className={inputCls}>
                              <option value="">— Select —</option>
                              {employees.map(e => <option key={e.id} value={e.id}>{e.last_name}, {e.first_name}</option>)}
                            </select>
                          </div>
                          <div className="col-span-2">
                            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Description *</label>
                            <input type="text" value={addDescription} onChange={e => setAddDescription(e.target.value)} className={inputCls} placeholder="e.g. Safety boots reimbursement" />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Amount *</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                              <input type="number" step="0.01" min="0" value={addAmount} onChange={e => setAddAmount(e.target.value)} className={inputCls + " pl-7"} placeholder="0.00" />
                            </div>
                          </div>
                          <div className="col-span-3">
                            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</label>
                            <input type="text" value={addNotes} onChange={e => setAddNotes(e.target.value)} className={inputCls} />
                          </div>
                        </div>
                        {addError && <p className="mt-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{addError}</p>}
                        <div className="flex gap-2 mt-3">
                          <button onClick={submitAdd} disabled={addSaving}
                            className="px-4 py-2 rounded-xl bg-[#123b1f] hover:bg-[#1a5c2e] text-white text-sm font-semibold transition-colors disabled:opacity-60">
                            {addSaving ? "Saving…" : "Save"}
                          </button>
                          <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-xl text-gray-600 hover:bg-gray-100 text-sm font-semibold">Cancel</button>
                        </div>
                      </div>
                    )}

                    {/* No adjustments */}
                    {adjustments.length === 0 && !showAdd && (
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-12 text-center">
                        <p className="text-sm text-gray-400">No adjustments for this pay period.</p>
                        <button onClick={() => setShowAdd(true)} className="mt-3 text-sm text-[#123b1f] font-semibold hover:underline">Add one manually</button>
                      </div>
                    )}

                    {/* Deductions table */}
                    {deductions.length > 0 && (
                      <AdjTable
                        title="Deductions"
                        rows={deductions}
                        colorClass="text-red-700"
                        editId={editId}
                        editDate={editDate}
                        editAmt={editAmt}
                        editDesc={editDesc}
                        editNotes={editNotes}
                        editSaving={editSaving}
                        dates={dates}
                        onEdit={startEdit}
                        onEditDateChange={setEditDate}
                        onEditAmtChange={setEditAmt}
                        onEditDescChange={setEditDesc}
                        onEditNotesChange={setEditNotes}
                        onSaveEdit={saveEdit}
                        onCancelEdit={() => setEditId(null)}
                        onMarkApplied={markApplied}
                        onPushNext={pushToNext}
                        onCancel={cancelAdj}
                      />
                    )}

                    {/* Reimbursements table */}
                    {reimbursements.length > 0 && (
                      <AdjTable
                        title="Reimbursements"
                        rows={reimbursements}
                        colorClass="text-green-700"
                        editId={editId}
                        editDate={editDate}
                        editAmt={editAmt}
                        editDesc={editDesc}
                        editNotes={editNotes}
                        editSaving={editSaving}
                        dates={dates}
                        onEdit={startEdit}
                        onEditDateChange={setEditDate}
                        onEditAmtChange={setEditAmt}
                        onEditDescChange={setEditDesc}
                        onEditNotesChange={setEditNotes}
                        onSaveEdit={saveEdit}
                        onCancelEdit={() => setEditId(null)}
                        onMarkApplied={markApplied}
                        onPushNext={pushToNext}
                        onCancel={cancelAdj}
                      />
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-table component ──────────────────────────────────────────────────────

function AdjTable({
  title, rows, colorClass,
  editId, editDate, editAmt, editDesc, editNotes, editSaving, dates,
  onEdit, onEditDateChange, onEditAmtChange, onEditDescChange, onEditNotesChange,
  onSaveEdit, onCancelEdit, onMarkApplied, onPushNext, onCancel,
}: {
  title: string;
  rows: PayAdjustment[];
  colorClass: string;
  editId: string | null;
  editDate: string; editAmt: string; editDesc: string; editNotes: string; editSaving: boolean;
  dates: string[];
  onEdit: (a: PayAdjustment) => void;
  onEditDateChange: (v: string) => void;
  onEditAmtChange: (v: string) => void;
  onEditDescChange: (v: string) => void;
  onEditNotesChange: (v: string) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onMarkApplied: (id: string) => void;
  onPushNext: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        <span className={`text-xs font-semibold ${colorClass} tabular-nums`}>
          ${rows.reduce((s, a) => s + Number(a.amount), 0).toFixed(2)}
        </span>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-50">
          <tr>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Team Member</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Description</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Source</th>
            <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Amount</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Status</th>
            <th className="px-4 py-2.5 w-32" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map(a => {
            const isEditing = editId === a.id;
            return (
              <tr key={a.id} className={`hover:bg-gray-50/50 transition-colors ${isEditing ? "bg-blue-50/30" : ""}`}>
                <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{empName(a.employee)}</td>
                <td className="px-4 py-3 text-gray-600">
                  {isEditing
                    ? <input type="text" value={editDesc} onChange={e => onEditDescChange(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-full" />
                    : <>{a.description}{a.notes && <div className="text-[11px] text-gray-400 mt-0.5">{a.notes}</div>}</>
                  }
                </td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${a.category === "uniform" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"}`}>
                    {a.category === "uniform" ? "Uniform" : "Manual"}
                  </span>
                </td>
                <td className={`px-4 py-3 text-right font-semibold tabular-nums ${colorClass}`}>
                  {isEditing
                    ? <div className="relative"><span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span><input type="number" step="0.01" value={editAmt} onChange={e => onEditAmtChange(e.target.value)} className="border border-gray-200 rounded-lg pl-5 pr-2 py-1 text-xs w-24 text-right" /></div>
                    : fmt$(Number(a.amount))
                  }
                </td>
                <td className="px-4 py-3">
                  {a.status === "applied"
                    ? <span className="text-[10px] font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">Applied</span>
                    : <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Pending</span>
                  }
                </td>
                <td className="px-4 py-3">
                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      {/* Date override when editing */}
                      <select value={editDate} onChange={e => onEditDateChange(e.target.value)}
                        className="border border-gray-200 rounded-lg px-1.5 py-1 text-[10px] bg-white">
                        {dates.map(d => <option key={d} value={d}>{fmtPaycheckDate(d)}</option>)}
                      </select>
                      <button onClick={() => onSaveEdit(a.id)} disabled={editSaving}
                        className="text-[10px] font-semibold text-white bg-[#123b1f] hover:bg-[#1a5c2e] px-2 py-1 rounded-md disabled:opacity-60">
                        {editSaving ? "…" : "Save"}
                      </button>
                      <button onClick={onCancelEdit} className="text-[10px] font-semibold text-gray-500 hover:text-gray-700 px-2 py-1 rounded-md hover:bg-gray-100">✕</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 justify-end">
                      {a.status === "pending" && (
                        <>
                          <button onClick={() => onMarkApplied(a.id)}
                            className="text-[10px] font-semibold text-green-700 bg-green-50 hover:bg-green-100 px-2 py-1 rounded-md transition-colors whitespace-nowrap">
                            ✓ Apply
                          </button>
                          <button onClick={() => onPushNext(a.id)}
                            title="Push to next pay period"
                            className="text-[10px] font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 px-2 py-1 rounded-md transition-colors whitespace-nowrap">
                            → Next
                          </button>
                        </>
                      )}
                      <button onClick={() => onEdit(a)} className="text-gray-300 hover:text-gray-500 p-1 rounded transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                      {a.status === "pending" && (
                        <button onClick={() => onCancel(a.id)} className="text-red-300 hover:text-red-500 p-1 rounded transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
