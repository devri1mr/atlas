"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type Bid = {
  id: number;
  client_name: string | null;
  client_last_name: string | null;
  status_id: number | null;
  created_at: string;
};

export default function BidDetailPage() {
  const params = useParams();
  const bidId = Number(params?.id);

  const [bid, setBid] = useState<Bid | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bidId) return;

    async function load() {
      setLoading(true);
      const res = await fetch(`/api/bids/${bidId}`, { cache: "no-store" });
      const json = await res.json();
      setBid(json?.data ?? null);
      setLoading(false);
    }

    load();
  }, [bidId]);

  if (loading) return <div className="p-8">Loading…</div>;
  if (!bid) return <div className="p-8 text-red-600">Bid not found.</div>;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {bid.client_name || ""} {bid.client_last_name || ""}
          </h1>
          <div className="text-gray-500 text-sm">Bid ID: {bid.id}</div>
        </div>

        <Link className="text-emerald-800 hover:underline" href="/atlasbid/new">
          Back to bids
        </Link>
      </div>

      <div className="border rounded-xl p-6 bg-white shadow-sm">
        <div className="text-gray-600 text-sm">Draft workspace (Phase 1)</div>
        <div className="mt-2 text-sm">
          Next we’ll add:
          <ul className="list-disc ml-5 mt-2 text-gray-700">
            <li>Division selection</li>
            <li>Labor builder + blended rate</li>
            <li>Materials builder</li>
            <li>Pricing summary</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
