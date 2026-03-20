"use client";

import { useEffect, useState } from "react";

type Level = {
  id: string;
  name: string;
  multiplier: number;
  display_order: number;
  is_active: boolean;
};

const inputCls = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all";

const TIER_COLORS: Record<number, string> = {
  0: "text-green-600 bg-green-50",
  1: "text-amber-600 bg-amber-50",
  2: "text-orange-600 bg-orange-50",
  3: "text-red-600 bg-red-50",
};

function getColor(index: number) {
  return TIER_COLORS[index] ?? "text-gray-600 bg-gray-50";
}

export default function ComplexityClient() {
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { fetchLevels(); }, []);

  async function fetchLevels() {
    setLoading(true);
    try {
      const res = await fetch("/api/complexity-levels");
      const json = await res.json();
      setLevels((json.data || []).sort((a: Level, b: Level) => a.display_order - b.display_order));
    } catch (e: any) {
      setError("Failed to load complexity levels.");
    } finally {
      setLoading(false);
    }
  }

  async function saveLevel(level: Level) {
    setSavingId(level.id);
    setError("");
    try {
      const res = await fetch("/api/complexity-levels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(level),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || "Failed to save.");
      }
      setSavedId(level.id);
      setTimeout(() => setSavedId(null), 2000);
      await fetchLevels();
    } catch (e: any) {
      setError(e?.message || "Failed to save complexity level.");
    } finally {
      setSavingId(null);
    }
  }

  function updateLevel(id: string, patch: Partial<Level>) {
    setLevels(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
  }

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
            <span className="text-white/80">Complexity Profiles</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Complexity Profiles</h1>
          <p className="text-white/50 text-sm mt-1">Global effort multipliers applied to labor tasks based on site difficulty.</p>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gray-100" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-100 rounded w-1/3" />
                    <div className="h-3 bg-gray-100 rounded w-1/4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {levels.map((level, idx) => (
              <div key={level.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-start gap-4">
                  <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold ${getColor(idx)}`}>
                    ×{level.multiplier.toFixed(1)}
                  </div>
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Profile Name</label>
                        <input
                          value={level.name}
                          onChange={(e) => updateLevel(level.id, { name: e.target.value })}
                          className={inputCls}
                          placeholder="e.g. Standard"
                        />
                      </div>
                      <div className="w-36">
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Multiplier</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.01"
                            min="0.1"
                            max="10"
                            value={level.multiplier}
                            onChange={(e) => updateLevel(level.id, { multiplier: Number(e.target.value) })}
                            className={inputCls + " pr-6"}
                          />
                          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">×</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <div
                          onClick={() => updateLevel(level.id, { is_active: !level.is_active })}
                          className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${level.is_active ? "bg-green-600" : "bg-gray-200"}`}
                        >
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${level.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
                        </div>
                        <span className="text-sm text-gray-600">{level.is_active ? "Active" : "Inactive"}</span>
                      </label>

                      <button
                        onClick={() => saveLevel(level)}
                        disabled={savingId === level.id}
                        className={`flex items-center gap-2 text-sm font-semibold py-2 px-4 rounded-xl transition-colors ${
                          savedId === level.id
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : "bg-[#123b1f] text-white hover:bg-[#1a5c2e] disabled:opacity-60"
                        }`}
                      >
                        {savingId === level.id ? (
                          <>
                            <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                            Saving…
                          </>
                        ) : savedId === level.id ? (
                          <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            Saved
                          </>
                        ) : (
                          "Save"
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && levels.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
            <p className="text-gray-500 text-sm">No complexity profiles found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
