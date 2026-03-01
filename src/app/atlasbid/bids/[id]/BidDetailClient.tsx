"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Bid = {
  id: string;
  client_name: string | null;
  client_last_name: string | null;
  status_id: string | null;
  created_at: string | null;
};

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function BidDetailClient({ bidId }: { bidId: string }) {
  const [loading, setLoading] = useState(true);
  const [bid, setBid] = useState<Bid | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmedId = useMemo(() => (bidId ?? "").trim(), [bidId]);
  const idValid = useMemo(() => isUuidLike(trimmedId), [trimmedId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setBid(null);
      setError(null);

      // If you ever see "undefined" after this, the wrong component/file is being rendered.
      if (!trimmedId) {
        setError(`Invalid bid id: ${String(bidId)}`);
        setLoading(false);
        return;
      }

      if (!idValid) {
        setError(`Invalid bid id: ${trimmedId}`);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/bids/${encodeURIComponent(trimmedId)}`, {
          cache: "no-store",
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(json?.error ?? "Failed to load bid");
        }

        if (!cancelled) {
          setBid(json?.data ?? null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "Unknown error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [bidId, trimmedId, idValid]);

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
            <Link
              href="/atlasbid/bids"
              className="rounded-md border border-[#9cc4a6] bg-white px-3 py-2 text-sm font-medium text-[#123b1f] hover:bg-[#eef6f0]"
            >
              Back to bids
            </Link>

            <button
              onClick={() => window.location.reload()}
              className="rounded-md border border-[#9cc4a6] bg-white px-3 py-2 text-sm font-medium text-[#123b1f] hover:bg-[#eef6f0]"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="mt-4 rounded-xl border border-[#d7e6db] bg-white p-4 shadow-sm">
          {loading ? (
            <div className="text-sm text-[#3d5a45]">Loading…</div>
          ) : !bid ? (
            <div className="text-sm text-[#3d5a45]">Bid not found.</div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm">
                <span className="font-semibold text-[#123b1f]">Bid ID:</span>{" "}
                <span className="text-[#3d5a45]">{bid.id}</span>
              </div>

              <div className="text-sm">
                <span className="font-semibold text-[#123b1f]">Client:</span>{" "}
                <span className="text-[#3d5a45]">
                  {(bid.client_name ?? "").trim()}{" "}
                  {(bid.client_last_name ?? "").trim() || ""}
                </span>
              </div>

              <div className="text-sm">
                <span className="font-semibold text-[#123b1f]">Status ID:</span>{" "}
                <span className="text-[#3d5a45]">{bid.status_id ?? "—"}</span>
              </div>

              <div className="text-sm">
                <span className="font-semibold text-[#123b1f]">Created:</span>{" "}
                <span className="text-[#3d5a45]">{fmtDate(bid.created_at)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 text-xs text-[#6b7f71]">
          Debug: this component should always receive the URL param via
          props. If bidId shows undefined, the wrong file is being rendered or
          the import path/casing is wrong.
        </div>
      </div>
    </div>
  );
}
