"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AccessGate from "@/components/AccessGate";

type Emp = {
  id: string;
  first_name: string;
  last_name: string;
  middle_initial: string | null;
  preferred_name: string | null;
  job_title: string | null;
  photo_url: string | null;
};

function displayName(e: Emp) {
  const mi = e.middle_initial ? ` ${e.middle_initial}.` : "";
  return `${e.last_name}, ${e.first_name}${mi}`;
}
function initials(e: Emp) {
  return `${e.first_name[0] ?? ""}${e.last_name[0] ?? ""}`.toUpperCase();
}

export default function PhotoRoundPage() {
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [justCaptured, setJustCaptured] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/atlas-time/employees?status=active", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed");
      let list: Emp[] = json.employees ?? [];
      // Missing-photo first, then alphabetical
      list = [
        ...list.filter(e => !e.photo_url),
        ...list.filter(e => e.photo_url),
      ];
      setEmployees(list);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const visible = showAll ? employees : employees.filter(e => !e.photo_url || done.has(e.id) === false);
  const emp = visible[idx] ?? null;
  const total = visible.length;
  const missingCount = employees.filter(e => !e.photo_url).length;

  async function uploadPhoto(file: File) {
    if (!emp) return;
    try {
      setUploading(true);
      setError("");
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch(`/api/atlas-time/employees/${emp.id}/photo`, { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Upload failed");
      // Update local photo_url
      setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, photo_url: json.photo_url } : e));
      setDone(prev => new Set([...prev, emp.id]));
      setJustCaptured(true);
      setTimeout(() => {
        setJustCaptured(false);
        advance();
      }, 1000);
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function advance() {
    setIdx(i => Math.min(i + 1, total - 1));
  }
  function back() {
    setIdx(i => Math.max(i - 1, 0));
  }
  function skip() {
    advance();
  }

  const progress = total > 0 ? Math.round(((done.size) / Math.max(employees.filter(e => !e.photo_url).length, 1)) * 100) : 0;

  return (
    <AccessGate permKey="hr_team_view">
      <div className="min-h-screen bg-[#f0f4f0] flex flex-col">
        {/* Hidden inputs */}
        <input ref={cameraRef} type="file" accept="image/*" capture="user" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ""; }} />
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ""; }} />

        {/* Header */}
        <div className="px-4 md:px-8 py-5"
          style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}>
          <div className="max-w-lg mx-auto">
            <div className="flex items-center gap-2 text-white/50 text-xs mb-2">
              <Link href="/operations-center/atlas-time/employees" className="hover:text-white/80 transition-colors">Team Members</Link>
              <span>/</span>
              <span className="text-white/80">Photo Round</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-white">Photo Round</h1>
                <p className="text-white/50 text-xs mt-0.5">{missingCount} missing · {done.size} captured this session</p>
              </div>
              <button
                onClick={() => setShowAll(s => !s)}
                className="text-xs font-semibold text-white/60 hover:text-white border border-white/20 px-3 py-1.5 rounded-lg transition-colors"
              >
                {showAll ? "Missing only" : "Show all"}
              </button>
            </div>
            {/* Progress bar */}
            {missingCount > 0 && (
              <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-400 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
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
              <div className="text-4xl mb-3">🎉</div>
              <p className="text-sm font-semibold text-gray-700">All team members have photos!</p>
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

              {/* Employee Card */}
              <div className={`w-full bg-white rounded-3xl border shadow-sm overflow-hidden transition-all duration-300 ${justCaptured ? "border-green-400 shadow-green-100" : "border-gray-100"}`}>
                {/* Photo area */}
                <div className="relative bg-gray-50 flex items-center justify-center" style={{ height: "280px" }}>
                  {emp.photo_url ? (
                    <img src={emp.photo_url} alt={displayName(emp)} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-24 h-24 rounded-2xl bg-[#123b1f]/10 flex items-center justify-center text-[#123b1f] font-bold text-3xl">
                        {initials(emp)}
                      </div>
                      <span className="text-xs text-gray-400">No photo yet</span>
                    </div>
                  )}
                  {justCaptured && (
                    <div className="absolute inset-0 flex items-center justify-center bg-green-500/20">
                      <div className="bg-green-500 text-white rounded-full w-16 h-16 flex items-center justify-center shadow-lg">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                    </div>
                  )}
                  {uploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <svg className="animate-spin w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                    </div>
                  )}
                  {/* "Has photo" badge */}
                  {emp.photo_url && !justCaptured && (
                    <div className="absolute top-3 right-3 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      ✓ Photo
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="px-5 py-4">
                  <div className="text-lg font-bold text-gray-900">{displayName(emp)}</div>
                  {emp.job_title && <div className="text-sm text-gray-400 mt-0.5">{emp.job_title}</div>}
                </div>
              </div>

              {/* Actions */}
              <div className="w-full space-y-2">
                <button
                  onClick={() => cameraRef.current?.click()}
                  disabled={uploading}
                  className="w-full flex items-center justify-center gap-2 bg-[#123b1f] hover:bg-[#1a5c2e] text-white font-semibold py-4 rounded-2xl text-base transition-colors disabled:opacity-60 shadow-lg shadow-[#123b1f]/20"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  Take Photo
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-white border border-gray-200 text-gray-600 font-semibold py-3 rounded-xl text-sm transition-colors hover:bg-gray-50 disabled:opacity-60"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Upload
                  </button>
                  <button
                    onClick={skip}
                    disabled={idx === total - 1 || uploading}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-white border border-gray-200 text-gray-400 font-semibold py-3 rounded-xl text-sm transition-colors hover:bg-gray-50 disabled:opacity-30"
                  >
                    Skip →
                  </button>
                </div>
              </div>

              {/* Thumbnail strip */}
              {employees.length > 1 && (
                <div className="w-full">
                  <p className="text-xs text-gray-400 mb-2">All team members</p>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {employees.map((e, i) => (
                      <button
                        key={e.id}
                        onClick={() => setIdx(visible.findIndex(v => v.id === e.id))}
                        className={`shrink-0 w-12 h-12 rounded-xl overflow-hidden border-2 transition-all ${
                          emp.id === e.id ? "border-[#123b1f] scale-110" : "border-transparent opacity-60"
                        }`}
                      >
                        {e.photo_url
                          ? <img src={e.photo_url} alt={initials(e)} className="w-full h-full object-cover" />
                          : <div className="w-full h-full bg-[#123b1f]/10 flex items-center justify-center text-[#123b1f] font-bold text-[10px]">{initials(e)}</div>
                        }
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
