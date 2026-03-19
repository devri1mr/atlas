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

type ApiBidByIdResponse = { data?: BidRecord; error?: string };

function cleanText(value?: string | null) {
  const s = String(value ?? "").trim();
  if (!s || s.toLowerCase() === "null" || s.toLowerCase() === "undefined") return "";
  return s;
}

function displayClientName(bid?: Partial<BidRecord> | null) {
  const company = cleanText(bid?.customer_name);
  if (company) return company;
  const parts = [cleanText(bid?.client_name), cleanText(bid?.client_last_name)].filter(Boolean);
  return parts.length ? parts.join(" ") : "—";
}

async function readJsonOrThrow(res: Response) {
  const text = await res.text();
  const looksLikeHtml = /^\s*</.test(text) && /<!doctype|<html/i.test(text);
  if (!res.ok) {
    if (looksLikeHtml) throw new Error(`Request failed (HTTP ${res.status}) — bad API route.`);
    try { throw new Error(JSON.parse(text || "{}")?.error || `HTTP ${res.status}`); }
    catch { throw new Error(text || `HTTP ${res.status}`); }
  }
  if (!text) return {};
  if (looksLikeHtml) throw new Error("Expected JSON but got HTML.");
  try { return JSON.parse(text); }
  catch { throw new Error("Response was not valid JSON."); }
}

async function fetchBidById(bidId: string): Promise<BidRecord> {
  const res = await fetch(`/api/bids/${encodeURIComponent(bidId)}`, { cache: "no-store" });
  const json = (await readJsonOrThrow(res)) as ApiBidByIdResponse;
  if (!json?.data?.id) throw new Error("Bid not found.");
  return json.data;
}

