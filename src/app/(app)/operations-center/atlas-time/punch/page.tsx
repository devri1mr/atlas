"use client";

import { useEffect, useRef, useState } from "react";

type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  job_title: string | null;
  at_departments: { id: string; name: string } | null;
};

type Division = { id: string; name: string };

type OpenPunch = {
  id: string;
  clock_in_at: string;
  division_id: string | null;
  at_divisions: { id: string; name: string } | null;
};

type View = "pin" | "confirm" | "success";

function displayName(e: Employee) {
  return e.preferred_name ? `${e.preferred_name} ${e.last_name}` : `${e.first_name} ${e.last_name}`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function elapsed(clockIn: string): string {
  const ms = Date.now() - new Date(clockIn).getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const PIN_LENGTH = 4;
const PAD = [["1","2","3"],["4","5","6"],["7","8","9"],["","0","⌫"]];

export default function KioskPage() {
  const [now, setNow] = useState(new Date());
  const [view, setView] = useState<View>("pin");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [openPunch, setOpenPunch] = useState<OpenPunch | null>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [selectedDivision, setSelectedDivision] = useState("");

  const [acting, setActing] = useState(false);
  const [result, setResult] = useState<{ action: "in" | "out"; time: string; hours?: string } | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    clockRef.current = setInterval(() => setNow(new Date()), 1000);
    return () => { if (clockRef.current) clearInterval(clockRef.current); };
  }, []);

  function armIdle() {
    if (idleRef.current) clearTimeout(idleRef.current);
    idleRef.current = setTimeout(() => reset(), 30_000);
  }

  useEffect(() => {
    if (view === "confirm") armIdle();
    return () => { if (idleRef.current) clearTimeout(idleRef.current); };
  }, [view]);

  function getGps() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { timeout: 6000, maximumAge: 60_000 }
    );
  }

  async function pressKey(key: string) {
    if (view === "confirm") armIdle();
    if (key === "⌫") { setPin(p => p.slice(0, -1)); setError(""); return; }
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + key;
    setPin(next);
    setError("");
    if (next.length === PIN_LENGTH) await verifyPin(next);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (view !== "pin") return;
      if (e.key >= "0" && e.key <= "9") pressKey(e.key);
      if (e.key === "Backspace") pressKey("⌫");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, pin]);

  async function verifyPin(p: string) {
    try {
      setLoading(true);
      const res = await fetch("/api/atlas-time/punch/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: p }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(res.status === 404 ? "Incorrect PIN" : (json?.error ?? "Error"));
        setPin("");
        if ("vibrate" in navigator) navigator.vibrate([80, 40, 80]);
        return;
      }
      setEmployee(json.employee);
      setOpenPunch(json.open_punch ?? null);
      setDivisions(json.divisions ?? []);
      const lastDiv = json.open_punch?.division_id ?? json.divisions?.[0]?.id ?? "";
      setSelectedDivision(lastDiv);
      if ("vibrate" in navigator) navigator.vibrate(30);
      getGps();
      setView("confirm");
    } catch {
      setError("Connection error");
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  async function confirmPunch() {
    if (!employee) return;
    try {
      setActing(true);
      setError("");
      if (openPunch) {
        const res = await fetch(`/api/atlas-time/punches/${openPunch.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clock_out: true, lat: coords?.lat, lng: coords?.lng }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error ?? "Failed");
        const hrs = ((Date.now() - new Date(openPunch.clock_in_at).getTime()) / 3_600_000).toFixed(2);
        setResult({ action: "out", time: fmtTime(new Date().toISOString()), hours: hrs });
      } else {
        const res = await fetch("/api/atlas-time/punches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employee_id: employee.id, punch_method: "kiosk", division_id: selectedDivision || null, lat: coords?.lat, lng: coords?.lng }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error ?? "Failed");
        setResult({ action: "in", time: fmtTime(new Date().toISOString()) });
      }
      if ("vibrate" in navigator) navigator.vibrate([50, 30, 50]);
      setView("success");
      resetRef.current = setTimeout(() => reset(), 5000);
    } catch (e: any) {
      setError(e?.message ?? "Punch failed");
    } finally {
      setActing(false);
    }
  }

  function reset() {
    if (resetRef.current) clearTimeout(resetRef.current);
    if (idleRef.current) clearTimeout(idleRef.current);
    setView("pin"); setPin(""); setError("");
    setEmployee(null); setOpenPunch(null);
    setDivisions([]); setSelectedDivision("");
    setResult(null); setCoords(null); setActing(false);
  }

  // ─── SUCCESS ────────────────────────────────────────────────
  if (view === "success" && result && employee) {
    const isIn = result.action === "in";
    const divName = divisions.find(d => d.id === selectedDivision)?.name;
    return (
      <div
        onClick={reset}
        className="h-screen flex flex-col items-center justify-center gap-5 select-none cursor-pointer px-8"
        style={{ background: isIn ? "linear-gradient(160deg,#071a0d 0%,#0d2616 40%,#1a5c2a 100%)" : "linear-gradient(160deg,#0f0f0f 0%,#1a1a1a 100%)" }}
      >
        {/* Icon */}
        <div className={`w-24 h-24 rounded-full flex items-center justify-center ${isIn ? "bg-green-500" : "bg-slate-600"}`}
          style={{ boxShadow: isIn ? "0 0 48px rgba(34,197,94,0.35)" : "0 0 32px rgba(0,0,0,0.4)" }}>
          {isIn ? (
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          ) : (
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><rect x="9" y="9" width="6" height="6"/>
            </svg>
          )}
        </div>

        <div className="text-center space-y-1">
          <div className="text-4xl font-bold text-white tracking-tight">{isIn ? "Clocked In" : "Clocked Out"}</div>
          <div className="text-xl text-white/70 font-medium">{displayName(employee)}</div>
          {divName && <div className="text-base text-white/40">{divName}</div>}
          <div className="text-base text-white/40">{result.time}</div>
        </div>

        {!isIn && result.hours && (
          <div className="mt-2 bg-white/8 border border-white/10 rounded-2xl px-8 py-4 text-center">
            <span className="text-4xl font-bold text-white">{result.hours}</span>
            <span className="text-white/50 text-lg ml-2">hrs today</span>
          </div>
        )}

        <p className="text-white/20 text-sm mt-4">Tap to dismiss</p>
      </div>
    );
  }

  // ─── CONFIRM ────────────────────────────────────────────────
  if (view === "confirm" && employee) {
    const isClockedIn = !!openPunch;
    return (
      <div
        className="h-screen flex flex-col select-none overflow-hidden"
        style={{ background: "linear-gradient(160deg,#071a0d 0%,#0d2616 100%)" }}
        onPointerDown={armIdle}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 pt-12 pb-4 shrink-0">
          <button onClick={reset} className="flex items-center gap-1.5 text-white/50 active:text-white transition-colors text-sm font-medium">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Back
          </button>
          <span className="text-white/40 font-mono text-sm tabular-nums">
            {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })}
          </span>
        </div>

        {/* Body — scrollable if content overflows on small phone */}
        <div className="flex-1 overflow-y-auto px-6 pb-8">
          <div className="flex flex-col items-center gap-5 pt-4">

            {error && (
              <div className="w-full max-w-sm bg-red-500/15 border border-red-400/30 rounded-2xl px-4 py-3 text-red-300 text-sm text-center">
                {error}
              </div>
            )}

            {/* Name */}
            <div className="text-center">
              <div className="text-3xl font-bold text-white tracking-tight">{displayName(employee)}</div>
              {employee.job_title && <div className="text-sm text-white/40 mt-1">{employee.job_title}</div>}
            </div>

            {/* Status pill */}
            {isClockedIn ? (
              <div className="bg-green-500/15 border border-green-400/25 rounded-2xl px-6 py-4 text-center w-full max-w-sm">
                <div className="text-xs font-semibold text-green-400/80 uppercase tracking-widest mb-1">Clocked In</div>
                <div className="text-3xl font-bold text-green-300">{elapsed(openPunch!.clock_in_at)}</div>
                <div className="text-sm text-green-400/60 mt-1">
                  since {fmtTime(openPunch!.clock_in_at)}
                  {openPunch!.at_divisions && <span> · {openPunch!.at_divisions.name}</span>}
                </div>
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-center w-full max-w-sm">
                <div className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-1">Not Clocked In</div>
                <div className="text-3xl font-bold text-white/80">
                  {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                </div>
              </div>
            )}

            {/* Division picker — clock-in only */}
            {!isClockedIn && divisions.length > 0 && (
              <div className="w-full max-w-sm">
                <p className="text-xs font-semibold text-white/30 uppercase tracking-widest text-center mb-3">Select Division</p>
                <div className="grid grid-cols-1 gap-2">
                  {divisions.map((div) => (
                    <button
                      key={div.id}
                      onClick={() => { setSelectedDivision(div.id); armIdle(); }}
                      className={`w-full py-3.5 px-5 rounded-xl text-base font-semibold text-left border transition-all active:scale-98 ${
                        selectedDivision === div.id
                          ? "bg-white text-[#0d2616] border-white"
                          : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10"
                      }`}
                    >
                      {div.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Punch button */}
            <div className="w-full max-w-sm pt-1">
              <button
                onClick={confirmPunch}
                disabled={acting || (!isClockedIn && divisions.length > 0 && !selectedDivision)}
                className={`w-full py-5 rounded-2xl text-xl font-bold text-white transition-all active:scale-95 disabled:opacity-40 ${
                  isClockedIn
                    ? "bg-red-500 active:bg-red-600"
                    : "bg-green-600 active:bg-green-700"
                }`}
                style={{ boxShadow: isClockedIn ? "0 4px 24px rgba(239,68,68,0.3)" : "0 4px 24px rgba(22,163,74,0.3)" }}
              >
                {acting ? (
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {isClockedIn ? "Clocking Out…" : "Clocking In…"}
                  </div>
                ) : isClockedIn ? "Clock Out" : "Clock In"}
              </button>

              <button onClick={reset} className="w-full mt-3 py-2 text-white/25 text-sm active:text-white/50 transition-colors">
                Not me
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── PIN ENTRY ────────────────────────────────────────────────
  return (
    <div
      className="h-screen flex flex-col select-none overflow-hidden"
      style={{ background: "linear-gradient(160deg,#071a0d 0%,#0d2616 40%,#1a5c2a 100%)" }}
    >
      {/* Top: logo + clock */}
      <div className="flex items-center justify-between px-6 pt-12 pb-0 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg overflow-hidden bg-white flex items-center justify-center shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/atlas-time-logo.png" alt="Atlas Time" className="w-full h-full object-contain" />
          </div>
          <span className="text-white font-bold text-base tracking-tight">Atlas Time</span>
        </div>
        <div className="text-right">
          <div className="text-white/80 font-mono font-semibold text-base tabular-nums">
            {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })}
          </div>
          <div className="text-white/30 text-xs">
            {now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          </div>
        </div>
      </div>

      {/* Center: PIN prompt */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
        <div className="text-center">
          <p className="text-white/50 text-sm font-medium uppercase tracking-widest mb-1">
            {loading ? "Verifying…" : "Enter PIN"}
          </p>

          {/* Error */}
          {error ? (
            <div className="mt-1 text-red-300 text-sm font-medium">{error}</div>
          ) : (
            <div className="mt-1 h-5" />
          )}
        </div>

        {/* Dots */}
        <div className="flex gap-5">
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-150 ${
                i < pin.length
                  ? "w-4 h-4 bg-white"
                  : "w-3.5 h-3.5 bg-white/20"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Numpad — pinned to bottom */}
      <div className="shrink-0 px-8 pb-10 pt-2">
        <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
          {PAD.flat().map((key, i) => (
            key === "" ? (
              <div key={i} />
            ) : (
              <button
                key={i}
                onClick={() => pressKey(key)}
                disabled={loading}
                className={`h-16 rounded-2xl text-xl font-semibold flex items-center justify-center transition-all active:scale-90 disabled:opacity-30
                  ${key === "⌫"
                    ? "bg-white/8 text-white/50 active:bg-white/15"
                    : "bg-white/10 text-white active:bg-white/20"
                  }`}
              >
                {key === "⌫" ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/>
                  </svg>
                ) : loading && pin.length === PIN_LENGTH ? (
                  <div className="w-4 h-4 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
                ) : key}
              </button>
            )
          ))}
        </div>
      </div>
    </div>
  );
}
