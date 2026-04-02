"use client";

import { Fragment, useEffect, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

type AtDivision = { id: string; name: string; division_id: string | null; divisions?: { id: string; name: string } | null };
type Employee   = { id: string; first_name: string; last_name: string; preferred_name?: string | null };
type Punch = {
  id: string;
  employee_id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  date_for_payroll: string;
  status: string;
  is_manual: boolean;
  division_id: string | null;
  at_division_id: string | null;
  regular_hours: number | null;
  ot_hours: number | null;
  at_employees: { id: string; first_name: string; last_name: string; preferred_name?: string | null } | null;
  divisions: { id: string; name: string } | null;
  at_divisions: { id: string; name: string } | null;
};

// ── Formatters ─────────────────────────────────────────────────────────────────

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York",
  });
}
function fmtHours(h: number | null, ot: number | null) {
  const total = (h ?? 0) + (ot ?? 0);
  if (total === 0) return "—";
  return `${total.toFixed(2)} hrs`;
}
function empName(e: { first_name: string; last_name: string; preferred_name?: string | null } | null) {
  if (!e) return "—";
  const first = e.preferred_name || e.first_name;
  return `${e.last_name}, ${first}`;
}
function todayEst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}
function toEst(iso: string) {
  // Convert ISO UTC to Eastern local datetime string for <input type="datetime-local">
  const d = new Date(iso);
  const est = new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
  return `${est.getFullYear()}-${String(est.getMonth()+1).padStart(2,"0")}-${String(est.getDate()).padStart(2,"0")}T${String(est.getHours()).padStart(2,"0")}:${String(est.getMinutes()).padStart(2,"0")}`;
}
function estToUtc(localDatetime: string) {
  // localDatetime = "YYYY-MM-DDTHH:MM" in Eastern — convert to UTC ISO
  const [datePart, timePart] = localDatetime.split("T");
  const [y,m,d] = datePart.split("-").map(Number);
  const [hh,mm] = (timePart ?? "00:00").split(":").map(Number);
  // Build a Date interpreted in Eastern by using a trick with Intl
  const est = new Date(`${datePart}T${timePart}:00`);
  // Offset correction: get UTC equiv of Eastern wall clock time
  const utcStr = new Date(est.toLocaleString("en-US", { timeZone: "UTC" }));
  const estStr = new Date(est.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const offsetMs = utcStr.getTime() - estStr.getTime();
  return new Date(est.getTime() + offsetMs).toISOString();
}

type PunchEdit = { timeIn: string; timeOut: string; atDiv: string; saving: boolean; error: string };

const STATUS_COLORS: Record<string, string> = {
  open:     "bg-blue-100 text-blue-700",
  pending:  "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  flagged:  "bg-red-100 text-red-700",
};

const inp = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white";

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function LawnPunchesPage() {
  const [date,       setDate]       = useState(todayEst());
  const [punches,    setPunches]    = useState<Punch[]>([]);
  const [employees,  setEmployees]  = useState<Employee[]>([]);
  const [atDivs,     setAtDivs]     = useState<AtDivision[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");

  // Inline edit — keyed by punch ID so multiple rows can be open at once
  const [editStates, setEditStates] = useState<Record<string, PunchEdit>>({});

  // Add punch modal
  const [showAdd,     setShowAdd]     = useState(false);
  const [addEmp,      setAddEmp]      = useState("");
  const [addDate,     setAddDate]     = useState(todayEst());
  const [addTimeIn,   setAddTimeIn]   = useState("");
  const [addTimeOut,  setAddTimeOut]  = useState("");
  const [addAtDiv,    setAddAtDiv]    = useState("");
  const [addNote,     setAddNote]     = useState("");
  const [addSaving,   setAddSaving]   = useState(false);
  const [addError,    setAddError]    = useState("");
  const [dupWarning,  setDupWarning]  = useState("");

  // Load supporting data once
  useEffect(() => {
    fetch("/api/atlas-time/employees").then(r => r.json()).then(d => {
      const list = ((d.employees ?? []) as Employee[])
        .filter((e: any) => e.status === "active")
        .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
      setEmployees(list);
    }).catch(() => {});

    fetch("/api/atlas-time/divisions").then(r => r.json()).then(d => {
      setAtDivs(d.divisions ?? d ?? []);
    }).catch(() => {});
  }, []);

  // Load punches when date changes
  useEffect(() => { loadPunches(); }, [date]);

  async function loadPunches() {
    setLoading(true); setError("");
    try {
      const res  = await fetch(`/api/atlas-time/punches?date_from=${date}&date_to=${date}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setPunches((data.punches ?? []).sort((a: Punch, b: Punch) => {
        const nameA = empName(a.at_employees);
        const nameB = empName(b.at_employees);
        return nameA.localeCompare(nameB) || a.clock_in_at.localeCompare(b.clock_in_at);
      }));
    } catch (e: any) { setError(e.message ?? "Error"); }
    finally { setLoading(false); }
  }

  // ── Inline edit ───────────────────────────────────────────────────────────

  function startEdit(p: Punch) {
    setEditStates(prev => {
      if (p.id in prev) {
        const next = { ...prev };
        delete next[p.id];
        return next;
      }
      return {
        ...prev,
        [p.id]: {
          timeIn:  p.clock_in_at  ? toEst(p.clock_in_at)  : "",
          timeOut: p.clock_out_at ? toEst(p.clock_out_at) : "",
          atDiv:   p.at_division_id ?? "",
          saving:  false,
          error:   "",
        },
      };
    });
  }

  function updateEdit(id: string, field: keyof Omit<PunchEdit, "saving" | "error">, value: string) {
    setEditStates(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  function cancelEdit(id: string) {
    setEditStates(prev => { const next = { ...prev }; delete next[id]; return next; });
  }

  async function saveEdit(p: Punch) {
    const es = editStates[p.id];
    if (!es) return;
    setEditStates(prev => ({ ...prev, [p.id]: { ...prev[p.id], saving: true, error: "" } }));
    try {
      const body: Record<string, any> = { at_division_id: es.atDiv || null };
      body.clock_in_at  = es.timeIn  ? estToUtc(es.timeIn)  : null;
      body.clock_out_at = es.timeOut ? estToUtc(es.timeOut) : null;
      const res = await fetch(`/api/atlas-time/punches/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Save failed"); }
      cancelEdit(p.id);
      await loadPunches();
    } catch (e: any) {
      setEditStates(prev => ({ ...prev, [p.id]: { ...prev[p.id], saving: false, error: e.message ?? "Save failed" } }));
    }
  }

  // ── Add punch ─────────────────────────────────────────────────────────────

  function openAdd() {
    setAddEmp(""); setAddDate(date); setAddTimeIn(""); setAddTimeOut("");
    setAddAtDiv(""); setAddNote(""); setAddError(""); setDupWarning("");
    setShowAdd(true);
  }

  function checkDuplicate(empId: string, d: string) {
    if (!empId || !d) { setDupWarning(""); return; }
    const existing = punches.filter(p =>
      p.employee_id === empId && p.date_for_payroll === d
    );
    if (existing.length > 0) {
      const times = existing.map(p => `${fmtTime(p.clock_in_at)}${p.clock_out_at ? ` – ${fmtTime(p.clock_out_at)}` : " (still clocked in)"}`).join(", ");
      setDupWarning(`⚠ This team member already has ${existing.length} punch${existing.length > 1 ? "es" : ""} for this date: ${times}`);
    } else {
      setDupWarning("");
    }
  }

  async function submitAdd() {
    if (!addEmp)     { setAddError("Select a team member"); return; }
    if (!addTimeIn)  { setAddError("Time in is required"); return; }
    setAddSaving(true); setAddError("");
    try {
      const clockIn  = estToUtc(`${addDate}T${addTimeIn}`);
      const clockOut = addTimeOut ? estToUtc(`${addDate}T${addTimeOut}`) : null;
      const res = await fetch("/api/atlas-time/punches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id:    addEmp,
          is_manual:      true,
          clock_in_at:    clockIn,
          clock_out_at:   clockOut,
          date_for_payroll: addDate,
          at_division_id: addAtDiv || null,
          note:           addNote || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add punch");
      setShowAdd(false);
      await loadPunches();
    } catch (e: any) { setAddError(e.message ?? "Error"); }
    finally { setAddSaving(false); }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const byEmployee = punches.reduce<Record<string, Punch[]>>((acc, p) => {
    const key = p.employee_id;
    (acc[key] = acc[key] ?? []).push(p);
    return acc;
  }, {});

  return (
    <div className="px-4 py-5 max-w-5xl space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-base font-bold text-gray-900">Punch Review</h1>
          <p className="text-xs text-gray-400 mt-0.5">View, correct, and add punches for any date</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white" />
          <button onClick={openAdd}
            className="bg-[#123b1f] text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-[#1a5c2a] transition-colors flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Punch
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}

      {/* Punch table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : punches.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">No punches found for {date}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Team Member</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">In</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Out</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Hours</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500">Division</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Status</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {punches.map(p => {
                  const empPunches = byEmployee[p.employee_id] ?? [];
                  const hasDup = empPunches.length > 1;
                  const es = editStates[p.id];
                  const isEditing = !!es;
                  const divLabel = p.at_divisions?.name ?? p.divisions?.name ?? "—";
                  return (
                    <Fragment key={p.id}>
                      <tr className={hasDup ? "bg-amber-50" : isEditing ? "bg-green-50/30" : "hover:bg-gray-50/40"}>
                        <td className="px-5 py-3 font-semibold text-gray-800 text-xs whitespace-nowrap">
                          {empName(p.at_employees)}
                          {hasDup && <span className="ml-2 text-amber-600 text-[10px] font-bold">⚠ {empPunches.length} punches</span>}
                          {p.is_manual && <span className="ml-2 text-gray-400 text-[10px]">manual</span>}
                        </td>
                        <td className="px-3 py-3 text-xs text-center text-gray-700">{fmtTime(p.clock_in_at)}</td>
                        <td className="px-3 py-3 text-xs text-center text-gray-700">{fmtTime(p.clock_out_at)}</td>
                        <td className="px-3 py-3 text-xs text-center font-semibold text-gray-700">{fmtHours(p.regular_hours, p.ot_hours)}</td>
                        <td className="px-3 py-3 text-xs">
                          <span className={!divLabel || divLabel === "—" ? "text-amber-600 font-semibold" : "text-gray-700"}>
                            {divLabel || "⚠ Not set"}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${STATUS_COLORS[p.status] ?? "bg-gray-100 text-gray-500"}`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          <button onClick={() => startEdit(p)}
                            className={`text-xs font-semibold hover:underline ${isEditing ? "text-gray-400" : "text-[#123b1f]"}`}>
                            {isEditing ? "Editing…" : "Edit"}
                          </button>
                        </td>
                      </tr>
                      {isEditing && es && (
                        <tr className="border-t border-green-100">
                          <td colSpan={7} className="p-0">
                            <div className="bg-green-50/40 px-5 py-4">
                              <div className="flex flex-wrap items-end gap-4">
                                <div>
                                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                                    Time In <span className="text-gray-300 font-normal normal-case">(Eastern)</span>
                                  </label>
                                  <input type="datetime-local" value={es.timeIn}
                                    onChange={e => updateEdit(p.id, "timeIn", e.target.value)}
                                    className="border border-green-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-500 bg-white" />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                                    Time Out <span className="text-gray-300 font-normal normal-case">(Eastern · optional)</span>
                                  </label>
                                  <input type="datetime-local" value={es.timeOut}
                                    onChange={e => updateEdit(p.id, "timeOut", e.target.value)}
                                    className="border border-green-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-500 bg-white" />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Division</label>
                                  <select value={es.atDiv} onChange={e => updateEdit(p.id, "atDiv", e.target.value)}
                                    className="border border-green-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-500 bg-white min-w-[160px]">
                                    <option value="">— None —</option>
                                    {atDivs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                  </select>
                                </div>
                                <div className="flex items-end gap-2">
                                  <button onClick={() => saveEdit(p)} disabled={es.saving}
                                    className="bg-[#123b1f] text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-[#1a5c2a] disabled:opacity-40 transition-colors">
                                    {es.saving ? "Saving…" : "Save Changes"}
                                  </button>
                                  <button onClick={() => cancelEdit(p.id)}
                                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                                    Cancel
                                  </button>
                                </div>
                              </div>
                              {es.error && <p className="mt-2 text-xs text-red-600">{es.error}</p>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary */}
      {punches.length > 0 && (
        <p className="text-xs text-gray-400 text-right">
          {punches.length} punch{punches.length !== 1 ? "es" : ""} · {Object.keys(byEmployee).length} team member{Object.keys(byEmployee).length !== 1 ? "s" : ""}
        </p>
      )}

      {/* ── Add Punch Modal ──────────────────────────────────────────────────── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-800">Add Manual Punch</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>

            {/* Team member */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Team Member</label>
              <select className={inp} value={addEmp}
                onChange={e => { setAddEmp(e.target.value); checkDuplicate(e.target.value, addDate); }}>
                <option value="">Select…</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.last_name}, {e.preferred_name || e.first_name}</option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Date</label>
              <input type="date" className={inp} value={addDate}
                onChange={e => { setAddDate(e.target.value); checkDuplicate(addEmp, e.target.value); }} />
            </div>

            {/* Duplicate warning */}
            {dupWarning && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 font-medium">
                {dupWarning}
              </div>
            )}

            {/* Times */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Time In</label>
                <input type="time" className={inp} value={addTimeIn} onChange={e => setAddTimeIn(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Time Out <span className="text-gray-300 font-normal">(opt)</span></label>
                <input type="time" className={inp} value={addTimeOut} onChange={e => setAddTimeOut(e.target.value)} />
              </div>
            </div>

            {/* Division */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Division</label>
              <select className={inp} value={addAtDiv} onChange={e => setAddAtDiv(e.target.value)}>
                <option value="">— None —</option>
                {atDivs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            {/* Note */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Note <span className="text-gray-300 font-normal">(opt)</span></label>
              <input type="text" className={inp} value={addNote} placeholder="Reason for manual entry…"
                onChange={e => setAddNote(e.target.value)} />
            </div>

            {addError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{addError}</p>}

            <div className="flex gap-3 pt-1">
              <button onClick={submitAdd} disabled={addSaving}
                className="flex-1 bg-[#123b1f] text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-[#1a5c2a] disabled:opacity-40 transition-colors">
                {addSaving ? "Adding…" : "Add Punch"}
              </button>
              <button onClick={() => setShowAdd(false)}
                className="flex-1 border border-gray-200 text-gray-700 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
