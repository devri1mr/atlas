"use client";

import { useEffect, useState } from "react";

type Level = {
  id: string;
  name: string;
  multiplier: number;
  display_order: number;
  is_active: boolean;
};

export default function ComplexityClient() {
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLevels();
  }, []);

  async function fetchLevels() {
    const res = await fetch("/api/complexity-levels");
    const json = await res.json();
    setLevels(json.data || []);
    setLoading(false);
  }

  async function saveLevel(level: Level) {
    await fetch("/api/complexity-levels", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(level),
    });

    fetchLevels();
  }

  if (loading) return <div>Loading complexity levels...</div>;

  return (
    <div style={{ padding: 24 }}>
      <h1>Complexity Levels</h1>
      <p>Global effort scaling used in bid calculations.</p>

      <table style={{ width: "100%", marginTop: 20 }}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Multiplier</th>
            <th>Active</th>
            <th>Save</th>
          </tr>
        </thead>
        <tbody>
          {levels.map((level) => (
            <tr key={level.id}>
              <td>
                <input
                  value={level.name}
                  onChange={(e) =>
                    setLevels((prev) =>
                      prev.map((l) =>
                        l.id === level.id
                          ? { ...l, name: e.target.value }
                          : l
                      )
                    )
                  }
                />
              </td>

              <td>
                <input
                  type="number"
                  step="0.01"
                  value={level.multiplier}
                  onChange={(e) =>
                    setLevels((prev) =>
                      prev.map((l) =>
                        l.id === level.id
                          ? { ...l, multiplier: Number(e.target.value) }
                          : l
                      )
                    )
                  }
                />
              </td>

              <td>
                <input
                  type="checkbox"
                  checked={level.is_active}
                  onChange={(e) =>
                    setLevels((prev) =>
                      prev.map((l) =>
                        l.id === level.id
                          ? { ...l, is_active: e.target.checked }
                          : l
                      )
                    )
                  }
                />
              </td>

              <td>
                <button onClick={() => saveLevel(level)}>
                  Save
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
