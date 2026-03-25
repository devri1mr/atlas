"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

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

const PAD_KEYS = [
  ["1","2","3"],
  ["4","5","6"],
  ["7","8","9"],
  ["","0","⌫"],
];

export default function KioskPage() {
  const [now, setNow] = useState(new Date());
  const [view, setView] = useState<View>("pin");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [openPunch, setOpenPunch] = useState<OpenPunch | null>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [selectedDivision, setSelectedDivision] = useState<string>("");

  const [acting, setActing] = useState(false);
  const [result, setResult] = useState<{ action: "in" | "out"; time: string; hours?: string } | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live clock
  useEffect(() => {
    timerRef.current = setInterval(() => setNow(new Date()), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Idle reset — if no interaction for 30s on confirm screen, go back to PIN
  function resetIdle() {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (view === "confirm") {
      idleTimer.current = setTimeout(() => reset(), 30_000);
    }
  }

  useEffect(() => { resetIdle(); }, [view]);

  function getGps() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { timeout: 6000, maximumAge: 60_000 }
    );
  }

  // Handle PIN digit press
  async function pressKey(key: string) {
    resetIdle();
    if (key === "⌫") {
      setPin((p) => p.slice(0, -1));
      setError("");
      return;
    }
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + key;
    setPin(next);
    setError("");

    if (next.length === PIN_LENGTH) {
      await verifyPin(next);
    }
  }

  // Keyboard support
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
      setError("");
      const res = await fetch("/api/atlas-time/punch/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: p }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(res.status === 404 ? "PIN not found — try again" : (json?.error ?? "Error"));
        setPin("");
        if ("vibrate" in navigator) navigator.vibrate([100, 50, 100]);
        return;
      }
      setEmployee(json.employee);
      setOpenPunch(json.open_punch ?? null);
      setDivisions(json.divisions ?? []);
      // Pre-select their last division or first available
      const lastDiv = json.open_punch?.division_id ?? json.employee?.at_departments?.id ?? json.divisions?.[0]?.id ?? "";
      setSelectedDivision(lastDiv);
      if ("vibrate" in navigator) navigator.vibrate(40);
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
        // Clock out
        const res = await fetch(`/api/atlas-time/punches/${openPunch.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clock_out: true, lat: coords?.lat, lng: coords?.lng }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error ?? "Clock out failed");
        const hrs = ((Date.now() - new Date(openPunch.clock_in_at).getTime()) / 3_600_000).toFixed(2);
        setResult({ action: "out", time: fmtTime(new Date().toISOString()), hours: hrs });
      } else {
        // Clock in
        const res = await fetch("/api/atlas-time/punches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employee_id: employee.id,
            punch_method: "kiosk",
            division_id: selectedDivision || null,
            lat: coords?.lat,
            lng: coords?.lng,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error ?? "Clock in failed");
        setResult({ action: "in", time: fmtTime(new Date().toISOString()) });
      }

      if ("vibrate" in navigator) navigator.vibrate([60, 30, 60]);
      setView("success");
      resetTimer.current = setTimeout(() => reset(), 5000);
    } catch (e: any) {
      setError(e?.message ?? "Punch failed");
    } finally {
      setActing(false);
    }
  }

  function reset() {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    setView("pin");
    setPin("");
    setError("");
    setEmployee(null);
    setOpenPunch(null);
    setDivisions([]);
    setSelectedDivision("");
    setResult(null);
    setCoords(null);
    setActing(false);
  }

  // ─── SUCCESS ──────────────────────────────────────────────────
  if (view === "success" && result && employee) {
    const isIn = result.action === "in";
    const divName = divisions.find(d => d.id === selectedDivision)?.name;
    return (
      <div
        className="h-screen flex flex-col items-center justify-center gap-6 select-none cursor-pointer"
        style={{ background: isIn ? "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" : "#111827" }}
        onClick={reset}
      >
        <div className={`w-36 h-36 rounded-full flex items-center justify-center shadow-2xl ${isIn ? "bg-green-400" : "bg-slate-500"}`}>
          {isIn ? (
            <svg width="68" height="68" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          ) : (
            <svg width="68" height="68" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="6" height="6"/><circle cx="12" cy="12" r="10"/>
            </svg>
          )}
        </div>

        <div className="text-center">
          <div className="text-6xl font-bold text-white mb-3">{isIn ? "Clocked In" : "Clocked Out"}</div>
          <div className="text-2xl text-white/70">{displayName(employee)}</div>
          {divName && <div className="text-lg text-white/50 mt-1">{divName}</div>}
          <div className="text-xl text-white/50 mt-1">{result.time}</div>
        </div>

        {!isIn && result.hours && (
          <div className="bg-white/10 rounded-2xl px-10 py-5 text-center">
            <span className="text-5xl font-bold text-white">{result.hours}</span>
            <span className="text-white/60 text-2xl ml-2">hours today</span>
          </div>
        )}

        <p className="text-white/25 text-base mt-4">Tap to dismiss</p>
      </div>
    );
  }

  // ─── CONFIRM ─────────────────────────────────────────────────
  if (view === "confirm" && employee) {
    const isClockedIn = !!openPunch;
    return (
      <div
        className="h-screen flex flex-col bg-[#f0f4f0] select-none"
        onPointerDown={resetIdle}
      >
        {/* Header */}
        <div
          className="px-8 py-5 flex items-center justify-between shrink-0"
          style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}
        >
          <button onClick={reset} className="flex items-center gap-2.5 text-white/60 hover:text-white text-lg transition-colors">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Back
          </button>
          <div className="font-mono text-white text-2xl font-bold tabular-nums">
            {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })}
          </div>
        </div>

        <div className="flex-1 flex flex-col md:flex-row items-stretch overflow-hidden">
          {/* Left — employee info */}
          <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8">
            {error && (
              <div className="w-full max-w-md rounded-2xl bg-red-50 border border-red-200 px-5 py-4 text-base text-red-700 text-center">{error}</div>
            )}

            {/* Name */}
            <div className="text-center">
              <div className="text-5xl font-bold text-gray-900">{displayName(employee)}</div>
              {employee.job_title && <div className="text-xl text-gray-500 mt-2">{employee.job_title}</div>}
            </div>

            {/* Status */}
            <div className={`w-full max-w-sm rounded-2xl p-6 text-center border-2 ${
              isClockedIn ? "bg-green-50 border-green-200" : "bg-white border-gray-200"
            }`}>
              {isClockedIn ? (
                <>
                  <div className="text-base font-semibold text-green-700 mb-1">Currently Clocked In</div>
                  <div className="text-4xl font-bold text-green-800">{elapsed(openPunch!.clock_in_at)}</div>
                  <div className="text-base text-green-600 mt-1">
                    Since {fmtTime(openPunch!.clock_in_at)}
                    {openPunch!.at_divisions && <span> · {openPunch!.at_divisions.name}</span>}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-base font-semibold text-gray-500 mb-1">Not Clocked In</div>
                  <div className="text-4xl font-bold text-gray-800">
                    {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right — division + punch */}
          <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 bg-white/50 border-t md:border-t-0 md:border-l border-gray-200">
            {/* Division selector (only on clock-in) */}
            {!isClockedIn && divisions.length > 0 && (
              <div className="w-full max-w-sm">
                <label className="block text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3 text-center">Select Division</label>
                <div className="grid grid-cols-1 gap-2.5">
                  {divisions.map((div) => (
                    <button
                      key={div.id}
                      onClick={() => { setSelectedDivision(div.id); resetIdle(); }}
                      className={`w-full py-4 px-5 rounded-2xl text-lg font-semibold text-left border-2 transition-all ${
                        selectedDivision === div.id
                          ? "bg-[#123b1f] text-white border-[#123b1f]"
                          : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      {div.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Punch button */}
            <button
              onClick={confirmPunch}
              disabled={acting || (!isClockedIn && divisions.length > 0 && !selectedDivision)}
              className={`w-full max-w-sm py-7 rounded-3xl text-white text-2xl font-bold shadow-xl transition-all active:scale-95 disabled:opacity-50 ${
                isClockedIn
                  ? "bg-red-500 hover:bg-red-600"
                  : "bg-[#123b1f] hover:bg-[#1a5c2e]"
              }`}
            >
              {acting ? (
                <div className="flex items-center justify-center gap-3">
                  <div className="w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {isClockedIn ? "Clocking Out…" : "Clocking In…"}
                </div>
              ) : isClockedIn ? "Clock Out" : "Clock In"}
            </button>

            <button onClick={reset} className="text-gray-400 hover:text-gray-600 text-base transition-colors">
              That's not me
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── PIN ENTRY (main kiosk screen) ───────────────────────────
  return (
    <div
      className="h-screen flex flex-col items-center justify-center gap-0 select-none"
      style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 60%, #1a5c2a 100%)" }}
    >
      {/* Logo + clock */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-8 py-5">
        <Image src="/atlas-time-logo.png" alt="Atlas Time" width={44} height={44} style={{ objectFit: "contain" }} />
        <div className="text-right">
          <div className="text-white font-mono font-bold text-2xl tabular-nums">
            {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })}
          </div>
          <div className="text-white/40 text-sm">
            {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </div>
        </div>
      </div>

      {/* PIN area */}
      <div className="flex flex-col items-center gap-8 w-full max-w-xs px-6">
        <div className="text-center">
          <div className="text-white text-2xl font-semibold mb-1">Enter Your PIN</div>
          <div className="text-white/40 text-base">
            {loading ? "Checking…" : error ? "" : "4-digit employee code"}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/20 border border-red-400/40 rounded-2xl px-5 py-3 text-red-200 text-base text-center w-full">
            {error}
          </div>
        )}

        {/* PIN dots */}
        <div className="flex gap-4">
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <div
              key={i}
              className={`w-5 h-5 rounded-full transition-all ${
                i < pin.length
                  ? "bg-white scale-110"
                  : "bg-white/20"
              }`}
            />
          ))}
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {PAD_KEYS.flat().map((key, i) => (
            key === "" ? (
              <div key={i} />
            ) : (
              <button
                key={i}
                onClick={() => pressKey(key)}
                disabled={loading}
                className={`aspect-square rounded-2xl text-white font-semibold text-2xl
                  flex items-center justify-center transition-all active:scale-90
                  ${key === "⌫"
                    ? "bg-white/10 hover:bg-white/20 text-white/60"
                    : "bg-white/15 hover:bg-white/25"
                  } disabled:opacity-40`}
              >
                {loading && pin.length === PIN_LENGTH && key !== "⌫" ? (
                  <div className="w-5 h-5 border-2 border-white/50 border-t-transparent rounded-full animate-spin" />
                ) : key}
              </button>
            )
          ))}
        </div>
      </div>
    </div>
  );
}
