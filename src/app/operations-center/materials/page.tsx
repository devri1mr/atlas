"use client";

import { useEffect, useMemo, useState } from "react";

type Material = {
  id: string;
  display_name: string | null;
  name: string;
  common_name?: string | null;
  scientific_name?: string | null;
  cultivar?: string | null;
  unit: string | null;
  unit_cost: number | null;
  is_active: boolean | null;
  category_id?: string | null;
};

type MaterialCategory = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
};

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newCommonName, setNewCommonName] = useState("");
  const [newScientificName, setNewScientificName] = useState("");
  const [newCultivar, setNewCultivar] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newCost, setNewCost] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");

  const parentCategories = useMemo(
    () => categories.filter((c) => !c.parent_id),
    [categories]
  );

  const childCategories = useMemo(
    () => categories.filter((c) => !!c.parent_id),
    [categories]
  );

  const categoryLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    const byId = new Map(categories.map((c) => [c.id, c]));

    for (const c of categories) {
      if (c.parent_id) {
        const parent = byId.get(c.parent_id);
        map.set(c.id, parent ? `${parent.name} / ${c.name}` : c.name);
      } else {
        map.set(c.id, c.name);
      }
    }

    return map;
  }, [categories]);

  async function loadCategories() {
    const res = await fetch(`/api/material-categories`, { cache: "no-store" });
    const json = await res.json();
    setCategories(Array.isArray(json?.data) ? json.data : []);
  }

  async function loadMaterials() {
    const params = new URLSearchParams();

    if (search.trim()) params.set("search", search.trim());
    if (selectedCategoryId) params.set("category_id", selectedCategoryId);

    const qs = params.toString();
    const res = await fetch(`/api/materials${qs ? `?${qs}` : ""}`, {
      cache: "no-store",
    });
    const data = await res.json();
    setMaterials(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    loadMaterials();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      loadMaterials();
    }, 200);

    return () => clearTimeout(t);
  }, [search, selectedCategoryId]);

  async function addMaterial() {
    const trimmedName = newName.trim();
    const trimmedDisplayName = newDisplayName.trim() || trimmedName;

    if (!trimmedName) return;

    const res = await fetch("/api/materials", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: trimmedName,
        display_name: trimmedDisplayName,
        common_name: newCommonName.trim() || null,
        scientific_name: newScientificName.trim() || null,
        cultivar: newCultivar.trim() || null,
        unit: newUnit.trim() || null,
        unit_cost: newCost === "" ? null : Number(newCost),
        category_id: newCategoryId || null,
        is_active: true,
      }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => null);
      alert(json?.error || "Failed to add material");
      return;
    }

    setShowAdd(false);
    setNewName("");
    setNewDisplayName("");
    setNewCommonName("");
    setNewScientificName("");
    setNewCultivar("");
    setNewUnit("");
    setNewCost("");
    setNewCategoryId("");

    await loadMaterials();
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 26, fontWeight: 600, marginBottom: 20 }}>
        Materials Catalog
      </h1>

      <div
        style={{
          marginBottom: 16,
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <input
          placeholder="Search materials..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: 300,
            padding: 8,
            border: "1px solid #ccc",
            borderRadius: 6,
          }}
        />

        <select
          value={selectedCategoryId}
          onChange={(e) => setSelectedCategoryId(e.target.value)}
          style={{
            padding: 8,
            border: "1px solid #ccc",
            borderRadius: 6,
            minWidth: 240,
          }}
        >
          <option value="">All Categories</option>
          {parentCategories.map((parent) => (
            <optgroup key={parent.id} label={parent.name}>
              <option value={parent.id}>{parent.name}</option>
              {childCategories
                .filter((child) => child.parent_id === parent.id)
                .map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>

        <button
          onClick={() => setShowAdd(true)}
          style={{
            padding: "8px 14px",
            background: "#1f7a55",
            color: "white",
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
          }}
        >
          Add Material
        </button>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
            <th style={{ padding: 8 }}>Material</th>
            <th style={{ padding: 8 }}>Category</th>
            <th style={{ padding: 8 }}>Unit</th>
            <th style={{ padding: 8 }}>Cost</th>
            <th style={{ padding: 8 }}>Active</th>
          </tr>
        </thead>

        <tbody>
          {materials.map((m) => (
            <tr key={m.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: 8 }}>
                <div>{m.display_name || m.name}</div>
                {m.scientific_name ? (
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {m.scientific_name}
                    {m.cultivar ? ` '${m.cultivar}'` : ""}
                  </div>
                ) : null}
              </td>
              <td style={{ padding: 8 }}>
                {m.category_id ? categoryLabelMap.get(m.category_id) || "-" : "-"}
              </td>
              <td style={{ padding: 8 }}>{m.unit || "-"}</td>
              <td style={{ padding: 8 }}>
                {m.unit_cost !== null && m.unit_cost !== undefined
                  ? `$${Number(m.unit_cost).toFixed(2)}`
                  : "-"}
              </td>
              <td style={{ padding: 8 }}>{m.is_active ? "Yes" : "No"}</td>
            </tr>
          ))}

          {materials.length === 0 && (
            <tr>
              <td colSpan={5} style={{ padding: 16 }}>
                No materials found
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {showAdd && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              background: "white",
              padding: 24,
              width: 420,
              borderRadius: 8,
            }}
          >
            <h3 style={{ marginBottom: 12 }}>Add Material</h3>

            <input
              placeholder="Internal name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{ width: "100%", marginBottom: 10, padding: 8 }}
            />

            <input
              placeholder="Display name"
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              style={{ width: "100%", marginBottom: 10, padding: 8 }}
            />

            <input
              placeholder="Common name"
              value={newCommonName}
              onChange={(e) => setNewCommonName(e.target.value)}
              style={{ width: "100%", marginBottom: 10, padding: 8 }}
            />

            <input
              placeholder="Scientific name"
              value={newScientificName}
              onChange={(e) => setNewScientificName(e.target.value)}
              style={{ width: "100%", marginBottom: 10, padding: 8 }}
            />

            <input
              placeholder="Cultivar"
              value={newCultivar}
              onChange={(e) => setNewCultivar(e.target.value)}
              style={{ width: "100%", marginBottom: 10, padding: 8 }}
            />

            <select
              value={newCategoryId}
              onChange={(e) => setNewCategoryId(e.target.value)}
              style={{ width: "100%", marginBottom: 10, padding: 8 }}
            >
              <option value="">Select category</option>
              {parentCategories.map((parent) => (
                <optgroup key={parent.id} label={parent.name}>
                  <option value={parent.id}>{parent.name}</option>
                  {childCategories
                    .filter((child) => child.parent_id === parent.id)
                    .map((child) => (
                      <option key={child.id} value={child.id}>
                        {child.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>

            <input
              placeholder="Unit (ea, yd, ton, sqft)"
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              style={{ width: "100%", marginBottom: 10, padding: 8 }}
            />

            <input
              placeholder="Cost"
              value={newCost}
              onChange={(e) => setNewCost(e.target.value)}
              style={{ width: "100%", marginBottom: 14, padding: 8 }}
            />

            <button
              onClick={addMaterial}
              style={{
                padding: "8px 14px",
                background: "#1f7a55",
                color: "white",
                borderRadius: 6,
                border: "none",
                marginRight: 8,
              }}
            >
              Save
            </button>

            <button
              onClick={() => setShowAdd(false)}
              style={{
                padding: "8px 14px",
                background: "#ccc",
                borderRadius: 6,
                border: "none",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
