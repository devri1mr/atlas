"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Division = {
  id: string; // uuid
  name: string;
  default_gp_percent?: number | null;
};

type Task = {
  id: string;
  division_id: string;
  name: string;
  unit: string | null;
  minutes_per_unit: number | null;
  default_qty: number | null;
  notes: string | null;

  // nice-to-haves (kept)
  min_qty: number | null;
  round_qty_to: number | null;
  seasonal_multiplier: number | null;
  difficulty_multiplier: number | null;

  created_at: string | null;
  updated_at: string | null;
};

export default function OperationsTasksPage() {
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [divisionId, setDivisionId] = useState<string>("");

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // form
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [minutesPerUnit, setMinutesPerUnit] = useState<string>("");
  const [defaultQty, setDefaultQty] = useState<string>("");
  const [notes, setNotes] = useState("");

  const [minQty, setMinQty] = useState<string>("");
  const [roundQtyTo, setRoundQtyTo] = useState<string>("");
  const [seasonalMultiplier, setSeasonalMultiplier] = useState<string>("");
  const [difficultyMultiplier, setDifficultyMultiplier] = useState<string>("");

  const selectedDivision = useMemo(
    () => divisions.find((d) => d.id === divisionId) || null,
    [divisions, divisionId]
  );

  // load divisions once
  useEffect(() => {
    async function loadDivisions() {
      try {
        setError(null);
        const res = await fetch("/api/divisions", { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? "Failed to load divisions");

        const list: Division[] = json?.data ?? [];
        setDivisions(list);

        // default select first division if none selected
        if (!divisionId && list.length > 0) setDivisionId(list[0].id);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load divisions");
      }
    }
    loadDivisions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // load tasks when division changes
  useEffect(() => {
    if (!divisionId) return;

    const controller = new AbortController();

    async function loadTasks() {
      try {
        setLoadingTasks(true);
        setError(null);

        const res = await fetch(`/api/task-catalog?division_id=${divisionId}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? "Failed to load tasks");

        setTasks(json?.data ?? []);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setError(e?.message ?? "Failed to load tasks");
        setTasks([]);
      } finally {
        setLoadingTasks(false);
      }
    }

    loadTasks();
    return () => controller.abort();
  }, [divisionId]);

  function toNumOrNull(v: string): number | null {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  async function handleCreateTask() {
    try {
      setError(null);

      if (!divisionId) throw new Error("Select a division first.");
      if (!name.trim()) throw new Error("Task name is required.");

      const payload = {
        division_id: divisionId,
        name: name.trim(),
        unit: unit.trim() ? unit.trim() : null,
        minutes_per_unit: toNumOrNull(minutesPerUnit),
        default_qty: toNumOrNull(defaultQty),
        notes: notes.trim() ? notes.trim() : null,

        min_qty: toNumOrNull(minQty),
        round_qty_to: toNumOrNull(roundQtyTo),
        seasonal_multiplier: toNumOrNull(seasonalMultiplier),
        difficulty_multiplier: toNumOrNull(difficultyMultiplier),
      };

      const res = await fetch("/api/task-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Failed to create task");

      // prepend to list
      setTasks((prev) => [json.data, ...prev]);

      // reset form (keep division)
      setName("");
      setUnit("");
      setMinutesPerUnit("");
      setDefaultQty("");
      setNotes("");
      setMinQty("");
      setRoundQtyTo("");
      setSeasonalMultiplier("");
      setDifficultyMultiplier("");
    } catch (e: any) {
      setError(e?.message ?? "Failed to create task");
    }
  }

  return (
    <div className="min-h-screen bg-[#f6f8f6] px-6 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4">
          <div className="text-sm text-[#3d5a45]">
            Operations Center → Tasks. Create and manage reusable labor tasks by
            division.
          </div>
          <Link
            href="/operations-center"
            className="mt-1 inline-block text-sm font-medium text-[#1e7a3a] hover:underline"
          >
            ← Back to Operations Center
          </Link>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: Division picker */}
          <div className="rounded-xl border border-[#d7e6db] bg-white p-4 shadow-sm">
            <div className="mb-2 text-sm font-semibold text-[#123b1f]">
              Division
            </div>

            <select
              value={divisionId}
              onChange={(e) => setDivisionId(e.target.value)}
              className="w-full rounded-md border border-[#cfe0d4] bg-white px-3 py-2 text-sm text-[#123b1f] focus:outline-none"
            >
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>

            {selectedDivision && (
              <div className="mt-3 text-xs text-[#3d5a45]">
                Selected:{" "}
                <span className="font-medium text-[#123b1f]">
                  {selectedDivision.name}
                </span>
              </div>
            )}
          </div>

          {/* Middle/Right: Create form */}
          <div className="rounded-xl border border-[#d7e6db] bg-white p-4 shadow-sm lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-[#123b1f]">
                Add Task
              </div>

              <button
                onClick={handleCreateTask}
                className="cursor-pointer rounded-md bg-[#1e7a3a] px-4 py-2 text-sm font-medium text-white hover:bg-[#16602d]"
              >
                Create Task
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-medium text-[#3d5a45]">
                  Task Name
                </div>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-[#cfe0d4] px-3 py-2 text-sm"
                  placeholder='e.g. "Install brown mulch by hand"'
                />
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-[#3d5a45]">
                  Unit (optional)
                </div>
                <input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full rounded-md border border-[#cfe0d4] px-3 py-2 text-sm"
                  placeholder="yd / sqft / ea / hr"
                />
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-[#3d5a45]">
                  Minutes per Unit (optional)
                </div>
                <input
                  value={minutesPerUnit}
                  onChange={(e) => setMinutesPerUnit(e.target.value)}
                  className="w-full rounded-md border border-[#cfe0d4] px-3 py-2 text-sm"
                  placeholder="e.g. 12.5"
                />
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-[#3d5a45]">
                  Default Qty (optional)
                </div>
                <input
                  value={defaultQty}
                  onChange={(e) => setDefaultQty(e.target.value)}
                  className="w-full rounded-md border border-[#cfe0d4] px-3 py-2 text-sm"
                  placeholder="e.g. 10"
                />
              </div>

              <div className="md:col-span-2">
                <div className="mb-1 text-xs font-medium text-[#3d5a45]">
                  Notes (optional)
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-md border border-[#cfe0d4] px-3 py-2 text-sm"
                  rows={3}
                  placeholder="Any bidding guidance, assumptions, etc."
                />
              </div>

              {/* nice-to-haves */}
              <div>
                <div className="mb-1 text-xs font-medium text-[#3d5a45]">
                  Min Qty (nice-to-have)
                </div>
                <input
                  value={minQty}
                  onChange={(e) => setMinQty(e.target.value)}
                  className="w-full rounded-md border border-[#cfe0d4] px-3 py-2 text-sm"
                  placeholder="e.g. 1"
                />
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-[#3d5a45]">
                  Round Qty To (nice-to-have)
                </div>
                <input
                  value={roundQtyTo}
                  onChange={(e) => setRoundQtyTo(e.target.value)}
                  className="w-full rounded-md border border-[#cfe0d4] px-3 py-2 text-sm"
                  placeholder="e.g. 0.5"
                />
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-[#3d5a45]">
                  Seasonal Multiplier (nice-to-have)
                </div>
                <input
                  value={seasonalMultiplier}
                  onChange={(e) => setSeasonalMultiplier(e.target.value)}
                  className="w-full rounded-md border border-[#cfe0d4] px-3 py-2 text-sm"
                  placeholder="e.g. 1.15"
                />
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-[#3d5a45]">
                  Difficulty Multiplier (nice-to-have)
                </div>
                <input
                  value={difficultyMultiplier}
                  onChange={(e) => setDifficultyMultiplier(e.target.value)}
                  className="w-full rounded-md border border-[#cfe0d4] px-3 py-2 text-sm"
                  placeholder="e.g. 1.25"
                />
              </div>
            </div>
          </div>
        </div>

        {/* List */}
        <div className="mt-6 rounded-xl border border-[#d7e6db] bg-white shadow-sm">
          <div className="border-b border-[#edf3ee] px-4 py-3 text-sm font-semibold text-[#123b1f]">
            Tasks
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#eef6f0] text-left text-[#123b1f]">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Unit</th>
                  <th className="px-4 py-3 font-semibold">Min/Unit</th>
                  <th className="px-4 py-3 font-semibold">Default Qty</th>
                  <th className="px-4 py-3 font-semibold">Notes</th>
                </tr>
              </thead>

              <tbody>
                {loadingTasks ? (
                  <tr>
                    <td className="px-4 py-6 text-[#3d5a45]" colSpan={5}>
                      Loading…
                    </td>
                  </tr>
                ) : tasks.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-[#3d5a45]" colSpan={5}>
                      No tasks yet for this division.
                    </td>
                  </tr>
                ) : (
                  tasks.map((t) => (
                    <tr key={t.id} className="border-t border-[#edf3ee]">
                      <td className="px-4 py-3 font-medium text-[#123b1f]">
                        {t.name}
                      </td>
                      <td className="px-4 py-3">{t.unit ?? "—"}</td>
                      <td className="px-4 py-3">
                        {t.minutes_per_unit ?? "—"}
                      </td>
                      <td className="px-4 py-3">{t.default_qty ?? "—"}</td>
                      <td className="px-4 py-3">{t.notes ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
