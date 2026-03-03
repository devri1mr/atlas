// src/app/atlasbid/bids/[id]/BidDetailClient.tsx
"use client";

import * as React from "react";
import Link from "next/link";

type Division = { id: string; name: string };

type LaborRatesGet = {
  rates?: Array<{ division_id: string; hourly_rate: number }>;
  divisions?: Division[];
  error?: string;
};

type BidRecord = {
  id: string;
  client_name?: string | null;
  client_last_name?: string | null;
  division_id?: string | null;

  status_name?: string | null;
  internal_notes?: string | null;

  created_at?: string | null;
};

type MaybeBidResponse = {
  bid?: BidRecord;
  data?: BidRecord; // some endpoints use {data}
  error?: string;
};

function safeJoinName(first?: string | null, last?: string | null) {
  const parts = [first ?? "", last ?? ""].map((s) => String(s).trim()).filter(Boolean);
  return parts.length ? parts.join(" ") : "—";
}

function fmtDate(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

/**
 * Reads response as text first, then JSON-parses.
 * If the server returns HTML (DOCTYPE), you get a useful error instead of a crash.
 */
async function readJsonOrThrow(res: Response) {
  const text = await res.text();
  const looksLikeHtml = /^\s*</.test(text) && /<!doctype|<html/i.test(text);

  if (!res.ok) {
    if (looksLikeHtml) {
      throw new Error(`Request failed (HTTP ${res.status}) and returned HTML. Likely a bad API route or redirect.`);
    }
    try {
      const j = JSON.parse(text || "{}");
      throw new Error(j?.error || `HTTP ${res.status}`);
    } catch {
      throw new Error(text || `HTTP ${res.status}`);
    }
  }

  if (!text) return {};
  if (looksLikeHtml) {
    throw new Error(`Expected JSON but got HTML. Likely a bad API route or redirect.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Response was not valid JSON.`);
  }
}

/**
 * We try a couple common endpoints so you don't get stuck on a single route mismatch.
 * If one works, we use it. If not, you'll see a clear error.
 */
async function fetchBidWithFallback(bidId: string): Promise<BidRecord> {
  const candidates = [
    `/api/atlasbid/bids/${bidId}`, // common REST style
    `/api/atlasbid/bid?id=${encodeURIComponent(bidId)}`, // common query style
    `/api/bids/${bidId}`, // fallback
    `/api/bid?id=${encodeURIComponent(bidId)}`, // fallback
  ];

  let lastErr: any = null;

  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const json = (await readJsonOrThrow(res)) as MaybeBidResponse;

      const bid = json?.bid ?? (json as any)?.data ?? (json as any);
      if (bid?.id) return bid as BidRecord;

      // If endpoint returns something else but 200, treat as mismatch
      lastErr = new Error(`Endpoint returned JSON but not a bid shape: ${url}`);
    } catch (e: any) {
      lastErr = e;
    }
  }

  throw lastErr ?? new Error("Unable to load bid.");
}

export default function BidDetailClient({ bidId }: { bidId: string }) {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [bid, setBid] = React.useState<BidRecord | null>(null);

  const [divisions, setDivisions] = React.useState<Division[]>([]);
  const divisionNameById = React.useMemo(() => {
    const m = new Map<string, string>();
    divisions.forEach((d) => m.set(d.id, d.name));
    return m;
  }, [divisions]);

  const base = `/atlasbid/bids/${bidId}`;

  async function loadAll() {
    setLoading(true);
    setError(null);

    try {
      // Load divisions (for displaying division name)
      const divRes = await fetch("/api/labor-rates", { cache: "no-store" });
      const divJson = (await readJsonOrThrow(divRes)) as LaborRatesGet;
      setDivisions(Array.isArray(divJson?.divisions) ? divJson.divisions : []);

      // Load bid
      const b = await fetchBidWithFallback(bidId);
      setBid(b);
    } catch (e: any) {
      setError(e?.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bidId]);

  if (loading) {
    return <div style={{ padding: 24 }}>Loading…</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 24, maxWidth: 980 }}>
        <h1 style={{ marginBottom: 6 }}>AtlasBid</h1>
        <div style={{ color: "#6b7280", marginBottom: 14 }}>
          Bid ID: <span style={{ fontFamily: "monospace" }}>{bidId}</span>
        </div>

        <div
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            padding: 14,
            borderRadius: 12,
          }}
        >
          {error}
          <div style={{ marginTop: 10 }}>
            <button
              onClick={loadAll}
              style={{
                border: "1px solid #e5e7eb",
                background: "white",
                padding: "8px 12px",
                borderRadius: 10,
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!bid) {
    return (
      <div style={{ padding: 24, maxWidth: 980, color: "#b91c1c" }}>
        Bid not found.
      </div>
    );
  }

  const clientFull = safeJoinName(bid.client_name, bid.client_last_name);
  const divId = bid.division_id ?? "";
  const divName = divId ? (divisionNameById.get(divId) ?? divId) : "—";

  const tabWrapStyle: React.CSSProperties = {
    display: "flex",
    gap: 10,
    border: "1px solid #e5e7eb",
    padding: 10,
    borderRadius: 12,
    width: "fit-content",
    marginBottom: 18,
    background: "#fafafa",
  };

  const tabStyle: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "white",
    textDecoration: "none",
    color: "#111827",
    fontSize: 14,
  };

  const cardStyle: React.CSSProperties = {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 18,
    background: "white",
  };

  return (
    <div style={{ padding: 24, maxWidth: 980 }}>
      {/* Header */}
      <h1 style={{ marginBottom: 6 }}>AtlasBid</h1>
      <div style={{ color: "#6b7280", marginBottom: 14 }}>
        Bid ID: <span style={{ fontFamily: "monospace" }}>{bid.id}</span>
      </div>

      {/* Tabs */}
      <div style={tabWrapStyle}>
        <Link href={base} style={tabStyle}>
          Overview
        </Link>
        <Link href={`${base}/scope`} style={tabStyle}>
          Scope
        </Link>
        <Link href={`${base}/pricing`} style={tabStyle}>
          Pricing
        </Link>
        <Link href={`${base}/proposal`} style={tabStyle}>
          Proposal
        </Link>
      </div>

      {/* Overview Card */}
      <div style={cardStyle}>
        <p style={{ marginTop: 0 }}>
          <strong>Client:</strong> {clientFull}
        </p>

        <p>
          <strong>Division:</strong> {divName}
          {divId ? (
            <span style={{ color: "#6b7280" }}>
              {" "}
              (<span style={{ fontFamily: "monospace" }}>{divId}</span>)
            </span>
          ) : null}
        </p>

        <p>
          <strong>Status:</strong> {bid.status_name ?? "(None)"}
        </p>

        <p>
          <strong>Internal Notes:</strong> {bid.internal_notes ?? "None"}
        </p>

        <p style={{ marginBottom: 14 }}>
          <strong>Created At:</strong> {fmtDate(bid.created_at)}
        </p>

        <Link href="/atlasbid/bids" style={{ textDecoration: "none", color: "#111827" }}>
          Back to bids
        </Link>
      </div>
    </div>
  );
}
