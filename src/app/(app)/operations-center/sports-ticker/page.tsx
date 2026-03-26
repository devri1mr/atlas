"use client";

import { useEffect, useState } from "react";

type TickerConfig = {
  showSports: boolean;
  showSportsNews: boolean;
  sportsNFL: boolean;
  sportsNBA: boolean;
  sportsNHL: boolean;
  sportsMLB: boolean;
  sportsNCAAB: boolean;
  sportsCFB: boolean;
};

const DEFAULTS: TickerConfig = {
  showSports: true,
  showSportsNews: true,
  sportsNFL: true,
  sportsNBA: true,
  sportsNHL: true,
  sportsMLB: true,
  sportsNCAAB: true,
  sportsCFB: true,
};

const DASH_CONFIG_KEY = "dashboard-config";

function load(): TickerConfig {
  try {
    const raw = localStorage.getItem(DASH_CONFIG_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULTS;
}

function save(cfg: TickerConfig) {
  try {
    const existing = JSON.parse(localStorage.getItem(DASH_CONFIG_KEY) ?? "{}");
    localStorage.setItem(DASH_CONFIG_KEY, JSON.stringify({ ...existing, ...cfg }));
    // Reset ticker start time so it restarts cleanly after config change
    sessionStorage.removeItem("sports-ticker-start");
  } catch {}
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? "bg-green-500" : "bg-gray-200"}`}
    >
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

function Row({ label, desc, on, onToggle, indent }: { label: string; desc?: string; on: boolean; onToggle: () => void; indent?: boolean }) {
  return (
    <label className={`flex items-center justify-between py-3 hover:bg-gray-50 rounded-xl px-3 cursor-pointer transition-colors ${indent ? "pl-8" : ""}`}>
      <div>
        <div className={`font-medium text-gray-800 ${indent ? "text-sm" : "text-sm"}`}>{label}</div>
        {desc && <div className="text-xs text-gray-400 mt-0.5">{desc}</div>}
      </div>
      <Toggle on={on} onToggle={onToggle} />
    </label>
  );
}

function SHead({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3 pt-5 pb-1 first:pt-0">{children}</p>;
}

export default function SportsTickerSettingsPage() {
  const [cfg, setCfg] = useState<TickerConfig>(DEFAULTS);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setCfg(load()); }, []);

  function tog(key: keyof TickerConfig) {
    const next = { ...cfg, [key]: !cfg[key] };
    setCfg(next);
    save(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  const leagues = [
    { key: "sportsNFL" as const,   label: "NFL",                  desc: "National Football League" },
    { key: "sportsNBA" as const,   label: "NBA",                  desc: "National Basketball Association" },
    { key: "sportsNHL" as const,   label: "NHL",                  desc: "National Hockey League" },
    { key: "sportsMLB" as const,   label: "MLB",                  desc: "Major League Baseball" },
    { key: "sportsNCAAB" as const, label: "NCAAB",                desc: "Men's College Basketball" },
    { key: "sportsCFB" as const,   label: "CFB",                  desc: "College Football" },
  ];

  return (
    <div className="min-h-screen bg-[#f0f4f0]">
      {/* Header */}
      <div className="px-4 md:px-8 py-6 md:py-8"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white/80">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">Sports Ticker</h1>
              <p className="text-white/50 text-xs mt-0.5">Configure live scores and news for the dashboard ticker bar.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-2xl mx-auto space-y-4">

        {/* Saved toast */}
        <div className={`fixed top-4 right-4 z-50 bg-green-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg transition-all duration-300 ${saved ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"}`}>
          Settings saved
        </div>

        {/* Main ticker toggle */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-2 py-1">
          <SHead>Ticker Bar</SHead>
          <Row
            label="Enable Sports Ticker"
            desc="Show the scrolling live-score bar at the bottom of the dashboard."
            on={cfg.showSports}
            onToggle={() => tog("showSports")}
          />
        </div>

        {/* Content */}
        <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm px-2 py-1 transition-opacity ${!cfg.showSports ? "opacity-40 pointer-events-none" : ""}`}>
          <SHead>Ticker Content</SHead>
          <Row
            label="Live Scores"
            desc="Show game scores and status (live, final, upcoming)."
            on={cfg.showSports}
            onToggle={() => {}}
          />
          <div className="mx-3 my-1 text-[11px] text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
            Scores are always included when the ticker is enabled. Toggle individual leagues below.
          </div>
          <Row
            label="Sports News Headlines"
            desc="Append news headlines from active leagues after the scores."
            on={cfg.showSportsNews}
            onToggle={() => tog("showSportsNews")}
          />
        </div>

        {/* Leagues */}
        <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm px-2 py-1 transition-opacity ${!cfg.showSports ? "opacity-40 pointer-events-none" : ""}`}>
          <SHead>Active Leagues</SHead>
          <p className="text-xs text-gray-400 px-3 pb-2">Only enabled leagues appear in the ticker, score card, and news feed.</p>
          {leagues.map(l => (
            <Row
              key={l.key}
              label={l.label}
              desc={l.desc}
              on={cfg[l.key]}
              onToggle={() => tog(l.key)}
              indent
            />
          ))}
        </div>

        {/* Info */}
        <div className="bg-white/60 rounded-2xl border border-gray-100 px-5 py-4">
          <p className="text-xs text-gray-500 leading-relaxed">
            Scores and news are pulled from ESPN's public API and refresh each time the dashboard loads.
            The ticker runs continuously — it remembers its position when you navigate away and come back.
          </p>
        </div>
      </div>
    </div>
  );
}
