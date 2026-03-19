"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Weather = { temp: number; desc: string; icon: string; city: string };
type Bid = { id: string; client_name: string; client_last_name?: string; status?: string; total_price?: number; created_at: string };
type StatCard = { label: string; value: string; sub?: string; trend?: "up" | "down" | "neutral"; color?: string };

const WEATHER_CODES: Record<number, { desc: string; icon: string }> = {
  0: { desc: "Clear", icon: "☀️" }, 1: { desc: "Mostly Clear", icon: "🌤️" },
  2: { desc: "Partly Cloudy", icon: "⛅" }, 3: { desc: "Overcast", icon: "☁️" },
  45: { desc: "Foggy", icon: "🌫️" }, 48: { desc: "Foggy", icon: "🌫️" },
  51: { desc: "Light Drizzle", icon: "🌦️" }, 53: { desc: "Drizzle", icon: "🌧️" },
  55: { desc: "Heavy Drizzle", icon: "🌧️" }, 61: { desc: "Light Rain", icon: "🌧️" },
  63: { desc: "Rain", icon: "🌧️" }, 65: { desc: "Heavy Rain", icon: "⛈️" },
  71: { desc: "Light Snow", icon: "🌨️" }, 73: { desc: "Snow", icon: "❄️" },
  75: { desc: "Heavy Snow", icon: "❄️" }, 80: { desc: "Showers", icon: "🌦️" },
  95: { desc: "Thunderstorm", icon: "⛈️" },
};

function greeting(name: string) {
  const h = new Date().getHours();
  const time = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return `${time}, ${name}`;
}

