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
  hire_date: string | null;
  divisions: { id: string; name: string } | null;
};

type Division = { id: string; name: string; active: boolean };

type SavedRate = {
  id: string;
  rate: number;
  division_id: string | null;
  division_name: string | null;
  is_default: boolean;
};

type PendingRate = {
  key: string;
  rate: string;
  division_id: string;
  is_default: boolean;
};

function displayName(e: Emp) {
  const mi = e.middle_initial ? ` ${e.middle_initial}.` : "";
  return `${e.first_name}${mi} ${e.last_name}`;
}
function initials(e: Emp) {
  return `${e.first_name[0] ?? ""}${e.last_name[0] ?? ""}`.toUpperCase();
}

export default function RateSetupPage() {
  const [allEmployees, setAllEmployees] = useState<Emp[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [hasRates, setHasRates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [justSaved, setJustSaved] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());

  // Per-employee existing rates (fetched lazily)
  const [existingRates, setExistingRates] = useState<SavedRate[]>([]);
  const [loadingRates, setLoadingRates] = useState(false);

  // Pending rates to add this session
  const [pendingRates, setPendingRates] = useState<PendingRate[]>([]);

  // Add rate form
  const [addRate, setAddRate] = useState("");
  const [addDivision, setAddDivision] = useState("");
  const [addDefault, setAddDefault] = useState(false);
  const rateRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const [empRes, divRes, hrRes] = await Promise.all([
        fetch("/api/atlas-time/employees", { cache: "no-store" }),
        fetch("/api/atlas-time/divisions", { cache: "no-store" }),
        fetch("/api/atlas-time/employees/has-rates", { cache: "no-store" }),
      ]);
      const empJson = await empRes.json().catch(() => null);
      const divJson = await divRes.json().catch(() => null);
      const hrJson  = await hrRes.json().catch(() => ({ employee_ids: [] }));
      if (!empRes.ok) throw new Error(empJson?.error ?? "Failed");
      const rateIds = new Set<string>(hrJson.employee_ids ?? []);
      setHasRates(rateIds);
      let list: Emp[] = empJson.employees ?? [];
      list = [
        ...list.filter(e => !rateIds.has(e.id)),
        ...list.filter(e => rateIds.has(e.id)),
      ];
      setAllEmployees(list);
      setDivisions((divJson?.divisions ?? []).filter((d: Division) => d.active));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const missing = allEmployees.filter(e => !hasRates.has(e.id) && !done.has(e.id));
  const visible = showAll ? allEmployees : missing;
  const emp = visible[idx] ?? null;
  const missingCount = missing.length;

  // When employee changes, fetch their existing rates and reset pending
  useEffect(() => {
    if (!emp) return;
    setPendingRates([]);
    setAddRate("");
    setAddDivision("");
    setAddDefault(false);
    setExistingRates([]);
    setLoadingRates(true);
    fetch(`/api/atlas-time/employees/${emp.id}`, { cache: "no-store" })
      .then(r => r.json()).catch(() => null)
      .then(j => { setExistingRates(j?.pay_rates ?? []); })
      .finally(() => { setLoadingRates(false); setTimeout(() => rateRef.current?.focus(), 50); });
  }, [idx, emp?.id]);

  function addPending() {
    const parsed = parseFloat(addRate);
    if (isNaN(parsed) || parsed <= 0) { setError("Enter a valid rate."); return; }
    setError("");
    // If marking this as default, unmark others
    const newPending: PendingRate = {
      key: `${Date.now()}`,
      rate: addRate,
      division_id: addDivision,
      is_default: addDefault,
    };
    setPendingRates(prev => addDefault
      ? [...prev.map(r => ({ ...r, is_default: false })), newPending]
      : [...prev, newPending]
    );
    setAddRate("");
    setAddDivision("");
    setAddDefault(false);
    setTimeout(() => rateRef.current?.focus(), 50);
  }

  async function saveAndNext() {
    if (!emp) { advance(); return; }
    if (pendingRates.length === 0) { advance(); return; }
    try {
      setSaving(true);
      setError("");
      const effectiveDate = emp.hire_date ?? new Date().toISOString().slice(0, 10);
      for (const pr of pendingRates) {
        const parsed = parseFloat(pr.rate);
        const div = divisions.find(d => d.id === pr.division_id);
        await fetch(`/api/atlas-time/employees/${emp.id}/pay-rates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rate: parsed,
            division_id: pr.division_id || null,
            division_name: div?.name ?? null,
            is_default: pr.is_default,
            effective_date: effectiveDate,
          }),
        });
      }
      // Update employee's default_pay_rate in local state if any is_default
      const defaultPending = pendingRates.find(r => r.is_default);
      if (defaultPending) {
        const parsed = parseFloat(defaultPending.rate);
        setAllEmployees(prev => prev.map(e => e.id === emp.id
          ? { ...e, pay_type: "hourly", default_pay_rate: parsed }
          : e
        ));
      } else if (!emp.default_pay_rate && pendingRates.length > 0) {
        // Mark first rate as default_pay_rate on employee for display
        const parsed = parseFloat(pendingRates[0].rate);
        await fetch(`/api/atlas-time/employees/${emp.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pay_type: "hourly", default_pay_rate: parsed }),
        });
        setAllEmployees(prev => prev.map(e => e.id === emp.id
          ? { ...e, pay_type: "hourly", default_pay_rate: parsed }
          : e
        ));
      }
      setDone(prev => new Set([...prev, emp.id]));
      setHasRates(prev => new Set([...prev, emp.id]));
      setJustSaved(true);
      setTimeout(() => { setJustSaved(false); advance(); }, 700);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const visibleLen = visible.length;
  function advance() {
    setIdx(i => Math.min(i + 1, visibleLen - 1));
  }
  function back() {
    setIdx(i => Math.max(i - 1, 0));
  }

  const total = visibleLen;
  const canSave = pendingRates.length > 0;

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
              <button onClick={() => { setShowAll(s => !s); setIdx(0); }}
                className="text-xs font-semibold text-white/60 hover:text-white border border-white/20 px-3 py-1.5 rounded-lg transition-colors">
                {showAll ? "Missing only" : "Show all"}
              </button>
            </div>
            {missingCount > 0 && (
              <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-green-400 rounded-full transition-all duration-500"
                  style={{ width: `${Math.round((done.size / missingCount) * 100)}%` }} />
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
              <div className="flex items-center gap-2 w-full">
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
                <div className="flex items-center gap-4 px-5 py-4 border-b border-gray-50">
                  <div className="w-12 h-12 rounded-2xl overflow-hidden shrink-0 bg-[#123b1f]/10 flex items-center justify-center">
                    {emp.photo_url
                      ? <img src={emp.photo_url} alt={initials(emp)} className="w-full h-full object-cover" />
                      : <span className="text-[#123b1f] font-bold text-base">{initials(emp)}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-bold text-gray-900 truncate">{displayName(emp)}</div>
                    {emp.job_title && <div className="text-xs text-gray-400">{emp.job_title}</div>}
                    {emp.divisions && <div className="text-xs text-blue-600 mt-0.5">{emp.divisions.name}</div>}
                  </div>
                  {justSaved && (
                    <div className="shrink-0 w-7 h-7 rounded-full bg-green-500 flex items-center justify-center">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                  )}
                </div>

                {/* Existing rates */}
                {loadingRates ? (
                  <div className="px-5 py-3 border-b border-gray-50">
                    <div className="h-3 bg-gray-100 rounded animate-pulse w-1/3" />
                  </div>
                ) : existingRates.length > 0 && (
                  <div className="px-5 py-3 border-b border-gray-50 space-y-1.5">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Existing Rates</p>
                    {existingRates.map(r => (
                      <div key={r.id} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-500">{r.division_name ?? "General"}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-gray-800 tabular-nums">${r.rate.toFixed(2)}/hr</span>
                          {r.is_default && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">Default</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pending rates (added this session) */}
                {pendingRates.length > 0 && (
                  <div className="px-5 py-3 border-b border-gray-50 space-y-1.5">
                    <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider mb-2">To Be Saved</p>
                    {pendingRates.map(pr => {
                      const div = divisions.find(d => d.id === pr.division_id);
                      return (
                        <div key={pr.key} className="flex items-center justify-between gap-2">
                          <span className="text-xs text-gray-600">{div?.name ?? "General"}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-gray-800 tabular-nums">${parseFloat(pr.rate).toFixed(2)}/hr</span>
                            {pr.is_default && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Default</span>}
                            <button onClick={() => setPendingRates(prev => prev.filter(r => r.key !== pr.key))}
                              className="text-gray-300 hover:text-red-400 transition-colors ml-0.5">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add rate form */}
                <div className="px-5 py-4 space-y-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Add Rate</p>

                  {/* Division */}
                  <select
                    value={addDivision}
                    onChange={e => setAddDivision(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  >
                    <option value="">General (no division)</option>
                    {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>

                  {/* Rate + default toggle + add button */}
                  <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">$</span>
                      <input
                        ref={rateRef}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={addRate}
                        onChange={e => setAddRate(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") addPending(); }}
                        placeholder="0.00"
                        className="w-full border border-gray-200 rounded-xl pl-7 pr-10 py-2.5 text-lg font-bold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-medium">/hr</span>
                    </div>
                    <button
                      onClick={addPending}
                      disabled={!addRate}
                      className="shrink-0 h-[42px] px-4 bg-[#123b1f] hover:bg-[#1a5c2e] text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>

                  {/* Default toggle */}
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <button type="button" onClick={() => setAddDefault(v => !v)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${addDefault ? "bg-[#123b1f]" : "bg-gray-200"}`}>
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${addDefault ? "translate-x-4.5" : "translate-x-0.5"}`} />
                    </button>
                    <span className="text-xs text-gray-500">Mark as default rate</span>
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="w-full space-y-2">
                <button
                  onClick={saveAndNext}
                  disabled={saving || !canSave}
                  className="w-full flex items-center justify-center gap-2 bg-[#123b1f] hover:bg-[#1a5c2e] text-white font-semibold py-4 rounded-2xl text-base transition-colors disabled:opacity-50 shadow-lg shadow-[#123b1f]/20"
                >
                  {saving
                    ? <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                    : <>Save {pendingRates.length > 0 ? `${pendingRates.length} Rate${pendingRates.length > 1 ? "s" : ""}` : ""} & Next <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg></>
                  }
                </button>
                <button onClick={advance} disabled={idx === total - 1}
                  className="w-full flex items-center justify-center gap-1.5 bg-white border border-gray-200 text-gray-400 font-semibold py-3 rounded-xl text-sm transition-colors hover:bg-gray-50 disabled:opacity-30">
                  Skip →
                </button>
              </div>

              {/* Thumbnail strip — only visible employees */}
              {visible.length > 1 && (
                <div className="w-full">
                  <p className="text-xs text-gray-400 mb-2">{showAll ? "All team members" : "Missing rates"}</p>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {visible.map((e, i) => (
                      <button key={e.id} onClick={() => setIdx(i)}
                        className={`relative shrink-0 w-12 h-12 rounded-xl overflow-hidden border-2 transition-all ${
                          emp.id === e.id ? "border-[#123b1f] scale-110" :
                          done.has(e.id) ? "border-green-400 opacity-70" :
                          "border-transparent opacity-60"
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
                    ))}
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
