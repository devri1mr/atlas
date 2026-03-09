"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

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
  return `$${Number(v || 0).toFixed(2)}`;
}

export default function PricingPage() {
  const params = useParams();
  const bidId = String(params?.id ?? "");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        bid_id: bidId,
        target_gp_pct: Number(nextGpPct || 0),
        prepay_enabled: nextPrepay,
        manual_price:
          nextManualPrice !== "" && !Number.isNaN(Number(nextManualPrice))
            ? Number(nextManualPrice)
            : null,
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
      suggested_price: Number(json?.suggested_price ?? 0),
      final_price: Number(json?.final_price ?? 0),
      prepay_price: Number(json?.prepay_price ?? 0),
      gp_base_price: Number(json?.gp_base_price ?? 0),
      effective_gp: Number(json?.effective_gp ?? 0),
      target_gp_pct: Number(json?.target_gp_pct ?? Number(nextGpPct || 0)),
      prepay_discount_pct: Number(json?.prepay_discount_pct ?? 0),
      override_amount: Number(json?.override_amount ?? 0),
      has_manual_override: Boolean(json?.has_manual_override ?? false),
      pricing_mode:
        json?.pricing_mode === "manual_override"
          ? "manual_override"
          : "suggested",
      below_target: Boolean(json?.below_target ?? false),
      target_gap_pct: Number(json?.target_gap_pct ?? 0),
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
          trucking_cost: data.trucking_cost,
          total_cost: data.total_cost,
          target_gp_pct: targetGpPct,
          sell_rounded: data.final_price,
          prepay_enabled: prepayEnabled,
          prepay_price: data.prepay_price,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          json?.error?.message || json?.error || "Failed to save pricing."
        );
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

        const bidRes = await fetch(`/api/bids/${bidId}`, {
          cache: "no-store",
        });

        const bidJson = await bidRes.json().catch(() => null);

        if (bidRes.ok && bidJson) {
          const row = bidJson?.data ?? bidJson?.row ?? bidJson ?? null;

          if (row) {
            const nextTargetGp = Number(row?.target_gp_pct ?? 50);
            const nextPrepayEnabled = Boolean(row?.prepay_enabled ?? false);
            const nextManualPrice =
              row?.sell_rounded !== null &&
              row?.sell_rounded !== undefined &&
              Number(row?.sell_rounded) > 0
                ? String(Number(row.sell_rounded))
                : "";

            setTargetGpPct(nextTargetGp);
            setPrepayEnabled(nextPrepayEnabled);
            setManualPrice(nextManualPrice);

            await calculate(nextTargetGp, nextPrepayEnabled, nextManualPrice);
          } else {
            await calculate(50, false, "");
          }
        } else {
          await calculate(50, false, "");
        }
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
      calculate(targetGpPct, prepayEnabled, manualPrice).catch((e: any) => {
        setError(e?.message || "Failed to calculate pricing.");
      });
    }, 200);

    return () => clearTimeout(t);
  }, [targetGpPct, prepayEnabled, manualPrice]);

  const suggestedPrice = useMemo(() => {
    return Number(data?.suggested_price ?? 0);
  }, [data]);

  const finalPrice = useMemo(() => {
    return Number(data?.final_price ?? 0);
  }, [data]);

  const overrideAmount = useMemo(() => {
    return Number(data?.override_amount ?? finalPrice - suggestedPrice);
  }, [data, finalPrice, suggestedPrice]);

  const overrideColorClass = useMemo(() => {
    if (overrideAmount > 0) return "text-green-600";
    if (overrideAmount < 0) return "text-red-600";
    return "text-gray-700";
  }, [overrideAmount]);

  const overrideBorderClass = useMemo(() => {
    if (overrideAmount > 0) return "border-green-300";
    if (overrideAmount < 0) return "border-red-300";
    return "border-gray-300";
  }, [overrideAmount]);

  const overridePrefix = useMemo(() => {
    return overrideAmount > 0 ? "+" : "";
  }, [overrideAmount]);

  const gpColorClass = useMemo(() => {
    const gp = Number(data?.effective_gp ?? 0);
    const target = Number(data?.target_gp_pct ?? targetGpPct);

    if (gp < target - 0.25) return "text-red-600";
    if (gp > target + 0.25) return "text-green-700";
    return "text-gray-800";
  }, [data, targetGpPct]);

  const gpBadgeClass = useMemo(() => {
    const gp = Number(data?.effective_gp ?? 0);
    const target = Number(data?.target_gp_pct ?? targetGpPct);

    if (gp < target - 0.25) {
      return "border-amber-200 bg-amber-50 text-amber-700";
    }
    if (gp > target + 0.25) {
      return "border-green-200 bg-green-50 text-green-700";
    }
    return "border-gray-200 bg-gray-50 text-gray-700";
  }, [data, targetGpPct]);

  const pricingModeLabel = useMemo(() => {
    return data?.pricing_mode === "manual_override"
      ? "Manual Override"
      : "Suggested";
  }, [data]);

  const pricingModeClass = useMemo(() => {
    return data?.pricing_mode === "manual_override"
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : "border-gray-200 bg-gray-50 text-gray-700";
  }, [data]);

  const gpBaseLabel = useMemo(() => {
    return prepayEnabled
      ? "GP based on prepay price"
      : "GP based on project price";
  }, [prepayEnabled]);

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Pricing</h1>
            <div className="mt-1 text-sm text-gray-500">
              Final price uses Ops settings for contingency and rounding behind
              the scenes.
            </div>
          </div>

          <div
            className={`rounded-full border px-3 py-1 text-xs font-medium ${pricingModeClass}`}
          >
            {pricingModeLabel}
          </div>
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

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Suggested Project Price
              </label>
              <div className="w-full rounded-md border bg-gray-100 px-3 py-2 text-base text-gray-800">
                {money(suggestedPrice)}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Project Price (editable)
              </label>
              <input
                type="number"
                value={manualPrice}
                onChange={(e) => setManualPrice(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-base"
                min={0}
                step={0.01}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Override Amount
              </label>
              <div
                className={`w-full rounded-md border bg-gray-100 px-3 py-2 text-base font-medium ${overrideColorClass} ${overrideBorderClass}`}
              >
                {overridePrefix}
                {money(Math.abs(overrideAmount))}
              </div>
            </div>

            <label className="flex items-center gap-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={prepayEnabled}
                onChange={(e) => setPrepayEnabled(e.target.checked)}
                className="h-4 w-4"
              />
              Apply prepay discount (
              {Number(data?.prepay_discount_pct ?? 0).toFixed(0)}% payment via
              check up-front)
            </label>

            {Boolean(data?.below_target) ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Below target GP by{" "}
                <span className="font-semibold">
                  {Math.abs(Number(data?.target_gap_pct ?? 0)).toFixed(2)}%
                </span>
                .
              </div>
            ) : null}
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-gray-600">Labor cost</span>
              <span className="font-semibold">
                {money(Number(data?.labor_cost ?? 0))}
              </span>
            </div>

            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-gray-600">Materials cost</span>
              <span className="font-semibold">
                {money(Number(data?.material_cost ?? 0))}
              </span>
            </div>

            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-gray-600">Trucking cost</span>
              <span className="font-semibold">
                {money(Number(data?.trucking_cost ?? 0))}
              </span>
            </div>

            <div className="flex items-center justify-between border-b pb-3 pt-1">
              <span className="text-gray-700">Total cost</span>
              <span className="font-semibold">
                {money(Number(data?.total_cost ?? 0))}
              </span>
            </div>

            <div className="flex items-center justify-between pt-3">
              <span className="text-gray-700">Project price</span>
              <span className="text-lg font-bold text-green-700">
                {money(finalPrice)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-gray-700">Project price (with prepay)</span>
              <span className="text-lg font-bold text-green-700">
                {money(
                  prepayEnabled
                    ? Number(data?.prepay_price ?? 0)
                    : finalPrice
                )}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-gray-700">{gpBaseLabel}</span>
              <span className="font-semibold">
                {money(Number(data?.gp_base_price ?? 0))}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-gray-700">Effective GP%</span>
              <span className={`font-semibold ${gpColorClass}`}>
                {Number(data?.effective_gp ?? 0).toFixed(2)}%
              </span>
            </div>

            <div className="pt-2">
              <div
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${gpBadgeClass}`}
              >
                Target GP {Number(data?.target_gp_pct ?? targetGpPct).toFixed(2)}
                %
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <button
            onClick={() =>
              calculate(targetGpPct, prepayEnabled, manualPrice).catch(
                (e: any) =>
                  setError(e?.message || "Failed to calculate pricing.")
              )
            }
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
