"use client";

import React from "react";
import Link from "next/link";

export default function BidDetailClient({
  bid,
}: {
  bid: {
    id: string;
    client_name?: string | null;
    client_last_name?: string | null;
    division_name?: string | null;
    status?: string | null;
    internal_notes?: string | null;
    created_at?: string | null;
  };
}) {
  const base = `/atlasbid/bids/${bid.id}`;

  const clientDisplay =
    [bid.client_name, bid.client_last_name]
      .filter(Boolean)
      .join(" ") || "—";

  const divisionDisplay = bid.division_name || "Landscaping";

  return (
    <div style={{ padding: 24, maxWidth: 980 }}>
      {/* SINGLE HEADER */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
          AtlasBid
        </div>
        <div style={{ color: "#6b7280" }}>
          Bid ID: <span style={{ fontFamily: "monospace" }}>{bid.id}</span>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 10,
          border: "1px solid #e5e7eb",
          padding: 10,
          borderRadius: 12,
          width: "fit-content",
          marginBottom: 18,
          background: "#fafafa",
        }}
      >
        <Link href={base}>Overview</Link>
        <Link href={`${base}/scope`}>Scope</Link>
        <Link href={`${base}/pricing`}>Pricing</Link>
        <Link href={`${base}/proposal`}>Proposal</Link>
      </div>

      {/* Overview Card */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 18,
          background: "white",
        }}
      >
        <p>
          <strong>Client:</strong> {clientDisplay}
        </p>

        <p>
          <strong>Division:</strong> {divisionDisplay}
        </p>

        <p>
          <strong>Status:</strong> {bid.status || "(None)"}
        </p>

        <p>
          <strong>Internal Notes:</strong>{" "}
          {bid.internal_notes || "None"}
        </p>

        <p>
          <strong>Created At:</strong>{" "}
          {bid.created_at
            ? new Date(bid.created_at).toLocaleString()
            : "—"}
        </p>

        <div style={{ marginTop: 14 }}>
          <Link href="/atlasbid/bids">Back to bids</Link>
        </div>
      </div>
    </div>
  );
}
