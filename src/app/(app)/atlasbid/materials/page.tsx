"use client";

import { useEffect, useMemo, useState } from "react";
import UnitInput from "@/components/UnitInput";

type Material = {
  id: string;
  name: string;
  default_unit?: string | null;
  default_unit_cost?: number | null;
  vendor?: string | null;
  sku?: string | null;
  is_active?: boolean | null;
  in_inventory?: boolean;
};

const UNIT_OPTIONS = [
  { label: "yd(s)", value: "yd" },
  { label: "sq ft", value: "sqft" },
  { label: "lin ft", value: "lf" },
  { label: "ft", value: "ft" },
  { label: "sticks", value: "stick" },
  { label: "ea", value: "ea" },
  { label: "tons", value: "ton" },
  { label: "loads", value: "load" },
  { label: "bag(s)", value: "bag" },
  { label: "lb(s)", value: "lb" },
  { label: "gal(s)", value: "gal" },
];

export default function MaterialsCatalogPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [search, setSearch] = useState("");
  const [filterInventory, setFilterInventory] = useState<"all" | "in" | "out">("all");
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [unit, setUnit] = useState("ea");
  const [cost, setCost] = useState<number>(0);
  const [vendor, setVendor] = useState("");
  const [sku, setSku] = useState("");
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Partial<Material>>({});

  async function loadMaterials() {
    const res = await fetch(`/api/materials-catalog`, { cache: "no-store" });
    const json = await res.json();
    const rows = json?.rows || json?.data || [];
    setMaterials(Array.isArray(rows) ? rows : []);
  }

  useEffect(() => { loadMaterials(); }, []);

  const filtered = useMemo(() => {
    let list = materials;
    if (filterInventory === "in") list = list.filter(m => m.in_inventory);
    if (filterInventory === "out") list = list.filter(m => !m.in_inventory);
    const q = search.toLowerCase().trim();
    if (!q) return list;
    return list.filter(m => `${m.name} ${m.vendor ?? ""} ${m.sku ?? ""}`.toLowerCase().includes(q));
  }, [search, materials, filterInventory]);

  async function addMaterial() {
    if (!name.trim()) return;
    setAdding(true);
    const res = await fetch(`/api/materials-catalog`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, default_unit: unit, default_unit_cost: cost, vendor, sku }),
    });
    const json = await res.json();
    if (res.ok) {
      setMaterials(prev => [...prev, { ...(json.data || json.row), in_inventory: false }]);
      setName(""); setUnit("ea"); setCost(0); setVendor(""); setSku("");
    }
    setAdding(false);
  }

  function startEdit(m: Material) {
    setEditingId(m.id);
    setEditFields({ name: m.name, default_unit: m.default_unit, default_unit_cost: m.default_unit_cost, vendor: m.vendor, sku: m.sku });
  }

  async function saveEdit(m: Material) {
    const res = await fetch(`/api/materials-catalog/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editFields),
    });
    if (res.ok) {
      setMaterials(prev => prev.map(r => r.id === m.id ? { ...r, ...editFields } : r));
      setEditingId(null);
    }
  }

  async function toggleActive(m: Material) {
    const res = await fetch(`/api/materials-catalog/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !m.is_active }),
    });
    if (res.ok) setMaterials(prev => prev.map(r => r.id === m.id ? { ...r, is_active: !m.is_active } : r));
  }

  async function linkToInventory(m: Material) {
    setLinkingId(m.id);
    // Create a materials row linked to this catalog entry so inventory tracking is enabled
    const res = await fetch(`/api/materials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: m.name,
        display_name: m.name,
        unit: m.default_unit || "ea",
        inventory_unit: m.default_unit || "ea",
        unit_cost: m.default_unit_cost || 0,
        inventory_enabled: true,
        is_active: true,
        catalog_material_id: m.id,
      }),
    });
    if (res.ok) {
      setMaterials(prev => prev.map(r => r.id === m.id ? { ...r, in_inventory: true } : r));
    }
    setLinkingId(null);
  }

  return (
    <div className="px-4 py-6 sm:px-8 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-[#123b1f]">Materials Catalog</h1>

      {/* Add new */}
      <div className="border border-gray-200 rounded-xl p-4 sm:p-5 space-y-3 bg-white shadow-sm">
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Add Material</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <input className="border border-gray-200 p-2 rounded-lg text-sm sm:col-span-2" placeholder="Material name" value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addMaterial()} />
          <UnitInput className="border border-gray-200 p-2 rounded-lg text-sm" value={unit} onChange={setUnit} />
          <input className="border border-gray-200 p-2 rounded-lg text-sm" type="number" placeholder="Unit cost" value={cost || ""} onChange={e => setCost(Number(e.target.value))} />
          <input className="border border-gray-200 p-2 rounded-lg text-sm" placeholder="Vendor" value={vendor} onChange={e => setVendor(e.target.value)} />
          <input className="border border-gray-200 p-2 rounded-lg text-sm" placeholder="SKU" value={sku} onChange={e => setSku(e.target.value)} />
        </div>
        <button onClick={addMaterial} disabled={adding || !name.trim()}
          className="bg-green-500 hover:bg-green-600 text-white font-bold text-sm px-5 py-2 rounded-lg shadow-sm disabled:opacity-40 transition-colors">
          {adding ? "Adding…" : "+ Add to Catalog"}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <input className="border border-gray-200 p-2 rounded-lg text-sm flex-1 min-w-0" placeholder="Search materials…" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="flex flex-wrap gap-1 border border-gray-200 rounded-lg overflow-hidden text-sm w-fit">
          {(["all", "in", "out"] as const).map(f => (
            <button key={f} onClick={() => setFilterInventory(f)}
              className={`px-3 py-2 font-medium transition-colors ${filterInventory === f ? "bg-[#123b1f] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
              {f === "all" ? "All" : f === "in" ? "✓ In Inventory" : "Not in Inventory"}
            </button>
          ))}
        </div>
        <span className="text-sm text-gray-400 shrink-0">{filtered.length} item{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-3 px-4 py-2 bg-gray-50 border-b text-xs font-bold text-gray-500 uppercase tracking-wide min-w-[560px]">
            <div>Name</div>
            <div>Unit</div>
            <div>Default Cost</div>
            <div>Vendor</div>
            <div>Inventory</div>
            <div />
          </div>

          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">No materials found.</div>
          )}

          {filtered.map(m => (
            <div key={m.id} className={`border-b last:border-0 min-w-[560px] ${!m.is_active ? "opacity-50" : ""}`}>
              {editingId === m.id ? (
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-3 px-4 py-3 items-center">
                  <input className="border border-gray-200 p-1.5 rounded text-sm" value={editFields.name ?? ""} onChange={e => setEditFields(f => ({ ...f, name: e.target.value }))} />
                  <UnitInput className="border border-gray-200 p-1.5 rounded text-sm" value={editFields.default_unit ?? "ea"} onChange={v => setEditFields(f => ({ ...f, default_unit: v }))} />
                  <input className="border border-gray-200 p-1.5 rounded text-sm" type="number" value={editFields.default_unit_cost ?? 0} onChange={e => setEditFields(f => ({ ...f, default_unit_cost: Number(e.target.value) }))} />
                  <input className="border border-gray-200 p-1.5 rounded text-sm" value={editFields.vendor ?? ""} onChange={e => setEditFields(f => ({ ...f, vendor: e.target.value }))} placeholder="Vendor" />
                  <div />
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(m)} className="text-xs font-semibold text-green-600 hover:text-green-800">Save</button>
                    <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-3 px-4 py-3 items-center hover:bg-gray-50">
                  <div className="font-medium text-gray-900 text-sm">{m.name}</div>
                  <div className="text-sm text-gray-600">{m.default_unit || "—"}</div>
                  <div className="text-sm text-gray-600">${Number(m.default_unit_cost || 0).toFixed(2)}</div>
                  <div className="text-sm text-gray-500 truncate">{m.vendor || "—"}</div>
                  <div>
                    {m.in_inventory ? (
                      <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full border border-green-200">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        In Inventory
                      </span>
                    ) : (
                      <button onClick={() => linkToInventory(m)} disabled={linkingId === m.id}
                        className="text-xs text-gray-400 hover:text-green-600 hover:underline disabled:opacity-50 transition-colors">
                        {linkingId === m.id ? "Linking…" : "+ Link to Inventory"}
                      </button>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => startEdit(m)} className="text-xs font-medium text-blue-600 hover:text-blue-800">Edit</button>
                    <button onClick={() => toggleActive(m)} className="text-xs text-gray-400 hover:text-red-500">
                      {m.is_active ? "Deactivate" : "Reactivate"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
