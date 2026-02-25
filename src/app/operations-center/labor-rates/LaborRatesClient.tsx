"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  id: number;
  division: string;
  role: string;
  hourly_rate: number;
  division_id: number;
  role_id: number;
};

export default function LaborRatesClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // simple “add new” fields (IDs because that’s what your table stores)
  const [divisionId, setDivisionId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [rate, setRate] = useState("");

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/labor-rates", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load");
      setRows(json.rows ?? []);
    } catch (e: any) {
      setErr(e.message ?? "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function addRow() {
    setErr(null);
    const division_id = Number(divisionId);
    const role_id = Number(roleId);
    const hourly_rate = Number(rate);

    if (!division_id || !role_id || !hourly_rate) {
      setErr("Enter division_id, role_id, and hourly_rate.");
      return;
    }

    const res = await fetch("/api/labor-rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ division_id, role_id, hourly_rate }),
    });
    const json = await res.json();
    if (!res.ok) {
      setErr(json?.error ?? "Failed to add");
      return;
    }

    setDivisionId("");
    setRoleId("");
    setRate("");
    await refresh();
  }

  async function updateRate(id: number, hourly_rate: number) {
    const res = await fetch("/api/labor-rates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, hourly_rate }),
    });
    const json = await res.json();
    if (!res.ok) {
      setErr(json?.error ?? "Failed to update");
      return;
    }
    await refresh();
  }

  async function deleteRow(id: number) {
    const res = await fetch("/api/labor-rates", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    if (!res.ok) {
      setErr(json?.error ?? "Failed to delete");
      return;
    }
    await refresh();
  }

  const content = useMemo(() => {
    if (loading) return <p>Loading…</p>;
    if (err) return <p style={{ color: "crimson" }}>{err}</p>;

    return (
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Division</th>
            <th align="left">Role</th>
            <th align="left">Hourly Rate</th>
            <th align="left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.division}</td>
              <td>{r.role}</td>
              <td>
                <input
                  type="number"
                  defaultValue={r.hourly_rate}
                  onBlur={(e) => updateRate(r.id, Number(e.target.value))}
                  style={{ width: 120 }}
                />
              </td>
              <td>
                <button onClick={() => deleteRow(r.id)}>Delete</button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4}>No labor rates found.</td>
            </tr>
          )}
        </tbody>
      </table>
    );
  }, [rows, loading, err]);

  return (
    <main style={{ padding: 24 }}>
      <h1>Operations Center</h1>
      <h2>Labor Rates</h2>

      <details style={{ marginBottom: 12 }}>
        <summary>Add new rate</summary>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
          <input
            placeholder="division_id"
            value={divisionId}
            onChange={(e) => setDivisionId(e.target.value)}
            style={{ width: 140 }}
          />
          <input
            placeholder="role_id"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            style={{ width: 140 }}
          />
          <input
            placeholder="hourly_rate"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            style={{ width: 140 }}
          />
          <button onClick={addRow}>Add</button>
        </div>
        <p style={{ opacity: 0.7, marginTop: 8 }}>
          (Using IDs because that’s what your table stores. Next step is replacing these with dropdowns.)
        </p>
      </details>

      {content}
    </main>
  );
}