"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Department = {
  id: string;
  name: string;
  code: string | null;
  sort_order: number;
  active: boolean;
};

const inputCls = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all";
const labelCls = "block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide";

export default function DepartmentsPage() {
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [error, setError] = useState("");

  // New dept form
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [saving, setSaving] = useState(false);

  // Inline edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  async function load() {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/atlas-time/departments", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to load");
      setDepartments(json.departments ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load departments");
    } finally {
      setLoading(false);
    }
  }

  async function addDepartment() {
    if (!newName.trim()) return;
    try {
      setSaving(true);
      setError("");
      const res = await fetch("/api/atlas-time/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), code: newCode.trim() || null }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to add department");
      setDepartments((prev) => [...prev, json.department]);
      setNewName("");
      setNewCode("");
      setAdding(false);
    } catch (e: any) {
      setError(e?.message ?? "Failed to add department");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    try {
      setEditSaving(true);
      setError("");
      const res = await fetch(`/api/atlas-time/departments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), code: editCode.trim() || null }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to save");
      setDepartments((prev) => prev.map((d) => d.id === id ? json.department : d));
      setEditId(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save");
    } finally {
      setEditSaving(false);
    }
  }

  async function toggleActive(dept: Department) {
    try {
      const res = await fetch(`/api/atlas-time/departments/${dept.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !dept.active }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to update");
      setDepartments((prev) => prev.map((d) => d.id === dept.id ? json.department : d));
    } catch (e: any) {
      setError(e?.message ?? "Failed to update");
    }
  }

  async function deleteDept(id: string) {
    if (!confirm("Delete this department? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/atlas-time/departments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? "Failed to delete");
      }
      setDepartments((prev) => prev.filter((d) => d.id !== id));
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete");
    }
  }

  function startEdit(dept: Department) {
    setEditId(dept.id);
    setEditName(dept.name);
    setEditCode(dept.code ?? "");
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen bg-[#f0f4f0]">
      <div
        className="px-4 md:px-8 py-6 md:py-8"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}
      >
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 text-white/50 text-xs mb-2">
            <Link href="/operations-center" className="hover:text-white/80 transition-colors">Operations Center</Link>
            <span>/</span>
            <Link href="/operations-center/atlas-time" className="hover:text-white/80 transition-colors">Atlas Time</Link>
            <span>/</span>
            <span className="text-white/80">Departments</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Departments</h1>
          <p className="text-white/50 text-sm mt-1">Organize crews for payroll reporting and assignment.</p>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">Departments</h2>
            <button
              onClick={() => { setAdding(true); setEditId(null); }}
              className="text-xs font-semibold text-[#123b1f] hover:text-[#1a5c2e] transition-colors flex items-center gap-1"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Department
            </button>
          </div>

          {loading ? (
            <div className="p-5 space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {departments.length === 0 && !adding && (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-gray-400">No departments yet. Add your first one.</p>
                </div>
              )}

              {departments.map((dept) => (
                <div key={dept.id} className="px-5 py-3.5">
                  {editId === dept.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(dept.id); if (e.key === "Escape") setEditId(null); }}
                        placeholder="Department name"
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      <input
                        value={editCode}
                        onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                        placeholder="CODE"
                        maxLength={6}
                        className="w-20 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 font-mono uppercase"
                      />
                      <button
                        onClick={() => saveEdit(dept.id)}
                        disabled={editSaving}
                        className="bg-[#123b1f] text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-[#1a5c2e] disabled:opacity-60 transition-colors"
                      >
                        {editSaving ? "…" : "Save"}
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        className="text-gray-400 hover:text-gray-600 text-xs px-2 py-1.5"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${dept.active ? "text-gray-900" : "text-gray-400"}`}>{dept.name}</span>
                          {dept.code && (
                            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{dept.code}</span>
                          )}
                          {!dept.active && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">Inactive</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => startEdit(dept)}
                          className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                          title="Edit"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button
                          onClick={() => toggleActive(dept)}
                          className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                          title={dept.active ? "Deactivate" : "Activate"}
                        >
                          {dept.active ? (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                            </svg>
                          ) : (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => deleteDept(dept.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                          title="Delete"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Add new row */}
              {adding && (
                <div className="px-5 py-3.5 bg-green-50/50">
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") addDepartment(); if (e.key === "Escape") { setAdding(false); setNewName(""); setNewCode(""); } }}
                      placeholder="Department name (e.g. Landscaping)"
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <input
                      value={newCode}
                      onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                      placeholder="CODE"
                      maxLength={6}
                      className="w-20 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 font-mono uppercase"
                    />
                    <button
                      onClick={addDepartment}
                      disabled={saving || !newName.trim()}
                      className="bg-[#123b1f] text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-[#1a5c2e] disabled:opacity-60 transition-colors"
                    >
                      {saving ? "…" : "Add"}
                    </button>
                    <button
                      onClick={() => { setAdding(false); setNewName(""); setNewCode(""); }}
                      className="text-gray-400 hover:text-gray-600 text-xs px-2 py-1.5"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 pb-4">
          Divisions (sub-groups within departments) are managed inside each department. Coming soon.
        </p>
      </div>
    </div>
  );
}
