"use client";

import { useEffect, useState } from "react";
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
  divisions?: { id: string; name: string } | null;
};
type InvRow = { inventory_value: number; name?: string; quantity_on_hand?: number; min_quantity?: number };

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

// ── Dashboard config ───────────────────────────────────────────────────────────
type DashConfig = {
  // Header
  showWeather: boolean;
  showNewBidBtn: boolean;
  // Stats row
  showStatCards: boolean;
  showOpenBids: boolean;
  showPipelineValue: boolean;
  showWonValue: boolean;
  showInventoryValue: boolean;
  showActiveEmployees: boolean;
  showWinRate: boolean;
  // Main widgets
  showRecentBids: boolean;
  showClockedIn: boolean;
  showBidPipeline: boolean;
  showLowStock: boolean;
  // Right column
  showQuickActions: boolean;
  showGoalProgress: boolean;
};

const DEFAULT_CONFIG: DashConfig = {
  showWeather: true, showNewBidBtn: true,
  showStatCards: true, showOpenBids: true, showPipelineValue: true,
  showWonValue: true, showInventoryValue: true, showActiveEmployees: true, showWinRate: false,
  showRecentBids: true, showClockedIn: true, showBidPipeline: true, showLowStock: true,
  showQuickActions: true, showGoalProgress: true,
};