async function patchBid(bidId: string, payload: Partial<BidRecord>): Promise<BidRecord> {
  const res = await fetch(`/api/bids/${encodeURIComponent(bidId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(payload),
  });
  const json = (await readJsonOrThrow(res)) as ApiBidByIdResponse;
  if (!json?.data?.id) throw new Error("Bid update failed.");
  return json.data;
}

export default function BidDetailClient({ bidId }: { bidId: string }) {
  const effectiveBidId = React.useMemo(() => String(bidId || "").trim(), [bidId]);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [bid, setBid] = React.useState<BidRecord | null>(null);
  const [divisions, setDivisions] = React.useState<Division[]>([]);
  const [statuses, setStatuses] = React.useState<Status[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [saveMessage, setSaveMessage] = React.useState<string | null>(null);

  const divisionNameById = React.useMemo(() => {
    const m = new Map<string, string>();
    divisions.forEach((d) => m.set(d.id, d.name));
    return m;
  }, [divisions]);

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
    division_id: "",
  });

  function syncFormFromBid(b: BidRecord) {
    setForm({
      customer_name: cleanText(b.customer_name),
      client_name: cleanText(b.client_name),
      client_last_name: cleanText(b.client_last_name),
      address1: cleanText(b.address1 ?? b.address),
      address2: cleanText(b.address2),
      city: cleanText(b.city),
      state: cleanText(b.state),
      zip: cleanText(b.zip),
      internal_notes: cleanText(b.internal_notes),
      status_id: b.status_id == null ? "" : String(b.status_id),
      division_id: cleanText(b.division_id),
    });
  }

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      if (!effectiveBidId) throw new Error("Missing bid id.");
      const [divRes, stRes] = await Promise.all([
        fetch("/api/labor-rates", { cache: "no-store" }),
        fetch("/api/statuses", { cache: "no-store" }),
      ]);
      const divJson = (await readJsonOrThrow(divRes)) as LaborRatesGet;
      const stJson = (await readJsonOrThrow(stRes)) as StatusesGet;
      setDivisions(Array.isArray(divJson?.divisions) ? divJson.divisions : []);
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

  React.useEffect(() => { loadAll(); }, [effectiveBidId]);

  const computedDisplayName = React.useMemo(() => displayClientName({
    customer_name: form.customer_name,
    client_name: form.client_name,
    client_last_name: form.client_last_name,
  }), [form.customer_name, form.client_name, form.client_last_name]);

  async function handleSave() {
    if (!bid) return;
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    try {
      const updated = await patchBid(effectiveBidId, {
        customer_name: form.customer_name.trim() || null,
        client_name: form.client_name.trim() || null,
        client_last_name: form.client_last_name.trim() || null,
        address1: form.address1.trim() || null,
        address2: form.address2.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        zip: form.zip.trim() || null,
        internal_notes: form.internal_notes.trim() || null,
        status_id: form.status_id === "" ? null : Number(form.status_id),
        division_id: form.division_id || null,
      });
      setBid(updated);
      syncFormFromBid(updated);
      setSaveMessage("Saved successfully.");
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const base = `/atlasbid/bids/${effectiveBidId}`;

  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;

  if (error && !bid) return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">{error}</div>
    </div>
  );

  if (!bid) return <div className="p-6 text-red-600">Bid not found.</div>;

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500";
  const labelCls = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5";

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Overview banner */}
      <div className="-mx-6 -mt-6 px-8 py-4 bg-[#123b1f] text-center">
        <div className="text-2xl font-extrabold text-white uppercase tracking-[0.2em]">Overview</div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}
      {saveMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-4 py-3 text-sm">{saveMessage}</div>
      )}

      {/* Client name preview */}
      <div className="bg-[#f6f8f6] rounded-xl border border-[#d7e6db] px-6 py-4">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Client / Account</div>
        <div className="text-2xl font-extrabold text-gray-900">{computedDisplayName}</div>
      </div>

      {/* Client info */}
      <div className="bg-white rounded-xl border border-[#d7e6db] px-6 py-5 space-y-4">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b border-gray-100 pb-2">Client Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelCls}>Account Name <span className="text-gray-300 font-normal normal-case tracking-normal">(company, HOA, organization…)</span></label>
            <input className={inputCls} value={form.customer_name} placeholder="ABC Property Management"
              onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>First Name</label>
            <input className={inputCls} value={form.client_name} placeholder="John"
              onChange={(e) => setForm((p) => ({ ...p, client_name: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Last Name</label>
            <input className={inputCls} value={form.client_last_name} placeholder="Smith"
              onChange={(e) => setForm((p) => ({ ...p, client_last_name: e.target.value }))} />
          </div>
        </div>
      </div>

      {/* Address */}
      <div className="bg-white rounded-xl border border-[#d7e6db] px-6 py-5 space-y-4">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b border-gray-100 pb-2">Job Location</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelCls}>Address Line 1</label>
            <input className={inputCls} value={form.address1} placeholder="123 Main St"
              onChange={(e) => setForm((p) => ({ ...p, address1: e.target.value }))} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Address Line 2 <span className="text-gray-300 font-normal normal-case tracking-normal">(optional)</span></label>
            <input className={inputCls} value={form.address2} placeholder="Suite, unit, building…"
              onChange={(e) => setForm((p) => ({ ...p, address2: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>City</label>
            <input className={inputCls} value={form.city} placeholder="Saginaw"
              onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>State</label>
              <input className={inputCls} value={form.state} placeholder="MI"
                onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>ZIP</label>
              <input className={inputCls} value={form.zip} placeholder="48604"
                onChange={(e) => setForm((p) => ({ ...p, zip: e.target.value }))} />
            </div>
          </div>
        </div>
      </div>

      {/* Bid settings */}
      <div className="bg-white rounded-xl border border-[#d7e6db] px-6 py-5 space-y-4">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b border-gray-100 pb-2">Bid Settings</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Division</label>
            <select className={inputCls} value={form.division_id} disabled={saving}
              onChange={(e) => setForm((p) => ({ ...p, division_id: e.target.value }))}>
              <option value="">(None)</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select className={inputCls} value={form.status_id} disabled={saving}
              onChange={(e) => setForm((p) => ({ ...p, status_id: e.target.value }))}>
              <option value="">(None)</option>
              {statuses.map((s) => (
                <option key={s.id} value={String(s.id)}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Internal notes */}
      <div className="bg-white rounded-xl border border-[#d7e6db] px-6 py-5 space-y-4">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b border-gray-100 pb-2">Internal Notes</h2>
        <textarea
          className={`${inputCls} resize-vertical`}
          value={form.internal_notes}
          rows={4}
          placeholder="Notes visible only to your team…"
          onChange={(e) => setForm((p) => ({ ...p, internal_notes: e.target.value }))}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pb-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#123b1f] text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-[#1a5c2e] disabled:opacity-60 transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <Link href="/atlasbid/bids" className="bg-white border border-gray-200 text-gray-700 font-semibold px-5 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
          ← All Bids
        </Link>
        <Link href={`${base}/scope`} className="ml-auto bg-emerald-600 text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-emerald-700 transition-colors">
          Scope →
        </Link>
      </div>

    </div>
  );
}
