"use client";

import React, { useEffect, useMemo, useState } from "react";

type Division = {
  id: string;
  name: string;
  labor_rate: number;
  target_gross_profit_percent: number;
  allow_overtime: boolean;
  active: boolean;
  created_at?: string;
  performance_sheet_url?: string | null;
  department_id?: string | null;
};

type Department = { id: string; name: string; code: string | null; active: boolean };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 });

function asPercentFromWholeNumber(n: number) {
  // DB stores "50" meaning 50%, display as 50%
  return percent.format((n ?? 0) / 100);
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = payload?.error || payload?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return payload as T;
}

export default function DivisionsClient() {
  const [rows, setRows] = useState<Division[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [laborRate, setLaborRate] = useState<string>("30");
  const [targetGp, setTargetGp] = useState<string>("50");
  const [allowOt, setAllowOt] = useState(true);
  const [active, setActive] = useState(true);
  const [deptId, setDeptId] = useState<string>("");

  // Edit modal
  const [showEdit, setShowEdit] = useState(false);
  const [editId, setEditId] = useState<string>("");
  const [editName, setEditName] = useState("");
  const [editLaborRate, setEditLaborRate] = useState<string>("0");
  const [editTargetGp, setEditTargetGp] = useState<string>("0");
  const [editAllowOt, setEditAllowOt] = useState(true);
  const [editActive, setEditActive] = useState(true);
  const [editSheetUrl, setEditSheetUrl] = useState<string>("");
  const [editDeptId, setEditDeptId] = useState<string>("");

  const activeCount = useMemo(() => rows.filter((r) => r.active).length, [rows]);

  async function load() {
    setError(null);
    setLoading(true);
    try {
      const [divOut, deptRes] = await Promise.all([
        api<{ data: Division[] }>("/api/operations-center/divisions", { method: "GET" }),
        fetch("/api/atlas-time/departments", { cache: "no-store" }),
      ]);
      setRows(divOut.data ?? []);
      const deptJson = await deptRes.json().catch(() => null);
      setDepartments((deptJson?.departments ?? []).filter((d: Department) => d.active));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load divisions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function resetCreateForm() {
    setName("");
    setLaborRate("30");
    setTargetGp("50");
    setAllowOt(true);
    setActive(true);
    setDeptId("");
  }

  function openEdit(row: Division) {
    setError(null);
    setEditId(row.id);
    setEditName(row.name ?? "");
    setEditLaborRate(String(row.labor_rate ?? 0));
    setEditTargetGp(String(row.target_gross_profit_percent ?? 0));
    setEditAllowOt(Boolean(row.allow_overtime));
    setEditActive(Boolean(row.active));
    setEditSheetUrl(row.performance_sheet_url ?? "");
    setEditDeptId(row.department_id ?? "");
    setShowEdit(true);
  }

  async function createDivision() {
    setError(null);

    const n = name.trim();
    const lr = Number(laborRate);
    const gp = Number(targetGp);

    if (!n) return setError("Division name is required.");
    if (!Number.isFinite(lr)) return setError("Labor rate must be a number.");
    if (!Number.isFinite(gp)) return setError("Target GP% must be a number.");

    try {
      setBusyId("create");
      const out = await api<{ data: Division }>("/api/operations-center/divisions", {
        method: "POST",
        body: JSON.stringify({
          name: n,
          labor_rate: lr,
          target_gross_profit_percent: gp,
          allow_overtime: allowOt,
          active,
          department_id: deptId || null,
        }),
      });

      const next = [...rows, out.data].sort((a, b) => a.name.localeCompare(b.name));
      setRows(next);

      setShowCreate(false);
      resetCreateForm();
    } catch (e: any) {
      setError(e?.message ?? "Failed to create division");
    } finally {
      setBusyId(null);
    }
  }

  async function saveEdit() {
    setError(null);

    const n = editName.trim();
    const lr = Number(editLaborRate);
    const gp = Number(editTargetGp);

    if (!editId) return setError("Missing division id.");
    if (!n) return setError("Division name is required.");
    if (!Number.isFinite(lr)) return setError("Labor rate must be a number.");
    if (!Number.isFinite(gp)) return setError("Target GP% must be a number.");

    try {
      setBusyId(editId);
      const out = await api<{ data: Division }>("/api/operations-center/divisions", {
        method: "PATCH",
        body: JSON.stringify({
          id: editId,
          name: n,
          labor_rate: lr,
          target_gross_profit_percent: gp,
          allow_overtime: editAllowOt,
          active: editActive,
          performance_sheet_url: editSheetUrl.trim() || null,
          department_id: editDeptId || null,
        }),
      });

      setRows((prev) => prev.map((r) => (r.id === editId ? out.data : r)).sort((a, b) => a.name.localeCompare(b.name)));
      setShowEdit(false);
    } catch (e: any) {
      setError(e?.message ?? "Failed to update division");
    } finally {
      setBusyId(null);
    }
  }

  async function setDivisionActive(row: Division, nextActive: boolean) {
    setError(null);
    try {
      setBusyId(row.id);
      const out = await api<{ data: Division }>("/api/operations-center/divisions", {
        method: "PATCH",
        body: JSON.stringify({ id: row.id, active: nextActive }),
      });
      setRows((prev) => prev.map((r) => (r.id === row.id ? out.data : r)));
    } catch (e: any) {
      setError(e?.message ?? "Failed to update active flag");
    } finally {
      setBusyId(null);
    }
  }

  async function setDivisionOt(row: Division, nextOt: boolean) {
    setError(null);
    try {
      setBusyId(row.id);
      const out = await api<{ data: Division }>("/api/operations-center/divisions", {
        method: "PATCH",
        body: JSON.stringify({ id: row.id, allow_overtime: nextOt }),
      });
      setRows((prev) => prev.map((r) => (r.id === row.id ? out.data : r)));
    } catch (e: any) {
      setError(e?.message ?? "Failed to update OT flag");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteDivision(row: Division) {
    const ok = window.confirm(`Delete "${row.name}" permanently? (This cannot be undone.)`);
    if (!ok) return;

    setError(null);
    try {
      setBusyId(row.id);
      await api<{ ok: boolean }>(`/api/operations-center/divisions?id=${encodeURIComponent(row.id)}`, {
        method: "DELETE",
      });
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete division");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="mx-auto max-w-5xl px-4 md:px-6 py-6 md:py-8">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-emerald-950">Divisions</h1>
            <p className="mt-1 text-sm text-emerald-900/70">
              Manage division labor rate + target gross profit. <span className="font-medium">UI shows $ and %</span>, DB stores numbers.
            </p>
            <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-900">
              Active divisions: {activeCount} / {rows.length}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-900 shadow-sm hover:bg-emerald-50"
            >
              Refresh
            </button>
            <button
              onClick={() => {
                setError(null);
                resetCreateForm();
                setShowCreate(true);
              }}
              className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"
            >
              Add Division
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="mt-6 overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-sm">
          <div className="border-b border-emerald-100 bg-emerald-50/60 px-4 py-3">
            <div className="text-sm font-semibold text-emerald-950">Division Settings</div>
            <div className="text-xs text-emerald-900/70">Edit rates, set Active, and control OT allowance.</div>
          </div>

          {loading ? (
            <div className="px-4 py-10 text-center text-sm text-emerald-900/70">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-emerald-900/70">No divisions yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-emerald-900/70">
                    <th className="px-4 py-3 font-semibold">Division</th>
                    <th className="px-4 py-3 font-semibold">Department</th>
                    <th className="px-4 py-3 font-semibold">Labor Rate</th>
                    <th className="px-4 py-3 font-semibold">Target GP%</th>
                    <th className="px-4 py-3 font-semibold">Allow OT</th>
                    <th className="px-4 py-3 font-semibold">Active</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const busy = busyId === r.id || busyId === "create";
                    return (
                      <tr key={r.id} className="border-t border-emerald-100 hover:bg-emerald-50/40">
                        <td className="px-4 py-3">
                          <div className="font-medium text-emerald-950">{r.name}</div>
                        </td>

                        <td className="px-4 py-3 text-emerald-950 text-sm">
                          {r.department_id
                            ? (departments.find(d => d.id === r.department_id)?.name ?? <span className="text-emerald-900/40 italic">Unknown</span>)
                            : <span className="text-emerald-900/40">—</span>}
                        </td>

                        <td className="px-4 py-3 text-emerald-950">{money.format(Number(r.labor_rate ?? 0))}</td>

                        <td className="px-4 py-3 text-emerald-950">
                          {asPercentFromWholeNumber(Number(r.target_gross_profit_percent ?? 0))}
                        </td>

                        <td className="px-4 py-3">
                          <label className="inline-flex items-center gap-2 text-sm font-medium text-emerald-950">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-emerald-700"
                              checked={Boolean(r.allow_overtime)}
                              disabled={busy}
                              onChange={(e) => setDivisionOt(r, e.target.checked)}
                            />
                            Allow OT
                          </label>
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={[
                              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                              r.active ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900",
                            ].join(" ")}
                          >
                            {r.active ? "Yes" : "No"}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              disabled={busy}
                              onClick={() => openEdit(r)}
                              className="rounded-md border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-50 disabled:opacity-50"
                            >
                              Edit
                            </button>

                            <button
                              disabled={busy}
                              onClick={() => setDivisionActive(r, !r.active)}
                              className="rounded-md border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-50 disabled:opacity-50"
                            >
                              {r.active ? "Deactivate" : "Activate"}
                            </button>

                            <button
                              disabled={busy}
                              onClick={() => deleteDivision(r)}
                              className="rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-xl">
              <div className="border-b border-emerald-100 bg-emerald-50/70 px-5 py-4">
                <div className="text-lg font-semibold text-emerald-950">Add Division</div>
                <div className="mt-1 text-xs text-emerald-900/70">Stores numbers only. UI shows $ and %.</div>
              </div>

              <div className="space-y-4 px-5 py-5">
                <div>
                  <label className="block text-xs font-semibold text-emerald-900/80">Division Name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                    placeholder="e.g., Landscaping"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-emerald-900/80">Department</label>
                  <select
                    value={deptId}
                    onChange={(e) => setDeptId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 bg-white"
                  >
                    <option value="">— None —</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-emerald-900/40">Determines payroll items for QB export.</p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-emerald-900/80">Labor Rate ($)</label>
                    <input
                      value={laborRate}
                      onChange={(e) => setLaborRate(e.target.value)}
                      inputMode="decimal"
                      className="mt-1 w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                      placeholder="30"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-emerald-900/80">Target Gross Profit (%)</label>
                    <input
                      value={targetGp}
                      onChange={(e) => setTargetGp(e.target.value)}
                      inputMode="numeric"
                      className="mt-1 w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                      placeholder="50"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-emerald-950">
                    <input
                      type="checkbox"
                      checked={allowOt}
                      onChange={(e) => setAllowOt(e.target.checked)}
                      className="h-4 w-4 accent-emerald-700"
                    />
                    Allow OT (1.5x)
                  </label>

                  <label className="flex items-center gap-2 text-sm font-medium text-emerald-950">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => setActive(e.target.checked)}
                      className="h-4 w-4 accent-emerald-700"
                    />
                    Active
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-emerald-100 bg-white px-5 py-4">
                <button
                  onClick={() => {
                    setShowCreate(false);
                    setError(null);
                  }}
                  className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50"
                >
                  Cancel
                </button>
                <button
                  disabled={busyId === "create"}
                  onClick={createDivision}
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                >
                  {busyId === "create" ? "Creating…" : "Create"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {showEdit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-xl">
              <div className="border-b border-emerald-100 bg-emerald-50/70 px-5 py-4">
                <div className="text-lg font-semibold text-emerald-950">Edit Division</div>
                <div className="mt-1 text-xs text-emerald-900/70">Edits affect future bids. Existing projects should use stored snapshots.</div>
              </div>

              <div className="space-y-4 px-5 py-5">
                <div>
                  <label className="block text-xs font-semibold text-emerald-900/80">Division Name</label>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-emerald-900/80">Department</label>
                  <select
                    value={editDeptId}
                    onChange={(e) => setEditDeptId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 bg-white"
                  >
                    <option value="">— None —</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-emerald-900/40">Determines payroll items for QB export.</p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-emerald-900/80">Labor Rate ($)</label>
                    <input
                      value={editLaborRate}
                      onChange={(e) => setEditLaborRate(e.target.value)}
                      inputMode="decimal"
                      className="mt-1 w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-emerald-900/80">Target Gross Profit (%)</label>
                    <input
                      value={editTargetGp}
                      onChange={(e) => setEditTargetGp(e.target.value)}
                      inputMode="numeric"
                      className="mt-1 w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-emerald-950">
                    <input
                      type="checkbox"
                      checked={editAllowOt}
                      onChange={(e) => setEditAllowOt(e.target.checked)}
                      className="h-4 w-4 accent-emerald-700"
                    />
                    Allow OT (1.5x)
                  </label>

                  <label className="flex items-center gap-2 text-sm font-medium text-emerald-950">
                    <input
                      type="checkbox"
                      checked={editActive}
                      onChange={(e) => setEditActive(e.target.checked)}
                      className="h-4 w-4 accent-emerald-700"
                    />
                    Active
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-emerald-900/80">
                    AtlasPerformance Sheet URL
                    <span className="ml-1 font-normal text-emerald-900/50">(Google Sheets export URL for COGS sheet)</span>
                  </label>
                  <input
                    value={editSheetUrl}
                    onChange={(e) => setEditSheetUrl(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-emerald-200 px-3 py-2 text-xs font-mono outline-none focus:border-emerald-400"
                    placeholder="https://docs.google.com/spreadsheets/d/.../export?format=csv&gid=..."
                  />
                  <p className="mt-1 text-xs text-emerald-900/40">Leave blank to hide this division in AtlasPerformance.</p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-emerald-100 bg-white px-5 py-4">
                <button
                  onClick={() => {
                    setShowEdit(false);
                    setError(null);
                  }}
                  className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50"
                >
                  Cancel
                </button>
                <button
                  disabled={busyId === editId}
                  onClick={saveEdit}
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                >
                  {busyId === editId ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
