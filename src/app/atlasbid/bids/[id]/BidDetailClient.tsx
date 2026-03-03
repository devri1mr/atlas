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

type StatusesGet = {
  data?: Status[];
  error?: string;
};

type BidRecord = {
  id: string;
  client_name?: string | null;
  client_last_name?: string | null;
  division_id?: string | null;

  status_id?: number | null;
  internal_notes?: string | null;

  created_at?: string | null;
};

type ApiBidByIdResponse = {
  data?: BidRecord;
  error?: string;
};

function safeJoinName(first?: string | null, last?: string | null) {
  const parts = [first ?? "", last ?? ""]
    .map((s) => String(s).trim())
    .filter(Boolean);
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

async function fetchBidById(bidId: string): Promise<BidRecord> {
  const url = `/api/bids/${encodeURIComponent(bidId)}`;
  const res = await fetch(url, { cache: "no-store" });
  const json = (await readJsonOrThrow(res)) as ApiBidByIdResponse;

  const bid = json?.data;
  if (!bid?.id) {
    throw new Error("Bid not found.");
  }
  return bid;
}

async function patchBidStatus(bidId: string, status_id: number | null): Promise<BidRecord> {
  const res = await fetch(`/api/bids/${encodeURIComponent(bidId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ status_id }),
  });

  const json = (await readJsonOrThrow(res)) as ApiBidByIdResponse;
  const bid = json?.data;
  if (!bid?.id) throw new Error("Status update failed.");
  return bid;
}

export default function BidDetailClient({ bidId }: { bidId: string }) {
  const effectiveBidId = React.useMemo(() => String(bidId || "").trim(), [bidId]);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [bid, setBid] = React.useState<BidRecord | null>(null);

  const [divisions, setDivisions] = React.useState<Division[]>([]);
  const divisionNameById = React.useMemo(() => {
    const m = new Map<string, string>();
    divisions.forEach((d) => m.set(d.id, d.name));
    return m;
  }, [divisions]);

  const [statuses, setStatuses] = React.useState<Status[]>([]);
  const statusNameById = React.useMemo(() => {
    const m = new Map<number, string>();
    statuses.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [statuses]);

  const [savingStatus, setSavingStatus] = React.useState(false);

  const base = `/atlasbid/bids/${effectiveBidId}`;

  async function loadAll() {
    setLoading(true);
    setError(null);

    try {
      if (!effectiveBidId) {
        throw new Error(`Invalid bid id: "(empty)"`);
      }

      // Load divisions (for displaying division name)
      const divRes = await fetch("/api/labor-rates", { cache: "no-store" });
      const divJson = (await readJsonOrThrow(divRes)) as LaborRatesGet;
      setDivisions(Array.isArray(divJson?.divisions) ? divJson.divisions : []);

      // Load statuses (for status dropdown)
      const stRes = await fetch("/api/statuses", { cache: "no-store" });
      const stJson = (await readJsonOrThrow(stRes)) as StatusesGet;
      setStatuses(Array.isArray(stJson?.data) ? stJson.data : []);

      // Load bid
      const b = await fetchBidById(effectiveBidId);
      setBid(b);
    } catch (e: any) {
      setBid(null);
      setError(e?.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveBidId]);

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
    display: "inline-block",
  };

  const cardStyle: React.CSSProperties = {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 18,
    background: "white",
  };

  const btnStyle: React.CSSProperties = {
    border: "1px solid #e5e7eb",
    background: "white",
    padding: "8px 12px",
    borderRadius: 10,
    cursor: "pointer",
  };

  const backBtnStyle: React.CSSProperties = {
    ...btnStyle,
    border: "1px solid #16a34a",
    background: "#16a34a",
    color: "white",
    textDecoration: "none",
    display: "inline-block",
  };

  const nextBtnStyle: React.CSSProperties = {
    ...btnStyle,
    border: "1px solid #111827",
    background: "#111827",
    color: "white",
    textDecoration: "none",
    display: "inline-block",
  };

  if (loading) {
    return <div style={{ padding: 24 }}>Loading…</div>;
  }

  return (
    <div style={{ padding: 24, maxWidth: 980 }}>
      {/* Header (ONLY ONCE) */}
      <h1 style={{ marginBottom: 6 }}>AtlasBid</h1>
      <div style={{ color: "#6b7280", marginBottom: 14 }}>
        Bid ID:{" "}
        <span style={{ fontFamily: "monospace" }}>
          {bid?.id || effectiveBidId || "—"}
        </span>
      </div>

      {/* Tabs (ONLY ONCE) */}
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

      {/* Error state */}
      {error ? (
        <div style={{ maxWidth: 980 }}>
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
              <button onClick={loadAll} style={btnStyle}>
                Retry
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* No bid */}
      {!error && !bid ? (
        <div style={{ marginTop: 14, ...cardStyle, color: "#b91c1c" }}>
          Bid not found.
        </div>
      ) : null}

      {/* Overview card */}
      {!error && bid ? (
        <div style={cardStyle}>
          <p style={{ marginTop: 0 }}>
            <strong>Client:</strong> {safeJoinName(bid.client_name, bid.client_last_name)}
          </p>

          {(() => {
            const divId = bid.division_id ?? "";
            const divName = divId ? divisionNameById.get(divId) ?? divId : "—";
            return (
              <p>
                <strong>Division:</strong> {divName}
                {divId ? (
                  <span style={{ color: "#6b7280" }}>
                    {" "}
                    (<span style={{ fontFamily: "monospace" }}>{divId}</span>)
                  </span>
                ) : null}
              </p>
            );
          })()}

          {/* Status dropdown */}
          <div style={{ marginTop: 12, marginBottom: 12 }}>
            <div style={{ marginBottom: 6 }}>
              <strong>Status:</strong>
            </div>

            <select
              value={bid.status_id ?? ""}
              disabled={savingStatus}
              onChange={async (e) => {
                const v = e.target.value;
                const nextStatus = v === "" ? null : Number(v);

                // optimistic update
                setBid((prev) => (prev ? { ...prev, status_id: nextStatus } : prev));

                try {
                  setSavingStatus(true);
                  const updated = await patchBidStatus(effectiveBidId, nextStatus);
                  setBid(updated);
                } catch (err: any) {
                  setError(err?.message || "Status update failed");
                } finally {
                  setSavingStatus(false);
                }
              }}
              style={{
                width: 320,
                maxWidth: "100%",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: "10px 12px",
                background: "white",
              }}
            >
              <option value="">(None)</option>
              {statuses.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>

            <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
              Current: {bid.status_id ? statusNameById.get(bid.status_id) ?? `#${bid.status_id}` : "(None)"}
              {savingStatus ? " — saving…" : ""}
            </div>
          </div>

          <p>
            <strong>Internal Notes:</strong> {bid.internal_notes ?? "None"}
          </p>

          <p style={{ marginBottom: 14 }}>
            <strong>Created At:</strong> {fmtDate(bid.created_at)}
          </p>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <Link href="/atlasbid/bids" style={backBtnStyle}>
              Back to bids
            </Link>

            <Link href={`${base}/scope`} style={nextBtnStyle}>
              Next →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
