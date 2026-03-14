"use client";

import { useEffect, useState } from "react";

type Material = {
  id: string;
  display_name: string | null;
  name: string;
  unit: string | null;
  unit_cost: number | null;
  is_active: boolean | null;
};

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [search, setSearch] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newCost, setNewCost] = useState("");

  const loadMaterials = async () => {
    const res = await fetch(
      `/api/materials?search=${encodeURIComponent(search)}`,
      { cache: "no-store" }
    );
    const data = await res.json();
    setMaterials(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    loadMaterials();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      loadMaterials();
    }, 200);

    return () => clearTimeout(t);
  }, [search]);

  async function addMaterial() {
    if (!newName.trim()) return;

    const res = await fetch("/api/materials", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: newName.trim(),
        display_name: newName.trim(),
        unit: newUnit.trim() || null,
        unit_cost: newCost === "" ? null : Number(newCost),
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
    setNewUnit("");
    setNewCost("");

    await loadMaterials();
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 26, fontWeight: 600, marginBottom: 20 }}>
        Materials Catalog
      </h1>

      <div style={{ marginBottom: 16, display: "flex", gap: 10, alignItems: "center" }}>
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
            <th style={{ padding: 8 }}>Unit</th>
            <th style={{ padding: 8 }}>Cost</th>
            <th style={{ padding: 8 }}>Active</th>
          </tr>
        </thead>

        <tbody>
          {materials.map((m) => (
            <tr key={m.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: 8 }}>{m.display_name || m.name}</td>
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
              <td colSpan={4} style={{ padding: 16 }}>
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
          }}
        >
          <div
            style={{
              background: "white",
              padding: 24,
              width: 320,
              borderRadius: 8,
            }}
          >
            <h3 style={{ marginBottom: 12 }}>Add Material</h3>

            <input
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{ width: "100%", marginBottom: 10, padding: 6 }}
            />

            <input
              placeholder="Unit (ea, yd, ton)"
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              style={{ width: "100%", marginBottom: 10, padding: 6 }}
            />

            <input
              placeholder="Cost"
              value={newCost}
              onChange={(e) => setNewCost(e.target.value)}
              style={{ width: "100%", marginBottom: 14, padding: 6 }}
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
