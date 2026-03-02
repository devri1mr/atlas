"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Bid = {
  id: string;
  client_name: string;
  client_last_name: string;
  status_id: number | null;
  internal_notes: string | null;
  created_at: string;
};

export default function BidDetailClient({ bidId }: { bidId: string }) {
  const [bid, setBid] = useState<Bid | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("BidDetailClient bidId =", bidId);

    // If bidId is missing, don't hang forever
    if (!bidId) {
      setError("Missing bid id in the URL (params.id is empty).");
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/bids/${bidId}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        // If API returns HTML (like a redirect page), this makes it obvious
        const text = await res.text();
        let json: any = null;

        try {
          json = JSON.parse(text);
        } catch {
          throw new Error(
            `API did not return JSON. First 120 chars: ${text.slice(0, 120)}`
          );
        }

        if (!res.ok) {
          setError(json?.error || "Failed to load bid");
          setBid(null);
          return;
        }

        setBid(json.data ?? null);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setError(err?.message || "Network error");
        setBid(null);
      } finally {
        setLoading(false);
      }
    }

    load();

    return () => controller.abort();
  }, [bidId]);

  if (loading) {
    return <div style={{ padding: 24 }}>Loading...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: "red" }}>{error}</div>
        <br />
        <Link href="/atlasbid/bids">Back to bids</Link>
      </div>
    );
  }

  if (!bid) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: "red" }}>Bid not found</div>
        <br />
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
        <strong>Created At:</strong> {new Date(bid.created_at).toLocaleString()}
      </p>

      <br />
      <Link href="/atlasbid/bids">Back to bids</Link>
    </div>
  );
}
