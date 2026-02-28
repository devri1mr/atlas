"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Division = {
  id: string;
  name: string;
  labor_rate: number;
  target_gross_profit_percent: number;
  allow_overtime: boolean;
  active: boolean;
  created_at: string;
};

export default function NewBidPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [divisions, setDivisions] = useState<Division[]>([]);

  // Form fields
  const [divisionId, setDivisionId] = useState<string>("");
  const [clientName, setClientName] = useState<string>("");
  const [clientLastName, setClientLastName] = useState<string>("");
  const [internalNotes, setInternalNotes] = useState<string>("");

  const selectedDivision = useMemo(() => {
    return divisions.find((d) => d.id === divisionId) ?? null;
  }, [divisions, divisionId]);

  const defaultGpDisplay = useMemo(() => {
    if (!selectedDivision) return "—";
    const n = Number(selectedDivision.target_gross_profit_percent);
    if (!Number.isFinite(n)) return "—";
    return `${n.toFixed(0)}%`;
  }, [selectedDivision]);

  async function loadDivisions() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/divisions", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to load divisions");
      }

      const rows: Division[] = (json?.data ?? []).filter((d: Division) => d.active !== false);

      setDivisions(rows);

      // Auto-select first division if none selected
      if (!divisionId && rows.length > 0) {
        setDivisionId(rows[0].id);
      }
    } catch (e: any) {
      setError(e?.message ?? "Unknown error loading divisions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDivisions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate() {
    setError(null);

    const first = clientName.trim();
    const last = clientLastName.trim();

    if (!divisionId) {
      setError("Division is required.");
      return;
    }
    if (!first || !last) {
      setError("Client first + last name are required.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: first,
          client_last_name: last,
          division_id: divisionId,
          internal_notes: internalNotes?.trim() || null,
          // status_id is optional here; if your DB default handles it, leave null
          status_id: null,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to create bid");
      }

      // ✅ IMPORTANT: your API returns { data: { id: ... } }
      const newId = json?.data?.id;

      if (!newId) {
        throw new Error("Create succeeded but no id returned from API.");
      }

      router.push(`/atlasbid/bids/${newId}`);
    } catch (e: any) {
      setError(e?.message ?? "Create failed");
      setSubmitting(false);
      return;
    }

    // leave submitting true while navigation happens
  }

  return (
    <div className="min-h-screen bg-[#f6f8f6] px-6 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#123b1f]">Create Bid</h1>
            <p className="mt-1 text-sm text-[#3d5a45]">
              Choose a division, enter the client, add internal notes (optional), then create.
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/atlasbid/bids"
              className="rounded-md border border-[#9cc4a6] bg-white px-3 py-2 text-sm font-medium text-[#123b1f] hover:bg-[#eef6f0]"
            >
              Back to Bids
            </Link>

            <button
              onClick={loadDivisions}
              className="rounded-md border border-[#9cc4a6] bg-white px-3 py-2 text-sm font-medium text-[#123b1f] hover:bg-[#eef6f0]"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="mt-6 rounded-xl border border-[#d7e6db] bg-white p-6 shadow-sm">
          {loading ? (
            <div className="text-sm text-[#3d5a45]">Loading…</div>
          ) : (
            <div className="space-y-6">
              {/* Division */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#123b1f]">Division</label>
                <select
                  value={divisionId}
                  onChange={(e) => setDivisionId(e.target.value)}
                  className="w-full rounded-md border border-[#cfe1d4] bg-white px-3 py-2 text-sm text-[#123b1f] focus:outline-none focus:ring-2 focus:ring-[#1e7a3a]"
                >
                  {divisions.length === 0 ? (
                    <option value="">No divisions available</option>
                  ) : (
                    divisions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))
                  )}
                </select>

                <div className="text-xs text-[#6b7f71]">
                  Default GP% for this division:{" "}
                  <span className="font-semibold text-[#123b1f]">{defaultGpDisplay}</span>
                </div>
              </div>

              {/* Client */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-[#123b1f]">Client First Name</label>
                  <input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="e.g., John"
                    className="w-full rounded-md border border-[#cfe1d4] bg-white px-3 py-2 text-sm text-[#123b1f] placeholder:text-[#92a69a] focus:outline-none focus:ring-2 focus:ring-[#1e7a3a]"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-[#123b1f]">Client Last Name</label>
                  <input
                    value={clientLastName}
                    onChange={(e) => setClientLastName(e.target.value)}
                    placeholder="e.g., Smith"
                    className="w-full rounded-md border border-[#cfe1d4] bg-white px-3 py-2 text-sm text-[#123b1f] placeholder:text-[#92a69a] focus:outline-none focus:ring-2 focus:ring-[#1e7a3a]"
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#123b1f]">Internal Notes (optional)</label>
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  placeholder="Internal notes only (shows on bid list)."
                  rows={3}
                  className="w-full rounded-md border border-[#cfe1d4] bg-white px-3 py-2 text-sm text-[#123b1f] placeholder:text-[#92a69a] focus:outline-none focus:ring-2 focus:ring-[#1e7a3a]"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 border-t border-[#edf3ee] pt-4">
                <button
                  onClick={onCreate}
                  disabled={submitting || loading}
                  className="rounded-md bg-[#1e7a3a] px-4 py-2 text-sm font-medium text-white hover:bg-[#16602d] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Creating…" : "Create Bid"}
                </button>
              </div>

              <div className="text-xs text-[#6b7f71]">
                Prepay is selected at the end of the bid (not here).
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
