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
  customer_name?: string | null;
  client_name?: string | null;
  client_last_name?: string | null;
  division_id?: string | null;
  status_id?: number | null;
  internal_notes?: string | null;
  address?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
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

function displayClientName(bid?: BidRecord | null) {
  const company = String(bid?.customer_name ?? "").trim();
  if (company) return company;
  return safeJoinName(bid?.client_name, bid?.client_last_name);
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
    throw new Error(
      `Expected JSON but got HTML. Likely a bad API route or redirect.`
    );
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
  if (!bid?.id) throw new Error("Bid not found.");
  return bid;
}

async function patchBid(
  bidId: string,
  payload: Partial<BidRecord>
): Promise<BidRecord> {
  const res = await fetch(`/api/bids/${encodeURIComponent(bidId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  const json = (await readJsonOrThrow(res)) as ApiBidByIdResponse;
  const bid = json?.data;
  if (!bid?.id) throw new Error("Bid update failed.");
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
  const [savingDetails, setSavingDetails] = React.useState(false);
  const [saveMessage, setSaveMessage] = React.useState<string | null>(null);

  const [form, setForm] = React.useState({
    customer_name: "",
    client_name: "",
    client_last_name: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    zip: "",
    internal_notes: "",
    status_id: "",
  });

  const cardStyle: React.CSSProperties = {
    border: "1px solid #d7e6db",
    borderRadius: 12,
    padding: 18,
    background: "white",
  };

  const btnStyle: React.CSSProperties = {
    border: "1px solid #e5e7eb",
    background: "white",
    padding: "10px 14px",
    borderRadius: 10,
    cursor: "pointer",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "10px 12px",
    background: "white",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: 6,
    fontWeight: 600,
    color: "#374151",
    fontSize: 14,
  };

  const backBtnStyle: React.CSSProperties = {
    ...btnStyle,
    border: "1px solid #16a34a",
    background: "#16a34a",
    color: "white",
    textDecoration: "none",
    display: "inline-block",
    fontWeight: 600,
  };

  const nextBtnStyle: React.CSSProperties = {
    ...btnStyle,
    border: "1px solid #123b1f",
    background: "#123b1f",
    color: "white",
    textDecoration: "none",
    display: "inline-block",
    fontWeight: 600,
  };

  const saveBtnStyle: React.CSSProperties = {
    ...btnStyle,
    border: "1px solid #111827",
    background: "#111827",
    color: "white",
    fontWeight: 600,
  };

  const base = `/atlasbid/bids/${effectiveBidId}`;

  function syncFormFromBid(nextBid: BidRecord) {
    setForm({
      customer_name: String(nextBid.customer_name ?? "").trim(),
      client_name: String(nextBid.client_name ?? "").trim(),
      client_last_name: String(nextBid.client_last_name ?? "").trim(),
      address1: String(nextBid.address1 ?? nextBid.address ?? "").trim(),
      address2: String(nextBid.address2 ?? "").trim(),
      city: String(nextBid.city ?? "").trim(),
      state: String(nextBid.state ?? "").trim(),
      zip: String(nextBid.zip ?? "").trim(),
      internal_notes: String(nextBid.internal_notes ?? "").trim(),
      status_id:
        nextBid.status_id === null || nextBid.status_id === undefined
          ? ""
          : String(nextBid.status_id),
    });
  }

  async function loadAll() {
    setLoading(true);
    setError(null);
    setSaveMessage(null);

    try {
      if (!effectiveBidId) throw new Error(`Missing bid id.`);

      const divRes = await fetch("/api/labor-rates", { cache: "no-store" });
      const divJson = (await readJsonOrThrow(divRes)) as LaborRatesGet;
      setDivisions(Array.isArray(divJson?.divisions) ? divJson.divisions : []);

      const stRes = await fetch("/api/statuses", { cache: "no-store" });
      const stJson = (await readJsonOrThrow(stRes)) as StatusesGet;
      setStatuses(Array.isArray(stJson?.data) ? stJson.data : []);

      const b = await fetchBidById(effectiveBidId);
      setBid(b);
      syncFormFromBid(b);
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

  const divId = bid?.division_id ?? "";
  const divName = divId ? divisionNameById.get(divId) ?? divId : "—";

  const computedDisplayName = React.useMemo(() => {
    return displayClientName({
      customer_name: form.customer_name,
      client_name: form.client_name,
      client_last_name: form.client_last_name,
    } as BidRecord);
  }, [form.customer_name, form.client_name, form.client_last_name]);

  async function handleSaveDetails() {
    if (!bid) return;

    setSavingDetails(true);
    setError(null);
    setSaveMessage(null);

    try {
      const payload = {
        customer_name: form.customer_name.trim() || null,
        client_name: form.client_name.trim() || null,
        client_last_name: form.client_last_name.trim() || null,
        address1: form.address1.trim() || null,
        address2: form.address2.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        zip: form.zip.trim() || null,
        internal_notes: form.internal_notes.trim() || null,
        status_id:
          form.status_id === "" ? null : Number(form.status_id),
      };

      const updated = await patchBid(effectiveBidId, payload);
      setBid(updated);
      syncFormFromBid(updated);
      setSaveMessage("Details saved.");
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSavingDetails(false);
    }
  }
