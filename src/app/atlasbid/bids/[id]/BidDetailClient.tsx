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

async function readJsonOrThrow(res: Response) {
  const text = await res.text();
  const looksLikeHtml = /^\s*</.test(text) && /<!doctype|<html/i.test(text);

  if (!res.ok) {
    if (looksLikeHtml) {
      throw new Error(
        `Request failed (HTTP ${res.status}) and returned HTML. Likely a bad API route.`
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
    throw new Error(`Expected JSON but got HTML.`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Response was not valid JSON.`);
  }
}

async function fetchBidById(bidId: string): Promise<BidRecord> {
  const res = await fetch(`/api/bids/${encodeURIComponent(bidId)}`, {
    cache: "no-store",
  });

  const json = (await readJsonOrThrow(res)) as ApiBidByIdResponse;

  const bid = json?.data;
  if (!bid?.id) throw new Error("Bid not found.");

  return bid;
}

async function patchBidStatus(
  bidId: string,
  status_id: number | null
): Promise<BidRecord> {
  const res = await fetch(`/api/bids/${encodeURIComponent(bidId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status_id }),
  });

  const json = (await readJsonOrThrow(res)) as ApiBidByIdResponse;

  if (!json?.data?.id) throw new Error("Status update failed.");

  return json.data;
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

  async function loadAll() {
    setLoading(true);
    setError(null);

    try {
      if (!effectiveBidId) throw new Error("Invalid bid id.");

      const divRes = await fetch("/api/labor-rates", { cache: "no-store" });
      const divJson = (await readJsonOrThrow(divRes)) as LaborRatesGet;
      setDivisions(divJson?.divisions ?? []);

      const statusRes = await fetch("/api/statuses", { cache: "no-store" });
      const statusJson = (await readJsonOrThrow(statusRes)) as StatusesGet;
      setStatuses(statusJson?.data ?? []);

      const b = await fetchBidById(effectiveBidId);
      setBid(b);
    } catch (e: any) {
      setError(e?.message || "Load failed");
      setBid(null);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    loadAll();
  }, [effectiveBidId]);

  if (loading) {
    return <div>Loading…</div>;
  }

  if (error) {
    return (
      <div className="text-red-600">
        {error}
        <div className="mt-2">
          <button onClick={loadAll} className="rounded border px-3 py-1">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!bid) {
    return <div className="text-red-600">Bid not found.</div>;
  }

  const divId = bid.division_id ?? "";
  const divName = divId ? divisionNameById.get(divId) ?? divId : "—";

  return (
    <div className="space-y-4">
      <div>
        <strong>Client:</strong>{" "}
        {safeJoinName(bid.client_name, bid.client_last_name)}
      </div>

      <div>
        <strong>Division:</strong> {divName}
      </div>

      <div>
        <strong>Status:</strong>
        <div className="mt-1">
          <select
            value={bid.status_id ?? ""}
            disabled={savingStatus}
            onChange={async (e) => {
              const v = e.target.value;
              const next = v === "" ? null : Number(v);

              setBid((prev) => (prev ? { ...prev, status_id: next } : prev));

              try {
                setSavingStatus(true);
                const updated = await patchBidStatus(effectiveBidId, next);
                setBid(updated);
              } catch (err: any) {
                setError(err?.message || "Status update failed");
              } finally {
                setSavingStatus(false);
              }
            }}
            className="ml-2 rounded border px-2 py-1"
          >
            <option value="">(None)</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <span className="ml-2 text-sm text-gray-500">
            Current:{" "}
            {bid.status_id
              ? statusNameById.get(bid.status_id) ?? bid.status_id
              : "(None)"}
          </span>
        </div>
      </div>

      <div>
        <strong>Internal Notes:</strong> {bid.internal_notes ?? "None"}
      </div>

      <div>
        <strong>Created At:</strong> {fmtDate(bid.created_at)}
      </div>

      <div className="flex gap-3 pt-3">
        <Link
          href="/atlasbid/bids"
          className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
        >
          Back to bids
        </Link>

        <Link
          href={`/atlasbid/bids/${effectiveBidId}/scope`}
          className="rounded bg-gray-900 px-4 py-2 text-white hover:bg-black"
        >
          Next →
        </Link>
      </div>
    </div>
  );
}
