"use client";

import { useEffect, useMemo, useState } from "react";

type Bid = {
  id: string;
  client_name: string;
  client_last_name: string;
  status_id: number | null;
  internal_notes: string | null;
  created_at: string;
};

type BidStatus = {
  id: number;
  name: string;
};

type Props = {
  bidId: string;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    v
  );
}

export default function BidDetailClient({ bidId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [bid, setBid] = useState<Bid | null>(null);

  const [statuses, setStatuses] = useState<BidStatus[]>([]);
  const [statusesError, setStatusesError] = useState<string | null>(null);

  // editable fields
  const [clientFirst, setClientFirst] = useState("");
  const [clientLast, setClientLast] = useState("");
  const [statusId, setStatusId] = useState<number | null>(null);
  const [internalNotes, setInternalNotes] = useState("");

  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const validId = useMemo(() => isUuid(bidId), [bidId]);

  async function load() {
    setSaveMessage(null);
    setError(null);
    setLoading(true);

    try {
      if (!bidId || !validId) {
        setBid(null);
        setError(`Invalid bid id: ${String(bidId)}`);
        return;
      }

      const res = await fetch(`/api/bids/${encodeURIComponent(bidId)}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok) {
        setBid(null);
        setError(json?.error || "Failed to load bid.");
        return;
      }

      const b: Bid = json.data;
      setBid(b);

      setClientFirst(b.client_name ?? "");
      setClientLast(b.client_last_name ?? "");
      setStatusId(b.status_id ?? null);
      setInternalNotes(b.internal_notes ?? "");
    } catch (e: any) {
      setBid(null);
      setError(e?.message || "Failed to load bid.");
    } finally {
      setLoading(false);
    }
  }

  async function loadStatuses() {
    setStatusesError(null);

    try {
      const res = await fetch(`/api/bid-statuses`, { cache: "no-store" });
      const json = await res.json();

      if (!res.ok) {
        setStatuses([]);
        setStatusesError(json?.error || "Failed to load statuses.");
        return;
      }

      setStatuses(Array.isArray(json.data) ? json.data : []);
    } catch (e: any) {
      setStatuses([]);
      setStatusesError(e?.message || "Failed to load statuses.");
    }
  }

  useEffect(() => {
    load();
    loadStatuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bidId]);

  const createdDisplay = useMemo(() => {
    if (!bid?.created_at) return "";
    try {
      return new Date(bid.created_at).toLocaleString();
    } catch {
      return bid.created_at;
    }
  }, [bid?.created_at]);

  const selectedStatusName = useMemo(() => {
    if (statusId == null) return "—";
    const found = statuses.find((s) => s.id === statusId);
    return found ? found.name : String(statusId);
  }, [statusId, statuses]);

  async function save() {
    setSaveMessage(null);
    setError(null);

    if (!bidId || !validId) {
      setError(`Invalid bid id: ${String(bidId)}`);
      return;
    }

    // Minimal validation (keep you moving)
    const first = clientFirst.trim();
    const last = clientLast.trim();

    if (!first || !last) {
      setError("Client first and last name are required.");
      return;
    }

    setSaving(true);

    try {
      const res = await fetch(`/api/bids/${encodeURIComponent(bidId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: first,
          client_last_name: last,
          status_id: statusId, // can be null
          internal_notes: internalNotes, // empty string OK
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json?.error || "Failed to save.");
        return;
      }

      const updated: Bid = json.data;
      setBid(updated);

      setClientFirst(updated.client_name ?? "");
      setClientLast(updated.client_last_name ?? "");
      setStatusId(updated.status_id ?? null);
      setInternalNotes(updated.internal_notes ?? "");

      setSaveMessage("Saved.");
    } catch (e: any) {
      setError(e?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Bid Detail</h1>
          <div style={{ color: "#666", marginTop: 6 }}>
            View / edit basic bid info (client + status + internal notes).
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <a
            href="/atlasbid/bids"
            style={{
              display: "inline-block",
              padding: "8px 12px",
              border: "1px solid #ccc",
              borderRadius: 8,
              textDecoration: "none",
              color: "inherit",
              height: "fit-content",
            }}
          >
            Back to bids
          </a>

          <button
            type="button"
            onClick={() => load()}
            disabled={loading || saving}
            style={{
              padding: "8px 12px",
              border: "1px solid #ccc",
              borderRadius: 8,
              background: "white",
              cursor: loading || saving ? "not-allowed" : "pointer",
              height: "fit-content",
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {!validId && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 10,
            border: "1px solid #f3b4b4",
            background: "#fde7e7",
            color: "#8a1f1f",
          }}
        >
          Invalid bid id: {String(bidId)}
          <div style={{ marginTop: 6, color: "#8a1f1f" }}>
            Debug: this page must be opened at /atlasbid/bids/&lt;uuid&gt;
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 10,
            border: "1px solid #f3b4b4",
            background: "#fde7e7",
            color: "#8a1f1f",
          }}
        >
          {error}
        </div>
      )}

      {saveMessage && !error && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 10,
            border: "1px solid #b7e1c1",
            background: "#e7f7ec",
            color: "#1f6f3a",
          }}
        >
          {saveMessage}
        </div>
      )}

      {loading && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 10,
            border: "1px solid #ddd",
            background: "#fafafa",
          }}
        >
          Loading…
        </div>
      )}

      {!loading && !bid && validId && !error && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 10,
            border: "1px solid #ddd",
            background: "#fafafa",
          }}
        >
          Bid not found.
        </div>
      )}

      {!loading && bid && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "white",
          }}
        >
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 700 }}>Bid ID:</div>
            <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
              {bid.id}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>
                Client First Name
              </label>
              <input
                value={clientFirst}
                onChange={(e) => setClientFirst(e.target.value)}
                placeholder="First name"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>
                Client Last Name
              </label>
              <input
                value={clientLast}
                onChange={(e) => setClientLast(e.target.value)}
                placeholder="Last name"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                }}
              />
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>
              Status
            </label>

            <select
              value={statusId === null ? "" : String(statusId)}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") setStatusId(null);
                else setStatusId(Number(v));
              }}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #ccc",
                background: "white",
              }}
            >
              <option value="">—</option>
              {statuses.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>

            {statusesError && (
              <div style={{ marginTop: 6, color: "#8a1f1f" }}>
                Status list error: {statusesError}
              </div>
            )}

            <div style={{ marginTop: 6, color: "#666" }}>
              Selected: <strong>{selectedStatusName}</strong>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>
              Internal Notes (Option A)
            </label>
            <textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Internal notes (not client-facing)"
              rows={6}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #ccc",
                resize: "vertical",
              }}
            />
          </div>

          <div style={{ marginTop: 14, color: "#666" }}>
            <div>
              <strong>Created:</strong> {createdDisplay}
            </div>
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={save}
              disabled={saving || loading}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #0a7a3d",
                background: "#0a7a3d",
                color: "white",
                fontWeight: 700,
                cursor: saving || loading ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>

            <button
              type="button"
              onClick={() => {
                if (!bid) return;
                setClientFirst(bid.client_name ?? "");
                setClientLast(bid.client_last_name ?? "");
                setStatusId(bid.status_id ?? null);
                setInternalNotes(bid.internal_notes ?? "");
                setSaveMessage("Reverted to last saved values.");
                setError(null);
              }}
              disabled={saving || loading || !bid}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #ccc",
                background: "white",
                cursor: saving || loading ? "not-allowed" : "pointer",
              }}
            >
              Revert
            </button>
          </div>

          <div style={{ marginTop: 16, color: "#777", fontSize: 12 }}>
            Debug: this component receives the URL param via props. If bidId ever shows
            undefined again, it means the wrong route/page file is being rendered.
          </div>
        </div>
      )}
    </div>
  );
}
