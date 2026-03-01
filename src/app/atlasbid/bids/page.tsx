"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type BidRow = {
  id: string;
  client_name: string | null;
  client_last_name: string | null;
  created_at: string | null;
  status_id: string | null;
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function BidsPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<BidRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/bids", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Failed to load bids");
      setRows(json?.data ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="min-h-screen bg-[#f6f8f6] px-6 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#123b1f]">Bids</h1>
            <p className="mt-1 text-sm text-[#3d5a45]">
              List of bids (pulled from /api/bids).
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
              href="/atlasbid/new"
              className="rounded-md bg-[#1e7a3a] px-3 py-2 text-sm font-medium text-white hover:bg-[#16602d]"
            >
              Create Bid
            </Link>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="mt-6 rounded-xl border border-[#d7e6db] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#eef6f0] text-left text-[#123b1f]">
                  <th className="px-4 py-3 font-semibold">Client</th>
                  <th className="px-4 py-3 font-semibold">Status ID</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-4 py-6 text-[#3d5a45]" colSpan={4}>
                      Loading…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-[#3d5a45]" colSpan={4}>
                      No bids yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((b) => (
                    <tr key={b.id} className="border-t border-[#edf3ee]">
                      <td className="px-4 py-3 font-medium text-[#123b1f]">
                        {(b.client_name ?? "").trim()}{" "}
                        {(b.client_last_name ?? "").trim() || ""}
                      </td>
                      <td className="px-4 py-3">{b.status_id ?? "—"}</td>
                      <td className="px-4 py-3">{fmtDate(b.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/atlasbid/bids/${b.id}`}
                          className="rounded-md border border-[#9cc4a6] bg-white px-2.5 py-1.5 text-xs font-medium text-[#123b1f] hover:bg-[#eef6f0]"
                        >
                          Open
                        </Link>
                      </td>
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
