"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Division = { id: number; name: string };
type Role = { id: number; name: string };
type RateRow = {
  id: number;
  division_id: number;
  job_role_id: number;
  hourly_rate: number;
};

type RowView = {
  id: number;
  division: string;
  role: string;
  hourly_rate: number;
};

export default function LaborRatesPage() {
  const supabase = useMemo(() => {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  const [rows, setRows] = useState<RowView[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [message, setMessage] = useState<string>("");

  async function load() {
    setLoading(true);
    setMessage("");

    const [{ data: divisions }, { data: roles }, { data: rates }] =
      await Promise.all([
        supabase.from("divisions").select("id,name").order("id"),
        supabase.from("job_roles").select("id,name").order("id"),
        supabase
          .from("division_labor_rates")
          .select("id,division_id,job_role_id,hourly_rate")
          .order("division_id"),
      ]);

    const divMap = new Map<number, string>(
      (divisions as Division[]).map((d) => [d.id, d.name])
    );
    const roleMap = new Map<number, string>(
      (roles as Role[]).map((r) => [r.id, r.name])
    );

    const view: RowView[] = (rates as RateRow[]).map((r) => ({
      id: r.id,
      division: divMap.get(r.division_id) ?? `Division ${r.division_id}`,
      role: roleMap.get(r.job_role_id) ?? `Role ${r.job_role_id}`,
      hourly_rate: Number(r.hourly_rate),
    }));

    setRows(view);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function saveRow(id: number, hourly_rate: number) {
    setSavingId(id);
    setMessage("");

    const res = await fetch("/api/labor-rates/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, hourly_rate }),
    });

    const json = await res.json();

    if (!res.ok) {
      setMessage(`Save error: ${json?.error ?? "Unknown error"}`);
      setSavingId(null);
      return;
    }

    setMessage("Saved!");
    setSavingId(null);
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Operations Center</h1>
      <h2>Labor Rates</h2>

      <div style={{ marginBottom: 12 }}>
        <button onClick={load} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </button>
        {message && <span style={{ marginLeft: 12 }}>{message}</span>}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ padding: 8, borderBottom: "1px solid #ccc" }}>
              Division
            </th>
            <th style={{ padding: 8, borderBottom: "1px solid #ccc" }}>
              Role
            </th>
            <th style={{ padding: 8, borderBottom: "1px solid #ccc" }}>
              Hourly Rate
            </th>
            <th style={{ padding: 8, borderBottom: "1px solid #ccc" }}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={{ padding: 8 }}>{r.division}</td>
              <td style={{ padding: 8 }}>{r.role}</td>
              <td style={{ padding: 8 }}>
                <input
                  type="number"
                  value={r.hourly_rate}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((x) =>
                        x.id === r.id
                          ? { ...x, hourly_rate: Number(e.target.value) }
                          : x
                      )
                    )
                  }
                  style={{ width: 100 }}
                />
              </td>
              <td style={{ padding: 8 }}>
                <button
                  onClick={() => saveRow(r.id, r.hourly_rate)}
                  disabled={savingId === r.id}
                >
                  {savingId === r.id ? "Saving..." : "Save"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}