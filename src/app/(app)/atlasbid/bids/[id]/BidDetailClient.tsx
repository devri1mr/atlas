// src/app/atlasbid/bids/[id]/BidDetailClient.tsx
"use client";

import * as React from "react";
import Link from "next/link";

type Division = { id: string; name: string };
type Status = { id: number; name: string; color?: string | null };
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

function cleanText(value?: string | null) {
  const s = String(value ?? "").trim();
  if (!s || s.toLowerCase() === "null" || s.toLowerCase() === "undefined") return "";
  return s;
}

async function readJsonOrThrow(res: Response) {
  const text = await res.text();
  const looksLikeHtml = /^\s*</.test(text) && /<!doctype|<html/i.test(text);
  if (!res.ok) {
    if (looksLikeHtml) throw new Error(`Request failed (HTTP ${res.status})`);
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
  const json = (await readJsonOrThrow(res)) as { data?: BidRecord };
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
  const json = (await readJsonOrThrow(res)) as { data?: BidRecord };
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

  const [form, setForm] = React.useState({
    customer_name: "", client_name: "", client_last_name: "",
    address1: "", address2: "", city: "", state: "", zip: "",
    status_id: "", division_id: "",
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
      status_id: b.status_id == null ? "" : String(b.status_id),
      division_id: cleanText(b.division_id),
    });
  }

  async function loadAll() {
    setLoading(true); setError(null);
    try {
      if (!effectiveBidId) throw new Error("Missing bid id.");
      const [divRes, stRes] = await Promise.all([
        fetch("/api/labor-rates", { cache: "no-store" }),
        fetch("/api/statuses", { cache: "no-store" }),
      ]);
      const divJson = await readJsonOrThrow(divRes) as { divisions?: Division[] };
      const stJson  = await readJsonOrThrow(stRes)  as { data?: Status[] };
      setDivisions(Array.isArray(divJson?.divisions) ? divJson.divisions : []);
      setStatuses(Array.isArray(stJson?.data) ? stJson.data : []);
      const b = await fetchBidById(effectiveBidId);
      setBid(b); syncFormFromBid(b);
    } catch (e: any) {
      setBid(null); setError(e?.message || "Load failed");
    } finally { setLoading(false); }
  }

  React.useEffect(() => { loadAll(); }, [effectiveBidId]);

  async function handleSave() {
    if (!bid) return;
    setSaving(true); setError(null); setSaveMessage(null);
    try {
      const updated = await patchBid(effectiveBidId, {
        customer_name:   form.customer_name.trim()   || null,
        client_name:     form.client_name.trim()     || null,
        client_last_name: form.client_last_name.trim() || null,
        address1:        form.address1.trim()        || null,
        address2:        form.address2.trim()        || null,
        city:            form.city.trim()            || null,
        state:           form.state.trim()           || null,
        zip:             form.zip.trim()             || null,
        status_id:  form.status_id  === "" ? null : Number(form.status_id),
        division_id: form.division_id || null,
      });
      setBid(updated); syncFormFromBid(updated);
      setSaveMessage("Saved");
      setTimeout(() => setSaveMessage(null), 2500);
    } catch (e: any) { setError(e?.message || "Save failed"); }
    finally { setSaving(false); }
  }

  const inp = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all";
  const lbl = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1";

  return (
    <div className="space-y-4 max-w-2xl">
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : error && !bid ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{error}</div>
      ) : !bid ? (
        <div className="text-red-600 text-sm p-4">Bid not found.</div>
      ) : (
        <>
          {error      && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
          {saveMessage && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Saved
            </div>
          )}

          {/* Single compact form card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-5 space-y-5">

            {/* Client */}
            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Client</p>
              <div>
                <label className={lbl}>Account Name <span className="text-gray-300 font-normal normal-case tracking-normal">(company, HOA…)</span></label>
                <input className={inp} value={form.customer_name} placeholder="ABC Property Management"
                  onChange={e => setForm(p => ({ ...p, customer_name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>First Name</label>
                  <input className={inp} value={form.client_name} placeholder="John"
                    onChange={e => setForm(p => ({ ...p, client_name: e.target.value }))} />
                </div>
                <div>
                  <label className={lbl}>Last Name</label>
                  <input className={inp} value={form.client_last_name} placeholder="Smith"
                    onChange={e => setForm(p => ({ ...p, client_last_name: e.target.value }))} />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-50" />

            {/* Location */}
            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Job Location</p>
              <input className={inp} value={form.address1} placeholder="Address"
                onChange={e => setForm(p => ({ ...p, address1: e.target.value }))} />
              <input className={inp} value={form.address2} placeholder="Suite, unit… (optional)"
                onChange={e => setForm(p => ({ ...p, address2: e.target.value }))} />
              <div className="grid grid-cols-5 gap-3">
                <div className="col-span-3">
                  <label className={lbl}>City</label>
                  <input className={inp} value={form.city} placeholder="Saginaw"
                    onChange={e => setForm(p => ({ ...p, city: e.target.value }))} />
                </div>
                <div>
                  <label className={lbl}>State</label>
                  <input className={inp} value={form.state} placeholder="MI"
                    onChange={e => setForm(p => ({ ...p, state: e.target.value }))} />
                </div>
                <div>
                  <label className={lbl}>ZIP</label>
                  <input className={inp} value={form.zip} placeholder="48604"
                    onChange={e => setForm(p => ({ ...p, zip: e.target.value }))} />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-50" />

            {/* Division + Status */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Division</label>
                <select className={inp} value={form.division_id} disabled={saving}
                  onChange={e => setForm(p => ({ ...p, division_id: e.target.value }))}>
                  <option value="">(None)</option>
                  {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Status</label>
                <select className={inp} value={form.status_id} disabled={saving}
                  onChange={e => setForm(p => ({ ...p, status_id: e.target.value }))}>
                  <option value="">(None)</option>
                  {statuses.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3 pb-8">
            <button onClick={handleSave} disabled={saving}
              className="bg-[#123b1f] text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-[#1a5c2e] disabled:opacity-60 transition-colors text-sm">
              {saving ? "Saving…" : "Save"}
            </button>
            <Link href="/atlasbid/bids"
              className="bg-white border border-gray-200 text-gray-700 font-semibold px-5 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-sm">
              Cancel
            </Link>
            <Link href={`/atlasbid/bids/${effectiveBidId}/photos`}
              className="ml-auto flex items-center gap-2 bg-emerald-600 text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-emerald-700 transition-colors text-sm">
              Photos
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
