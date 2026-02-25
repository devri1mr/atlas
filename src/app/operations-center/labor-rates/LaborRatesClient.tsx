"use client";

import React, { useEffect, useMemo, useState } from "react";

type Division = { id: number; name: string };
type Role = { id: number; name: string };

type LaborRateRow = {
  id: number;
  division_id: number;
  division_name: string;
  job_role_id: number;
  role_name: string;
  hourly_rate: number | null;
};

type ApiGetResponse = {
  rows: LaborRateRow[];
  divisions: Division[];
  roles: Role[];
};

function toNumberOrNull(v: string): number | null {
  const cleaned = v.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function formatCurrency(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function currencyInputValue(n: number | null) {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  // keep as plain number string so editing is easy
  return String(n);
}

export default function LaborRatesClient() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<LaborRateRow[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);

  const [query, setQuery] = useState("");

  // Per-row edits
  const [draftRates, setDraftRates] = useState<Record<number, string>>({});
  const [savingRowId, setSavingRowId] = useState<number | null>(null);
  const [savedRowId, setSavedRowId] = useState<number | null>(null);

  // Add modal
  const [addOpen, setAddOpen] = useState(false);
  const [addDivisionId, setAddDivisionId] = useState<string>("");
  const [addRoleId, setAddRoleId] = useState<string>("");
  const [addHourlyRate, setAddHourlyRate] = useState<string>("");
  const [adding, setAdding] = useState(false);

  // Delete
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/labor-rates", { cache: "no-store" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Failed to load (${res.status})`);
      }
      const data = (await res.json()) as ApiGetResponse;

      setRows(data.rows ?? []);
      setDivisions(data.divisions ?? []);
      setRoles(data.roles ?? []);

      // initialize drafts only for rows we don't have yet
      setDraftRates((prev) => {
        const next = { ...prev };
        for (const r of data.rows ?? []) {
          if (next[r.id] === undefined) {
            next[r.id] = currencyInputValue(r.hourly_rate ?? null);
          }
        }
        return next;
      });
    } catch (e: any) {
      setError(e?.message || "Failed to load labor rates.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = `${r.division_name} ${r.role_name} ${r.hourly_rate ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query]);

  function markSaved(rowId: number) {
    setSavedRowId(rowId);
    window.setTimeout(() => {
      setSavedRowId((cur) => (cur === rowId ? null : cur));
    }, 1200);
  }

  async function saveRow(rowId: number) {
    setError(null);
    setSavingRowId(rowId);
    try {
      const raw = draftRates[rowId] ?? "";
      const hourly_rate = toNumberOrNull(raw);
      if (hourly_rate === null) {
        throw new Error("Please enter a valid hourly rate.");
      }

      const res = await fetch("/api/labor-rates/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rowId, hourly_rate }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Save failed (${res.status})`);
      }

      // Optimistically update local rows
      setRows((prev) =>
        prev.map((r) => (r.id === rowId ? { ...r, hourly_rate } : r))
      );
      markSaved(rowId);
    } catch (e: any) {
      setError(e?.message || "Save failed.");
    } finally {
      setSavingRowId(null);
    }
  }

  async function deleteRow(rowId: number) {
    setError(null);
    setDeletingId(rowId);
    try {
      const res = await fetch("/api/labor-rates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rowId }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Delete failed (${res.status})`);
      }

      setRows((prev) => prev.filter((r) => r.id !== rowId));
      setDraftRates((prev) => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
    } catch (e: any) {
      setError(e?.message || "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  }

  function resetAddForm() {
    setAddDivisionId("");
    setAddRoleId("");
    setAddHourlyRate("");
  }

  async function addNewRate() {
    setError(null);
    setAdding(true);
    try {
      const division_id = Number(addDivisionId);
      const job_role_id = Number(addRoleId);
      const hourly_rate = toNumberOrNull(addHourlyRate);

      if (!division_id || !job_role_id) {
        throw new Error("Please select a division and a role.");
      }
      if (hourly_rate === null) {
        throw new Error("Please enter a valid hourly rate.");
      }

      const res = await fetch("/api/labor-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ division_id, job_role_id, hourly_rate }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Add failed (${res.status})`);
      }

      // Expect API to return the inserted row (recommended).
      // If it doesn't, we refresh to be safe.
      const maybe = await res.json().catch(() => null);

      if (maybe && typeof maybe === "object" && "row" in maybe) {
        const newRow = (maybe as any).row as LaborRateRow;
        setRows((prev) => [newRow, ...prev]);
        setDraftRates((prev) => ({ ...prev, [newRow.id]: currencyInputValue(newRow.hourly_rate) }));
      } else {
        setRefreshing(true);
        await load();
      }

      setAddOpen(false);
      resetAddForm();
    } catch (e: any) {
      setError(e?.message || "Add failed.");
    } finally {
      setAdding(false);
    }
  }

  const canAdd =
    addDivisionId !== "" && addRoleId !== "" && toNumberOrNull(addHourlyRate) !== null;

  return (
    <div className="px-6 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-slate-600">Operations Center</div>
          <h1 className="text-2xl font-semibold text-slate-900">Labor Rates</h1>
          <div className="mt-1 text-sm text-slate-600">
            Edit hourly rates like a spreadsheet. Save per row.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setRefreshing(true);
              load();
            }}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
          >
            Refresh
          </button>

          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            + Add new rate
          </button>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="relative w-full max-w-md">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search division, role, or rate…"
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>

        <div className="text-sm text-slate-600">
          {refreshing ? "Refreshing…" : `${filteredRows.length} row${filteredRows.length === 1 ? "" : "s"}`}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full border-collapse">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-4 py-3">Division</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Hourly Rate</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-600">
                    Loading…
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-600">
                    No labor rates found.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => {
                  const draft = draftRates[r.id] ?? currencyInputValue(r.hourly_rate ?? null);
                  const saved = savedRowId === r.id;

                  return (
                    <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/40">
                      <td className="px-4 py-3 text-sm text-slate-900">{r.division_name}</td>
                      <td className="px-4 py-3 text-sm text-slate-900">{r.role_name}</td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-500">$</span>
                          <input
                            inputMode="decimal"
                            value={draft}
                            onChange={(e) =>
                              setDraftRates((prev) => ({ ...prev, [r.id]: e.target.value }))
                            }
                            className="w-40 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                            placeholder="0.00"
                          />
                          <span className="text-xs text-slate-500">
                            {formatCurrency(toNumberOrNull(draft))}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => saveRow(r.id)}
                            disabled={savingRowId === r.id}
                            className={[
                              "rounded-md px-3 py-1.5 text-sm font-semibold shadow-sm",
                              saved
                                ? "bg-emerald-600 text-white"
                                : "bg-slate-900 text-white hover:bg-slate-800",
                              savingRowId === r.id ? "opacity-60 cursor-not-allowed" : "",
                            ].join(" ")}
                          >
                            {savingRowId === r.id ? "Saving…" : saved ? "Saved" : "Save"}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (confirm("Delete this labor rate?")) deleteRow(r.id);
                            }}
                            disabled={deletingId === r.id}
                            className={[
                              "rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50",
                              deletingId === r.id ? "opacity-60 cursor-not-allowed" : "",
                            ].join(" ")}
                          >
                            {deletingId === r.id ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          Tip: edit a rate, then click <span className="font-semibold text-slate-700">Save</span> on that row.
        </div>
      </div>

      {/* Add modal (no Radix needed; avoids dependency issues + fixes dropdown clipping) */}
      {addOpen && (
        <div className="fixed inset-0 z-[100]">
          {/* overlay */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              if (!adding) {
                setAddOpen(false);
                resetAddForm();
              }
            }}
          />
          {/* panel */}
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="relative z-[110] w-full max-w-lg overflow-visible rounded-xl border border-slate-200 bg-white shadow-xl">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <div className="text-base font-semibold text-slate-900">Add labor rate</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Choose a division + role, then set an hourly rate.
                  </div>
                </div>

                <button
                  type="button"
                  className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  onClick={() => {
                    if (!adding) {
                      setAddOpen(false);
                      resetAddForm();
                    }
                  }}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <div className="px-5 py-4 overflow-visible">
                {/* NOTE: overflow-visible + high z-index fixes select dropdown clipping */}
                <div className="grid gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-800">Division</label>
                    <select
                      className="relative z-[120] mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      value={addDivisionId}
                      onChange={(e) => setAddDivisionId(e.target.value)}
                    >
                      <option value="">Select…</option>
                      {divisions.map((d) => (
                        <option key={d.id} value={String(d.id)}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-800">Role</label>
                    <select
                      className="relative z-[120] mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      value={addRoleId}
                      onChange={(e) => setAddRoleId(e.target.value)}
                    >
                      <option value="">Select…</option>
                      {roles.map((r) => (
                        <option key={r.id} value={String(r.id)}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-800">Hourly rate</label>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-sm text-slate-500">$</span>
                      <input
                        inputMode="decimal"
                        value={addHourlyRate}
                        onChange={(e) => setAddHourlyRate(e.target.value)}
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                        placeholder="0.00"
                      />
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Preview: {formatCurrency(toNumberOrNull(addHourlyRate))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
                <button
                  type="button"
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  onClick={() => {
                    if (!adding) {
                      setAddOpen(false);
                      resetAddForm();
                    }
                  }}
                  disabled={adding}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={[
                    "rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700",
                    !canAdd || adding ? "opacity-60 cursor-not-allowed" : "",
                  ].join(" ")}
                  onClick={addNewRate}
                  disabled={!canAdd || adding}
                >
                  {adding ? "Adding…" : "Add"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}