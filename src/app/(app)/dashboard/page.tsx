"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useUser } from "@/lib/userContext";

// ── Types ──────────────────────────────────────────────────────────────────────
type Weather = { temp: number; desc: string; icon: string; city: string };
type Bid = {
  id: string; client_name: string; client_last_name?: string;
  customer_name?: string | null; created_by_name?: string | null;
  city?: string | null; state?: string | null;
  sell_rounded?: number | null; total_cost?: number | null;
  target_gp_pct?: number | null; created_at: string;
  statuses?: { id: number; name: string; color?: string | null } | null;
  divisions?: { id: string; name: string } | null;
};
type Punch = {
  id: string; clock_in_at: string; clock_out_at: string | null;
  at_employees?: { id: string; first_name: string; last_name: string; job_title?: string | null; at_departments?: { name: string } | null } | null;
};
type InvRow = { inventory_value: number; name?: string; quantity_on_hand?: number; min_quantity?: number };
type GameScore = {
  id: string; league: string; leagueLabel: string;
  awayTeam: string; awayAbbr: string; awayScore: string;
  homeTeam: string; homeAbbr: string; homeScore: string;
  status: string; isLive: boolean; isComplete: boolean;
};
type NewsItem = { headline: string; link: string; sport: string; };

// ── Leagues ────────────────────────────────────────────────────────────────────
const LEAGUES = [
  { key: "sportsNFL",   id: "nfl",                       sport: "football",   label: "NFL",   color: "#013369" },
  { key: "sportsNBA",   id: "nba",                       sport: "basketball", label: "NBA",   color: "#006BB6" },
  { key: "sportsNHL",   id: "nhl",                       sport: "hockey",     label: "NHL",   color: "#000000" },
  { key: "sportsMLB",   id: "mlb",                       sport: "baseball",   label: "MLB",   color: "#002D72" },
  { key: "sportsNCAAB", id: "mens-college-basketball",   sport: "basketball", label: "NCAAB", color: "#CC5500" },
  { key: "sportsCFB",   id: "college-football",          sport: "football",   label: "CFB",   color: "#8B0000" },
] as const;
type LeagueKey = typeof LEAGUES[number]["key"];

// ── Helpers ────────────────────────────────────────────────────────────────────
const WEATHER_CODES: Record<number, { desc: string; icon: string }> = {
  0:{desc:"Clear",icon:"☀️"},1:{desc:"Mostly Clear",icon:"🌤️"},2:{desc:"Partly Cloudy",icon:"⛅"},
  3:{desc:"Overcast",icon:"☁️"},45:{desc:"Foggy",icon:"🌫️"},48:{desc:"Foggy",icon:"🌫️"},
  51:{desc:"Light Drizzle",icon:"🌦️"},53:{desc:"Drizzle",icon:"🌧️"},55:{desc:"Heavy Drizzle",icon:"🌧️"},
  61:{desc:"Light Rain",icon:"🌧️"},63:{desc:"Rain",icon:"🌧️"},65:{desc:"Heavy Rain",icon:"⛈️"},
  71:{desc:"Light Snow",icon:"🌨️"},73:{desc:"Snow",icon:"❄️"},75:{desc:"Heavy Snow",icon:"❄️"},
  80:{desc:"Showers",icon:"🌦️"},95:{desc:"Thunderstorm",icon:"⛈️"},
};
function greeting(name: string) {
  const h = new Date().getHours();
  return `${h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"}, ${name}`;
}
function fmt$(n: number) {
  return n >= 1_000_000 ? `$${(n/1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${(n/1_000).toFixed(0)}K` : `$${n.toLocaleString()}`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function cleanStr(v?: string | null) {
  const s = String(v ?? "").trim();
  return s && s.toLowerCase() !== "null" ? s : "";
}
function elapsed(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

// ── ESPN fetch ─────────────────────────────────────────────────────────────────
async function fetchScores(sport: string, id: string, label: string): Promise<GameScore[]> {
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/${sport}/${id}/scoreboard`,
      { cache: "no-store" }
    );
    const json = await res.json();
    return (json.events ?? []).map((ev: any) => {
      const comp = ev.competitions?.[0];
      const away = comp?.competitors?.find((c: any) => c.homeAway === "away");
      const home = comp?.competitors?.find((c: any) => c.homeAway === "home");
      const statusDetail = comp?.status?.type?.shortDetail ?? "";
      const isLive = comp?.status?.type?.state === "in";
      const isComplete = comp?.status?.type?.completed ?? false;
      return {
        id: ev.id,
        league: id, leagueLabel: label,
        awayTeam: away?.team?.displayName ?? away?.team?.name ?? "Away",
        awayAbbr: away?.team?.abbreviation ?? "AWY",
        awayScore: away?.score ?? "",
        homeTeam: home?.team?.displayName ?? home?.team?.name ?? "Home",
        homeAbbr: home?.team?.abbreviation ?? "HME",
        homeScore: home?.score ?? "",
        status: statusDetail,
        isLive, isComplete,
      };
    });
  } catch { return []; }
}

async function fetchNews(sport: string, id: string, label: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/${sport}/${id}/news?limit=5`,
      { cache: "no-store" }
    );
    const json = await res.json();
    return (json.articles ?? []).map((a: any) => ({
      headline: a.headline ?? "",
      link: a.links?.web?.href ?? "#",
      sport: label,
    }));
  } catch { return []; }
}

