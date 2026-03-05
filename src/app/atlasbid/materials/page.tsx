"use client";

import { useEffect, useMemo, useState } from "react";

type Material = {
  id: string;
  name: string;
  default_unit?: string | null;
  default_unit_cost?: number | null;
  vendor?: string | null;
  sku?: string | null;
  is_active?: boolean | null;
};

const UNIT_OPTIONS = [
  { label: "yd(s)", value: "yd" },
  { label: "sq ft", value: "sqft" },
  { label: "lin ft", value: "lf" },
  { label: "ea", value: "ea" },
  { label: "tons", value: "ton" },
  { label: "loads", value: "load" },
];

export default function MaterialsCatalogPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [search, setSearch] = useState("");

  const [name, setName] = useState("");
  const [unit, setUnit] = useState("ea");
  const [cost, setCost] = useState<number>(0);
  const [vendor, setVendor] = useState("");
  const [sku, setSku] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);

  async function loadMaterials() {
    const res = await fetch(`/api/materials-catalog`, {
      cache: "no-store",
    });

    const json = await res.json();
    const rows = json?.rows || json?.data || [];

    setMaterials(Array.isArray(rows) ? rows : []);
  }

  useEffect(() => {
    loadMaterials();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();

    if (!q) return materials;

    return materials.filter((m) => {
      const hay = `${m.name} ${m.vendor ?? ""} ${m.sku ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [search, materials]);

  async function addMaterial() {
    if (!name.trim()) return;

    const res = await fetch(`/api/materials-catalog`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        default_unit: unit,
        default_unit_cost: cost,
        vendor,
        sku,
      }),
    });

    const json = await res.json();

    if (res.ok) {
      setMaterials((prev) => [...prev, json.row]);
      setName("");
      setUnit("ea");
      setCost(0);
      setVendor("");
      setSku("");
    }
  }

  async function saveEdit(m: Material) {
    const res = await fetch(`/api/materials-catalog/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(m),
    });

    if (res.ok) {
      setEditingId(null);
      loadMaterials();
    }
  }

  async function toggleActive(m: Material) {
    const res = await fetch(`/api/materials-catalog/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        is_active: !m.is_active,
      }),
    });

    if (res.ok) loadMaterials();
  }

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold">Materials Catalog</h1>

      {/* Add new */}
      <div className="border rounded p-6 space-y-4">
        <h2 className="text-lg font-semibold">Add Material</h2>

        <div className="grid grid-cols-6 gap-4">
          <input
            className="border p-2 rounded col-span-2"
            placeholder="Material name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <select
            className="border p-2 rounded"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          >
            {UNIT_OPTIONS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>

          <input
            className="border p-2 rounded"
            type="number"
            placeholder="Unit cost"
            value={cost}
            onChange={(e) => setCost(Number(e.target.value))}
          />

          <input
            className="border p-2 rounded"
            placeholder="Vendor"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
          />

          <input
            className="border p-2 rounded"
            placeholder="SKU"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
          />

          <button
            onClick={addMaterial}
            className="bg-emerald-700 text-white px-4 py-2 rounded"
          >
            Add
          </button>
        </div>
      </div>

      {/* Search */}
      <input
        className="border p-2 rounded w-full"
        placeholder="Search materials..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Table */}
      <div className="border rounded">
        {filtered.map((m) => (
          <div
            key={m.id}
            className="grid grid-cols-8 gap-4 border-b p-3 items-center"
          >
            <div>{m.name}</div>

            <div>{m.vendor}</div>

            <div>{m.sku}</div>

            <div>{m.default_unit}</div>

            <div>${Number(m.default_unit_cost || 0).toFixed(2)}</div>

            <div>{m.is_active ? "Active" : "Inactive"}</div>

            <button
              className="text-blue-600"
              onClick={() =>
                setEditingId(editingId === m.id ? null : m.id)
              }
            >
              Edit
            </button>

            <button
              className="text-red-600"
              onClick={() => toggleActive(m)}
            >
              Toggle
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
