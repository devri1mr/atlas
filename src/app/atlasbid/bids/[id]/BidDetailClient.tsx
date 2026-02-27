// src/app/atlasbid/bids/[id]/BidDetailClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Bid = {
  id: string;
  client_name: string | null;
  client_last_name: string | null;
  status_id: string | null;
  created_at: string;
  created_by_email: string | null;
  bid_statuses?: { name: string | null } | null;
};

type BidStatus = {
  id: string;
  name: string;
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function BidDetailClient({ id }: { id: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bid, setBid] = useState<Bid | null>(null);
  const [statuses, setStatuses] = useState<BidStatus[]>([]);

  const [clientName, setClientName] = useState("");
  const [clientLastName, setClientLastName] = useState("");
  const [statusId, setStatusId] = useState<string>("");

  const statusName = useMemo(() => {
    if (!statusId) return "";
    return statuses.find((s) => s.id === statusId)?.name ?? "";
  }, [statusId, statuses]);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const [bidRes, statusRes] = await Promise.all([
        fetch(`/api/bids/${encodeURIComponent(id)}`, { cache: "no-store" }),
        fetch(`/api/bid-statuses`, { cache: "no-store" }).catch(() => null as any),
      ]);

      const bidJson = await bidRes.json();
      if (!bidRes.ok) throw new Error(bidJson?.error ?? "Failed to load bid");

      let statusJson: any = { data: [] };
      if (statusRes && (statusRes as Response).ok) {
        statusJson = await (statusRes as Response).json();
      }

      const b: Bid = bidJson.data;
      setBid(b);
      setStatuses(statusJson.data ?? []);

      setClientName(b.client_name ?? "");
      setClientLastName(b.client_last_name ?? "");
      setStatusId(b.status_id ?? "");
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!bid) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/bids/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: clientName?.trim() || null,
          client_last_name: clientLastName?.trim() || null,
          status_id: statusId || null,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Save failed");

      setBid(json.data);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="min-h-screen bg-[#f6f8f6] px-6 py-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#123b1f]">Bid Detail</h1>
            <p className="mt-1 text-sm text-[#3d5a45]">
              View / edit basic bid info (client + status).
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/atlasbid/bids"
              className="rounded-md border border-[#9cc4a6] bg-white px-3 py-2 text-sm font-medium text-[#123b1f] hover:bg-[#eef6f0]"
            >
              Back to bids
            </Link>

            <button
              onClick={load}
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

        <div className="mt-6 rounded-xl border border-[#d7e6db] bg-white p-5 shadow-sm">
          {loading ? (
            <div className="text-sm text-[#3d5a45]">Loading…</div>
          ) : !bid ? (
            <div className="text-sm text-[#3d5a45]">Bid not found.</div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-[#123b1f]">
                    Client First Name
                  </label>
                  <input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="mt-1 w-full rounded-md border border-[#d7e6db] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#9cc4a6]"
                    placeholder="First name"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#123b1f]">
                    Client Last Name
                  </label>
                  <input
                    value={clientLastName}
                    onChange={(e) => setClientLastName(e.target.value)}
                    className="mt-1 w-full rounded-md border border-[#d7e6db] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#9cc4a6]"
                    placeholder="Last name"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-[#123b1f]">
                    Status
                  </label>
                  <select
                    value={statusId}
                    onChange={(e) => setStatusId(e.target.value)}
                    className="mt-1 w-full rounded-md border border-[#d7e6db] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#9cc4a6]"
                  >
                    <option value="">— Select status —</option>
                    {statuses.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>

                  {statusName ? (
                    <div className="mt-1 text-xs text-[#3d5a45]">
                      Selected: <span className="font-medium">{statusName}</span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 rounded-lg border border-[#edf3ee] bg-[#f9fbf9] p-4 text-sm text-[#123b1f]">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <div>
                    <span className="font-semibold">Bid ID:</span> {bid.id}
                  </div>
                  <div>
                    <span className="font-semibold">Created:</span> {fmtDate(bid.created_at)}
                  </div>
                  <div className="md:col-span-2">
                    <span className="font-semibold">Created By:</span>{" "}
                    {bid.created_by_email ?? "—"}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded-md bg-[#1e7a3a] px-4 py-2 text-sm font-medium text-white hover:bg-[#16602d] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