// ── Dashboard config ───────────────────────────────────────────────────────────
type DashConfig = {
  showNewBidBtn: boolean;
  showStatCards: boolean;
  showOpenBids: boolean; showPipelineValue: boolean;
  showWonValue: boolean; showInventoryValue: boolean;
  showActiveEmployees: boolean; showWinRate: boolean;
  showRecentBids: boolean; showClockedIn: boolean;
  showBidPipeline: boolean; showLowStock: boolean;
  showQuickActions: boolean; showGoalProgress: boolean;
  showSports: boolean; showSportsNews: boolean;
  sportsNFL: boolean; sportsNBA: boolean; sportsNHL: boolean;
  sportsMLB: boolean; sportsNCAAB: boolean; sportsCFB: boolean;
};
const DEFAULT_CONFIG: DashConfig = {
  showNewBidBtn: true,
  showStatCards: true, showOpenBids: true, showPipelineValue: true,
  showWonValue: true, showInventoryValue: true, showActiveEmployees: true, showWinRate: false,
  showRecentBids: true, showClockedIn: true, showBidPipeline: true, showLowStock: true,
  showQuickActions: true, showGoalProgress: true,
  showSports: true, showSportsNews: true,
  sportsNFL: true, sportsNBA: true, sportsNHL: true,
  sportsMLB: true, sportsNCAAB: true, sportsCFB: true,
};
function loadConfig(): DashConfig {
  try {
    const raw = localStorage.getItem("dashboard-config");
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_CONFIG;
}

// ── Customize helpers ──────────────────────────────────────────────────────────
function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${on ? "bg-green-500" : "bg-gray-200"}`}>
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-1"}`} />
    </button>
  );
}
function TRow({ label, desc, on, onToggle, indent }: { label: string; desc?: string; on: boolean; onToggle: () => void; indent?: boolean }) {
  return (
    <label className={`flex items-center justify-between py-2.5 hover:bg-gray-50 rounded-lg px-2 cursor-pointer transition-colors ${indent ? "pl-5" : ""}`}>
      <div>
        <div className={`font-medium text-gray-800 ${indent ? "text-xs" : "text-sm"}`}>{label}</div>
        {desc && <div className="text-xs text-gray-400 mt-0.5">{desc}</div>}
      </div>
      <Toggle on={on} onToggle={onToggle} />
    </label>
  );
}
function SHead({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 mt-5 first:mt-0 px-2">{children}</p>;
}

const ANNUAL_GOAL = 8_245_000;

// ── Sports Ticker ──────────────────────────────────────────────────────────────
const TICKER_SESSION_KEY = "sports-ticker-start";

function SportsTicker({ games, news, config }: { games: GameScore[]; news: NewsItem[]; config: DashConfig }) {
  const activeLeagues = LEAGUES.filter(l => config[l.key]);
  const visibleGames = games.filter(g => activeLeagues.some(l => l.label === g.leagueLabel));

  const items: string[] = [];
  for (const league of activeLeagues) {
    const lg = visibleGames.filter(g => g.leagueLabel === league.label);
    lg.forEach(g => {
      const score = g.isComplete || g.isLive
        ? `${g.awayAbbr} ${g.awayScore} - ${g.homeScore} ${g.homeAbbr}`
        : `${g.awayAbbr} vs ${g.homeAbbr}`;
      const status = g.isLive ? `🔴 ${g.status}` : g.status;
      items.push(`[${league.label}] ${score}  ${status}`);
    });
  }
  if (config.showSportsNews) {
    news.forEach(n => { items.push(`📰 [${n.sport}] ${n.headline}`); });
  }

  const duration = Math.max(30, items.length * 8);
  const [animDelay, setAnimDelay] = useState(0);

  useEffect(() => {
    try {
      let start = Number(sessionStorage.getItem(TICKER_SESSION_KEY) || 0);
      if (!start) {
        start = Date.now();
        sessionStorage.setItem(TICKER_SESSION_KEY, String(start));
      }
      const elapsed = (Date.now() - start) / 1000;
      setAnimDelay(-(elapsed % duration));
    } catch {}
  }, [duration]);

  if (items.length === 0) return null;

  const ticker = [...items, ...items].join("   ·   ");

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center overflow-hidden"
      style={{ background: "#0a1a0e", borderTop: "1px solid rgba(255,255,255,0.08)", height: 32 }}>
      <div className="shrink-0 px-3 text-[10px] font-bold text-green-400 tracking-widest uppercase border-r border-white/10 h-full flex items-center">
        SCORES
      </div>
      <div className="flex-1 overflow-hidden relative h-full">
        <div
          className="absolute top-0 whitespace-nowrap flex items-center h-full text-[11px] font-medium text-white/80 tracking-wide"
          style={{
            animation: `ticker ${duration}s linear infinite`,
            animationDelay: `${animDelay}s`,
          }}
        >
          {ticker}
        </div>
      </div>
      <style>{`
        @keyframes ticker {
          0%   { transform: translateX(100vw); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
}

// ── News Card ──────────────────────────────────────────────────────────────────
function SportsNewsCard({ news }: { news: NewsItem[] }) {
  const [activeTab, setActiveTab] = useState<string>("all");
  const leagues = ["all", ...Array.from(new Set(news.map(n => n.sport)))];
  const filtered = activeTab === "all" ? news : news.filter(n => n.sport === activeTab);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
        <h2 className="font-bold text-gray-900 text-sm">Sports News</h2>
        <div className="flex gap-1">
          {leagues.slice(0, 5).map(l => (
            <button key={l} onClick={() => setActiveTab(l)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors ${activeTab === l ? "bg-[#0a1a0e] text-white" : "text-gray-400 hover:text-gray-600"}`}>
              {l === "all" ? "ALL" : l}
            </button>
          ))}
        </div>
      </div>
      <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
        {filtered.length === 0
          ? <div className="px-5 py-6 text-xs text-gray-400 text-center">No news available.</div>
          : filtered.map((n, i) => (
            <a key={i} href={n.link} target="_blank" rel="noopener noreferrer"
              className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50/60 transition-colors group">
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0 mt-0.5">{n.sport}</span>
              <span className="text-xs text-gray-700 group-hover:text-green-700 transition-colors leading-relaxed">{n.headline}</span>
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5 text-gray-300 group-hover:text-green-500 transition-colors">
                <path d="M3 9L9 3M9 3H5M9 3v4"/>
              </svg>
            </a>
          ))
        }
      </div>
    </div>
  );
}

