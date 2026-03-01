"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Bid = {
  id: string;
  client_name: string;
  client_last_name: string;
  status_id: number | null;
  internal_notes: string | null;
  created_at: string;
};

export default function BidDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [bid, setBid] = useState<Bid | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setError("Invalid bid id");
      setLoading(false);
      return;
    }

    fetch(`/api/bids/${id}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load bid");
        return json.data;
      })
      .then((data) => {
        setBid(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  if (loading) return <div>Loading...</div>;

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: "red" }}>{error}</div>
        <Link href="/atlasbid/bids">Back to bids</Link>
      </div>
    );
  }

  if (!bid) return null;

  return (
    <div style={{ padding: 24 }}>
      <h2>Bid Detail</h2>

      <div>
        <strong>Client:</strong> {bid.client_name} {bid.client_last_name}
      </div>

      <div>
        <strong>Status ID:</strong> {bid.status_id ?? "None"}
      </div>

      <div>
        <strong>Internal Notes:</strong> {bid.internal_notes ?? "None"}
      </div>

      <br />

      <Link href="/atlasbid/bids">Back to bids</Link>
    </div>
  );
}
