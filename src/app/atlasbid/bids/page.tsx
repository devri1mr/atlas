"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Bid = {
  id: string;
  bid_code: string | null;
  client_name: string | null;
  client_last_name: string | null;
  created_at: string;
};

export default function BidsPage() {
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      const res = await fetch("/api/bids", { cache: "no-store" });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to load bids");
      }

      setBids(json.data ?? []);
    } catch (err: any) {
      setError(err.message ?? "Error loading bids");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600 }}>Bids</h1>

      <div style={{ marginTop: 16, marginBottom: 16 }}>
        <Link href="/atlasbid/new">
          <button>Create Bid</button>
        </Link>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {!loading && bids.length === 0 && <p>No bids yet.</p>}

      <ul>
        {bids.map((b) => (
          <li key={b.id} style={{ marginBottom: 8 }}>
            <Link href={`/atlasbid/bids/${b.id}`}>
              {b.bid_code ?? "—"} — {b.client_name} {b.client_last_name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
