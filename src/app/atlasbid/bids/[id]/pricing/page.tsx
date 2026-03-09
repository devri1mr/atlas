"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type PricingResponse = {
  labor_cost: number;
  material_cost: number;
  trucking_cost?: number;
  total_cost: number;
  rounded_price: number;
  prepay_price: number;
  effective_gp?: number;
};

function money(v: number) {
  return `$${Number(v || 0).toFixed(2)}`;
}

export default function PricingPage() {
  const params = useParams();
  const bidId = String(params?.id ?? "");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [targetGpPct, setTargetGpPct] = useState<number>(50);
  const [prepayEnabled, setPrepayEnabled] = useState(false);

  const [data, setData] = useState<PricingResponse | null>(null);

  async function calculate(nextGpPct = targetGpPct, nextPrepay = prepayEnabled) {
    if (!bidId) return;

    setError("");

    const res = await fetch("/api/atlasbid/pricing/calculate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        bid_id: bidId,
        target_gp_pct: nextGpPct,
        prepay_enabled: nextPrepay,
      }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(json?.error || "Failed to calculate pricing.");
    }

    setData({
      labor_cost: Number(json?.labor_cost ?? 0),
      material_cost: Number(json?.material_cost ?? 0),
      trucking_cost: Number(json?.trucking_cost ?? 0),
      total_cost: Number(json?.total_cost ?? 0),
      rounded_price: Number(json?.rounded_price ?? 0),
      prepay_price: Number(json?.prepay_price ?? 0),
      effective_gp: Number(json?.effective_gp ?? 0),
    });
  }

  async function savePricing() {
    if (!bidId || !data) return;

    try {
      setSaving(true);
      setError("");

      const res = await fetch(`/api/bids/${bidId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          labor_cost: data.labor_cost,
          material_cost: data.material_cost,
          trucking_cost: data.trucking_cost ?? 0,
          total_cost: data.total_cost,
          target_gp_pct: targetGpPct,
          sell_rounded: data.rounded_price,
          prepay_enabled: prepayEnabled,
          prepay_price: data.prepay_price,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.error?.message || json?.error || "Failed to save pricing.");
      }
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
        await calculate(50, false);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "Failed to load pricing.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [bidId]);

  useEffect(() => {
    if (!bidId || loading) return;

    const t = setTimeout(() => {
      calculate(targetGpPct, prepayEnabled).catch((e: any) => {
        setError(e?.message || "Failed to calculate pricing.");
      });
    }, 200);

    return () => clearTimeout(t);
  }, [targetGpPct, prepayEnabled]);

  const truckingCost = useMemo(() => Number(data?.trucking_cost ?? 0), [data]);

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="p-8 space-y-8">
      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold">Pricing</h1>
        <div className="mt-1 text-sm text-gray-500">
          Final price uses Ops settings for contingency and rounding behind the scenes.
        </div>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-bold">Pricing Preview</h2>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Target Gross Profit % (editable)
              </label>
              <input
                type="number"
                value={targetGpPct}
                onChange={(e) => setTargetGpPct(Number(e.target.value || 0))}
                className="w-full rounded-md border px-3 py-2 text-base"
                min={0}
                max={95}
                step={0.1}
              />
            </div>

            <label className="flex items-center gap-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={prepayEnabled}
                onChange={(e) => setPrepayEnabled(e.target.checked)}
                className="h-4 w-4"
              />
              Apply prepay discount (100% payment via check up-front)
            </label>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-gray-600">Labor cost</span>
              <span className="font-semibold">{money(Number(data?.labor_cost ?? 0))}</span>
            </div>

            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-gray-600">Materials cost</span>
              <span className="font-semibold">{money(Number(data?.material_cost ?? 0))}</span>
            </div>

            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-gray-600">Trucking cost</span>
              <span className="font-semibold">{money(truckingCost)}</span>
            </div>

            <div className="flex items-center justify-between border-b pb-3 pt-1">
              <span className="text-gray-700">Total cost</span>
              <span className="font-semibold">{money(Number(data?.total_cost ?? 0))}</span>
            </div>

            <div className="flex items-center justify-between pt-3">
              <span className="text-gray-700">Project price</span>
              <span className="text-lg font-bold text-green-700">
                {money(Number(data?.rounded_price ?? 0))}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-gray-700">Project price (with prepay)</span>
              <span className="text-lg font-bold text-green-700">
                {money(prepayEnabled ? Number(data?.prepay_price ?? 0) : Number(data?.rounded_price ?? 0))}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-gray-700">Effective GP%</span>
              <span className="font-semibold">
                {Number(data?.effective_gp ?? 0).toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <button
            onClick={() => calculate().catch((e: any) => setError(e?.message || "Failed to calculate pricing."))}
            className="rounded-md border px-4 py-2 font-medium"
          >
            Recalculate
          </button>

          <button
            onClick={savePricing}
            disabled={saving || !data}
            className="rounded-md bg-black px-4 py-2 font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Pricing"}
          </button>
        </div>
      </div>
    </div>
  );
}
