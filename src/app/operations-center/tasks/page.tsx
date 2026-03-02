"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Division = {
  id: string; // divisions.id is UUID in your DB
  name: string;
  default_gp_percent?: number | null;
};

type Task = {
  id: string;
  division_id: string;
  name: string;
  unit: string | null; // e.g. "yd", "sqft", "ea", "hr"
  minutes_per_unit: number | null; // minutes per unit
  default_qty: number | null; // optional
  notes: string | null;

  // nice-to-haves (kept even if null)
  min_qty: number | null;
  round_qty_to: number | null;
  seasonal_multiplier: number | null;
  difficulty_multiplier: number | null;

  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function numOrNull(v: string) {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function TasksPage() {
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [divisionId, setDivisionId] = useState<string>("");

  const [rows, setRows] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [minutesPerUnit, setMinutesPerUnit] = useState("");
  const [defaultQty, setDefaultQty] = useState("");
  const [notes, setNotes] = useState("");

  // nice-to-haves
  const [minQty, setMinQty] = useState("");
  const [roundQtyTo, setRoundQtyTo] = useState("");
  const [seasonalMultiplier, setSeasonalMultiplier] = useState("");
  const [difficultyMultiplier, setDifficultyMultiplier] = useState("");

  const selectedDivision = useMemo(
    () => divisions.find((d) => d.id === divisionId) ?? null,
    [divisions, divisionId]
  );

  async function loadDivisions() {
    const res = await fetch("/api/divisions", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error ?? "Failed to load divisions");
    setDivisions(json?.data ?? []);
    // Default to first division if not set
    const first = (json?.data ?? [])[0];
    if (first && !divisionId) setDivisionId(first.id);
  }

  async function loadTasks(divId: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks?division_id=${encodeURIComponent(divId)}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Failed to load tasks");
      setRows(json?.data ?? []);
    } catch (e: any) {
      setRows([]);
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        await loadDivisions();
      } catch (e: any) {
        setError(e?.message ?? "Failed to load divisions");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!divisionId) return;
    loadTasks(divisionId);
  }, [divisionId]);

  async function createTask() {
    setError(null);

    if (!divisionId) {
      setError("Select a division first.");
      return;
    }
    if (!name.trim()) {
      setError("Task name is required.");
      return;
    }

    const payload = {
      division_id: divisionId,
      name: name.trim(),
      unit: unit.trim() || null,
      minutes_per_unit: numOrNull(minutesPerUnit),
      default_qty: numOrNull(defaultQty),
      notes: notes.trim() || null,

      // nice-to-haves
      min_qty: numOrNull(minQty),
      round_qty_to: numOrNull(roundQtyTo),
      seasonal_multiplier: numOrNull(seasonalMultiplier),
      difficulty_multiplier: numOrNull(difficultyMultiplier),
    };

    setSaving(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Failed to create task");

      // reset basic fields (leave nice-to-haves as-is for speed if you're bulk-entering)
      setName("");
      setUnit("");
      setMinutesPerUnit("");
      setDefaultQty("");
      setNotes("");

      await loadTasks(divisionId);
    } catch (e: any) {
      setError(e?.message ?? "Failed to create task");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(taskId: string, nextActive: boolean) {
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: nextActive }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Failed to update task");
      setRows((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, is_active: nextActive } : t))
      );
    } catch (e: any) {
      setError(e?.message ?? "Failed to update task");
    }
  }

  return (
    <div className="min-h-screen bg-[#f6f8f6] px-6 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#123b1f]">Tasks Catalog</h1>
            <p className="mt-1 text-sm text-[#3d5a45]">
              Operations Center → Tasks. Create and manage reusable labor tasks by division.
            </p>
            <div className="mt-2 text-sm">
              <Link className="text-[#1e7a3a] hover:underline" href="/operations-center">
                ← Back to Operations Center
              </Link>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Controls */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-[#d7e6db] bg-white p-4 shadow-sm md:col-span-1">
            <div className="text-sm font-semibold text-[#123b1f]">Division</div>
            <select
              value={divisionId}
              onChange={(e) => setDivisionId(e.target.value)}
              className="mt-2 w-full rounded-md border border-[#9cc4a6] bg-white px-3 py-2 text-sm text-[#123b1f] focus:outline-none"
            >
              <option value="">Select division…</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>

            {selectedDivision && (
              <div className="mt-3 text-xs text-[#3d5a45]">
                Selected: <span className="font-semibold">{selectedDivision.name}</span>
              </div>
            )}
          </div>

          {/* Create form */}
          <div className="rounded-xl border border-[#d7e6db] bg-white p-4 shadow-sm md:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-[#123b1f]">Add Task</div>
              <button
                onClick={createTask}
                disabled={saving}
                className="rounded-md bg-[#1e7a3a] px-3 py-2 text-sm font-medium text-white hover:bg-[#16602d] disabled:opacity-60"
              >
                {saving ? "Saving…" : "Create Task"}
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-[#123b1f]">Task Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder='e.g. "Install brown mulch by hand"'
                  className="mt-1 w-full rounded-md border border-[#9cc4a6] px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#123b1f]">Unit (optional)</label>
                <input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder='yd / sqft / ea / hr'
                  className="mt-1 w-full rounded-md border border-[#9cc4a6] px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#123b1f]">Minutes per Unit (optional)</label>
                <input
                  value={minutesPerUnit}
                  onChange={(e) => setMinutesPerUnit(e.target.value)}
                  placeholder="e.g. 12.5"
                  className="mt-1 w-full rounded-md border border-[#9cc4a6] px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#123b1f]">Default Qty (optional)</label>
                <input
                  value={defaultQty}
                  onChange={(e) => setDefaultQty(e.target.value)}
                  placeholder="e.g. 10"
                  className="mt-1 w-full rounded-md border border-[#9cc4a6] px-3 py-2 text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-[#123b1f]">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Any bidding guidance, assumptions, etc."
                  className="mt-1 w-full rounded-md border border-[#9cc4a6] px-3 py-2 text-sm"
                />
              </div>

              {/* Nice-to-haves */}
              <div>
                <label className="text-xs font-semibold text-[#123b1f]">Min Qty (nice-to-have)</label>
                <input
                  value={minQty}
                  onChange={(e) => setMinQty(e.target.value)}
                  placeholder="e.g. 1"
                  className="mt-1 w-full rounded-md border border-[#9cc4a6] px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#123b1f]">Round Qty To (nice-to-have)</label>
                <input
                  value={roundQtyTo}
                  onChange={(e) => setRoundQtyTo(e.target.value)}
                  placeholder="e.g. 0.5"
                  className="mt-1 w-full rounded-md border border-[#9cc4a6] px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#123b1f]">Seasonal Multiplier (nice-to-have)</label>
                <input
                  value={seasonalMultiplier}
                  onChange={(e) => setSeasonalMultiplier(e.target.value)}
                  placeholder="e.g. 1.15"
                  className="mt-1 w-full rounded-md border border-[#9cc4a6] px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#123b1f]">Difficulty Multiplier (nice-to-have)</label>
                <input
                  value={difficultyMultiplier}
                  onChange={(e) => setDifficultyMultiplier(e.target.value)}
                  placeholder="e.g. 1.25"
                  className="mt-1 w-full rounded-md border border-[#9cc4a6] px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="mt-6 rounded-xl border border-[#d7e6db] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#edf3ee] px-4 py-3">
            <div className="text-sm font-semibold text-[#123b1f]">Tasks</div>
            <button
              onClick={() => divisionId && loadTasks(divisionId)}
              disabled={!divisionId || loading}
              className="rounded-md border border-[#9cc4a6] bg-white px-3 py-2 text-sm font-medium text-[#123b1f] hover:bg-[#eef6f0] disabled:opacity-60"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#eef6f0] text-left text-[#123b1f]">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Unit</th>
                  <th className="px-4 py-3 font-semibold">Min/Unit</th>
                  <th className="px-4 py-3 font-semibold">Active</th>
                  <th className="px-4 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-[#3d5a45]">
                      Loading…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-[#3d5a45]">
                      No tasks yet for this division.
                    </td>
                  </tr>
                ) : (
                  rows.map((t) => (
                    <tr key={t.id} className="border-t border-[#edf3ee]">
                      <td className="px-4 py-3 font-medium text-[#123b1f]">{t.name}</td>
                      <td className="px-4 py-3">{t.unit ?? "—"}</td>
                      <td className="px-4 py-3">
                        {t.minutes_per_unit === null ? "—" : t.minutes_per_unit}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                            t.is_active
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {t.is_active ? "Yes" : "No"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => toggleActive(t.id, !t.is_active)}
                          className="rounded-md border border-[#9cc4a6] bg-white px-2.5 py-1.5 text-xs font-medium text-[#123b1f] hover:bg-[#eef6f0]"
                        >
                          {t.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-3 text-xs text-[#3d5a45]">
          Notes: this page expects <code>/api/tasks</code> and <code>/api/tasks/[id]</code> to exist.
          Next step is building those API routes (we’ll do that next).
        </div>
      </div>
    </div>
  );
}
