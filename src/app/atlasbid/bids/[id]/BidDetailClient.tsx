// src/app/atlasbid/bids/[id]/BidDetailClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Division = { id: string; name: string };

type Bid = {
  id: string;

  // some builds store client info directly on bid
  client_name?: string | null;
  client_last_name?: string | null;

  // division
  division_id?: string | null;

  // optional fields your overview shows
  status_id?: string | null;
  internal_notes?: string | null;
  created_at?: string | null;
};

type Status = { id: string; name: string };

function safeStr(v: any) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function formatDateTime(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString();
}

// Join first/last; avoids "undefined" and double spaces
function fullName(first?: string | null, last?: string | null) {
  const parts = [safeStr(first).trim(), safeStr(last).trim()].filter(Boolean);
  return parts.length ? parts.join(" ") : "—";
}

export default function BidDetailClient({ bidId }: { bidId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [bid, setBid] = useState<Bid | null>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);

  // -----------------------------
  // API endpoints (adjust if needed)
  // -----------------------------
  // If your bid API is different, change only this:
  // Common alternatives:
  //   /api/atlasbid/bids?id=${bidId}
  //   /api/bids/${bidId}
  //   /api/atlasbid/bid?id=${bidId}
  const BID_ENDPOINT = `/api/atlasbid/bids/${bidId}`;

  const DIVISIONS_ENDPOINT = `/api/divisions`;
  const STATUSES_ENDPOINT = `/api/statuses`; // if you don't have this, it will just silently fail

  async function loadAll() {
    setLoading(true);
    setError(null);

    try {
      const [bidRes, divRes, statusRes] = await Promise.allSettled([
        fetch(BID_ENDPOINT, { cache: "no-store" }),
        fetch(DIVISIONS_ENDPOINT, { cache: "no-store" }),
        fetch(STATUSES_ENDPOINT, { cache: "no-store" }),
      ]);

      // ---- bid
      if (bidRes.status === "fulfilled") {
        const r = bidRes.value;
        const txt = await r.text();
        const json = txt ? JSON.parse(txt) : {};
        if (!r.ok) throw new Error(json?.error || `Bid load failed (HTTP ${r.status})`);

        // Accept either { bid: {...} } or direct object
        const b: Bid = json?.bid ?? json;
        if (!b?.id) throw new Error("Bid not found.");
        setBid(b);
      } else {
        throw new Error(bidRes.reason?.message || "Bid load failed.");
      }

      // ---- divisions
      if (divRes.status === "fulfilled") {
        const r = divRes.value;
        const txt = await r.text();
        const json = txt ? JSON.parse(txt) : {};
        if (r.ok) {
          const list: Division[] = Array.isArray(json?.divisions)
            ? json.divisions
            : Array.isArray(json)
            ? json
            : [];
          setDivisions(list);
        }
      }

      // ---- statuses (optional)
      if (statusRes.status === "fulfilled") {
        const r = statusRes.value;
        const txt = await r.text();
        const json = txt ? JSON.parse(txt) : {};
        if (r.ok) {
          const list: Status[] = Array.isArray(json?.statuses)
            ? json.statuses
            : Array.isArray(json)
            ? json
            : [];
          setStatuses(list);
        }
      }
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bidId]);

  const base = `/atlasbid/bids/${bidId}`;

  const clientDisplay = useMemo(() => {
    if (!bid) return "—";
    return fullName(bid.client_name, bid.client_last_name);
  }, [bid]);

  const divisionName = useMemo(() => {
    if (!bid?.division_id) return "—";
    const match = divisions.find((d) => d.id === bid.division_id);
    const name = match?.name?.trim();

    // You said: "Yes I do only want landscaping"
    // If division is missing or mismatched, we still force label:
    // (If you *don't* want forcing, delete the next line)
    return name || "Landscaping";
  }, [bid?.division_id, divisions]);

  // helpful for styling selected tab without relying on router hooks
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "";

  function isActiveTab(href: string) {
    // exact match for Overview; prefix match for others
    if (href === base) return pathname === base;
    return pathname.startsWith(href);
  }

  if (loading) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!bid) return <div className="p-6 text-red-600">Bid not found.</div>;

  return (
    <div style={{ padding: 24, maxWidth: 980 }}>
      {/* SINGLE header only (prevents dual headers) */}
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
        {[
          { label: "Overview", href: base },
          { label: "Scope", href: `${base}/scope` },
          { label: "Pricing", href: `${base}/pricing` },
          { label: "Proposal", href: `${base}/proposal` },
        ].map((t) => {
          const active = isActiveTab(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: active ? "#111827" : "white",
                color: active ? "white" : "#111827",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Overview card */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 18,
          background: "white",
        }}
      >
        <p style={{ marginTop: 0 }}>
          <strong>Client:</strong> {clientDisplay}
        </p>

        <p>
          <strong>Division:</strong> {divisionName}
        </p>

        {/* Status (optional) */}
        <div style={{ marginTop: 16, marginBottom: 16 }}>
          <div style={{ marginBottom: 6 }}>
            <strong>Status</strong>
          </div>

          {statuses.length ? (
            <select
              value={bid.status_id ?? ""}
              onChange={() => {
                // If you want status saving, tell me your status API route
                // and I’ll wire it. For now it’s display-only.
                alert("Status saving not wired yet.");
              }}
              style={{
                width: 260,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "white",
              }}
            >
              <option value="">(None)</option>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            <div style={{ color: "#6b7280" }}>(None)</div>
          )}
        </div>

        <p>
          <strong>Internal Notes:</strong> {bid.internal_notes || "None"}
        </p>

        <p>
          <strong>Created At:</strong> {formatDateTime(bid.created_at)}
        </p>

        <div style={{ marginTop: 14 }}>
          <Link href="/atlasbid/bids" style={{ textDecoration: "none" }}>
            Back to bids
          </Link>
        </div>
      </div>
    </div>
  );
}