// ── Scores Card ────────────────────────────────────────────────────────────────
function ScoresCard({ games, config }: { games: GameScore[]; config: DashConfig }) {
  const activeLeagues = LEAGUES.filter(l => config[l.key]);
  const [activeTab, setActiveTab] = useState(activeLeagues[0]?.label ?? "NFL");

  const leagueGames = games.filter(g => g.leagueLabel === activeTab);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="border-b border-gray-50">
        <div className="flex overflow-x-auto">
          {activeLeagues.map(l => (
            <button key={l.label} onClick={() => setActiveTab(l.label)}
              className={`shrink-0 px-4 py-3 text-xs font-bold tracking-wide transition-colors border-b-2 ${
                activeTab === l.label ? "border-[#123b1f] text-[#123b1f]" : "border-transparent text-gray-400 hover:text-gray-600"
              }`}>
              {l.label}
            </button>
          ))}
        </div>
      </div>
      {leagueGames.length === 0 ? (
        <div className="px-5 py-6 text-xs text-gray-400 text-center">No games scheduled today.</div>
      ) : (
        <div className="divide-y divide-gray-50 max-h-60 overflow-y-auto">
          {leagueGames.map(g => (
            <div key={g.id} className="flex items-center px-5 py-2.5 gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-xs">
                  <span className={`font-semibold ${g.isComplete && Number(g.awayScore) > Number(g.homeScore) ? "text-gray-900" : "text-gray-500"}`}>
                    {g.awayAbbr}
                  </span>
                  <span className={`font-bold tabular-nums text-sm ${g.isComplete && Number(g.awayScore) > Number(g.homeScore) ? "text-gray-900" : "text-gray-500"}`}>
                    {g.awayScore || "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs mt-1">
                  <span className={`font-semibold ${g.isComplete && Number(g.homeScore) > Number(g.awayScore) ? "text-gray-900" : "text-gray-500"}`}>
                    {g.homeAbbr}
                  </span>
                  <span className={`font-bold tabular-nums text-sm ${g.isComplete && Number(g.homeScore) > Number(g.awayScore) ? "text-gray-900" : "text-gray-500"}`}>
                    {g.homeScore || "—"}
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  g.isLive ? "bg-red-50 text-red-600" :
                  g.isComplete ? "bg-gray-100 text-gray-500" :
                  "bg-blue-50 text-blue-600"
                }`}>
                  {g.isLive ? `🔴 ${g.status}` : g.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user, can } = useUser();
  const [weather, setWeather] = useState<Weather | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [inventoryValue, setInventoryValue] = useState<number | null>(null);
  const [lowStockItems, setLowStockItems] = useState<InvRow[]>([]);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [totalEmployees, setTotalEmployees] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [games, setGames] = useState<GameScore[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [config, setConfig] = useState<DashConfig>(DEFAULT_CONFIG);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  useEffect(() => { setConfig(loadConfig()); }, []);

  function saveConfig(next: DashConfig) {
    setConfig(next);
    try { localStorage.setItem("dashboard-config", JSON.stringify(next)); } catch {}
  }
  function tog(key: keyof DashConfig) { saveConfig({ ...config, [key]: !config[key] }); }

  // Main data
  useEffect(() => {
    Promise.all([
      fetch("/api/bids", { cache: "no-store" }).then(r => r.json()).catch(() => ({})),
      fetch("/api/inventory/summary", { cache: "no-store" }).then(r => r.json()).catch(() => ({})),
      fetch("/api/atlas-time/punches", { cache: "no-store" }).then(r => r.json()).catch(() => ({})),
      fetch("/api/atlas-time/employees", { cache: "no-store" }).then(r => r.json()).catch(() => ({})),
    ]).then(([bidsJson, invJson, punchesJson, empJson]) => {
      setBids(bidsJson?.data ?? bidsJson?.bids ?? []);
      const rows: InvRow[] = invJson?.data ?? [];
      setInventoryValue(rows.reduce((s, r) => s + (Number(r.inventory_value) || 0), 0));
      setLowStockItems(rows.filter(r => r.min_quantity != null && (r.quantity_on_hand ?? 0) <= r.min_quantity!));
      setPunches((punchesJson?.punches ?? []).filter((p: Punch) => !p.clock_out_at));
      setTotalEmployees((empJson?.employees ?? []).filter((e: any) => e.status === "active").length);
      setLoading(false);
    });

    fetch("https://api.open-meteo.com/v1/forecast?latitude=43.4195&longitude=-83.9508&current=temperature_2m,weathercode&temperature_unit=fahrenheit")
      .then(r => r.json()).then(m => {
        const code = m?.current?.weathercode ?? 0;
        setWeather({ temp: Math.round(m?.current?.temperature_2m ?? 0), city: "Saginaw, MI", ...(WEATHER_CODES[code] ?? { desc: "Clear", icon: "☀️" }) });
      }).catch(() => {});
  }, []);

  // Sports data
  useEffect(() => {
    if (!config.showSports) return;
    const activeLeagues = LEAGUES.filter(l => config[l.key]);
    Promise.all(activeLeagues.map(l => fetchScores(l.sport, l.id, l.label))).then(results => {
      setGames(results.flat());
    });
    if (config.showSportsNews) {
      Promise.all(activeLeagues.map(l => fetchNews(l.sport, l.id, l.label))).then(results => {
        setNews(results.flat());
      });
    }
  }, [config.showSports, config.showSportsNews,
      config.sportsNFL, config.sportsNBA, config.sportsNHL,
      config.sportsMLB, config.sportsNCAAB, config.sportsCFB]);

  const name = user?.full_name?.trim()
    ? user.full_name.trim().split(" ")[0]
    : user?.email?.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, c => c.toUpperCase()).split(" ")[0] ?? "there";

  const openBids = bids.filter(b => !["won","lost","archived"].includes((b.statuses?.name ?? "").toLowerCase()));
  const wonBids  = bids.filter(b => (b.statuses?.name ?? "").toLowerCase() === "won");
  const closedBids = bids.filter(b => ["won","lost"].includes((b.statuses?.name ?? "").toLowerCase()));
  const pipelineValue = openBids.reduce((s, b) => s + (Number(b.sell_rounded) || 0), 0);
  const wonValue = wonBids.reduce((s, b) => s + (Number(b.sell_rounded) || 0), 0);
  const winRate = closedBids.length > 0 ? Math.round((wonBids.length / closedBids.length) * 100) : null;

  const statusCounts: Record<string, number> = {};
  bids.forEach(b => { const s = b.statuses?.name ?? "Draft"; statusCounts[s] = (statusCounts[s] ?? 0) + 1; });

  const allStats = [
    { key: "showOpenBids",        label: "Open Bids",         value: String(openBids.length),                              sub: "In pipeline",           color: "blue",    permKey: "bids_view" },
    { key: "showPipelineValue",   label: "Pipeline Value",    value: fmt$(pipelineValue),                                  sub: "Active opportunities",  color: "green",   permKey: "bids_view" },
    { key: "showWonValue",        label: "Won This Period",   value: fmt$(wonValue),                                       sub: `${wonBids.length} closed`, color: "emerald", permKey: "bids_view" },
    { key: "showInventoryValue",  label: "Inventory Value",   value: inventoryValue !== null ? fmt$(inventoryValue) : "—", sub: "On-hand stock",         color: "amber",   permKey: "mat_inventory_view" },
    { key: "showActiveEmployees", label: "Active Employees",  value: totalEmployees !== null ? String(totalEmployees) : "—", sub: "Clocked-eligible",    color: "violet",  permKey: "hr_team_view" },
    { key: "showWinRate",         label: "Win Rate",          value: winRate !== null ? `${winRate}%` : "—",               sub: "Won vs. closed bids",   color: "rose",    permKey: "bids_view" },
  ] as const;

  const visibleStats = allStats.filter(s =>
    config[s.key as keyof DashConfig] &&
    config.showStatCards &&
    can(s.permKey)
  );

  const statColors: Record<string, { bg: string; ring: string }> = {
    blue:    { bg: "from-blue-50 to-white",    ring: "ring-blue-100" },
    green:   { bg: "from-green-50 to-white",   ring: "ring-green-100" },
    emerald: { bg: "from-emerald-50 to-white", ring: "ring-emerald-100" },
    amber:   { bg: "from-amber-50 to-white",   ring: "ring-amber-100" },
    violet:  { bg: "from-violet-50 to-white",  ring: "ring-violet-100" },
    rose:    { bg: "from-rose-50 to-white",    ring: "ring-rose-100" },
  };

  const recentBids = [...bids].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 8);
  const statusColor: Record<string, string> = {
    draft:"bg-gray-100 text-gray-500", sent:"bg-blue-50 text-blue-600",
    won:"bg-emerald-50 text-emerald-700", lost:"bg-red-50 text-red-500",
    "in review":"bg-amber-50 text-amber-600",
  };
  const pipelineStatuses = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]);
  const maxPipelineCount = Math.max(...pipelineStatuses.map(([,c]) => c), 1);
  const goalPct = Math.min(100, Math.round((wonValue / ANNUAL_GOAL) * 100));
  const hasRightCol = config.showQuickActions || config.showGoalProgress;

  // Permission-aware quick actions
  const ALL_QUICK_ACTIONS = [
    { label: "New Bid",         href: "/atlasbid/new",                          icon: "📋", permKey: "bids_create" },
    { label: "Add Receipt",     href: "/operations-center/inventory",            icon: "📦", permKey: "mat_inventory_edit" },
    { label: "Team Members",    href: "/operations-center/atlas-time/employees", icon: "👥", permKey: "hr_team_view" },
    { label: "Time Clock",      href: "/operations-center/atlas-time/clock",     icon: "⏱️", permKey: "hr_manager" },
    { label: "Materials",       href: "/operations-center/materials-catalog",    icon: "🌿", permKey: "mat_catalog_view" },
    { label: "Settings",        href: "/operations-center",                      icon: "⚙️", permKey: "settings_view" },
  ];
  const quickActions = ALL_QUICK_ACTIONS.filter(a => can(a.permKey));

  return (
    <div className="min-h-screen bg-[#f0f4f0]" style={{ paddingBottom: config.showSports ? 40 : 0 }}>

      {/* Hero Header */}
      <div className="relative overflow-hidden px-4 py-6 md:px-8 md:py-8"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}>
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full opacity-[0.06]" style={{ background: "radial-gradient(circle, #fff 0%, transparent 70%)" }} />
        <div className="relative flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
              {loading ? "Welcome back" : greeting(name)}
            </h1>
            <p className="text-white/50 text-xs md:text-sm mt-1">{today}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Weather — always shown */}
            {weather && (
              <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl px-3 py-2">
                <span className="text-xl">{weather.icon}</span>
                <div>
                  <div className="text-white font-semibold text-xs md:text-sm">{weather.temp}°F · {weather.desc}</div>
                  <div className="text-white/50 text-[10px]">{weather.city}</div>
                </div>
              </div>
            )}
            <button onClick={() => setCustomizeOpen(true)}
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/15 text-white/70 hover:text-white font-medium text-sm px-3 py-2.5 rounded-xl transition-all">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
              Customize
            </button>
            {/* New Bid — only if user has bids_create */}
            {config.showNewBidBtn && can("bids_create") && (
              <Link href="/atlasbid/new"
                className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-lg shadow-green-900/30 transition-all">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                New Bid
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-5 md:py-7 pb-12 space-y-5 md:space-y-6 max-w-[1400px]">

        {/* Stat Cards */}
        {visibleStats.length > 0 && (
          <div className={`grid gap-4 ${visibleStats.length <= 2 ? "grid-cols-2" : visibleStats.length <= 4 ? "grid-cols-2 xl:grid-cols-4" : "grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"}`}>
            {visibleStats.map(s => {
              const c = statColors[s.color];
              return (
                <div key={s.key} className={`bg-gradient-to-br ${c.bg} rounded-2xl border border-gray-100 shadow-sm p-5 ring-1 ${c.ring}`}>
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{s.label}</div>
                  <div className="text-3xl font-bold text-gray-900 tabular-nums tracking-tight">
                    {loading ? <span className="inline-block w-20 h-8 bg-gray-100 rounded animate-pulse" /> : s.value}
                  </div>
                  <div className="mt-2 text-xs text-gray-400">{s.sub}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Main grid */}
        <div className={`grid gap-6 ${hasRightCol ? "grid-cols-1 xl:grid-cols-[1fr_280px]" : "grid-cols-1"}`}>
          <div className="space-y-5 min-w-0">

            {/* Recent Bids */}
            {config.showRecentBids && can("bids_view") && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
                  <h2 className="font-bold text-gray-900">Recent Bids</h2>
                  <Link href="/atlasbid/bids" className="text-xs text-green-600 font-semibold hover:underline">View all →</Link>
                </div>
                {loading ? (
                  <div className="p-6 space-y-3">{[...Array(5)].map((_,i)=><div key={i} className="h-10 bg-gray-50 rounded-lg animate-pulse"/>)}</div>
                ) : recentBids.length === 0 ? (
                  <div className="px-6 py-12 text-center text-sm text-gray-400">No bids yet. <Link href="/atlasbid/new" className="text-green-600 font-semibold hover:underline">Create your first →</Link></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[560px]">
                      <thead>
                        <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-50">
                          <th className="text-left px-4 py-3">Client</th>
                          <th className="text-left px-4 py-3 hidden md:table-cell">Location</th>
                          <th className="text-left px-4 py-3">Status</th>
                          <th className="text-right px-4 py-3">Value</th>
                          <th className="text-right px-4 py-3 hidden sm:table-cell">GP%</th>
                          <th className="text-right px-4 py-3 hidden sm:table-cell">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentBids.map(bid => {
                          const statusName = bid.statuses?.name ?? "Draft";
                          const statusCls = statusColor[statusName.toLowerCase()] ?? "bg-gray-100 text-gray-500";
                          const location = [bid.city, bid.state].filter(Boolean).join(", ") || null;
                          const gp = bid.target_gp_pct != null ? `${Math.round(bid.target_gp_pct)}%` : null;
                          const clientDisplay = cleanStr(bid.customer_name) ||
                            [cleanStr(bid.client_name), cleanStr(bid.client_last_name)].filter(Boolean).join(" ") || "—";
                          const inits = clientDisplay !== "—" ? clientDisplay.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase() : "?";
                          return (
                            <tr key={bid.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                              <td className="px-4 md:px-5 py-3">
                                <Link href={`/atlasbid/bids/${bid.id}`} className="flex items-center gap-2.5 group w-fit">
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1a5c2a] to-[#123b1f] flex items-center justify-center text-white text-[11px] font-bold shrink-0">{inits}</div>
                                  <span className="font-semibold text-gray-900 group-hover:text-green-700 transition-colors truncate">{clientDisplay}</span>
                                </Link>
                              </td>
                              <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">{location ?? <span className="text-gray-300">—</span>}</td>
                              <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusCls}`}>{statusName}</span></td>
                              <td className="px-4 py-3 text-right font-medium text-gray-700 tabular-nums">{bid.sell_rounded ? fmt$(Number(bid.sell_rounded)) : "—"}</td>
                              <td className="px-4 py-3 text-right text-gray-500 text-xs tabular-nums hidden sm:table-cell">{gp ?? <span className="text-gray-300">—</span>}</td>
                              <td className="px-4 py-3 text-right text-gray-400 text-xs tabular-nums hidden sm:table-cell">{fmtDate(bid.created_at)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Bottom row: Clocked In + Pipeline + Low Stock */}
            {(config.showClockedIn || (config.showBidPipeline && can("bids_view")) || (config.showLowStock && can("mat_inventory_view"))) && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {config.showClockedIn && can("hr_manager") && (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                        <h2 className="font-bold text-gray-900 text-sm">Clocked In Now</h2>
                      </div>
                      <Link href="/operations-center/atlas-time/clock" className="text-xs text-green-600 font-semibold hover:underline">View →</Link>
                    </div>
                    {loading ? (
                      <div className="p-4 space-y-2">{[...Array(3)].map((_,i)=><div key={i} className="h-8 bg-gray-50 rounded-lg animate-pulse"/>)}</div>
                    ) : punches.length === 0 ? (
                      <div className="px-5 py-8 text-center text-xs text-gray-400">No one is clocked in right now.</div>
                    ) : (
                      <div className="divide-y divide-gray-50 max-h-52 overflow-y-auto">
                        <div className="px-5 py-2 bg-green-50/50 text-xs font-semibold text-green-700">{punches.length} clocked in</div>
                        {punches.map(p => {
                          const emp = p.at_employees;
                          if (!emp) return null;
                          return (
                            <div key={p.id} className="flex items-center gap-3 px-5 py-2.5">
                              <div className="w-7 h-7 rounded-full bg-[#123b1f]/10 flex items-center justify-center text-[#123b1f] font-bold text-[10px] shrink-0">
                                {emp.first_name[0]}{emp.last_name[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-semibold text-gray-800 truncate">{emp.first_name} {emp.last_name}</div>
                                <div className="text-[10px] text-gray-400 truncate">{emp.job_title ?? emp.at_departments?.name ?? ""}</div>
                              </div>
                              <span className="text-[10px] font-semibold text-green-600 shrink-0">{elapsed(p.clock_in_at)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                {config.showBidPipeline && can("bids_view") && (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
                      <h2 className="font-bold text-gray-900 text-sm">Bid Pipeline</h2>
                      <Link href="/atlasbid/bids" className="text-xs text-green-600 font-semibold hover:underline">View →</Link>
                    </div>
                    {loading ? (
                      <div className="p-4 space-y-2">{[...Array(4)].map((_,i)=><div key={i} className="h-8 bg-gray-50 rounded-lg animate-pulse"/>)}</div>
                    ) : pipelineStatuses.length === 0 ? (
                      <div className="px-5 py-8 text-center text-xs text-gray-400">No bids yet.</div>
                    ) : (
                      <div className="p-4 space-y-2.5">
                        {pipelineStatuses.map(([status, count]) => {
                          const pct = Math.round((count / maxPipelineCount) * 100);
                          const barColor = status.toLowerCase() === "won" ? "bg-emerald-400" : status.toLowerCase() === "lost" ? "bg-red-300" : status.toLowerCase() === "draft" ? "bg-gray-300" : status.toLowerCase() === "sent" ? "bg-blue-400" : "bg-amber-400";
                          return (
                            <div key={status}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium text-gray-700">{status}</span>
                                <span className="text-xs font-bold text-gray-500 tabular-nums">{count}</span>
                              </div>
                              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                {config.showLowStock && can("mat_inventory_view") && (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {lowStockItems.length > 0 && <span className="w-2 h-2 rounded-full bg-amber-400" />}
                        <h2 className="font-bold text-gray-900 text-sm">Low Stock</h2>
                      </div>
                      <Link href="/operations-center/inventory" className="text-xs text-green-600 font-semibold hover:underline">View →</Link>
                    </div>
                    {loading ? (
                      <div className="p-4 space-y-2">{[...Array(3)].map((_,i)=><div key={i} className="h-8 bg-gray-50 rounded-lg animate-pulse"/>)}</div>
                    ) : lowStockItems.length === 0 ? (
                      <div className="px-5 py-8 text-center"><div className="text-lg mb-1">✅</div><div className="text-xs text-gray-400">All inventory adequately stocked.</div></div>
                    ) : (
                      <div className="divide-y divide-gray-50 max-h-52 overflow-y-auto">
                        <div className="px-5 py-2 bg-amber-50 text-xs font-semibold text-amber-700">{lowStockItems.length} item{lowStockItems.length !== 1 ? "s" : ""} need restocking</div>
                        {lowStockItems.map((item, i) => (
                          <div key={i} className="flex items-center justify-between px-5 py-2.5">
                            <span className="text-xs font-medium text-gray-700 truncate pr-3">{item.name ?? "Item"}</span>
                            <span className="text-[10px] font-semibold text-amber-600 shrink-0">{item.quantity_on_hand ?? 0} / {item.min_quantity}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Sports scores + news */}
            {config.showSports && (
              <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
                <ScoresCard games={games} config={config} />
                {config.showSportsNews && news.length > 0 && <SportsNewsCard news={news} />}
              </div>
            )}
          </div>

          {/* Right column */}
          {hasRightCol && (
            <div className="space-y-5">
              {config.showGoalProgress && can("bids_view") && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-50">
                    <h2 className="font-bold text-gray-900 text-sm">Annual Revenue Goal</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Target: {fmt$(ANNUAL_GOAL)}</p>
                  </div>
                  <div className="p-5">
                    <div className="flex items-end justify-between mb-3">
                      <div className="text-2xl font-bold text-gray-900 tabular-nums">{loading ? "—" : fmt$(wonValue)}</div>
                      <div className="text-sm font-bold text-green-600">{loading ? "" : `${goalPct}%`}</div>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-700" style={{ width: loading ? "0%" : `${goalPct}%` }} />
                    </div>
                    <div className="flex justify-between mt-2 text-[10px] text-gray-400">
                      <span>Won revenue</span>
                      <span>{fmt$(ANNUAL_GOAL - (loading ? 0 : wonValue))} remaining</span>
                    </div>
                  </div>
                </div>
              )}
              {config.showQuickActions && quickActions.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-50">
                    <h2 className="font-bold text-gray-900 text-sm">Quick Actions</h2>
                  </div>
                  <div className="p-3 grid grid-cols-2 gap-2">
                    {quickActions.map(a => (
                      <Link key={a.href} href={a.href}
                        className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-green-50 border border-transparent hover:border-green-100 transition-all text-center group">
                        <span className="text-2xl">{a.icon}</span>
                        <span className="text-[11px] font-semibold text-gray-700 group-hover:text-green-700 leading-tight">{a.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              <a href="https://interrivus.com" target="_blank" rel="noopener noreferrer"
                className="rounded-2xl overflow-hidden relative block group transition-all hover:shadow-md"
                style={{ background: "linear-gradient(180deg, #f9fbfd 0%, #dce9f4 100%)", minHeight: 110 }}>
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 140" preserveAspectRatio="xMidYMid slice">
                  <path d="M-20 90 Q80 75 180 88 Q280 101 400 85" stroke="rgba(100,155,210,0.18)" strokeWidth="2" fill="none"/>
                  <path d="M-20 108 Q90 95 200 106 Q310 117 420 102" stroke="rgba(100,155,210,0.12)" strokeWidth="1.5" fill="none"/>
                </svg>
                <div className="relative p-5 flex flex-col items-center text-center">
                  <div className="text-[#6a8aa8] text-[9px] uppercase tracking-[0.2em] font-semibold mb-2">Powered by</div>
                  <Image src="/interrivus-logo.png" alt="InterRivus Systems" width={110} height={34} style={{ objectFit: "contain", mixBlendMode: "multiply" }} />
                  <div className="mt-2 flex items-center gap-1 text-[#2a6496] text-xs font-semibold group-hover:underline">
                    interrivus.com
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9L9 3M9 3H5M9 3v4"/></svg>
                  </div>
                </div>
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Fixed bottom sports ticker */}
      {config.showSports && <SportsTicker games={games} news={news} config={config} />}

      {/* Customize Drawer */}
      {customizeOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setCustomizeOpen(false)} />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-[320px] bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="font-bold text-gray-900">Customize Dashboard</h2>
                <p className="text-xs text-gray-400 mt-0.5">Saved automatically</p>
              </div>
              <button onClick={() => setCustomizeOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <SHead>Header</SHead>
              <div className="px-2 py-2.5 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-800">Weather Widget</div>
                  <div className="text-xs text-gray-400 mt-0.5">Always shown for everyone</div>
                </div>
                <div className="text-xs font-semibold text-gray-400 px-2 py-1 bg-gray-100 rounded-lg">Always on</div>
              </div>
              <TRow label="New Bid Button" desc="Quick-create button (only for users with bid access)" on={config.showNewBidBtn} onToggle={() => tog("showNewBidBtn")} />

              <SHead>Stats Row</SHead>
              <TRow label="Show Stats Row" desc="The metrics cards section" on={config.showStatCards} onToggle={() => tog("showStatCards")} />
              <TRow label="Open Bids"        on={config.showOpenBids}        onToggle={() => tog("showOpenBids")}        indent />
              <TRow label="Pipeline Value"   on={config.showPipelineValue}   onToggle={() => tog("showPipelineValue")}   indent />
              <TRow label="Won This Period"  on={config.showWonValue}        onToggle={() => tog("showWonValue")}        indent />
              <TRow label="Inventory Value"  on={config.showInventoryValue}  onToggle={() => tog("showInventoryValue")}  indent />
              <TRow label="Active Employees" on={config.showActiveEmployees} onToggle={() => tog("showActiveEmployees")} indent />
              <TRow label="Win Rate %"       desc="Won ÷ closed bids" on={config.showWinRate} onToggle={() => tog("showWinRate")} indent />

              <SHead>Main Widgets</SHead>
              <TRow label="Recent Bids"      desc="Latest bid activity table"               on={config.showRecentBids}  onToggle={() => tog("showRecentBids")} />
              <TRow label="Clocked In Now"   desc="Live list of who is punched in"          on={config.showClockedIn}   onToggle={() => tog("showClockedIn")} />
              <TRow label="Bid Pipeline"     desc="Breakdown of bids by status"             on={config.showBidPipeline} onToggle={() => tog("showBidPipeline")} />
              <TRow label="Low Stock Alerts" desc="Inventory items below minimum"           on={config.showLowStock}    onToggle={() => tog("showLowStock")} />

              <SHead>Sidebar Widgets</SHead>
              <TRow label="Annual Goal Tracker" desc="Progress toward $8.245M target" on={config.showGoalProgress} onToggle={() => tog("showGoalProgress")} />
              <TRow label="Quick Actions"    desc="Shortcut buttons — filtered by your permissions" on={config.showQuickActions} onToggle={() => tog("showQuickActions")} />

              <SHead>Sports</SHead>
              <TRow label="Sports Ticker & Scores" desc="Bottom bar + scores card" on={config.showSports} onToggle={() => tog("showSports")} />
              <TRow label="Sports News"      desc="Headlines by league"                     on={config.showSportsNews}  onToggle={() => tog("showSportsNews")} />
              <TRow label="NFL"  on={config.sportsNFL}   onToggle={() => tog("sportsNFL")}   indent />
              <TRow label="NBA"  on={config.sportsNBA}   onToggle={() => tog("sportsNBA")}   indent />
              <TRow label="NHL"  on={config.sportsNHL}   onToggle={() => tog("sportsNHL")}   indent />
              <TRow label="MLB"  on={config.sportsMLB}   onToggle={() => tog("sportsMLB")}   indent />
              <TRow label="NCAAB (Men's)" on={config.sportsNCAAB} onToggle={() => tog("sportsNCAAB")} indent />
              <TRow label="College Football"  on={config.sportsCFB}   onToggle={() => tog("sportsCFB")}   indent />
            </div>
            <div className="px-5 py-4 border-t border-gray-100 shrink-0">
              <button onClick={() => saveConfig(DEFAULT_CONFIG)} className="w-full text-sm text-gray-400 hover:text-gray-700 transition-colors py-2 hover:bg-gray-50 rounded-lg">
                Reset to defaults
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