function loadConfig(): DashConfig {
  try {
    const raw = localStorage.getItem("dashboard-config");
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_CONFIG;
}

// ── Customize drawer section helper ───────────────────────────────────────────
function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${on ? "bg-green-500" : "bg-gray-200"}`}>
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-1"}`} />
    </button>
  );
}
function ToggleRow({ label, desc, on, onToggle, indent }: { label: string; desc?: string; on: boolean; onToggle: () => void; indent?: boolean }) {
  return (
    <label className={`flex items-center justify-between py-2.5 cursor-pointer hover:bg-gray-50 rounded-lg px-2 transition-colors ${indent ? "pl-5" : ""}`}>
      <div>
        <div className={`font-medium text-gray-800 ${indent ? "text-xs" : "text-sm"}`}>{label}</div>
        {desc && <div className="text-xs text-gray-400 mt-0.5">{desc}</div>}
      </div>
      <Toggle on={on} onToggle={onToggle} />
    </label>
  );
}
function SectionHead({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 mt-5 first:mt-0 px-2">{children}</p>;
}

// ── Goal progress ──────────────────────────────────────────────────────────────
const ANNUAL_GOAL = 8_245_000;

// ── Main component ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useUser();
  const [weather, setWeather] = useState<Weather | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [inventoryValue, setInventoryValue] = useState<number | null>(null);
  const [lowStockItems, setLowStockItems] = useState<InvRow[]>([]);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [totalEmployees, setTotalEmployees] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<DashConfig>(DEFAULT_CONFIG);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  useEffect(() => { setConfig(loadConfig()); }, []);

  function saveConfig(next: DashConfig) {
    setConfig(next);
    try { localStorage.setItem("dashboard-config", JSON.stringify(next)); } catch {}
  }
  function toggle(key: keyof DashConfig) { saveConfig({ ...config, [key]: !config[key] }); }

  useEffect(() => {
    Promise.all([
      fetch("/api/bids", { cache: "no-store" }).then(r => r.json()).catch(() => ({})),
      fetch("/api/inventory/summary", { cache: "no-store" }).then(r => r.json()).catch(() => ({})),
      fetch("/api/atlas-time/punches", { cache: "no-store" }).then(r => r.json()).catch(() => ({})),
      fetch("/api/atlas-time/employees", { cache: "no-store" }).then(r => r.json()).catch(() => ({})),
    ]).then(([bidsJson, invJson, punchesJson, empJson]) => {
      const allBids: Bid[] = bidsJson?.data ?? bidsJson?.bids ?? [];
      setBids(allBids);
      const rows: InvRow[] = invJson?.data ?? [];
      setInventoryValue(rows.reduce((s, r) => s + (Number(r.inventory_value) || 0), 0));
      setLowStockItems(rows.filter(r => r.min_quantity != null && (r.quantity_on_hand ?? 0) <= r.min_quantity!));
      const allPunches: Punch[] = punchesJson?.punches ?? [];
      setPunches(allPunches.filter(p => !p.clock_out_at));
      const emps = empJson?.employees ?? [];
      setTotalEmployees(emps.filter((e: any) => e.status === "active").length);
      setLoading(false);
    });

    fetch("https://api.open-meteo.com/v1/forecast?latitude=43.4195&longitude=-83.9508&current=temperature_2m,weathercode&temperature_unit=fahrenheit")
      .then(r => r.json()).then(m => {
        const code = m?.current?.weathercode ?? 0;
        setWeather({ temp: Math.round(m?.current?.temperature_2m ?? 0), city: "Saginaw, MI", ...(WEATHER_CODES[code] ?? { desc: "Clear", icon: "☀️" }) });
      }).catch(() => {});
  }, []);

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
  bids.forEach(b => {
    const s = b.statuses?.name ?? "Draft";
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  });

  const statDefs = [
    { key: "showOpenBids",        label: "Open Bids",          value: String(openBids.length),                               sub: "In pipeline",           color: "blue" },
    { key: "showPipelineValue",   label: "Pipeline Value",     value: fmt$(pipelineValue),                                   sub: "Active opportunities",  color: "green" },
    { key: "showWonValue",        label: "Won This Period",    value: fmt$(wonValue),                                        sub: `${wonBids.length} bids closed`, color: "emerald" },
    { key: "showInventoryValue",  label: "Inventory Value",    value: inventoryValue !== null ? fmt$(inventoryValue) : "—",  sub: "On-hand stock",         color: "amber" },
    { key: "showActiveEmployees", label: "Active Employees",   value: totalEmployees !== null ? String(totalEmployees) : "—",sub: "Clocked-eligible staff",color: "violet" },
    { key: "showWinRate",         label: "Win Rate",           value: winRate !== null ? `${winRate}%` : "—",               sub: "Won vs. closed bids",   color: "rose" },
  ] as const;

  const visibleStats = statDefs.filter(s => config[s.key]);

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
    draft:"bg-gray-100 text-gray-500",sent:"bg-blue-50 text-blue-600",won:"bg-emerald-50 text-emerald-700",
    lost:"bg-red-50 text-red-500","in review":"bg-amber-50 text-amber-600",
  };

  const QUICK_ACTIONS = [
    { label: "New Bid",         href: "/atlasbid/new",                             icon: "📋" },
    { label: "Add Receipt",     href: "/operations-center/inventory",               icon: "📦" },
    { label: "Team Members",    href: "/operations-center/atlas-time/employees",    icon: "👥" },
    { label: "Time Clock",      href: "/operations-center/atlas-time/clock",        icon: "⏱️" },
    { label: "Materials",       href: "/operations-center/materials-catalog",       icon: "🌿" },
    { label: "Settings",        href: "/operations-center",                         icon: "⚙️" },
  ];

  // ── Pipeline status breakdown ────────────────────────────────────────────────
  const pipelineStatuses = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]);
  const maxPipelineCount = Math.max(...pipelineStatuses.map(([, c]) => c), 1);

  // ── Goal progress ────────────────────────────────────────────────────────────
  const goalPct = Math.min(100, Math.round((wonValue / ANNUAL_GOAL) * 100));

  // ── Right column has content? ────────────────────────────────────────────────
  const hasRightCol = config.showQuickActions || config.showGoalProgress;

  return (
    <div className="min-h-screen bg-[#f0f4f0]">

      {/* Hero Header */}
      <div className="relative overflow-hidden px-4 py-6 md:px-8 md:py-8"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}>
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full opacity-[0.06]" style={{ background: "radial-gradient(circle, #fff 0%, transparent 70%)" }} />
        <div className="absolute -bottom-20 right-40 w-96 h-96 rounded-full opacity-[0.04]" style={{ background: "radial-gradient(circle, #4ade80 0%, transparent 70%)" }} />
        <div className="relative flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
              {loading ? "Welcome back" : greeting(name)}
            </h1>
            <p className="text-white/50 text-xs md:text-sm mt-1">{today}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {config.showWeather && weather && (
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
            {config.showNewBidBtn && (
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
        {config.showStatCards && visibleStats.length > 0 && (
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

          {/* Left column */}
          <div className="space-y-5 min-w-0">

            {/* Recent Bids */}
            {config.showRecentBids && (
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
                                <Link href={`/atlasbid/bids/${bid.id}`} className="flex items-center gap-2.5 group w-fit max-w-full">
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1a5c2a] to-[#123b1f] flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                                    {inits}
                                  </div>
                                  <span className="font-semibold text-gray-900 group-hover:text-green-700 transition-colors truncate">{clientDisplay}</span>
                                </Link>
                              </td>
                              <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">{location ?? <span className="text-gray-300">—</span>}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusCls}`}>{statusName}</span>
                              </td>
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
            {(config.showClockedIn || config.showBidPipeline || config.showLowStock) && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">

                {/* Clocked In Now */}
                {config.showClockedIn && (
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

                {/* Bid Pipeline by Status */}
                {config.showBidPipeline && (
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
                          const barColor = status.toLowerCase() === "won" ? "bg-emerald-400"
                            : status.toLowerCase() === "lost" ? "bg-red-300"
                            : status.toLowerCase() === "draft" ? "bg-gray-300"
                            : status.toLowerCase() === "sent" ? "bg-blue-400"
                            : "bg-amber-400";
                          return (
                            <div key={status}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium text-gray-700">{status}</span>
                                <span className="text-xs font-bold text-gray-500 tabular-nums">{count}</span>
                              </div>
                              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Low Stock Alerts */}
                {config.showLowStock && (
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
                      <div className="px-5 py-8 text-center">
                        <div className="text-lg mb-1">✅</div>
                        <div className="text-xs text-gray-400">All inventory is adequately stocked.</div>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-50 max-h-52 overflow-y-auto">
                        <div className="px-5 py-2 bg-amber-50 text-xs font-semibold text-amber-700">{lowStockItems.length} item{lowStockItems.length !== 1 ? "s" : ""} need restocking</div>
                        {lowStockItems.map((item, i) => (
                          <div key={i} className="flex items-center justify-between px-5 py-2.5">
                            <span className="text-xs font-medium text-gray-700 truncate pr-3">{item.name ?? "Item"}</span>
                            <span className="text-[10px] font-semibold text-amber-600 shrink-0">
                              {item.quantity_on_hand ?? 0} / {item.min_quantity}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right column */}
          {hasRightCol && (
            <div className="space-y-5">

              {/* Annual Goal Progress */}
              {config.showGoalProgress && (
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
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-700"
                        style={{ width: loading ? "0%" : `${goalPct}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-2 text-[10px] text-gray-400">
                      <span>Won revenue</span>
                      <span>{fmt$(ANNUAL_GOAL - (loading ? 0 : wonValue))} remaining</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              {config.showQuickActions && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-50">
                    <h2 className="font-bold text-gray-900 text-sm">Quick Actions</h2>
                  </div>
                  <div className="p-3 grid grid-cols-2 gap-2">
                    {QUICK_ACTIONS.map(a => (
                      <Link key={a.href} href={a.href}
                        className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-green-50 border border-transparent hover:border-green-100 transition-all text-center group">
                        <span className="text-2xl">{a.icon}</span>
                        <span className="text-[11px] font-semibold text-gray-700 group-hover:text-green-700 leading-tight">{a.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* InterRivus brand */}
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

      {/* ── Customize Drawer ──────────────────────────────────────────────────── */}
      {customizeOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setCustomizeOpen(false)} />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-[320px] bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="font-bold text-gray-900">Customize Dashboard</h2>
                <p className="text-xs text-gray-400 mt-0.5">Saved automatically</p>
              </div>
              <button onClick={() => setCustomizeOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">

              <SectionHead>Header</SectionHead>
              <ToggleRow label="Weather Widget"    desc="Temperature & conditions for Saginaw, MI"  on={config.showWeather}    onToggle={() => toggle("showWeather")} />
              <ToggleRow label="New Bid Button"    desc="Quick-create button in the header"          on={config.showNewBidBtn} onToggle={() => toggle("showNewBidBtn")} />

              <SectionHead>Stats Row</SectionHead>
              <ToggleRow label="Show Stats Row"    desc="The metrics cards section"                  on={config.showStatCards}       onToggle={() => toggle("showStatCards")} />
              <ToggleRow label="Open Bids"         on={config.showOpenBids}        onToggle={() => toggle("showOpenBids")}        indent />
              <ToggleRow label="Pipeline Value"    on={config.showPipelineValue}   onToggle={() => toggle("showPipelineValue")}   indent />
              <ToggleRow label="Won This Period"   on={config.showWonValue}        onToggle={() => toggle("showWonValue")}        indent />
              <ToggleRow label="Inventory Value"   on={config.showInventoryValue}  onToggle={() => toggle("showInventoryValue")}  indent />
              <ToggleRow label="Active Employees"  on={config.showActiveEmployees} onToggle={() => toggle("showActiveEmployees")} indent />
              <ToggleRow label="Win Rate %"        desc="Won ÷ closed bids"        on={config.showWinRate}         onToggle={() => toggle("showWinRate")}         indent />

              <SectionHead>Main Widgets</SectionHead>
              <ToggleRow label="Recent Bids"       desc="Latest bid activity table"                  on={config.showRecentBids}  onToggle={() => toggle("showRecentBids")} />
              <ToggleRow label="Clocked In Now"    desc="Live list of who is punched in today"       on={config.showClockedIn}   onToggle={() => toggle("showClockedIn")} />
              <ToggleRow label="Bid Pipeline"      desc="Breakdown of bids by status"               on={config.showBidPipeline} onToggle={() => toggle("showBidPipeline")} />
              <ToggleRow label="Low Stock Alerts"  desc="Inventory items below minimum level"       on={config.showLowStock}    onToggle={() => toggle("showLowStock")} />

              <SectionHead>Sidebar Widgets</SectionHead>
              <ToggleRow label="Annual Goal Tracker" desc={`Progress toward ${fmt$(ANNUAL_GOAL)} target`} on={config.showGoalProgress} onToggle={() => toggle("showGoalProgress")} />
              <ToggleRow label="Quick Actions"     desc="Shortcut buttons to common tasks"          on={config.showQuickActions} onToggle={() => toggle("showQuickActions")} />

            </div>

            <div className="px-5 py-4 border-t border-gray-100 shrink-0">
              <button onClick={() => saveConfig(DEFAULT_CONFIG)}
                className="w-full text-sm text-gray-400 hover:text-gray-700 transition-colors py-2 hover:bg-gray-50 rounded-lg">
                Reset to defaults
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
