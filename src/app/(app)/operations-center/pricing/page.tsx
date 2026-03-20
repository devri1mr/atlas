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

const inputCls = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all";
const labelCls = "block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide";

export default function OperationsCenterPricingPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [row, setRow] = useState<PricingSettingsRow | null>(null);
  const [defaultMarginPercent, setDefaultMarginPercent] = useState("50");
  const [prepayDiscountPercent, setPrepayDiscountPercent] = useState("3");
  const [roundIncrement, setRoundIncrement] = useState("100");
  const [companyContingencyPercent, setCompanyContingencyPercent] = useState("5");

  async function load() {
    try {
      setLoading(true);
      setError("");
      setSuccess("");
      const res = await fetch("/api/operations-center/pricing", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Failed to load pricing settings.");
      const nextRow = json?.row ?? null;
      setRow(nextRow);
      setDefaultMarginPercent(String(num(nextRow?.default_margin_percent, 50)));
      setPrepayDiscountPercent(String(num(nextRow?.prepay_discount_percent ?? nextRow?.prepay_discount_pct, 3)));
      setRoundIncrement(String(num(nextRow?.round_increment, 100)));
      setCompanyContingencyPercent(String(num(nextRow?.company_contingency_percent, 5)));
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          default_margin_percent: num(defaultMarginPercent, 50),
          prepay_discount_percent: num(prepayDiscountPercent, 3),
          round_increment: num(roundIncrement, 100),
          company_contingency_percent: num(companyContingencyPercent, 5),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Failed to save pricing settings.");
      setRow(json?.row ?? null);
      setSuccess("Pricing settings saved successfully.");
    } catch (e: any) {
      setError(e?.message || "Failed to save pricing settings.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => { load(); }, []);

  const fields = [
    {
      label: "Default Margin %",
      description: "Default gross profit target applied when creating a new bid.",
      value: defaultMarginPercent,
      setValue: setDefaultMarginPercent,
      min: 0, max: 95, step: 0.1,
      suffix: "%",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
      ),
      color: "text-green-600 bg-green-50",
    },
    {
      label: "Prepay Discount %",
      description: "Discount applied when the client pays in full upfront via check.",
      value: prepayDiscountPercent,
      setValue: setPrepayDiscountPercent,
      min: 0, max: 100, step: 0.1,
      suffix: "%",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
        </svg>
      ),
      color: "text-blue-600 bg-blue-50",
    },
    {
      label: "Round Increment",
      description: "Final price is rounded up to the nearest multiple of this value.",
      value: roundIncrement,
      setValue: setRoundIncrement,
      min: 1, max: 10000, step: 1,
      suffix: "$",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
        </svg>
      ),
      color: "text-amber-600 bg-amber-50",
    },
    {
      label: "Contingency %",
      description: "Buffer added to total cost before applying GP% to cover unforeseen expenses.",
      value: companyContingencyPercent,
      setValue: setCompanyContingencyPercent,
      min: 0, max: 100, step: 0.1,
      suffix: "%",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      ),
      color: "text-purple-600 bg-purple-50",
    },
  ];

  return (
    <div className="min-h-screen bg-[#f0f4f0]">
      {/* Header */}
      <div
        className="px-4 md:px-8 py-6 md:py-8"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}
      >
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 text-white/50 text-xs mb-2">
            <span>Operations Center</span>
            <span>/</span>
            <span className="text-white/80">Pricing Settings</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Pricing Settings</h1>
          <p className="text-white/50 text-sm mt-1">Controls AtlasBid pricing behavior — margin, discounts, rounding, and contingency.</p>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        {success && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            {success}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="space-y-2">
                <div className="h-3 bg-gray-100 rounded w-1/4 animate-pulse" />
                <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
            {fields.map((field) => (
              <div key={field.label} className="p-5 flex items-start gap-4">
                <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${field.color}`}>
                  {field.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <label className={labelCls}>{field.label}</label>
                  <p className="text-xs text-gray-500 mb-2">{field.description}</p>
                  <div className="relative">
                    <input
                      type="number"
                      value={field.value}
                      onChange={(e) => field.setValue(e.target.value)}
                      className={inputCls + " pr-10"}
                      min={field.min}
                      max={field.max}
                      step={field.step}
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">{field.suffix}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && (
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={save}
              disabled={saving}
              className="bg-[#123b1f] text-white font-semibold py-2.5 px-6 rounded-xl hover:bg-[#1a5c2e] disabled:opacity-60 transition-colors text-sm"
            >
              {saving ? "Saving…" : "Save Settings"}
            </button>
            <button
              onClick={load}
              className="border border-gray-200 bg-white text-gray-600 font-medium py-2.5 px-4 rounded-xl hover:bg-gray-50 transition-colors text-sm"
            >
              Reset
            </button>
            {row && (
              <span className="text-xs text-gray-400 ml-auto">Settings active</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
