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

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/bids/${bidId}`);
        const json = await res.json();

        if (!res.ok) {
          setError(json.error || "Failed to load bid");
          return;
        }

        setBid(json);
      } catch {
        setError("Network error");
      }
    }

    load();
  }, [bidId]);

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: "red" }}>{error}</div>
      </div>
    );
  }

  if (!bid) {
    return <div style={{ padding: 24 }}>Loading...</div>;
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

      <br />

      <Link href="/atlasbid/bids">Back to bids</Link>
    </div>
  );
}
