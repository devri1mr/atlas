"use client";

import { useEffect, useState } from "react";

type PricingSettingsRow = {
  id: string;
  default_margin_percent: number | null;
  prepay_discount_percent: number | null;
  prepay_discount_pct?: number | null;
  round_increment: number | null;
  company_contingency_percent: number | null;
  is_active: boolean | null;
};

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export default function OperationsCenterPricingPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [row, setRow] = useState<PricingSettingsRow | null>(null);

  const [defaultMarginPercent, setDefaultMarginPercent] = useState("50");
  const [prepayDiscountPercent, setPrepayDiscountPercent] = useState("3");
  const [roundIncrement, setRoundIncrement] = useState("100");
  const [companyContingencyPercent, setCompanyContingencyPercent] =
    useState("5");

  async function load() {
    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const res = await fetch("/api/operations-center/pricing", {
        cache: "no-store",
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.error || "Failed to load pricing settings.");
      }

      const nextRow = json?.row ?? null;
      setRow(nextRow);

      setDefaultMarginPercent(
        String(num(nextRow?.default_margin_percent, 50))
      );
      setPrepayDiscountPercent(
        String(
          num(
            nextRow?.prepay_discount_percent ?? nextRow?.prepay_discount_pct,
            3
          )
        )
      );
      setRoundIncrement(String(num(nextRow?.round_increment, 100)));
      setCompanyContingencyPercent(
        String(num(nextRow?.company_contingency_percent, 5))
      );
    } catch (e: any) {
      setError(e?.message || "Failed to load pricing settings.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const res = await fetch("/api/operations-center/pricing", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          default_margin_percent: num(defaultMarginPercent, 50),
          prepay_discount_percent: num(prepayDiscountPercent, 3),
          round_increment: num(roundIncrement, 100),
          company_contingency_percent: num(companyContingencyPercent, 5),
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.error || "Failed to save pricing settings.");
      }

      const nextRow = json?.row ?? null;
      setRow(nextRow);
      setSuccess("Pricing settings saved.");
    } catch (e: any) {
      setError(e?.message || "Failed to save pricing settings.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="p-8 space-y-8">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      ) : null}

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold">Pricing Settings</h1>
        <div className="mt-2 text-sm text-gray-600">
          These values control AtlasBid pricing behavior for the active company.
        </div>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Default Margin %
            </label>
            <input
              type="number"
              value={defaultMarginPercent}
              onChange={(e) => setDefaultMarginPercent(e.target.value)}
              className="w-full rounded-md border px-3 py-2"
              min={0}
              max={95}
              step={0.1}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Prepay Discount %
            </label>
            <input
              type="number"
              value={prepayDiscountPercent}
              onChange={(e) => setPrepayDiscountPercent(e.target.value)}
              className="w-full rounded-md border px-3 py-2"
              min={0}
              max={100}
              step={0.1}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Round Increment
            </label>
            <input
              type="number"
              value={roundIncrement}
              onChange={(e) => setRoundIncrement(e.target.value)}
              className="w-full rounded-md border px-3 py-2"
              min={1}
              step={1}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Company Contingency %
            </label>
            <input
              type="number"
              value={companyContingencyPercent}
              onChange={(e) => setCompanyContingencyPercent(e.target.value)}
              className="w-full rounded-md border px-3 py-2"
              min={0}
              max={100}
              step={0.1}
            />
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <button
            onClick={load}
            className="rounded-md border px-4 py-2 font-medium"
          >
            Reload
          </button>

          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-black px-4 py-2 font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>

        {row ? (
          <div className="mt-8 rounded-lg border bg-gray-50 p-4 text-sm text-gray-600">
            Active settings row loaded.
          </div>
        ) : null}
      </div>
    </div>
  );
}
