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
  const [loading, setLoading] = useState(false);

  const loadMaterials = async () => {
    setLoading(true);

    const res = await fetch(`/api/materials?search=${encodeURIComponent(search)}`);
    const data = await res.json();

    setMaterials(data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadMaterials();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      loadMaterials();
    }, 250);

    return () => clearTimeout(t);
  }, [search]);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 26, fontWeight: 600, marginBottom: 20 }}>
        Materials Catalog
      </h1>

      <div style={{ marginBottom: 16 }}>
        <input
          placeholder="Search materials..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: 320,
            padding: 8,
            border: "1px solid #ccc",
            borderRadius: 6
          }}
        />
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
              <td style={{ padding: 8 }}>
                {m.display_name || m.name}
              </td>

              <td style={{ padding: 8 }}>
                {m.unit || "-"}
              </td>

              <td style={{ padding: 8 }}>
                {m.unit_cost ? `$${m.unit_cost.toFixed(2)}` : "-"}
              </td>

              <td style={{ padding: 8 }}>
                {m.is_active ? "Yes" : "No"}
              </td>
            </tr>
          ))}

          {materials.length === 0 && !loading && (
            <tr>
              <td colSpan={4} style={{ padding: 16 }}>
                No materials found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
