"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Bid = {
  id: string;
  client_name: string | null;
  client_last_name: string | null;
  division_id: string | null; // in your DB this may be uuid; keep as string
  bid_code?: string | null;
};

type LaborRow = {
  id: number;
  bid_id: string;
  task: string;
  item: string;
  quantity: number;
  unit: string;
  man_hours: number;
  hourly_rate: number;
  created_at: string;
};

type BidSettings = {
  division_id: string;
  margin_default: number; // could be 50 or 0.5
  contingency_pct: number; // could be 3 or 0.03
  round_up_increment: number; // usually 100
  prepay_discount_pct: number; // could be 3 or 0.03
};

function normalizePercent(n: number) {
  const x = Number(n) || 0;
  if (x > 0 && x <= 1) return x * 100;
  return x;
}

function roundUpToIncrement(n: number, inc: number) {
  const value = Number(n);
  const increment = Number(inc);
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(increment) || increment <= 0) return value;
  return Math.ceil(value / increment) * increment;
}

export default function BidScopePage() {
  const params = useParams();
  const bidId = String(params?.id || "");

  const [loading, setLoading] = useState(true);
  const [bid, setBid] = useState<Bid | null>(null);
  const [labor, setLabor] = useState<LaborRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [blendedRate, setBlendedRate] = useState<number>(0);

  // Labor inputs
  const [task, setTask] = useState("");
  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState<number>(0);
  const [unit, setUnit] = useState("");
  const [hours, setHours] = useState<number>(0);

  // Sales-editable (on this page for now)
  const [targetGpPct, setTargetGpPct] = useState<number>(50);
  const [prepayEnabled, setPrepayEnabled] = useState<boolean>(false);

  // Ops-controlled (hidden-ish, but used)
  const [contingencyPct, setContingencyPct] = useState<number>(3);
  const [roundUpIncrement, setRoundUpIncrement] = useState<number>(100);
  const [prepayDiscountPct, setPrepayDiscountPct] = useState<number>(3);

  async function load() {
    if (!bidId) return;

    setLoading(true);
    setError(null);

    try {
      // 1) Load the bid
      const bRes = await fetch(`/api/bids/${bidId}`, { cache: "no-store" });
      const bJson = await bRes.json().catch(() => ({}));
      if (!bRes.ok) throw new Error(bJson?.error ?? "Failed to load bid");
      const loadedBid: Bid | null = bJson?.data ?? null;
      setBid(loadedBid);

      const divisionId = loadedBid?.division_id ?? null;

      // 2) Load blended rate + bid settings (if division exists)
      if (divisionId) {
        const rateRes = await fetch(`/api/atlasbid/blended-rate?division_id=${divisionId}`, {
          cache: "no-store",
        });
        const rateJson = await rateRes.json().catch(() => ({}));
        setBlendedRate(Number(rateJson?.blended_rate || 0));

        const sRes = await fetch(`/api/atlasbid/bid-settings?division_id=${divisionId}`, {
          cache: "no-store",
        });
        const sJson = await sRes.json().catch(() => ({}));
        const settings: BidSettings | null = sJson?.settings ?? null;

        if (settings) {
          setTargetGpPct(normalizePercent(settings.margin_default) || 50);
          setContingencyPct(normalizePercent(settings.contingency_pct) || 0);
          setPrepayDiscountPct(normalizePercent(settings.prepay_discount_pct) || 0);
          setRoundUpIncrement(Number(settings.round_up_increment || 0));
        }
      }

      // 3) Load bid labor
      const lRes = await fetch(`/api/atlasbid/bid-labor?bid_id=${bidId}`, { cache: "no-store" });
      const lJson = await lRes.json().catch(() => ({}));
      if (!lRes.ok) throw new Error(lJson?.error ?? "Failed to load labor");
      setLabor(lJson?.rows ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bidId]);

  const laborSubtotal = useMemo(() => {
    return labor.reduce((sum, r) => sum + (Number(r.man_hours) || 0) * (Number(r.hourly_rate) || 0), 0);
  }, [labor]);

  const contingencyCost = useMemo(() => {
    const pct = (Number(contingencyPct) || 0) / 100;
    return laborSubtotal * pct;
  }, [laborSubtotal, contingencyPct]);

  const totalCost = useMemo(() => laborSubtotal + contingencyCost, [laborSubtotal, contingencyCost]);

  const targetSell = useMemo(() => {
    const gp = (Number(targetGpPct) || 0) / 100;
    if (gp >= 1) return 0;
    return totalCost / (1 - gp);
  }, [totalCost, targetGpPct]);

  const sellRounded = useMemo(() => roundUpToIncrement(targetSell, roundUpIncrement), [targetSell, roundUpIncrement]);

  const sellWithPrepay = useMemo(() => {
    if (!prepayEnabled) return sellRounded;
    const disc = (Number(prepayDiscountPct) || 0) / 100;
    return sellRounded * (1 - disc);
  }, [sellRounded, prepayEnabled, prepayDiscountPct]);

  const effectiveGpPct = useMemo(() => {
    const sell = prepayEnabled ? sellWithPrepay : sellRounded;
    if (sell <= 0) return 0;
    return ((sell - totalCost) / sell) * 100;
  }, [sellRounded, sellWithPrepay, prepayEnabled, totalCost]);

  async function addLabor() {
    setError(null);

    const res = await fetch("/api/atlasbid/bid-labor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bid_id: bidId,
        task,
        item,
        quantity,
        unit,
        man_hours: hours,
        hourly_rate: blendedRate,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json?.error ?? "Error adding labor");
      return;
    }

    setLabor((prev) => [...prev, json.row]);
    setTask("");
    setItem("");
    setQuantity(0);
    setUnit("");
    setHours(0);
  }

  async function deleteLaborRow(rowId: number) {
    setError(null);

    const res = await fetch(`/api/atlasbid/bid-labor/${rowId}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(json?.error ?? "Failed to delete labor row");
      return;
    }

    setLabor((prev) => prev.filter((r) => r.id !== rowId));
  }

  const clientDisplay = `${(bid?.client_name ?? "").trim()} ${(bid?.client_last_name ?? "").trim()}`.trim() || "—";

  return (
    <div className="min-h-screen bg-[#f6f8f6] px-6 py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm">
              <Link href={`/atlasbid/bids/${bidId}`} className="text-[#1e7a3a] hover:underline">
                ← Back to Bid
              </Link>
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-[#123b1f]">Scope</h1>
            <p className="mt-1 text-sm text-[#3d5a45]">
              Bid: <span className="font-medium">{bidId}</span> • Client: <span className="font-medium">{clientDisplay}</span>
            </p>
          </div>

          <button
            onClick={load}
            className="rounded-md border border-[#9cc4a6] bg-white px-3 py-2 text-sm font-medium text-[#123b1f] hover:bg-[#eef6f0]"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        {loading ? (
          <div className="rounded-xl border border-[#d7e6db] bg-white p-6 shadow-sm">Loading…</div>
        ) : !bid ? (
          <div className="rounded-xl border border-red-200 bg-white p-6 text-red-700 shadow-sm">Bid not found.</div>
        ) : (
          <>
            {/* LABOR BUILDER */}
            <div className="rounded-xl border border-[#d7e6db] bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-[#123b1f]">Labor Builder</h2>
                  <div className="text-sm text-[#3d5a45]">
                    Blended labor rate (excludes trucking):{" "}
                    <span className="font-semibold">${blendedRate.toFixed(2)} / hr</span>
                  </div>
                </div>

                <div className="text-right text-sm text-[#3d5a45]">
                  <div className="font-medium text-[#123b1f]">Labor Subtotal</div>
                  <div className="text-lg font-semibold">${laborSubtotal.toFixed(2)}</div>
                </div>
              </div>

              <div className="grid grid-cols-6 gap-3">
                <input className="rounded border p-2" placeholder="Task" value={task} onChange={(e) => setTask(e.target.value)} />
                <input className="rounded border p-2" placeholder="Item" value={item} onChange={(e) => setItem(e.target.value)} />
                <input className="rounded border p-2" type="number" placeholder="Qty" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
                <input className="rounded border p-2" placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
                <input className="rounded border p-2" type="number" placeholder="Hours" value={hours} onChange={(e) => setHours(Number(e.target.value))} />
                <button onClick={addLabor} className="rounded bg-[#1e7a3a] px-4 text-white hover:bg-[#16602d]">
                  Add
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-[#eef6f0] text-left text-[#123b1f]">
                      <th className="px-3 py-2 font-semibold">Task</th>
                      <th className="px-3 py-2 font-semibold">Item</th>
                      <th className="px-3 py-2 font-semibold">Qty</th>
                      <th className="px-3 py-2 font-semibold">Unit</th>
                      <th className="px-3 py-2 font-semibold">Hours</th>
                      <th className="px-3 py-2 font-semibold">Rate</th>
                      <th className="px-3 py-2 font-semibold">Total</th>
                      <th className="px-3 py-2 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {labor.length === 0 ? (
                      <tr className="border-t">
                        <td colSpan={8} className="px-3 py-4 text-[#3d5a45]">
                          No labor added yet.
                        </td>
                      </tr>
                    ) : (
                      labor.map((row) => {
                        const rowTotal = (Number(row.man_hours) || 0) * (Number(row.hourly_rate) || 0);
                        return (
                          <tr key={row.id} className="border-t border-[#edf3ee]">
                            <td className="px-3 py-2">{row.task}</td>
                            <td className="px-3 py-2">{row.item}</td>
                            <td className="px-3 py-2">{row.quantity}</td>
                            <td className="px-3 py-2">{row.unit}</td>
                            <td className="px-3 py-2">{row.man_hours}</td>
                            <td className="px-3 py-2">${Number(row.hourly_rate).toFixed(2)}</td>
                            <td className="px-3 py-2">${rowTotal.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right">
                              <button onClick={() => deleteLaborRow(row.id)} className="text-red-700 hover:underline">
                                Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* PRICING SUMMARY (preview) */}
            <div className="rounded-xl border border-[#d7e6db] bg-white p-6 shadow-sm space-y-4">
              <h2 className="text-lg font-semibold text-[#123b1f]">Pricing Preview</h2>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="block text-sm text-[#3d5a45]">Target Gross Profit % (editable)</label>
                  <input
                    className="rounded border p-2 w-full"
                    type="number"
                    value={Number.isFinite(targetGpPct) ? targetGpPct : 0}
                    onChange={(e) => setTargetGpPct(Number(e.target.value))}
                  />

                  <label className="inline-flex items-center gap-2 text-sm text-[#3d5a45]">
                    <input type="checkbox" checked={prepayEnabled} onChange={(e) => setPrepayEnabled(e.target.checked)} />
                    Apply prepay discount (100% upfront check)
                  </label>

                  <div className="text-xs text-[#3d5a45]">
                    Rounding + contingency are “baked in” from Ops Settings (hidden from sales).
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#3d5a45]">Labor cost</span>
                    <span className="font-semibold">${laborSubtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#3d5a45]">Contingency</span>
                    <span className="font-semibold">${contingencyCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-[#123b1f]">Total cost</span>
                    <span className="font-bold">${totalCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pt-3">
                    <span className="text-[#123b1f]">Sell price (rounded)</span>
                    <span className="font-bold text-[#1e7a3a]">${sellRounded.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#123b1f]">Sell price (with prepay)</span>
                    <span className="font-bold text-[#1e7a3a]">${sellWithPrepay.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-[#123b1f]">Effective GP%</span>
                    <span className="font-bold">{effectiveGpPct.toFixed(2)}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* MATERIALS placeholder */}
            <div className="rounded-xl border border-[#d7e6db] bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-[#123b1f]">Materials</h2>
              <p className="mt-1 text-sm text-[#3d5a45]">Materials builder comes next.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
