"use client";

import { useEffect, useMemo, useState } from "react";

type DivisionRow = {
  id: number;
  name: string;
  labor_rate: number; // stored as plain number (e.g., 30)
  target_gross_profit_percent: number; // stored as plain number (e.g., 50)
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

function formatCurrency(n: number) {
  const value = Number(n) || 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(n: number) {
  const value = Number(n);
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(0)}%`;
}

/**
 * Input helpers:
 * - Currency input is stored as digits + optional decimal, no $ in state
 * - Percent input is stored as digits only, no % in state
 */
function sanitizeCurrencyInput(raw: string) {
  // allow digits and one dot
  const cleaned = raw.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length === 1) return parts[0];
  return `${parts[0]}.${parts.slice(1).join("")}`.replace(/\.(?=.*\.)/g, ".");
}

function sanitizePercentInput(raw: string) {
  return raw.replace(/[^\d]/g, "");
}

export default function DivisionsOpsCenterPage() {
  const [rows, setRows] = useState<DivisionRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [open, setOpen] = useState(false);

  // Add form state (strings so user can type cleanly)
  const [name, setName] = useState("");
  const [laborRateStr, setLaborRateStr] = useState(""); // e.g. "30" or "30.5"
  const [gpStr, setGpStr] = useState(""); // e.g. "50"
  const [active, setActive] = useState(true);

  // Editing state: track a single row being edited (inline)
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editLaborRateStr, setEditLaborRateStr] = useState("");
  const [editGpStr, setEditGpStr] = useState("");
  const [editActive, setEditActive] = useState(true);

  const canSubmit = useMemo(() => {
    if (!name.trim()) return false;
    const lr = Number(laborRateStr);
    const gp = Number(gpStr);
    return Number.isFinite(lr) && lr >= 0 && Number.isFinite(gp) && gp >= 0 && gp <= 100;
  }, [name, laborRateStr, gpStr]);

  const canSaveEdit = useMemo(() => {
    if (editingId == null) return false;
    if (!editName.trim()) return false;
    const lr = Number(editLaborRateStr);
    const gp = Number(editGpStr);
    return Number.isFinite(lr) && lr >= 0 && Number.isFinite(gp) && gp >= 0 && gp <= 100;
  }, [editingId, editName, editLaborRateStr, editGpStr]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/operations-center/divisions", { cache: "no-store" });
      const json = await res.json();
      setRows(json?.rows || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openAdd() {
    setName("");
    setLaborRateStr("");
    setGpStr("");
    setActive(true);
    setOpen(true);
  }

  function startEdit(r: DivisionRow) {
    setEditingId(r.id);
    setEditName(r.name || "");
    setEditLaborRateStr(String(Number(r.labor_rate ?? 0)));
    setEditGpStr(String(Number(r.target_gross_profit_percent ?? 0)));
    setEditActive(!!r.is_active);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditLaborRateStr("");
    setEditGpStr("");
    setEditActive(true);
  }

  async function createDivision() {
    if (!canSubmit) return;

    const payload = {
      name: name.trim(),
      labor_rate: Number(laborRateStr),
      target_gross_profit_percent: Number(gpStr),
      is_active: !!active,
    };

    const res = await fetch("/api/operations-center/divisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!res.ok) {
      alert(json?.error || "Failed to create division");
      return;
    }

    setOpen(false);
    await load();
  }

  async function saveEdit() {
    if (!canSaveEdit || editingId == null) return;

    const payload = {
      id: editingId,
      name: editName.trim(),
      labor_rate: Number(editLaborRateStr),
      target_gross_profit_percent: Number(editGpStr),
      is_active: !!editActive,
    };

    const res = await fetch("/api/operations-center/divisions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!res.ok) {
      alert(json?.error || "Failed to save changes");
      return;
    }

    cancelEdit();
    await load();
  }

  async function deleteDivision(id: number) {
    const ok = confirm("Delete this division? This cannot be undone.");
    if (!ok) return;

    const res = await fetch(`/api/operations-center/divisions/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      alert(json?.error || "Failed to delete division");
      return;
    }
    await load();
  }

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Operations Center • Divisions</h1>
          <p className="text-sm text-gray-500">Edit divisions, blended labor rate, and target GP%.</p>
        </div>

        <button
          onClick={openAdd}
          className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded"
        >
          + Add Division
        </button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="grid grid-cols-12 gap-3 px-4 py-3 bg-gray-50 text-xs font-semibold text-gray-600">
          <div className="col-span-3">Division</div>
          <div className="col-span-3">Labor Rate</div>
          <div className="col-span-2">Target GP%</div>
          <div className="col-span-2">Active</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {rows.length === 0 ? (
          <div className="p-4 text-gray-500">No divisions yet.</div>
        ) : (
          rows.map((r) => {
            const isEditing = editingId === r.id;

            return (
              <div key={r.id} className="grid grid-cols-12 gap-3 px-4 py-3 border-t items-center text-sm">
                {/* Name */}
                <div className="col-span-3">
                  {isEditing ? (
                    <input
                      className="border rounded px-2 py-1 w-full"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  ) : (
                    <span className="font-medium">{r.name}</span>
                  )}
                </div>

                {/* Labor rate */}
                <div className="col-span-3">
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">$</span>
                      <input
                        className="border rounded px-2 py-1 w-full"
                        inputMode="decimal"
                        placeholder="30.00"
                        value={editLaborRateStr}
                        onChange={(e) => setEditLaborRateStr(sanitizeCurrencyInput(e.target.value))}
                      />
                    </div>
                  ) : (
                    <span>{formatCurrency(r.labor_rate)}</span>
                  )}
                </div>

                {/* GP% */}
                <div className="col-span-2">
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input
                        className="border rounded px-2 py-1 w-full"
                        inputMode="numeric"
                        placeholder="50"
                        value={editGpStr}
                        onChange={(e) => setEditGpStr(sanitizePercentInput(e.target.value))}
                      />
                      <span className="text-gray-500">%</span>
                    </div>
                  ) : (
                    <span>{formatPercent(r.target_gross_profit_percent)}</span>
                  )}
                </div>

                {/* Active */}
                <div className="col-span-2">
                  {isEditing ? (
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editActive}
                        onChange={(e) => setEditActive(e.target.checked)}
                      />
                      <span className="text-gray-600">Active</span>
                    </label>
                  ) : (
                    <span className={r.is_active ? "text-emerald-700 font-semibold" : "text-gray-400"}>
                      {r.is_active ? "Yes" : "No"}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="col-span-2 text-right space-x-3">
                  {isEditing ? (
                    <>
                      <button
                        onClick={saveEdit}
                        disabled={!canSaveEdit}
                        className={`px-3 py-1 rounded text-white ${
                          canSaveEdit ? "bg-emerald-700 hover:bg-emerald-800" : "bg-gray-300 cursor-not-allowed"
                        }`}
                      >
                        Save
                      </button>
                      <button onClick={cancelEdit} className="px-3 py-1 rounded border">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(r)}
                        className="text-emerald-700 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteDivision(r.id)}
                        className="text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ADD MODAL */}
      {open && (
        <div className="fixed inset-0 z-[1000] bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-lg shadow-lg border">
            <div className="p-4 border-b">
              <div className="text-lg font-semibold">Add Division</div>
              <div className="text-xs text-gray-500">Stores numbers only. UI shows $ and %.</div>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Division Name</label>
                <input
                  className="border rounded px-3 py-2 w-full"
                  placeholder="Landscaping"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">Labor Rate</label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">$</span>
                  <input
                    className="border rounded px-3 py-2 w-full"
                    inputMode="decimal"
                    placeholder="30.00"
                    value={laborRateStr}
                    onChange={(e) => setLaborRateStr(sanitizeCurrencyInput(e.target.value))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">Target Gross Profit %</label>
                <div className="flex items-center gap-2">
                  <input
                    className="border rounded px-3 py-2 w-full"
                    inputMode="numeric"
                    placeholder="50"
                    value={gpStr}
                    onChange={(e) => setGpStr(sanitizePercentInput(e.target.value))}
                  />
                  <span className="text-gray-500">%</span>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                Active
              </label>
            </div>

            <div className="p-4 border-t flex justify-end gap-2">
              <button className="px-4 py-2 rounded border" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                className={`px-4 py-2 rounded text-white ${
                  canSubmit ? "bg-emerald-700 hover:bg-emerald-800" : "bg-gray-300 cursor-not-allowed"
                }`}
                onClick={createDivision}
                disabled={!canSubmit}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
