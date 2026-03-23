"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type PricingResponse = {
  labor_cost: number;
  material_cost: number;
  trucking_cost: number;
  total_cost: number;
  suggested_price: number;
  final_price: number;
  prepay_price: number;
  gp_base_price: number;
  effective_gp: number;
  target_gp_pct: number;
  prepay_discount_pct: number;
  override_amount: number;
  has_manual_override: boolean;
  pricing_mode: "manual_override" | "suggested";
  below_target: boolean;
  target_gap_pct: number;
};

function money(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(v || 0));
}

const inputCls = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all";
const labelCls = "block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide";

export default function PricingPage() {
  const params = useParams();
  const bidId = String(params?.id ?? "");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [targetGpPct, setTargetGpPct] = useState<number>(50);
  const [manualPrice, setManualPrice] = useState<string>("");
  const [prepayEnabled, setPrepayEnabled] = useState(false);
  const [data, setData] = useState<PricingResponse | null>(null);

  async function calculate(
    nextGpPct = targetGpPct,
    nextPrepay = prepayEnabled,
    nextManualPrice = manualPrice
  ) {
    if (!bidId) return;
    setError("");
    const res = await fetch("/api/atlasbid/pricing/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bid_id: bidId,
        target_gp_pct: Number(nextGpPct || 0),
        prepay_enabled: nextPrepay,
        manual_price: nextManualPrice !== "" && !Number.isNaN(Number(nextManualPrice)) ? Number(nextManualPrice) : null,
      }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error || "Failed to calculate pricing.");
    setData({
      labor_cost: Number(json?.labor_cost ?? 0),
      material_cost: Number(json?.material_cost ?? 0),
      trucking_cost: Number(json?.trucking_cost ?? 0),
      total_cost: Number(json?.total_cost ?? 0),
      suggested_price: Number(json?.suggested_price ?? 0),
      final_price: Number(json?.final_price ?? 0),
      prepay_price: Number(json?.prepay_price ?? 0),
      gp_base_price: Number(json?.gp_base_price ?? 0),
      effective_gp: Number(json?.effective_gp ?? 0),
      target_gp_pct: Number(json?.target_gp_pct ?? Number(nextGpPct || 0)),
      prepay_discount_pct: Number(json?.prepay_discount_pct ?? 0),
      override_amount: Number(json?.override_amount ?? 0),
      has_manual_override: Boolean(json?.has_manual_override ?? false),
      pricing_mode: json?.pricing_mode === "manual_override" ? "manual_override" : "suggested",
      below_target: Boolean(json?.below_target ?? false),
      target_gap_pct: Number(json?.target_gap_pct ?? 0),
    });
  }

  async function savePricing() {
    if (!bidId || !data) return;
    try {
      setSaving(true);
      setSaved(false);
      setError("");
      const res = await fetch(`/api/bids/${bidId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          labor_cost: data.labor_cost,
          material_cost: data.material_cost,
          trucking_cost: data.trucking_cost,
          total_cost: data.total_cost,
          target_gp_pct: targetGpPct,
          sell_rounded: data.final_price,
          prepay_enabled: prepayEnabled,
          prepay_price: data.prepay_price,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message || json?.error || "Failed to save pricing.");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e?.message || "Failed to save pricing.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!bidId) return;
      try {
        setLoading(true);
        setError("");
        const bidRes = await fetch(`/api/bids/${bidId}`, { cache: "no-store" });
        const bidJson = await bidRes.json().catch(() => null);
        if (bidRes.ok && bidJson) {
          const row = bidJson?.data ?? bidJson?.row ?? bidJson ?? null;
          if (row) {
            const nextTargetGp = Number(row?.target_gp_pct ?? 50);
            const nextPrepayEnabled = Boolean(row?.prepay_enabled ?? false);
            setTargetGpPct(nextTargetGp);
            setPrepayEnabled(nextPrepayEnabled);
            setManualPrice("");
            await calculate(nextTargetGp, nextPrepayEnabled, "");
          } else {
            await calculate(50, false, "");
          }
        } else {
          await calculate(50, false, "");
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load pricing.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [bidId]);

  useEffect(() => {
    if (!bidId || loading) return;
    const t = setTimeout(() => {
      calculate(targetGpPct, prepayEnabled, manualPrice).catch((e: any) => {
        setError(e?.message || "Failed to calculate pricing.");
      });
    }, 200);
    return () => clearTimeout(t);
  }, [targetGpPct, prepayEnabled, manualPrice]);

  const finalPrice = useMemo(() => Number(data?.final_price ?? 0), [data]);
  const suggestedPrice = useMemo(() => Number(data?.suggested_price ?? 0), [data]);
  const overrideAmount = useMemo(() => Number(data?.override_amount ?? finalPrice - suggestedPrice), [data, finalPrice, suggestedPrice]);
  const effectiveGp = Number(data?.effective_gp ?? 0);
  const gpIsGood = effectiveGp >= (data?.target_gp_pct ?? targetGpPct) - 0.25;

  const costRows = [
    { label: "Labor", value: data?.labor_cost ?? 0 },
    { label: "Materials", value: data?.material_cost ?? 0 },
    { label: "Trucking", value: data?.trucking_cost ?? 0 },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f0f4f0]">
        <div className="px-4 md:px-8 py-6 md:py-8" style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}>
          <div className="max-w-4xl mx-auto">
            <div className="h-4 bg-white/10 rounded w-40 mb-3 animate-pulse" />
            <div className="h-8 bg-white/20 rounded w-32 animate-pulse" />
          </div>
        </div>
        <div className="px-4 md:px-8 py-6 max-w-4xl mx-auto space-y-4">
          {[1,2].map(i => <div key={i} className="bg-white rounded-2xl h-40 animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f4f0]">
      {/* Header */}
      <div
        className="px-4 md:px-8 py-6 md:py-8"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}
      >
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 text-white/50 text-xs mb-2">
            <Link href={`/atlasbid/bids/${bidId}`} className="hover:text-white/80 transition-colors">Overview</Link>
            <span>/</span>
            <span className="text-white/80">Pricing</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Pricing</h1>
              <p className="text-white/50 text-sm mt-1">Contingency and rounding applied from Ops settings.</p>
            </div>
            <div className="flex items-center gap-2">
              {data?.pricing_mode === "manual_override" ? (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-200 border border-blue-400/30">Manual Override</span>
              ) : (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/10 text-white/60 border border-white/20">Suggested</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-4xl mx-auto space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        {saved && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Pricing saved successfully.
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Controls */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
            <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">Pricing Controls</h2>

            <div>
              <label className={labelCls}>Target GP%</label>
              <div className="relative">
                <input
                  type="number"
                  value={targetGpPct}
                  onChange={(e) => setTargetGpPct(Number(e.target.value || 0))}
                  className={inputCls + " pr-8"}
                  min={0} max={95} step={0.1}
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">%</span>
              </div>
            </div>

            <div>
              <label className={labelCls}>Suggested Price</label>
              <div className="w-full border border-gray-100 rounded-xl px-3.5 py-2.5 text-sm bg-gray-50 text-gray-700 font-semibold">
                {money(suggestedPrice)}
              </div>
            </div>

            <div>
              <label className={labelCls}>Project Price (override)</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">$</span>
                <input
                  type="number"
                  value={manualPrice}
                  onChange={(e) => setManualPrice(e.target.value)}
                  className={inputCls + " pl-7"}
                  min={0} step={0.01}
                  placeholder={String(suggestedPrice)}
                />
              </div>
              {overrideAmount !== 0 && (
                <p className={`mt-1 text-xs font-semibold ${overrideAmount > 0 ? "text-green-600" : "text-red-600"}`}>
                  {overrideAmount > 0 ? "+" : ""}{money(overrideAmount)} vs suggested
                </p>
              )}
            </div>

            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div
                onClick={() => setPrepayEnabled(p => !p)}
                className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer ${prepayEnabled ? "bg-green-600" : "bg-gray-200"}`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${prepayEnabled ? "translate-x-5" : "translate-x-1"}`} />
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700">Prepay discount</span>
                <span className="ml-2 text-xs text-gray-400">({Number(data?.prepay_discount_pct ?? 0).toFixed(0)}% upfront check)</span>
              </div>
            </label>

            {data?.below_target && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Below target GP by <span className="font-semibold">{Math.abs(Number(data?.target_gap_pct ?? 0)).toFixed(2)}%</span>
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-3">
            <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">Cost Summary</h2>

            {costRows.map(r => (
              <div key={r.label} className="flex items-center justify-between text-sm border-b border-gray-50 pb-2.5">
                <span className="text-gray-500">{r.label} cost</span>
                <span className="font-semibold text-gray-800">{money(r.value)}</span>
              </div>
            ))}

            <div className="flex items-center justify-between text-sm border-b border-gray-100 pb-3 pt-1">
              <span className="font-semibold text-gray-700">Total cost</span>
              <span className="font-bold text-gray-900">{money(data?.total_cost ?? 0)}</span>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-sm font-semibold text-gray-700">Project price</span>
              <span className="text-xl font-bold text-[#123b1f]">{money(finalPrice)}</span>
            </div>

            {prepayEnabled && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">With prepay discount</span>
                <span className="text-lg font-bold text-green-700">{money(data?.prepay_price ?? 0)}</span>
              </div>
            )}

            <div className="flex items-center justify-between text-sm pt-1">
              <span className="text-gray-500">Effective GP%</span>
              <span className={`font-bold text-base ${gpIsGood ? "text-green-600" : "text-red-600"}`}>
                {effectiveGp.toFixed(1)}%
              </span>
            </div>

            <div className="pt-2">
              <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                gpIsGood
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}>
                Target {Number(data?.target_gp_pct ?? targetGpPct).toFixed(1)}% GP
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={savePricing}
            disabled={saving || !data}
            className="bg-[#123b1f] text-white font-semibold py-2.5 px-6 rounded-xl hover:bg-[#1a5c2e] disabled:opacity-60 transition-colors text-sm"
          >
            {saving ? "Saving…" : "Save Pricing"}
          </button>
          <button
            onClick={() => calculate(targetGpPct, prepayEnabled, manualPrice).catch((e: any) => setError(e?.message || "Failed to recalculate."))}
            className="border border-gray-200 bg-white text-gray-600 font-medium py-2.5 px-4 rounded-xl hover:bg-gray-50 transition-colors text-sm"
          >
            Recalculate
          </button>
          <Link
            href={`/atlasbid/bids/${bidId}/proposal`}
            className="ml-auto border border-gray-200 bg-white text-gray-600 font-medium py-2.5 px-4 rounded-xl hover:bg-gray-50 transition-colors text-sm"
          >
            Next: Proposal →
          </Link>
        </div>
      </div>
    </div>
  );
}
