"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

// Map code zone boundaries (latitude) for Saginaw, MI
// F3 = north of McCarty Rd (~43.421°N)
// F2 = between McCarty and Gratiot (~43.394°N)
// F1 = south of Gratiot Rd
const MCCARTY_LAT = 43.421;
const GRATIOT_LAT = 43.394;

type BidRow = {
  id: string;
  customer_name?: string | null;
  client_name?: string | null;
  client_last_name?: string | null;
  address1?: string | null;
  address?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
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
  hidden_from_proposal?: boolean | null;
  man_hours?: number | null;
  hourly_rate?: number | null;
};

type BundleRunMeta = { id: string; bundle_name: string };

function clean(v?: string | null) {
  const s = String(v ?? "").trim();
  return s && s.toLowerCase() !== "null" ? s : "";
}

function clientName(bid: BidRow) {
  const co = clean(bid.customer_name);
  if (co) return co;
  return [clean(bid.client_name), clean(bid.client_last_name)].filter(Boolean).join(" ") || "—";
}

function inferMapCode(lat: number): "F1" | "F2" | "F3" {
  if (lat >= MCCARTY_LAT) return "F3";
  if (lat >= GRATIOT_LAT) return "F2";
  return "F1";
}

export default function SapPage() {
  const params = useParams();
  const bidId = String(params?.id ?? "");

  const [bid, setBid] = useState<BidRow | null>(null);
  const [labor, setLabor] = useState<LaborRow[]>([]);
  const [bundles, setBundles] = useState<BundleRunMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Map code
  const [mapCode, setMapCode] = useState<"F1" | "F2" | "F3" | "">("");
  const [geocoding, setGeocoding] = useState(false);
  const [geocoded, setGeocoded] = useState(false);

  // Copy state
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!bidId) return;
    Promise.all([
      fetch(`/api/bids/${bidId}`, { cache: "no-store" }).then(r => r.json()),
      fetch(`/api/atlasbid/bid-labor?bid_id=${bidId}`, { cache: "no-store" }).then(r => r.json()),
      fetch(`/api/atlasbid/bundle-runs?bid_id=${bidId}`, { cache: "no-store" }).then(r => r.json()),
    ]).then(([bidJson, laborJson, brJson]) => {
      setBid(bidJson?.data ?? bidJson?.row ?? bidJson ?? null);
      const rows = laborJson?.data ?? laborJson?.rows ?? laborJson ?? [];
      setLabor(Array.isArray(rows) ? rows : []);
      setBundles(Array.isArray(brJson?.rows) ? brJson.rows : []);
    }).catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [bidId]);

  // Auto-geocode once bid loads to suggest map code
  useEffect(() => {
    if (!bid || geocoded) return;
    const addr = [clean(bid.address1 ?? bid.address), clean(bid.city), clean(bid.state), clean(bid.zip)].filter(Boolean).join(", ");
    if (!addr) return;
    setGeocoding(true);
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}&limit=1`, {
      headers: { "User-Agent": "AtlasBid/1.0" },
    })
      .then(r => r.json())
      .then(data => {
        const lat = parseFloat(data?.[0]?.lat ?? "");
        if (!isNaN(lat)) setMapCode(inferMapCode(lat));
      })
      .catch(() => {})
      .finally(() => { setGeocoding(false); setGeocoded(true); });
  }, [bid, geocoded]);

  const bundleNameMap = useMemo(() => new Map(bundles.map(b => [b.id, b.bundle_name])), [bundles]);

  const lineItems = useMemo(() => {
    const seen = new Set<string>();
    const items: { label: string; cost: number }[] = [];
    for (const row of labor) {
      if (row.hidden_from_proposal) continue;
      const brid = row.bundle_run_id;
      const sec = row.proposal_section?.trim();
      const key = brid ? `b:${brid}` : sec ? `s:${sec}` : `r:${row.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const label = brid ? (bundleNameMap.get(brid) ?? row.task) : (sec ?? row.proposal_text ?? row.task);
      items.push({ label, cost: (row.man_hours ?? 0) * (row.hourly_rate ?? 0) });
    }
    return items;
  }, [labor, bundleNameMap]);

  const totalSell = useMemo(() => {
    if (bid?.prepay_enabled && Number(bid.prepay_price ?? 0) > 0) return Number(bid.prepay_price);
    return Number(bid?.sell_rounded ?? 0);
  }, [bid]);

  const itemsWithAmounts = useMemo(() => {
    if (!lineItems.length) return [];
    const totalCost = lineItems.reduce((s, r) => s + r.cost, 0);
    const rounded = Math.round(totalSell);
    let run = 0;
    return lineItems.map((r, i) => {
      if (i === lineItems.length - 1) return { ...r, amount: rounded - run };
      const a = totalCost > 0
        ? Math.round((r.cost / totalCost) * rounded)
        : Math.floor(rounded / lineItems.length);
      run += a;
      return { ...r, amount: a };
    });
  }, [lineItems, totalSell]);

  function copy(value: string, key: string) {
    navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1800);
  }

  function CopyBtn({ value, id: key }: { value: string; id: string }) {
    const isCopied = copied === key;
    return (
      <button
        onClick={() => copy(value, key)}
        className={`ml-2 shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
          isCopied
            ? "bg-emerald-600 border-emerald-600 text-white"
            : "bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
        }`}
      >
        {isCopied ? "✓" : "Copy"}
      </button>
    );
  }

  function Field({ label, value, id, mono }: { label: string; value: string; id: string; mono?: boolean }) {
    return (
      <div className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-50 last:border-0">
        <div className="min-w-0">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">{label}</div>
          <div className={`text-sm text-gray-900 ${mono ? "font-mono" : "font-medium"} ${!value ? "text-gray-300 italic" : ""}`}>
            {value || "—"}
          </div>
        </div>
        {value && <CopyBtn value={value} id={id} />}
      </div>
    );
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading…</div>;
  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;
  if (!bid) return <div className="p-6 text-sm text-gray-400">Bid not found.</div>;

  const firstName = clean(bid.client_name);
  const lastName = clean(bid.client_last_name);
  const company = clean(bid.customer_name);
  const addr1 = clean(bid.address1 ?? bid.address);
  const addr2 = clean(bid.address2);
  const city = clean(bid.city);
  const state = clean(bid.state);
  const zip = clean(bid.zip);

  const mapCodeZoneLabel = mapCode === "F3"
    ? "North of McCarty Rd"
    : mapCode === "F2"
    ? "Between McCarty & Gratiot"
    : mapCode === "F1"
    ? "South of Gratiot Rd"
    : "";

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-10">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Service AutoPilot Entry</h2>
          <p className="text-xs text-gray-400 mt-0.5">Copy each field directly into SAP's Add Client form</p>
        </div>
        <button
          onClick={() => {
            const lines = [
              company && `Company: ${company}`,
              firstName && `First: ${firstName}`,
              lastName && `Last: ${lastName}`,
              addr1 && `Address: ${addr1}`,
              addr2 && `Address 2: ${addr2}`,
              zip && `Postal Code: ${zip}`,
              city && `City: ${city}`,
              state && `State: ${state}`,
              mapCode && `Map Code: ${mapCode}`,
              "",
              "SERVICES:",
              ...itemsWithAmounts.map(r => `  ${r.label}: $${r.amount.toLocaleString()}`),
              "",
              `TOTAL: $${Math.round(totalSell).toLocaleString()}`,
            ].filter((s): s is string => typeof s === "string").join("\n");
            copy(lines, "__all__");
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
            copied === "__all__"
              ? "bg-emerald-600 text-white"
              : "bg-[#123b1f] text-white hover:bg-[#1a5c2e]"
          }`}
        >
          {copied === "__all__" ? "✓ Copied!" : "Copy All"}
        </button>
      </div>

      {/* Client Name */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Client Name</span>
          <span className="ml-2 text-[10px] text-gray-400">SAP: First Name · Last Name · Client Name / Company Name</span>
        </div>
        <div className="px-5 divide-y divide-gray-50">
          <Field label="First Name" value={firstName} id="first" />
          <Field label="Last Name" value={lastName} id="last" />
          <Field label="Client Name / Company Name" value={company} id="company" />
        </div>
      </div>

      {/* Service Address */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Service Address</span>
        </div>
        <div className="px-5 divide-y divide-gray-50">
          <Field label="Address" value={addr1} id="addr1" />
          {addr2 && <Field label="Address (continued)" value={addr2} id="addr2" />}
          <Field label="Postal Code" value={zip} id="zip" />
          <Field label="City" value={city} id="city" />
          <Field label="State" value={state} id="state" />

          {/* Map Code — special field */}
          <div className="py-2.5">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Map Code</div>
            <div className="flex items-center gap-3">
              <div className="flex gap-2">
                {(["F1", "F2", "F3"] as const).map(code => (
                  <button
                    key={code}
                    onClick={() => setMapCode(code)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors ${
                      mapCode === code
                        ? "bg-[#123b1f] text-white border-[#123b1f]"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    {code}
                  </button>
                ))}
              </div>
              {mapCode && (
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-xs text-gray-400">{mapCodeZoneLabel}</span>
                  {geocoding && <span className="text-[10px] text-gray-300">detecting…</span>}
                  <CopyBtn value={mapCode} id="mapcode" />
                </div>
              )}
              {!mapCode && geocoding && (
                <span className="text-xs text-gray-400 animate-pulse">Detecting zone…</span>
              )}
              {!mapCode && !geocoding && (
                <span className="text-xs text-gray-400">Select zone above</span>
              )}
            </div>
            <div className="mt-1.5 text-[10px] text-gray-300">
              F3 = north of McCarty Rd · F2 = between McCarty & Gratiot · F1 = south of Gratiot
            </div>
          </div>
        </div>
      </div>

      {/* Services / Quote */}
      {itemsWithAmounts.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Services / Quote Line Items</span>
          </div>
          <div className="px-5 divide-y divide-gray-50">
            {itemsWithAmounts.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Service {i + 1}</div>
                  <div className="text-sm font-medium text-gray-900 truncate">{r.label}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold text-gray-900 tabular-nums">${r.amount.toLocaleString()}</span>
                  <CopyBtn value={r.label} id={`label-${i}`} />
                  <CopyBtn value={r.amount.toString()} id={`amt-${i}`} />
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between py-3">
              <span className="text-sm font-bold text-gray-900">Total</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-900 tabular-nums">${Math.round(totalSell).toLocaleString()}</span>
                <CopyBtn value={Math.round(totalSell).toString()} id="total" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
