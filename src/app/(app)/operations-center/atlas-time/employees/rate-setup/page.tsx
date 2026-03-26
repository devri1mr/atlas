"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AccessGate from "@/components/AccessGate";

type Emp = {
  id: string;
  first_name: string;
  last_name: string;
  middle_initial: string | null;
  job_title: string | null;
  pay_type: string;
  default_pay_rate: number | null;
  photo_url: string | null;
  divisions: { id: string; name: string } | null;
};

function displayName(e: Emp) {
  const mi = e.middle_initial ? ` ${e.middle_initial}.` : "";
  return `${e.first_name}${mi} ${e.last_name}`;
}
function initials(e: Emp) {
  return `${e.first_name[0] ?? ""}${e.last_name[0] ?? ""}`.toUpperCase();
}

export default function RateSetupPage() {
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [justSaved, setJustSaved] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());

  const [rate, setRate] = useState("");
  const rateRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/atlas-time/employees", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed");
      let list: Emp[] = (json.employees ?? []).filter((e: Emp) => e.pay_type !== "volunteer");
      // No-rate first, then alphabetical
      list = [
        ...list.filter(e => !e.default_pay_rate),
        ...list.filter(e => e.default_pay_rate),
      ];
      setEmployees(list);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const visible = showAll ? employees : employees.filter(e => !e.default_pay_rate || done.has(e.id));
  const emp = visible[idx] ?? null;
  const missingCount = employees.filter(e => !e.default_pay_rate).length;

  // Prefill from current employee
  useEffect(() => {
    if (emp) {
      setRate(emp.default_pay_rate ? String(emp.default_pay_rate) : "");
      setTimeout(() => rateRef.current?.focus(), 50);
    }
  }, [idx, emp?.id]);

  async function saveAndNext() {
    if (!emp || !rate) { advance(); return; }
    const parsed = parseFloat(rate);
    if (isNaN(parsed) || parsed <= 0) { setError("Enter a valid rate."); return; }
    try {
      setSaving(true);
      setError("");
      const res = await fetch(`/api/atlas-time/employees/${emp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pay_type: "hourly", default_pay_rate: parsed }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to save");
      setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, pay_type: "hourly", default_pay_rate: parsed } : e));
      setDone(prev => new Set([...prev, emp.id]));
      setJustSaved(true);
      setTimeout(() => {
        setJustSaved(false);
        advance();
      }, 600);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function advance() {
    setIdx(i => Math.min(i + 1, visible.length - 1));
  }
  function back() {
    setIdx(i => Math.max(i - 1, 0));
  }

  const total = visible.length;

  return (
    <AccessGate permKey="hr_team_view">
      <div className="min-h-screen bg-[#f0f4f0] flex flex-col">
        {/* Header */}
        <div className="px-4 md:px-8 py-5"
          style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}>
          <div className="max-w-lg mx-auto">
            <div className="flex items-center gap-2 text-white/50 text-xs mb-2">
              <Link href="/operations-center/atlas-time/employees" className="hover:text-white/80 transition-colors">Team Members</Link>
              <span>/</span>
              <span className="text-white/80">Rate Setup</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-white">Rate Setup</h1>
                <p className="text-white/50 text-xs mt-0.5">{missingCount} without a rate · {done.size} set this session</p>
              </div>
              <button
                onClick={() => setShowAll(s => !s)}
                className="text-xs font-semibold text-white/60 hover:text-white border border-white/20 px-3 py-1.5 rounded-lg transition-colors"
              >
                {showAll ? "Missing only" : "Show all"}
              </button>
            </div>
            {missingCount > 0 && (
              <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-400 rounded-full transition-all duration-500"
                  style={{ width: `${missingCount > 0 ? Math.round((done.size / missingCount) * 100) : 100}%` }}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-start px-4 py-6 max-w-lg mx-auto w-full space-y-4">
          {error && (
            <div className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
              {error}
              <button onClick={() => setError("")} className="ml-3 text-red-400">✕</button>
            </div>
          )}

          {loading ? (
            <div className="w-full bg-white rounded-3xl border border-gray-100 shadow-sm h-72 animate-pulse" />
          ) : total === 0 ? (
            <div className="w-full bg-white rounded-3xl border border-gray-100 shadow-sm px-6 py-16 text-center">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-sm font-semibold text-gray-700">All team members have pay rates!</p>
              <Link href="/operations-center/atlas-time/employees" className="mt-4 inline-flex items-center gap-1.5 text-sm text-[#123b1f] font-semibold hover:underline">
                Back to Team Members
              </Link>
            </div>
          ) : emp ? (
            <>
              {/* Counter */}
              <div className="flex items-center gap-2 text-xs text-gray-400 w-full">
                <button onClick={back} disabled={idx === 0} className="w-7 h-7 rounded-lg flex items-center justify-center bg-white border border-gray-200 text-gray-400 disabled:opacity-30 hover:bg-gray-50 transition-colors">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <span className="flex-1 text-center font-semibold text-gray-500 text-sm">{idx + 1} / {total}</span>
                <button onClick={advance} disabled={idx === total - 1} className="w-7 h-7 rounded-lg flex items-center justify-center bg-white border border-gray-200 text-gray-400 disabled:opacity-30 hover:bg-gray-50 transition-colors">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>

              {/* Card */}
              <div className={`w-full bg-white rounded-3xl border shadow-sm overflow-hidden transition-all duration-300 ${justSaved ? "border-green-400 shadow-green-100" : "border-gray-100"}`}>
                {/* Employee identity */}
                <div className="flex items-center gap-4 px-5 py-5 border-b border-gray-50">
                  <div className="w-14 h-14 rounded-2xl overflow-hidden shrink-0 bg-[#123b1f]/10 flex items-center justify-center">
                    {emp.photo_url
                      ? <img src={emp.photo_url} alt={initials(emp)} className="w-full h-full object-cover" />
                      : <span className="text-[#123b1f] font-bold text-lg">{initials(emp)}</span>
                    }
                  </div>
                  <div className="min-w-0">
                    <div className="text-lg font-bold text-gray-900 truncate">{displayName(emp)}</div>
                    {emp.job_title && <div className="text-sm text-gray-400">{emp.job_title}</div>}
                    {emp.divisions && <div className="text-xs text-blue-600 mt-0.5">{emp.divisions.name}</div>}
                  </div>
                  {justSaved && (
                    <div className="shrink-0 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                  )}
                </div>

                {/* Current rate display */}
                {emp.default_pay_rate && !done.has(emp.id) && (
                  <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
                    <span className="text-xs text-amber-700">Current rate:</span>
                    <span className="text-sm font-bold text-amber-800">
                      ${emp.default_pay_rate.toFixed(2)}/hr
                    </span>
                  </div>
                )}

                {/* Rate input */}
                <div className="px-5 py-5 space-y-3">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">Pay Rate</label>

                  {/* Rate field */}
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-lg">$</span>
                    <input
                      ref={rateRef}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={rate}
                      onChange={e => setRate(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") saveAndNext(); }}
                      placeholder="0.00"
                      className="w-full border border-gray-200 rounded-2xl pl-8 pr-12 py-4 text-2xl font-bold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">/hr</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="w-full space-y-2">
                <button
                  onClick={saveAndNext}
                  disabled={saving || !rate}
                  className="w-full flex items-center justify-center gap-2 bg-[#123b1f] hover:bg-[#1a5c2e] text-white font-semibold py-4 rounded-2xl text-base transition-colors disabled:opacity-60 shadow-lg shadow-[#123b1f]/20"
                >
                  {saving ? (
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                  ) : (
                    <>
                      Save & Next
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </>
                  )}
                </button>
                <button
                  onClick={advance}
                  disabled={idx === total - 1}
                  className="w-full flex items-center justify-center gap-1.5 bg-white border border-gray-200 text-gray-400 font-semibold py-3 rounded-xl text-sm transition-colors hover:bg-gray-50 disabled:opacity-30"
                >
                  Skip →
                </button>
              </div>

              {/* Thumbnail strip */}
              {employees.length > 1 && (
                <div className="w-full">
                  <p className="text-xs text-gray-400 mb-2">All team members</p>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {employees.map(e => {
                      const visIdx = visible.findIndex(v => v.id === e.id);
                      return (
                        <button
                          key={e.id}
                          onClick={() => visIdx >= 0 && setIdx(visIdx)}
                          disabled={visIdx < 0}
                          className={`relative shrink-0 w-12 h-12 rounded-xl overflow-hidden border-2 transition-all ${
                            emp.id === e.id ? "border-[#123b1f] scale-110" :
                            done.has(e.id) ? "border-green-400 opacity-70" :
                            "border-transparent opacity-50"
                          }`}
                        >
                          {e.photo_url
                            ? <img src={e.photo_url} alt={initials(e)} className="w-full h-full object-cover" />
                            : <div className="w-full h-full bg-[#123b1f]/10 flex items-center justify-center text-[#123b1f] font-bold text-[10px]">{initials(e)}</div>
                          }
                          {done.has(e.id) && (
                            <div className="absolute inset-0 flex items-center justify-center bg-green-500/30">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </AccessGate>
  );
}
