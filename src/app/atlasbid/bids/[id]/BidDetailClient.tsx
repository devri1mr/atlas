"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Bid = {
  id: string;
  client_name: string | null;
  client_last_name: string | null;
  status_id: string | null;
  created_at: string;
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function BidDetailClient({
  bidId,
}: {
  bidId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bid, setBid] = useState<Bid | null>(null);

  async function loadBid() {
    setLoading(true);
    setError(null);

    if (!bidId || bidId === "undefined") {
      setError(`Invalid bid id: ${String(bidId)}`);
      setBid(null);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/bids/${encodeURIComponent(bidId)}`, {
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to load bid");
      }

      setBid(json.data ?? null);
    } catch (err: any) {
      setError(err?.message ?? "Unknown error");
      setBid(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBid();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bidId]);

  return (
    <div className="min-h-screen bg-[#f6f8f6] px-6 py-6">
      <div className="mx-auto max-w-4xl">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#123b1f]">
              Bid Detail
            </h1>
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
              onClick={loadBid}
              className="rounded-md border border-[#9cc4a6] bg-white px-3 py-2 text-sm font-medium text-[#123b1f] hover:bg-[#eef6f0]"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Card */}
        <div className="mt-6 rounded-xl border border-[#d7e6db] bg-white p-5 shadow-sm">
          {loading ? (
            <div className="text-sm text-[#3d5a45]">Loading…</div>
          ) : !bid ? (
            <div className="text-sm text-[#3d5a45]">
              Bid not found.
            </div>
          ) : (
            <div className="space-y-4 text-sm">

              <div>
                <div className="text-xs text-[#6b7f71]">Bid ID</div>
                <div className="font-mono text-[#123b1f]">
                  {bid.id}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-[#6b7f71]">
                    Client First Name
                  </div>
                  <div className="font-medium text-[#123b1f]">
                    {bid.client_name ?? "—"}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-[#6b7f71]">
                    Client Last Name
                  </div>
                  <div className="font-medium text-[#123b1f]">
                    {bid.client_last_name ?? "—"}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs text-[#6b7f71]">Status ID</div>
                <div className="font-medium text-[#123b1f]">
                  {bid.status_id ?? "—"}
                </div>
              </div>

              <div>
                <div className="text-xs text-[#6b7f71]">Created</div>
                <div className="text-[#123b1f]">
                  {formatDate(bid.created_at)}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
