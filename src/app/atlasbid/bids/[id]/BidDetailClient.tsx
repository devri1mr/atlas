"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type BidRow = {
  id: string;
  client_name: string | null;
  client_last_name: string | null;
  status_id: string | null;
  created_at: string;
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export default function BidDetailClient({ bidId }: { bidId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bid, setBid] = useState<BidRow | null>(null);

  // IMPORTANT: derive "id" from bidId so the rest of the code is stable
  const id = bidId;

  const validId = useMemo(() => {
    if (!id) return false;
    if (id === "undefined") return false;
    return isUuidLike(id);
  }, [id]);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      if (!validId) {
        setBid(null);
        setError(`Invalid bid id: ${String(id)}`);
        return;
      }

      const res = await fetch(`/api/bids/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to load bid");
      }

      setBid(json?.data ?? null);

      if (!json?.data) {
        setError("Bid not found.");
      }
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
      setBid(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Local edit fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  useEffect(() => {
    setFirstName(bid?.client_name ?? "");
    setLastName(bid?.client_last_name ?? "");
  }, [bid?.client_name, bid?.client_last_name]);

  async function saveBasic() {
    setError(null);

    if (!validId) {
      setError(`Invalid bid id: ${String(id)}`);
      return;
    }

    const fn = firstName.trim();
    const ln = lastName.trim();
    if (!fn || !ln) {
      setError("Client first + last name are required.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/bids/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: fn,
          client_last_name: ln,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ?? "Save failed (PATCH not implemented yet?)");
      }

      setBid(json?.data ?? bid);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f6f8f6] px-6 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#123b1f]">Bid Detail</h1>
            <p className="mt-1 text-sm text-[#3d5a45]">
              View / edit basic bid info (client + status).
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={load}
              className="rounded-md border border-[#9cc4a6] bg-white px-3 py-2 text-sm font-medium text-[#123b1f] hover:bg-[#eef6f0]"
            >
              Refresh
            </button>

            <Link
              href="/atlasbid/bids"
              className="rounded-md border border-[#9cc4a6] bg-white px-3 py-2 text-sm font-medium text-[#123b1f] hover:bg-[#eef6f0]"
            >
              Back to bids
            </Link>
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
          ) : !bid ? (
            <div className="text-sm text-[#3d5a45]">Bid not found.</div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <div className="text-xs text-[#6b7f71]">Bid ID</div>
                  <div className="text-sm font-medium text-[#123b1f]">{bid.id}</div>
                </div>
                <div>
                  <div className="text-xs text-[#6b7f71]">Created</div>
                  <div className="text-sm text-[#123b1f]">{fmtDate(bid.created_at)}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-[#123b1f]">
                    Client First Name
                  </label>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full rounded-md border border-[#cfe1d4] bg-white px-3 py-2 text-sm text-[#123b1f] focus:outline-none focus:ring-2 focus:ring-[#1e7a3a]"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-[#123b1f]">
                    Client Last Name
                  </label>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full rounded-md border border-[#cfe1d4] bg-white px-3 py-2 text-sm text-[#123b1f] focus:outline-none focus:ring-2 focus:ring-[#1e7a3a]"
                  />
                </div>
              </div>

              <div className="flex justify-end border-t border-[#edf3ee] pt-4">
                <button
                  onClick={saveBasic}
                  disabled={saving}
                  className="rounded-md bg-[#1e7a3a] px-4 py-2 text-sm font-medium text-white hover:bg-[#16602d] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>

              <div className="text-xs text-[#6b7f71]">
                Note: If “Save” errors, PATCH isn’t implemented on the API yet.
                The key goal here is that the bid ID loads correctly.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