function fmt$(n: number) {
  return n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `$${(n / 1_000).toFixed(0)}K`
    : `$${n.toLocaleString()}`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function DashboardPage() {
  const [name, setName] = useState("there");
  const [weather, setWeather] = useState<Weather | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [inventoryValue, setInventoryValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  useEffect(() => {
    // Get user name
    getSupabaseClient().auth.getSession().then(({ data }) => {
      const email = data.session?.user?.email ?? "";
      const raw = email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      const first = raw.split(" ")[0];
      setName(first);
    });

    // Load bids + inventory in parallel
    Promise.all([
      fetch("/api/bids", { cache: "no-store" }).then(r => r.json()).catch(() => ({})),
      fetch("/api/inventory/summary", { cache: "no-store" }).then(r => r.json()).catch(() => ({})),
    ]).then(([bidsJson, invJson]) => {
      const allBids: Bid[] = bidsJson?.data ?? bidsJson?.bids ?? [];
      setBids(allBids);
      const rows = invJson?.data ?? [];
      const total = rows.reduce((s: number, r: any) => s + (Number(r.inventory_value) || 0), 0);
      setInventoryValue(total);
      setLoading(false);
    });

    // Weather for Saginaw, MI (hardcoded)
    fetch("https://api.open-meteo.com/v1/forecast?latitude=43.4195&longitude=-83.9508&current=temperature_2m,weathercode&temperature_unit=fahrenheit")
      .then(r => r.json())
      .then(meteo => {
        const code = meteo?.current?.weathercode ?? 0;
        const temp = Math.round(meteo?.current?.temperature_2m ?? 0);
        setWeather({ temp, city: "Saginaw, MI", ...( WEATHER_CODES[code] ?? { desc: "Clear", icon: "☀️" }) });
      })
      .catch(() => {});
  }, []);

  const openBids = bids.filter(b => !["won", "lost", "archived"].includes((b.status ?? "").toLowerCase()));
  const wonBids = bids.filter(b => (b.status ?? "").toLowerCase() === "won");
  const pipelineValue = openBids.reduce((s, b) => s + (Number(b.total_price) || 0), 0);
  const wonValue = wonBids.reduce((s, b) => s + (Number(b.total_price) || 0), 0);

  const stats: StatCard[] = [
    { label: "Open Bids", value: String(openBids.length), sub: "In pipeline", trend: "neutral", color: "blue" },
    { label: "Pipeline Value", value: fmt$(pipelineValue), sub: "Active opportunities", trend: "up", color: "green" },
    { label: "Won This Period", value: fmt$(wonValue), sub: `${wonBids.length} bids closed`, trend: "up", color: "emerald" },
    { label: "Inventory Value", value: inventoryValue !== null ? fmt$(inventoryValue) : "—", sub: "On-hand stock", trend: "neutral", color: "amber" },
  ];

  const recentBids = [...bids]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8);

  const statusColor: Record<string, string> = {
    draft: "bg-gray-100 text-gray-500",
    sent: "bg-blue-50 text-blue-600",
    won: "bg-emerald-50 text-emerald-700",
    lost: "bg-red-50 text-red-500",
    "in review": "bg-amber-50 text-amber-600",
  };

  const statColors: Record<string, { bg: string; icon: string; ring: string }> = {
    blue:    { bg: "from-blue-50 to-white",    icon: "text-blue-400",    ring: "ring-blue-100" },
    green:   { bg: "from-green-50 to-white",   icon: "text-green-500",   ring: "ring-green-100" },
    emerald: { bg: "from-emerald-50 to-white", icon: "text-emerald-500", ring: "ring-emerald-100" },
    amber:   { bg: "from-amber-50 to-white",   icon: "text-amber-500",   ring: "ring-amber-100" },
  };

  const QUICK_ACTIONS = [
    { label: "New Bid", desc: "Start a new proposal", href: "/atlasbid/new", icon: "📋" },
    { label: "Add Receipt", desc: "Log inventory receipt", href: "/operations-center/inventory", icon: "📦" },
    { label: "Materials Catalog", desc: "Browse & manage materials", href: "/operations-center/materials-catalog", icon: "🌿" },
    { label: "Operations Center", desc: "Config & settings", href: "/operations-center", icon: "⚙️" },
  ];

  return (
    <div className="min-h-screen bg-[#f0f4f0]">

      {/* Hero Header */}
      <div
        className="relative overflow-hidden px-8 py-8"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}
      >
        {/* Decorative circles */}
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full opacity-[0.06]" style={{ background: "radial-gradient(circle, #fff 0%, transparent 70%)" }} />
        <div className="absolute -bottom-20 right-40 w-96 h-96 rounded-full opacity-[0.04]" style={{ background: "radial-gradient(circle, #4ade80 0%, transparent 70%)" }} />

        <div className="relative flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">
              {loading ? "Welcome back" : greeting(name)}
            </h1>
            <p className="text-white/50 text-sm mt-1">{today}</p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Weather */}
            {weather && (
              <div className="flex items-center gap-2.5 bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl px-4 py-2.5">
                <span className="text-2xl">{weather.icon}</span>
                <div>
                  <div className="text-white font-semibold text-sm">{weather.temp}°F · {weather.desc}</div>
                  {weather.city && <div className="text-white/50 text-xs">{weather.city}</div>}
                </div>
              </div>
            )}

            {/* Quick new bid CTA */}
            <Link href="/atlasbid/new"
              className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white font-semibold text-sm px-5 py-2.5 rounded-xl shadow-lg shadow-green-900/30 transition-all hover:scale-[1.02]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Bid
            </Link>
          </div>
        </div>
      </div>

      <div className="px-8 py-7 space-y-7 max-w-[1400px]">

        {/* Stat Cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {stats.map(s => {
            const c = statColors[s.color ?? "green"];
            return (
              <div key={s.label} className={`bg-gradient-to-br ${c.bg} rounded-2xl border border-gray-100 shadow-sm p-5 ring-1 ${c.ring}`}>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{s.label}</div>
                <div className="text-3xl font-bold text-gray-900 tabular-nums tracking-tight">
                  {loading ? <span className="inline-block w-20 h-8 bg-gray-100 rounded animate-pulse" /> : s.value}
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  {s.trend === "up" && <span className="text-emerald-500 text-xs">↑</span>}
                  {s.trend === "down" && <span className="text-red-400 text-xs">↓</span>}
                  <span className="text-xs text-gray-400">{s.sub}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Main two-column */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* Bids table — takes 2/3 */}
          <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Recent Bids</h2>
              <Link href="/atlasbid/bids" className="text-xs text-green-600 font-semibold hover:underline">View all →</Link>
            </div>
            {loading ? (
              <div className="p-6 space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-10 bg-gray-50 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : recentBids.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-gray-400">No bids yet. <Link href="/atlasbid/new" className="text-green-600 font-semibold hover:underline">Create your first →</Link></div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-50">
                    <th className="text-left px-6 py-3">Client</th>
                    <th className="text-left px-6 py-3">Status</th>
                    <th className="text-right px-6 py-3">Value</th>
                    <th className="text-right px-6 py-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentBids.map(bid => (
                    <tr key={bid.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-3.5">
                        <Link href={`/atlasbid/bids/${bid.id}`} className="font-medium text-gray-900 hover:text-green-700 transition-colors">
                          {[bid.client_name, bid.client_last_name].filter(Boolean).join(" ") || "—"}
                        </Link>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${statusColor[(bid.status ?? "draft").toLowerCase()] ?? "bg-gray-100 text-gray-500"}`}>
                          {bid.status ?? "Draft"}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right font-medium text-gray-700 tabular-nums">
                        {bid.total_price ? fmt$(Number(bid.total_price)) : "—"}
                      </td>
                      <td className="px-6 py-3.5 text-right text-gray-400 text-xs tabular-nums">
                        {fmtDate(bid.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-5">

            {/* Quick Actions */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50">
                <h2 className="font-bold text-gray-900 text-sm">Quick Actions</h2>
              </div>
              <div className="p-3 grid grid-cols-2 gap-2">
                {QUICK_ACTIONS.map(a => (
                  <Link key={a.href} href={a.href}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-green-50 border border-transparent hover:border-green-100 transition-all text-center group">
                    <span className="text-2xl">{a.icon}</span>
                    <span className="text-xs font-semibold text-gray-700 group-hover:text-green-700 leading-tight">{a.label}</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Atlas brand card */}
            <div className="rounded-2xl overflow-hidden relative"
              style={{ background: "linear-gradient(135deg, #0d2616 0%, #1a5c2a 100%)", minHeight: 140 }}>
              <div className="absolute -bottom-8 -right-8 w-40 h-40 rounded-full opacity-10"
                style={{ background: "radial-gradient(circle, #4ade80, transparent 70%)" }} />
              <div className="relative p-5">
                <div className="text-white/40 text-[10px] uppercase tracking-[0.2em] font-semibold mb-1">Powered by</div>
                <div className="text-white text-xl font-extrabold tracking-[0.15em] uppercase">Atlas</div>
                <div className="text-white/30 text-[10px] tracking-widest uppercase mt-0.5">InterRivus Systems</div>
                <div className="mt-4 text-white/50 text-xs leading-relaxed">
                  Your complete landscaping operations platform.
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
