// src/app/atlasbid/bids/[id]/BidDetailClient.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
  sell_rounded?: number | null;
  prepay_enabled?: boolean | null;
  prepay_price?: number | null;
  project_name?: string | null;
};
type LaborRow = {
  id: string;
  task: string;
  proposal_text?: string | null;
  proposal_section?: string | null;
  bundle_run_id?: string | null;
  show_as_line_item?: boolean | null;
  hidden_from_proposal?: boolean | null;
  man_hours?: number | null;
  hourly_rate?: number | null;
};
type BundleRunMeta = { id: string; bundle_name: string };

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
  const pathname = usePathname();
  const effectiveBidId = React.useMemo(() => String(bidId || "").trim(), [bidId]);
  const base = `/atlasbid/bids/${effectiveBidId}`;

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [bid, setBid] = React.useState<BidRecord | null>(null);
  const [divisions, setDivisions] = React.useState<Division[]>([]);
  const [statuses, setStatuses] = React.useState<Status[]>([]);
  const [labor, setLabor] = React.useState<LaborRow[]>([]);
  const [bundlesMeta, setBundlesMeta] = React.useState<BundleRunMeta[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [saveMessage, setSaveMessage] = React.useState<string | null>(null);
  const [copiedField, setCopiedField] = React.useState<string | null>(null);

  const [form, setForm] = React.useState({
    customer_name: "", client_name: "", client_last_name: "",
    address1: "", address2: "", city: "", state: "", zip: "",
    internal_notes: "", status_id: "", division_id: "",
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
      const [divRes, stRes, laborRes, brRes] = await Promise.all([
        fetch("/api/labor-rates", { cache: "no-store" }),
        fetch("/api/statuses", { cache: "no-store" }),
        fetch(`/api/atlasbid/bid-labor?bid_id=${effectiveBidId}`, { cache: "no-store" }),
        fetch(`/api/atlasbid/bundle-runs?bid_id=${effectiveBidId}`, { cache: "no-store" }),
      ]);
      const divJson = await readJsonOrThrow(divRes) as { divisions?: Division[] };
      const stJson = await readJsonOrThrow(stRes) as { data?: Status[] };
      const laborJson = await readJsonOrThrow(laborRes) as { data?: LaborRow[]; rows?: LaborRow[] };
      const brJson = await readJsonOrThrow(brRes) as { rows?: BundleRunMeta[] };
      setDivisions(Array.isArray(divJson?.divisions) ? divJson.divisions : []);
      setStatuses(Array.isArray(stJson?.data) ? stJson.data : []);
      const laborRows = laborJson?.data ?? laborJson?.rows ?? [];
      setLabor(Array.isArray(laborRows) ? laborRows : []);
      setBundlesMeta(Array.isArray(brJson?.rows) ? brJson.rows : []);
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
      setSaveMessage("Saved");
      setTimeout(() => setSaveMessage(null), 2500);
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const workflowSteps = [
    { label: "Overview", href: base },
    { label: "Scope", href: `${base}/scope` },
    { label: "Pricing", href: `${base}/pricing` },
    { label: "Photos", href: `${base}/photos` },
    { label: "Proposal", href: `${base}/proposal` },
  ];

  const inputCls = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all";
  const labelCls = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5";

  // ── SAP panel helpers ────────────────────────────────────────────────────
  const isApproved = React.useMemo(() => {
    const s = statuses.find(s => s.id === Number(form.status_id));
    return s?.name?.toLowerCase() === "approved";
  }, [statuses, form.status_id]);

  const bundleNameMap = React.useMemo(() => new Map(bundlesMeta.map(b => [b.id, b.bundle_name])), [bundlesMeta]);

  const sapLineItems = React.useMemo(() => {
    const seen = new Set<string>();
    const items: { label: string; cost: number }[] = [];
    for (const row of labor) {
      if (row.hidden_from_proposal) continue;
      const brid = row.bundle_run_id;
      const sec = row.proposal_section?.trim();
      const key = brid ? `bundle:${brid}` : sec ? `sec:${sec}` : `row:${row.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const label = brid
        ? (bundleNameMap.get(brid) ?? row.task)
        : sec ?? row.proposal_text ?? row.task;
      const cost = (row.man_hours ?? 0) * (row.hourly_rate ?? 0);
      items.push({ label, cost });
    }
    return items;
  }, [labor, bundleNameMap]);

  const totalSell = bid?.sell_rounded ?? 0;
  const sapTotal = (bid?.prepay_enabled && (bid?.prepay_price ?? 0) > 0)
    ? Number(bid.prepay_price)
    : totalSell;

  // Pro-rate sell price across line items by cost
  const sapItemsWithAmounts = React.useMemo(() => {
    const totalCost = sapLineItems.reduce((s, r) => s + r.cost, 0);
    const rounded = Math.round(sapTotal);
    if (!sapLineItems.length) return [];
    let run = 0;
    return sapLineItems.map((r, i) => {
      if (i === sapLineItems.length - 1) return { ...r, amount: rounded - run };
      const a = totalCost > 0 ? Math.round((r.cost / totalCost) * rounded) : Math.floor(rounded / sapLineItems.length);
      run += a;
      return { ...r, amount: a };
    });
  }, [sapLineItems, sapTotal]);

  function copyField(value: string, key: string) {
    navigator.clipboard.writeText(value);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 1800);
  }

  function buildSapText() {
    const name = computedDisplayName;
    const addr = [form.address1, form.address2, form.city && form.state ? `${form.city}, ${form.state}` : form.city || form.state, form.zip].filter(Boolean).join("\n");
    const lines = sapItemsWithAmounts.map(r => `  • ${r.label}: $${r.amount.toLocaleString()}`).join("\n");
    return `CLIENT: ${name}\nADDRESS:\n${addr}\n\nSERVICES:\n${lines}\n\nTOTAL: $${Math.round(sapTotal).toLocaleString()}`;
  }

  function CopyBtn({ value, id }: { value: string; id: string }) {
    const copied = copiedField === id;
    return (
      <button
        onClick={() => copyField(value, id)}
        className={`ml-2 shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-md transition-colors ${copied ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
      >
        {copied ? "✓" : "Copy"}
      </button>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f4f0]">
      {/* Page header */}
      <div className="bg-white border-b border-gray-100">
        <div className="px-4 md:px-8 pt-4 pb-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm mb-3">
            <Link href="/atlasbid/bids" className="text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              All Bids
            </Link>
            <span className="text-gray-200">›</span>
            <span className="text-gray-700 font-medium truncate max-w-[200px]">
              {loading ? "…" : computedDisplayName}
            </span>
          </div>

        </div>
      </div>

      {/* Content */}
      <div className="px-4 md:px-8 py-6 max-w-3xl space-y-4">
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}
          </div>
        ) : error && !bid ? (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{error}</div>
        ) : !bid ? (
          <div className="text-red-600 text-sm p-4">Bid not found.</div>
        ) : (
          <>
            {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
            {saveMessage && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              {saveMessage}
            </div>}

            {/* ── SAP Entry Panel ── */}
            {isApproved && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-emerald-200 bg-emerald-100/60">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📋</span>
                    <span className="font-bold text-emerald-900 text-sm">Enter in Service AutoPilot</span>
                  </div>
                  <button
                    onClick={() => copyField(buildSapText(), "all")}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${copiedField === "all" ? "bg-emerald-600 text-white" : "bg-emerald-700 text-white hover:bg-emerald-800"}`}
                  >
                    {copiedField === "all" ? "✓ Copied!" : "Copy All"}
                  </button>
                </div>
                <div className="px-5 py-4 space-y-3 text-sm">
                  {/* Client */}
                  <div>
                    <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide mb-1">Client Name</div>
                    <div className="flex items-center">
                      <span className="font-semibold text-gray-900">{computedDisplayName}</span>
                      <CopyBtn value={computedDisplayName} id="name" />
                    </div>
                    {form.customer_name && (form.client_name || form.client_last_name) && (
                      <div className="flex items-center mt-1 text-gray-500 text-xs">
                        <span>Contact: {[form.client_name, form.client_last_name].filter(Boolean).join(" ")}</span>
                        <CopyBtn value={[form.client_name, form.client_last_name].filter(Boolean).join(" ")} id="contact" />
                      </div>
                    )}
                  </div>

                  {/* Address */}
                  {form.address1 && (
                    <div>
                      <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide mb-1">Service Address</div>
                      <div className="space-y-0.5">
                        <div className="flex items-center">
                          <span className="text-gray-900">{form.address1}</span>
                          <CopyBtn value={form.address1} id="addr1" />
                        </div>
                        {form.address2 && (
                          <div className="flex items-center">
                            <span className="text-gray-500">{form.address2}</span>
                            <CopyBtn value={form.address2} id="addr2" />
                          </div>
                        )}
                        {(form.city || form.state || form.zip) && (
                          <div className="flex items-center">
                            <span className="text-gray-900">
                              {[form.city, form.state].filter(Boolean).join(", ")}{form.zip ? ` ${form.zip}` : ""}
                            </span>
                            <CopyBtn value={[form.city, form.state].filter(Boolean).join(", ") + (form.zip ? ` ${form.zip}` : "")} id="citystatezip" />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Line items */}
                  {sapItemsWithAmounts.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide mb-1">Services / Line Items</div>
                      <div className="space-y-1">
                        {sapItemsWithAmounts.map((r, i) => (
                          <div key={i} className="flex items-center justify-between gap-2">
                            <span className="text-gray-800 flex-1">{r.label}</span>
                            <div className="flex items-center shrink-0">
                              <span className="font-semibold text-gray-900 tabular-nums">${r.amount.toLocaleString()}</span>
                              <CopyBtn value={r.amount.toString()} id={`item-${i}`} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Total */}
                  <div className="pt-2 border-t border-emerald-200 flex items-center justify-between">
                    <span className="font-bold text-emerald-900">Total</span>
                    <div className="flex items-center">
                      <span className="font-bold text-emerald-900 text-base tabular-nums">${Math.round(sapTotal).toLocaleString()}</span>
                      <CopyBtn value={Math.round(sapTotal).toString()} id="total" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Client name preview */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Client / Account</div>
              <div className="text-2xl font-bold text-gray-900">{computedDisplayName}</div>
            </div>

            {/* Client info */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-5 space-y-4">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Client Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Account Name <span className="text-gray-300 font-normal normal-case tracking-normal">(company, HOA…)</span></label>
                  <input className={inputCls} value={form.customer_name} placeholder="ABC Property Management"
                    onChange={e => setForm(p => ({ ...p, customer_name: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>First Name</label>
                  <input className={inputCls} value={form.client_name} placeholder="John"
                    onChange={e => setForm(p => ({ ...p, client_name: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Last Name</label>
                  <input className={inputCls} value={form.client_last_name} placeholder="Smith"
                    onChange={e => setForm(p => ({ ...p, client_last_name: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Job Location */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-5 space-y-4">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Job Location</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Address Line 1</label>
                  <input className={inputCls} value={form.address1} placeholder="123 Main St"
                    onChange={e => setForm(p => ({ ...p, address1: e.target.value }))} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Address Line 2 <span className="text-gray-300 font-normal normal-case tracking-normal">(optional)</span></label>
                  <input className={inputCls} value={form.address2} placeholder="Suite, unit…"
                    onChange={e => setForm(p => ({ ...p, address2: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>City</label>
                  <input className={inputCls} value={form.city} placeholder="Saginaw"
                    onChange={e => setForm(p => ({ ...p, city: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>State</label>
                    <input className={inputCls} value={form.state} placeholder="MI"
                      onChange={e => setForm(p => ({ ...p, state: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls}>ZIP</label>
                    <input className={inputCls} value={form.zip} placeholder="48604"
                      onChange={e => setForm(p => ({ ...p, zip: e.target.value }))} />
                  </div>
                </div>
              </div>
            </div>

            {/* Bid Settings */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-5 space-y-4">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Bid Settings</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Division</label>
                  <select className={inputCls} value={form.division_id} disabled={saving}
                    onChange={e => setForm(p => ({ ...p, division_id: e.target.value }))}>
                    <option value="">(None)</option>
                    {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Status</label>
                  <select className={inputCls} value={form.status_id} disabled={saving}
                    onChange={e => setForm(p => ({ ...p, status_id: e.target.value }))}>
                    <option value="">(None)</option>
                    {statuses.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Internal Notes */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-5 space-y-3">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Internal Notes</h2>
              <textarea
                className={`${inputCls} resize-none`}
                value={form.internal_notes}
                rows={4}
                placeholder="Notes visible only to your team…"
                onChange={e => setForm(p => ({ ...p, internal_notes: e.target.value }))}
              />
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3 pb-12">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-[#123b1f] text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-[#1a5c2e] disabled:opacity-60 transition-colors text-sm"
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
              <Link href="/atlasbid/bids"
                className="bg-white border border-gray-200 text-gray-700 font-semibold px-5 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-sm">
                Cancel
              </Link>
              <Link href={`${base}/scope`}
                className="ml-auto flex items-center gap-2 bg-emerald-600 text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-emerald-700 transition-colors text-sm">
                Continue to Scope
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
