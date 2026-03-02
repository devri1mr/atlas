"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type Bid = {
  id: string;
  client_name: string;
  client_last_name: string;
  status_id: number | null;
  internal_notes: string | null;
  created_at: string;
};

type Status = {
  id: number;
  name: string;
  color: string;
};

export default function BidDetailClient({ bidId }: { bidId?: string }) {
  const params = useParams();

  // Grab id from either prop OR URL
  const idFromUrl = useMemo(() => {
    const raw = (params as any)?.id;
    if (Array.isArray(raw)) return raw[0] ?? "";
    return typeof raw === "string" ? raw : "";
  }, [params]);

  const effectiveBidId =
    bidId && bidId.trim().length > 0 ? bidId.trim() : idFromUrl;

  const [bid, setBid] = useState<Bid | null>(null);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // status saving UI
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusSaveError, setStatusSaveError] = useState<string | null>(null);

  const currentStatus = useMemo(() => {
    if (!bid?.status_id) return null;
    return statuses.find((s) => s.id === bid.status_id) ?? null;
  }, [bid?.status_id, statuses]);

  useEffect(() => {
    if (!effectiveBidId) {
      setError("Missing bid id in the URL (id is empty).");
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    async function load() {
      try {
        setLoading(true);
        setError(null);

        // Load bid + statuses together
        const [bidRes, statusesRes] = await Promise.all([
          fetch(`/api/bids/${effectiveBidId}`, {
            cache: "no-store",
            signal: controller.signal,
          }),
          fetch(`/api/statuses`, {
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);

        const bidJson = await bidRes.json();
        const statusesJson = await statusesRes.json();

        if (!bidRes.ok) {
          throw new Error(bidJson?.error || "Failed to load bid");
        }
        if (!statusesRes.ok) {
          throw new Error(statusesJson?.error || "Failed to load statuses");
        }

        setBid(bidJson.data ?? null);
        setStatuses(statusesJson.data ?? []);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setError(err?.message || "Network error");
        setBid(null);
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [effectiveBidId]);

  async function updateStatus(nextStatusId: number | null) {
    if (!bid) return;

    setSavingStatus(true);
    setStatusSaveError(null);

    const prevStatusId = bid.status_id;

    // optimistic UI
    setBid({ ...bid, status_id: nextStatusId });

    try {
      const res = await fetch(`/api/bids/${bid.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status_id: nextStatusId }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Failed to update status");
      }

      setBid(json.data ?? null);
    } catch (err: any) {
      // rollback
      setBid({ ...bid, status_id: prevStatusId });
      setStatusSaveError(err?.message || "Failed to update status");
    } finally {
      setSavingStatus(false);
    }
  }

  if (loading) {
    return <div style={{ padding: 24 }}>Loading...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: "red" }}>{error}</div>
        <br />
        <Link href="/atlasbid/bids" style={{ cursor: "pointer" }}>
          Back to bids
        </Link>
      </div>
    );
  }

  if (!bid) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: "red" }}>Bid not found</div>
        <br />
        <Link href="/atlasbid/bids" style={{ cursor: "pointer" }}>
          Back to bids
        </Link>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h1>Bid Detail</h1>

      <p>
        <strong>Client:</strong> {bid.client_name} {bid.client_last_name}
      </p>

      {/* Status Dropdown */}
      <div style={{ marginTop: 16, marginBottom: 16 }}>
        <div style={{ marginBottom: 6 }}>
          <strong>Status</strong>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <select
            value={bid.status_id ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              updateStatus(v === "" ? null : Number(v));
            }}
            disabled={savingStatus}
            style={{
              padding: "8px 10px",
              minWidth: 240,
              cursor: savingStatus ? "not-allowed" : "pointer",
            }}
          >
            <option value="">(None)</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Badge */}
          {currentStatus && (
            <span
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                background: currentStatus.color,
                color: "white",
                fontSize: 12,
                fontWeight: 700,
              }}
              title={currentStatus.color}
            >
              {currentStatus.name}
            </span>
          )}

          {savingStatus && (
            <span style={{ fontSize: 13, color: "#666" }}>Saving…</span>
          )}
        </div>

        {statusSaveError && (
          <div style={{ marginTop: 8, color: "red" }}>{statusSaveError}</div>
        )}
      </div>

      <p>
        <strong>Internal Notes:</strong> {bid.internal_notes ?? "None"}
      </p>

      <p>
        <strong>Created At:</strong>{" "}
        {new Date(bid.created_at).toLocaleString()}
      </p>

      <br />
      <Link href="/atlasbid/bids" style={{ cursor: "pointer" }}>
        Back to bids
      </Link>
    </div>
  );
}
