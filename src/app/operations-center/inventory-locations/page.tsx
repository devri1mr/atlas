"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Location = { id: string; name: string; is_active: boolean };
type RegisteredMaterial = { id: string; name: string; display_name: string | null; unit: string | null; catalog_material_id: string | null };
type CatalogResult = { id: string; name: string; default_unit?: string | null };

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500";
const btnPrimary = "bg-green-500 hover:bg-green-600 text-white font-bold text-sm px-4 py-2 rounded-lg shadow-sm transition-colors disabled:opacity-40";
const btnGhost = "text-sm text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg border border-gray-200 hover:border-gray-400 transition-colors";

export default function InventoryLocationsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [regMaterials, setRegMaterials] = useState<RegisteredMaterial[]>([]);
  const [regLoading, setRegLoading] = useState(true);
  const [deletingMatId, setDeletingMatId] = useState<string | null>(null);

  // Link-to-catalog state
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [catSearch, setCatSearch] = useState("");
  const [catResults, setCatResults] = useState<CatalogResult[]>([]);
  const [catSearching, setCatSearching] = useState(false);
  const [linkSaving, setLinkSaving] = useState(false);
  const catSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/inventory-locations", { cache: "no-store" });
    const json = await res.json();
    setLocations(json?.data ?? []);
    setLoading(false);
  }

  async function loadMaterials() {
    setRegLoading(true);
    const res = await fetch("/api/materials-search?limit=50&include_inactive=true", { cache: "no-store" });
    const json = await res.json();
    setRegMaterials(json?.data ?? []);
    setRegLoading(false);
  }

  useEffect(() => { load(); loadMaterials(); }, []);

  async function handleAdd() {
    if (!newName.trim()) return;
    setAdding(true);
    const r = await fetch("/api/inventory-locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const j = await r.json();
    if (!r.ok) { setError(j?.error || "Failed to add"); setAdding(false); return; }
    setLocations(prev => [...prev, j.data].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName("");
    setAdding(false);
  }

  function startEdit(loc: Location) { setEditingId(loc.id); setEditName(loc.name); }

  async function handleSave(id: string) {
    setSavingId(id);
    const r = await fetch(`/api/inventory-locations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim() }),
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

  async function handleDeleteMaterial(id: string, name: string) {
    if (!confirm(`Remove "${name}" from inventory? This will fail if it has transaction history.`)) return;
    setDeletingMatId(id);
    const r = await fetch(`/api/materials/${id}`, { method: "DELETE" });
    if (!r.ok) { const j = await r.json(); setError(j?.error || "Failed to remove"); setDeletingMatId(null); return; }
    setRegMaterials(prev => prev.filter(m => m.id !== id));
    setDeletingMatId(null);
  }

  function openLink(matId: string) {
    setLinkingId(matId);
    setCatSearch("");
    setCatResults([]);
  }

  function closeLink() {
    setLinkingId(null);
    setCatSearch("");
    setCatResults([]);
  }

  useEffect(() => {
    if (linkingId === null) return;
    if (catSearchRef.current) clearTimeout(catSearchRef.current);
    catSearchRef.current = setTimeout(async () => {
      setCatSearching(true);
      const q = catSearch.trim() ? `&q=${encodeURIComponent(catSearch)}` : "";
      const res = await fetch(`/api/materials-catalog?limit=20${q}`, { cache: "no-store" });
      const json = await res.json();
      setCatResults(json?.data ?? []);
      setCatSearching(false);
    }, 250);
  }, [catSearch, linkingId]);

  async function handleLink(matId: string, catalogId: string) {
    setLinkSaving(true);
    const r = await fetch(`/api/materials/${matId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ catalog_material_id: catalogId }),
    });
    const j = await r.json();
    if (!r.ok) { setError(j?.error || "Failed to link"); setLinkSaving(false); return; }
    setRegMaterials(prev => prev.map(m => m.id === matId ? { ...m, catalog_material_id: catalogId } : m));
    setLinkSaving(false);
    closeLink();
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
                  <th className="text-center px-5 py-3">Status</th>
                  <th className="text-right px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {locations.map(loc => (
                  <tr key={loc.id} className="border-b last:border-0 hover:bg-gray-50">
                    {editingId === loc.id ? (
                      <td colSpan={3} className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <input className={inputCls + " flex-1"} value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleSave(loc.id)} autoFocus />
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

          <div className="px-5 py-4 border-t bg-gray-50 space-y-3">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add Location</div>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Name *</label>
                <input className={inputCls} placeholder='e.g. "Main Yard", "North Lot"'
                  value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAdd()} />
              </div>
              <button onClick={handleAdd} disabled={adding || !newName.trim()} className={btnPrimary}>
                {adding ? "Adding…" : "+ Add"}
              </button>
            </div>
          </div>
        </div>

        {/* Registered Materials */}
        <div className="bg-white rounded-xl border border-[#d7e6db] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-gray-900">Registered Materials</h2>
              <p className="text-xs text-gray-400 mt-0.5">All items enabled for inventory tracking.</p>
            </div>
            <span className="text-xs text-gray-400">{regMaterials.length} total</span>
          </div>

          {regLoading ? (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">Loading…</div>
          ) : regMaterials.length === 0 ? (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">No registered materials.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-5 py-3">Name</th>
                  <th className="text-left px-5 py-3">Unit</th>
                  <th className="text-left px-5 py-3">Catalog Link</th>
                  <th className="text-right px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {regMaterials.map(m => (
                  <>
                    <tr key={m.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">{m.display_name || m.name}</td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{m.unit || "—"}</td>
                      <td className="px-5 py-3">
                        {m.catalog_material_id
                          ? <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Linked</span>
                          : <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Unlinked</span>}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {!m.catalog_material_id && (
                            <button onClick={() => linkingId === m.id ? closeLink() : openLink(m.id)}
                              className="text-xs font-semibold text-blue-600 hover:underline">
                              {linkingId === m.id ? "Cancel" : "Link to Catalog"}
                            </button>
                          )}
                          <button onClick={() => handleDeleteMaterial(m.id, m.display_name || m.name)}
                            disabled={deletingMatId === m.id}
                            className="text-xs font-semibold text-red-500 hover:underline disabled:opacity-40">
                            {deletingMatId === m.id ? "…" : "Remove"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {linkingId === m.id && (
                      <tr key={m.id + "-link"} className="border-b bg-blue-50">
                        <td colSpan={4} className="px-5 py-4">
                          <p className="text-xs text-gray-500 mb-2">Search the catalog and pick the matching entry for <strong>{m.display_name || m.name}</strong>:</p>
                          <input
                            className={inputCls + " mb-2"}
                            placeholder="Search catalog…"
                            value={catSearch}
                            onChange={e => setCatSearch(e.target.value)}
                            autoFocus
                          />
                          {catSearching && <div className="text-xs text-gray-400 py-1">Searching…</div>}
                          {!catSearching && catResults.length === 0 && catSearch && (
                            <div className="text-xs text-gray-400 py-1">No matches found.</div>
                          )}
                          {catResults.length > 0 && (
                            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                              {catResults.map(c => (
                                <button key={c.id} onClick={() => handleLink(m.id, c.id)}
                                  disabled={linkSaving}
                                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-green-50 border-b last:border-0 flex items-center justify-between disabled:opacity-40">
                                  <span>{c.name}</span>
                                  <span className="text-xs text-gray-400">{c.default_unit || ""}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex justify-center">
          <Link href="/operations-center/inventory" className={btnGhost}>← Back to Inventory</Link>
        </div>
      </div>
    </div>
  );
}
