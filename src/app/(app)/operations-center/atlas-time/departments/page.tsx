"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
// Company divisions auto-populate from Operations Center `divisions` table.
// Time-clock-only extras live in `at_divisions` (time_clock_only = true).

type Department = { id: string; name: string; code: string | null; sort_order: number; active: boolean };
type Division = { id: string; name: string; active: boolean; time_clock_only: boolean; source: "company" | "time_clock" };

const inputCls = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all";

function ClockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  );
}

export default function DepartmentsPage() {
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [error, setError] = useState("");

  // Dept form
  const [addingDept, setAddingDept] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");
  const [newDeptCode, setNewDeptCode] = useState("");
  const [deptSaving, setDeptSaving] = useState(false);
  const [editDeptId, setEditDeptId] = useState<string | null>(null);
  const [editDeptName, setEditDeptName] = useState("");
  const [editDeptCode, setEditDeptCode] = useState("");
  const [editDeptSaving, setEditDeptSaving] = useState(false);

  // Division form
  const [addingDiv, setAddingDiv] = useState(false);
  const [newDivName, setNewDivName] = useState("");
  // All new divisions added here are time-clock-only (company divisions come from ops center)
  const [divSaving, setDivSaving] = useState(false);
  const [editDivId, setEditDivId] = useState<string | null>(null);
  const [editDivName, setEditDivName] = useState("");
  const [editDivTCO, setEditDivTCO] = useState(false);
  const [editDivSaving, setEditDivSaving] = useState(false);

  async function load() {
    try {
      setLoading(true);
      setError("");
      const [deptRes, divRes] = await Promise.all([
        fetch("/api/atlas-time/departments", { cache: "no-store" }),
        fetch("/api/atlas-time/divisions", { cache: "no-store" }),
      ]);
      const deptJson = await deptRes.json().catch(() => null);
      const divJson = await divRes.json().catch(() => null);
      if (!deptRes.ok) throw new Error(deptJson?.error ?? "Failed to load departments");
      setDepartments(deptJson.departments ?? []);
      setDivisions(divJson?.divisions ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  // ── Departments ──────────────────────────────────────────
  async function addDepartment() {
    if (!newDeptName.trim()) return;
    try {
      setDeptSaving(true);
      const res = await fetch("/api/atlas-time/departments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newDeptName.trim(), code: newDeptCode.trim() || null }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed");
      setDepartments(p => [...p, json.department]);
      setNewDeptName(""); setNewDeptCode(""); setAddingDept(false);
    } catch (e: any) { setError(e?.message ?? "Failed"); }
    finally { setDeptSaving(false); }
  }

  async function saveDeptEdit(id: string) {
    if (!editDeptName.trim()) return;
    try {
      setEditDeptSaving(true);
      const res = await fetch(`/api/atlas-time/departments/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editDeptName.trim(), code: editDeptCode.trim() || null }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed");
      setDepartments(p => p.map(d => d.id === id ? json.department : d));
      setEditDeptId(null);
    } catch (e: any) { setError(e?.message ?? "Failed"); }
    finally { setEditDeptSaving(false); }
  }

  async function toggleDept(dept: Department) {
    const res = await fetch(`/api/atlas-time/departments/${dept.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !dept.active }),
    });
    const json = await res.json().catch(() => null);
    if (res.ok) setDepartments(p => p.map(d => d.id === dept.id ? json.department : d));
  }

  async function deleteDept(id: string) {
    if (!confirm("Delete this department?")) return;
    const res = await fetch(`/api/atlas-time/departments/${id}`, { method: "DELETE" });
    if (res.ok) setDepartments(p => p.filter(d => d.id !== id));
    else {
      const json = await res.json().catch(() => null);
      setError(json?.error ?? "Failed to delete");
    }
  }

  // ── Divisions ────────────────────────────────────────────
  async function addDivision() {
    if (!newDivName.trim()) return;
    try {
      setDivSaving(true);
      const res = await fetch("/api/atlas-time/divisions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newDivName.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed");
      setDivisions(p => [...p, json.division].sort((a, b) => a.name.localeCompare(b.name)));
      setNewDivName(""); setAddingDiv(false);
    } catch (e: any) { setError(e?.message ?? "Failed"); }
    finally { setDivSaving(false); }
  }

  async function saveDivEdit(id: string) {
    if (!editDivName.trim()) return;
    try {
      setEditDivSaving(true);
      const res = await fetch(`/api/atlas-time/divisions/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editDivName.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed");
      setDivisions(p => p.map(d => d.id === id ? json.division : d));
      setEditDivId(null);
    } catch (e: any) { setError(e?.message ?? "Failed"); }
    finally { setEditDivSaving(false); }
  }

  async function toggleDiv(div: Division) {
    const res = await fetch(`/api/atlas-time/divisions/${div.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !div.active }),
    });
    const json = await res.json().catch(() => null);
    if (res.ok) setDivisions(p => p.map(d => d.id === div.id ? json.division : d));
  }

  async function deleteDiv(id: string) {
    if (!confirm("Delete this division?")) return;
    const res = await fetch(`/api/atlas-time/divisions/${id}`, { method: "DELETE" });
    if (res.ok) setDivisions(p => p.filter(d => d.id !== id));
    else {
      const json = await res.json().catch(() => null);
      setError(json?.error ?? "Failed to delete");
    }
  }

  function startEditDiv(div: Division) {
    setEditDivId(div.id); setEditDivName(div.name);
  }

  useEffect(() => { load(); }, []);

  const EditButtons = ({ onSave, onCancel, saving }: { onSave: () => void; onCancel: () => void; saving: boolean }) => (
    <>
      <button onClick={onSave} disabled={saving}
        className="bg-[#123b1f] text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-[#1a5c2e] disabled:opacity-60 transition-colors">
        {saving ? "…" : "Save"}
      </button>
      <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-xs px-2 py-1.5">Cancel</button>
    </>
  );

  const RowActions = ({ onEdit, onToggle, onDelete, active }: { onEdit: () => void; onToggle: () => void; onDelete: () => void; active: boolean }) => (
    <div className="flex items-center gap-1 shrink-0">
      <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-50 transition-colors" title="Edit">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button onClick={onToggle} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-50 transition-colors" title={active ? "Deactivate" : "Activate"}>
        {active ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        )}
      </button>
      <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors" title="Delete">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f0f4f0]">
      <div className="px-4 md:px-8 py-6 md:py-8"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}>
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 text-white/50 text-xs mb-2">
            <Link href="/operations-center" className="hover:text-white/80 transition-colors">Operations Center</Link>
            <span>/</span>
            <Link href="/operations-center/atlas-time" className="hover:text-white/80 transition-colors">Atlas Time</Link>
            <span>/</span>
            <span className="text-white/80">Departments & Divisions</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Departments & Divisions</h1>
          <p className="text-white/50 text-sm mt-1">Organize crews for payroll reporting, assignment, and kiosk punch selection.</p>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
            {error}
            <button onClick={() => setError("")} className="text-red-400 hover:text-red-600 ml-2">✕</button>
          </div>
        )}

        {/* ── Departments ─────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">Departments</h2>
            <button onClick={() => { setAddingDept(true); setEditDeptId(null); }}
              className="text-xs font-semibold text-[#123b1f] hover:text-[#1a5c2e] transition-colors flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add
            </button>
          </div>

          {loading ? (
            <div className="p-5 space-y-3">{[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {departments.length === 0 && !addingDept && (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-gray-400">No departments yet.</p>
                </div>
              )}
              {departments.map(dept => (
                <div key={dept.id} className="px-5 py-3.5">
                  {editDeptId === dept.id ? (
                    <div className="flex items-center gap-2">
                      <input autoFocus value={editDeptName} onChange={e => setEditDeptName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveDeptEdit(dept.id); if (e.key === "Escape") setEditDeptId(null); }}
                        placeholder="Department name"
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                      <input value={editDeptCode} onChange={e => setEditDeptCode(e.target.value.toUpperCase())}
                        placeholder="CODE" maxLength={6}
                        className="w-20 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 font-mono uppercase" />
                      <EditButtons onSave={() => saveDeptEdit(dept.id)} onCancel={() => setEditDeptId(null)} saving={editDeptSaving} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <span className={`text-sm font-medium ${dept.active ? "text-gray-900" : "text-gray-400"}`}>{dept.name}</span>
                        {dept.code && <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{dept.code}</span>}
                        {!dept.active && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">Inactive</span>}
                      </div>
                      <RowActions
                        onEdit={() => { setEditDeptId(dept.id); setEditDeptName(dept.name); setEditDeptCode(dept.code ?? ""); }}
                        onToggle={() => toggleDept(dept)}
                        onDelete={() => deleteDept(dept.id)}
                        active={dept.active}
                      />
                    </div>
                  )}
                </div>
              ))}
              {addingDept && (
                <div className="px-5 py-3.5 bg-green-50/50">
                  <div className="flex items-center gap-2">
                    <input autoFocus value={newDeptName} onChange={e => setNewDeptName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") addDepartment(); if (e.key === "Escape") { setAddingDept(false); setNewDeptName(""); setNewDeptCode(""); } }}
                      placeholder="Department name (e.g. Landscaping)"
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    <input value={newDeptCode} onChange={e => setNewDeptCode(e.target.value.toUpperCase())}
                      placeholder="CODE" maxLength={6}
                      className="w-20 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 font-mono uppercase" />
                    <button onClick={addDepartment} disabled={deptSaving || !newDeptName.trim()}
                      className="bg-[#123b1f] text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-[#1a5c2e] disabled:opacity-60 transition-colors">
                      {deptSaving ? "…" : "Add"}
                    </button>
                    <button onClick={() => { setAddingDept(false); setNewDeptName(""); setNewDeptCode(""); }}
                      className="text-gray-400 hover:text-gray-600 text-xs px-2 py-1.5">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Divisions ────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Divisions</h2>
              <p className="text-xs text-gray-400 mt-0.5">Company divisions auto-populate from Operations Center. Add extras for Time Clock only.</p>
            </div>
            <button onClick={() => { setAddingDiv(true); setEditDivId(null); }}
              className="text-xs font-semibold text-[#123b1f] hover:text-[#1a5c2e] transition-colors flex items-center gap-1 shrink-0">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Time Clock Extra
            </button>
          </div>

          {!loading && (
            <div className="divide-y divide-gray-50">
              {divisions.length === 0 && !addingDiv && (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-gray-400">No divisions found. Add divisions in <Link href="/operations-center/divisions" className="underline hover:text-gray-700">Operations Center → Divisions</Link>.</p>
                </div>
              )}

              {/* Company divisions — read-only */}
              {divisions.filter(d => d.source === "company").map(div => (
                <div key={div.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-medium ${div.active ? "text-gray-800" : "text-gray-400"}`}>{div.name}</span>
                    {!div.active && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">Inactive</span>}
                  </div>
                  <span className="text-[10px] text-gray-400 shrink-0">Operations Center</span>
                </div>
              ))}

              {/* Separator if both types exist */}
              {divisions.some(d => d.source === "company") && (divisions.some(d => d.source === "time_clock") || addingDiv) && (
                <div className="px-5 py-2 bg-gray-50/60 flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Time Clock Only Extras</span>
                </div>
              )}

              {/* Time-clock-only extras — editable */}
              {divisions.filter(d => d.source === "time_clock").map(div => (
                <div key={div.id} className="px-5 py-3.5">
                  {editDivId === div.id ? (
                    <div className="flex items-center gap-2">
                      <input autoFocus value={editDivName} onChange={e => setEditDivName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveDivEdit(div.id); if (e.key === "Escape") setEditDivId(null); }}
                        placeholder="Division name"
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                      <EditButtons onSave={() => saveDivEdit(div.id)} onCancel={() => setEditDivId(null)} saving={editDivSaving} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium ${div.active ? "text-gray-900" : "text-gray-400"}`}>{div.name}</span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-600 border border-sky-200">
                          <ClockIcon /> Time Clock
                        </span>
                        {!div.active && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">Inactive</span>}
                      </div>
                      <RowActions
                        onEdit={() => startEditDiv(div)}
                        onToggle={() => toggleDiv(div)}
                        onDelete={() => deleteDiv(div.id)}
                        active={div.active}
                      />
                    </div>
                  )}
                </div>
              ))}

              {addingDiv && (
                <div className="px-5 py-3.5 bg-sky-50/40 border-t border-sky-100">
                  <div className="flex items-center gap-2">
                    <input autoFocus value={newDivName} onChange={e => setNewDivName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") addDivision(); if (e.key === "Escape") { setAddingDiv(false); setNewDivName(""); } }}
                      placeholder="e.g. Night Crew, Snow Removal"
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
                    <button onClick={addDivision} disabled={divSaving || !newDivName.trim()}
                      className="bg-sky-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-sky-700 disabled:opacity-60 transition-colors">
                      {divSaving ? "…" : "Add"}
                    </button>
                    <button onClick={() => { setAddingDiv(false); setNewDivName(""); }}
                      className="text-gray-400 hover:text-gray-600 text-xs px-2 py-1.5">Cancel</button>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-2">This division will only appear in the Time Clock, not in bids or other modules.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
