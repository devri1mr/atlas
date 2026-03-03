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

type Status = { id: number; name: string; color?: string | null };
type StatusesGet = { data?: Status[]; error?: string };

type BidRecord = {
  id: string;
  client_name?: string | null;
  client_last_name?: string | null;
  division_id?: string | null;

  status_id?: number | null;
  internal_notes?: string | null;

  created_at?: string | null;
};

type BidGet = { data?: BidRecord; error?: string };

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

async function readJsonOrThrow(res: Response) {
  const text = await res.text();
  const looksLikeHtml = /^\s*</.test(text) && /<!doctype|<html/i.test(text);

  if (!res.ok) {
    if (looksLikeHtml) {
      throw new Error(
        `Request failed (HTTP ${res.status}) and returned HTML. Likely a bad API route or redirect.`
      );
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

export default function BidDetailClient({ bidId }: { bidId: string }) {
  const [loading, setLoading] = React.useState(true);
  const [savingStatus, setSavingStatus] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [bid, setBid] = React.useState<BidRecord | null>(null);
  const [divisions, setDivisions] = React.useState<Division[]>([]);
  const [statuses, setStatuses] = React.useState<Status[]>([]);

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
      // divisions (for division name)
      const divRes = await fetch("/api/labor-rates", { cache: "no-store" });
      const divJson = (await readJsonOrThrow(divRes)) as LaborRatesGet;
      setDivisions(Array.isArray(divJson?.divisions) ? divJson.divisions : []);

      // statuses (for dropdown)
      const stRes = await fetch("/api/statuses", { cache: "no-store" });
      const stJson = (await readJsonOrThrow(stRes)) as StatusesGet;
      setStatuses(Array.isArray(stJson?.data) ? stJson.data : []);

      // bid (single source of truth: your route exists)
      const bidRes = await fetch(`/api/bids/${encodeURIComponent(bidId)}`, { cache: "no-store" });
      const bidJson = (await readJsonOrThrow(bidRes)) as BidGet;

      if (!bidJson?.data?.id) {
        throw new Error(bidJson?.error || "Bid not found.");
      }

      setBid(bidJson.data);
    } catch (e: any) {
      setError(e?.message || "Load failed");
      setBid(null);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(nextStatusId: number | null) {
    if (!bidId) return;
    setSavingStatus(true);
    setError(null);

    try {
      const res = await fetch(`/api/bids/${encodeURIComponent(bidId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status_id: nextStatusId }),
      });

      const json = (await readJsonOrThrow(res)) as BidGet;
      if (!json?.data?.id) {
        throw new Error(json?.error || "Failed to update status");
      }
      setBid(json.data);
    } catch (e: any) {
      setError(e?.message || "Failed to update status");
    } finally {
      setSavingStatus(false);
    }
  }

  React.useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bidId]);

  // ---- styles ----
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
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  };

  const cardStyle: React.CSSProperties = {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 18,
    background: "white",
  };

  const labelRow: React.CSSProperties = { margin: "8px 0" };

  const buttonBase: React.CSSProperties = {
    border: "1px solid #e5e7eb",
    padding: "10px 12px",
    borderRadius: 10,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    fontWeight: 600,
  };

  const greenButton: React.CSSProperties = {
    ...buttonBase,
    background: "#16a34a",
    borderColor: "#16a34a",
    color: "white",
  };

  const nextButton: React.CSSProperties = {
    ...buttonBase,
    background: "white",
    color: "#111827",
  };

  // ---- render ----
  if (loading) {
    return <div style={{ padding: 24 }}>Loading…</div>;
  }

  return (
    <div style={{ padding: 24, maxWidth: 980 }}>
      {/* Single Header */}
      <h1 style={{ marginBottom: 6 }}>AtlasBid</h1>
      <div style={{ color: "#6b7280", marginBottom: 14 }}>
        Bid ID: <span style={{ fontFamily: "monospace" }}>{bidId}</span>
      </div>

      {/* Single Tabs Row */}
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

      {/* Error */}
      {error ? (
        <div
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            padding: 14,
            borderRadius: 12,
            marginBottom: 14,
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
      ) : null}

      {/* Main Card */}
      <div style={cardStyle}>
        {!bid ? (
          <div style={{ color: "#b91c1c", fontWeight: 600 }}>Bid not found.</div>
        ) : (
          <>
            <div style={labelRow}>
              <strong>Client:</strong> {safeJoinName(bid.client_name, bid.client_last_name)}
            </div>

            <div style={labelRow}>
              <strong>Division:</strong>{" "}
              {bid.division_id
                ? divisionNameById.get(bid.division_id) ?? bid.division_id
                : "—"}
            </div>

            {/* Status Dropdown */}
            <div style={{ ...labelRow, display: "flex", alignItems: "center", gap: 10 }}>
              <strong>Status:</strong>
              <select
                value={bid.status_id ?? ""}
                disabled={savingStatus}
                onChange={(e) => {
                  const v = e.target.value;
                  updateStatus(v === "" ? null : Number(v));
                }}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: "8px 10px",
                  background: "white",
                  minWidth: 220,
                  cursor: savingStatus ? "not-allowed" : "pointer",
                }}
              >
                <option value="">{`(None)`}</option>
                {statuses.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name}
                  </option>
                ))}
              </select>

              {savingStatus ? (
                <span style={{ color: "#6b7280", fontSize: 13 }}>Saving…</span>
              ) : null}
            </div>

            <div style={labelRow}>
              <strong>Internal Notes:</strong> {bid.internal_notes ?? "None"}
            </div>

            <div style={{ ...labelRow, marginBottom: 16 }}>
              <strong>Created At:</strong> {fmtDate(bid.created_at)}
            </div>

            {/* Footer Actions */}
            <div style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
              <Link href="/atlasbid/bids" style={greenButton}>
                Back to bids
              </Link>

              <Link href={`${base}/scope`} style={nextButton}>
                Next → Scope
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
