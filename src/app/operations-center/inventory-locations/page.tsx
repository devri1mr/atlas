"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Location = { id: string; name: string; division_id: string | null; is_active: boolean };
type Division = { id: string; name: string };

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500";
const btnPrimary = "bg-green-500 hover:bg-green-600 text-white font-bold text-sm px-4 py-2 rounded-lg shadow-sm transition-colors disabled:opacity-40";
const btnGhost = "text-sm text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg border border-gray-200 hover:border-gray-400 transition-colors";

export default function InventoryLocationsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newDivId, setNewDivId] = useState("");
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDivId, setEditDivId] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [lRes, dRes] = await Promise.all([
      fetch("/api/inventory-locations", { cache: "no-store" }),
      fetch("/api/divisions", { cache: "no-store" }),
    ]);
    const lJson = await lRes.json();
    const dJson = await dRes.json();
    setLocations(lJson?.data ?? []);
    const divs: Division[] = dJson?.divisions ?? dJson?.data ?? dJson ?? [];
    setDivisions(Array.isArray(divs) ? divs : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const divById = new Map(divisions.map(d => [d.id, d]));

  async function handleAdd() {
    if (!newName.trim()) return;
    setAdding(true);
    const r = await fetch("/api/inventory-locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), division_id: newDivId || null }),
    });
    const j = await r.json();
    if (!r.ok) { setError(j?.error || "Failed to add"); setAdding(false); return; }
    setLocations(prev => [...prev, j.data].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName("");
    setNewDivId("");
    setAdding(false);
  }

  function startEdit(loc: Location) {
    setEditingId(loc.id);
    setEditName(loc.name);
    setEditDivId(loc.division_id ?? "");
  }

  async function handleSave(id: string) {
    setSavingId(id);
    const r = await fetch(`/api/inventory-locations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), division_id: editDivId || null }),
    });
    const j = await r.json();
    if (!r.ok) { setError(j?.error || "Failed to save"); setSavingId(null); return; }
    setLocations(prev => prev.map(l => l.id === id ? { ...l, ...j.data } : l));
    setEditingId(null);
    setSavingId(null);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete location "${name}"? This will fail if it has transaction history.`)) return;
    setDeletingId(id);
    const r = await fetch(`/api/inventory-locations/${id}`, { method: "DELETE" });
    if (!r.ok) { const j = await r.json(); setError(j?.error || "Failed to delete"); setDeletingId(null); return; }
    setLocations(prev => prev.filter(l => l.id !== id));
    setDeletingId(null);
  }

  async function toggleActive(loc: Location) {
    const r = await fetch(`/api/inventory-locations/${loc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !loc.is_active }),
    });
    const j = await r.json();
    if (!r.ok) { setError(j?.error || "Failed to update"); return; }
    setLocations(prev => prev.map(l => l.id === loc.id ? { ...l, is_active: !loc.is_active } : l));
  }

  return (
    <div className="min-h-screen bg-[#f6f8f6]">
      <div className="bg-[#123b1f] px-8 py-4 flex items-center justify-between">
        <div className="text-2xl font-extrabold text-white uppercase tracking-[0.2em]">Inventory Locations</div>
        <Link href="/operations-center" className="text-white/60 hover:text-white text-sm">← Operations Center</Link>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">
        <p className="text-sm text-gray-500">
          Locations represent physical storage sites (e.g. "Main Yard", "North Lot"). Each receipt is assigned a location.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="underline ml-4">dismiss</button>
          </div>
        )}

        <div className="bg-white rounded-xl border border-[#d7e6db] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
            <h2 className="font-bold text-gray-900">Locations</h2>
            <span className="text-xs text-gray-400">{locations.length} total</span>
          </div>

          {loading ? (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">Loading…</div>
          ) : locations.length === 0 ? (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">No locations yet. Add one below.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-5 py-3">Name</th>
                  <th className="text-left px-5 py-3">Division</th>
                  <th className="text-center px-5 py-3">Status</th>
                  <th className="text-right px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {locations.map(loc => (
                  <tr key={loc.id} className="border-b last:border-0 hover:bg-gray-50">
                    {editingId === loc.id ? (
                      <td colSpan={4} className="px-5 py-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <input className={inputCls + " flex-1 min-w-[160px]"} value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleSave(loc.id)} autoFocus />
                          <select className={inputCls + " w-40"} value={editDivId} onChange={e => setEditDivId(e.target.value)}>
                            <option value="">All divisions</option>
                            {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                          <button onClick={() => handleSave(loc.id)} disabled={savingId === loc.id || !editName.trim()}
                            className="text-xs font-semibold text-green-600 hover:text-green-800 disabled:opacity-40">
                            {savingId === loc.id ? "Saving…" : "Save"}
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-5 py-3 font-medium text-gray-900">{loc.name}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs">{loc.division_id ? (divById.get(loc.division_id)?.name ?? "—") : "All"}</td>
                        <td className="px-5 py-3 text-center">
                          <button onClick={() => toggleActive(loc)}
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold cursor-pointer ${loc.is_active ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-400 hover:bg-gray-200"}`}>
                            {loc.is_active ? "Active" : "Inactive"}
                          </button>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button onClick={() => startEdit(loc)} className="text-xs font-semibold text-blue-600 hover:underline">Edit</button>
                            <button onClick={() => handleDelete(loc.id, loc.name)} disabled={deletingId === loc.id}
                              className="text-xs font-semibold text-red-500 hover:underline disabled:opacity-40">
                              {deletingId === loc.id ? "…" : "Delete"}
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Add form */}
          <div className="px-5 py-4 border-t bg-gray-50 space-y-3">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add Location</div>
            <div className="flex gap-3 flex-wrap items-end">
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs text-gray-500 mb-1">Name *</label>
                <input className={inputCls} placeholder='e.g. "Main Yard", "North Lot"'
                  value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAdd()} />
              </div>
              <div className="w-44">
                <label className="block text-xs text-gray-500 mb-1">Division (optional)</label>
                <select className={inputCls} value={newDivId} onChange={e => setNewDivId(e.target.value)}>
                  <option value="">All divisions</option>
                  {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <button onClick={handleAdd} disabled={adding || !newName.trim()} className={btnPrimary}>
                {adding ? "Adding…" : "+ Add"}
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          <Link href="/operations-center/inventory" className={btnGhost}>← Back to Inventory</Link>
        </div>
      </div>
    </div>
  );
}
