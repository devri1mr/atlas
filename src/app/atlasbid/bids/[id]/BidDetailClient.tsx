"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Bid = {
  id: string;
  client_name: string;
  client_last_name: string;
  status_id: number | null;
  internal_notes: string | null;
  created_at: string;
};

type ApiResponse =
  | { data: Bid | null; error?: string }
  | Bid
  | { error: string };

export default function BidDetailClient({ bidId }: { bidId: string }) {
  const [bid, setBid] = useState<Bid | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const apiUrl = useMemo(() => `/api/bids/${encodeURIComponent(bidId)}`, [bidId]);

  useEffect(() => {
    if (!bidId) return;

    let isMounted = true;
    const controller = new AbortController();

    async function load() {
      try {
        setLoading(true);
        setError(null);

        // Hard timeout so "Loading..." can’t hang forever
        const timeout = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(apiUrl, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
        });

        clearTimeout(timeout);

        // Read body safely (even if not JSON)
        const text = await res.text();
        let json: ApiResponse | null = null;

        try {
          json = text ? (JSON.parse(text) as ApiResponse) : null;
        } catch {
          json = null;
        }

        if (!res.ok) {
          const msg =
            (json && typeof json === "object" && "error" in json && (json as any).error) ||
            `Failed to load bid (HTTP ${res.status})`;
          if (isMounted) setError(msg);
          return;
        }

        // Support both shapes:
        // 1) { data: {...} }
        // 2) {...}
        const maybeBid =
          json && typeof json === "object" && "data" in json
            ? (json as any).data
            : json;

        if (!maybeBid || typeof maybeBid !== "object") {
          if (isMounted) setBid(null);
          return;
        }

        if (isMounted) setBid(maybeBid as Bid);
      } catch (err: any) {
        const msg =
          err?.name === "AbortError"
            ? "Request timed out (15s)."
            : "Network / runtime error while loading bid.";
        if (isMounted) setError(msg);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [apiUrl, bidId]);

  if (loading) {
    return <div style={{ padding: 24 }}>Loading...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: "red", marginBottom: 12 }}>{error}</div>

        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 12 }}>
          Debug: requesting <code>{apiUrl}</code>
        </div>

        <Link href="/atlasbid/bids">Back to bids</Link>
      </div>
    );
  }

  if (!bid) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: "red", marginBottom: 12 }}>Bid not found</div>
        <Link href="/atlasbid/bids">Back to bids</Link>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Bid Detail</h1>

      <p>
        <strong>Client:</strong> {bid.client_name} {bid.client_last_name}
      </p>

      <p>
        <strong>Status ID:</strong> {bid.status_id ?? "None"}
      </p>

      <p>
        <strong>Internal Notes:</strong> {bid.internal_notes ?? "None"}
      </p>

      <p>
        <strong>Created At:</strong>{" "}
        {bid.created_at ? new Date(bid.created_at).toLocaleString() : "Unknown"}
      </p>

      <br />
      <Link href="/atlasbid/bids">Back to bids</Link>
    </div>
  );
}
