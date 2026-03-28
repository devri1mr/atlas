"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

type RankedPerson = {
  employee_id: string | null;
  resource_name: string;
  display_name: string;
  photo_url: string | null;
  total_earned: number;
  payroll_cost: number;
  total_payroll_hours: number;
  efficiency_pct: number;
  labor_pct: number;
};

type RankingsData = {
  top_producers: RankedPerson[];
  most_efficient: RankedPerson[];
  period: string;
  start: string;
  end: string;
};

type Period = "today" | "this_week" | "last_week" | "this_month" | "ytd";

const PERIOD_LABELS: Record<Period, string> = {
  today:      "Today",
  this_week:  "This Week",
  last_week:  "Last Week",
  this_month: "This Month",
  ytd:        "Year to Date",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const pct = (n: number) => `${Math.round(n * 100)}%`;

function fmtDateShort(d: string) {
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "UTC",
  });
}

function initials(name: string): string {
  const parts = name.trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  // "Last, First" format
  return (parts[1][0] + parts[0][0]).toUpperCase();
}

function Avatar({ person, size = 40 }: { person: RankedPerson; size?: number }) {
  const [imgErr, setImgErr] = useState(false);
  const show = person.photo_url && !imgErr;
  return (
    <div
      className="rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-emerald-800 text-white font-bold"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {show ? (
        <img
          src={person.photo_url!}
          alt={person.display_name}
          width={size} height={size}
          className="object-cover w-full h-full"
          onError={() => setImgErr(true)}
        />
      ) : (
        <span>{initials(person.display_name)}</span>
      )}
    </div>
  );
}

// ── Bar row ────────────────────────────────────────────────────────────────────

function ProducerRow({ person, maxEarned, rank }: { person: RankedPerson; maxEarned: number; rank: number }) {
  const barPct = maxEarned > 0 ? (person.total_earned / maxEarned) * 100 : 0;
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 border-t border-gray-100 first:border-t-0">
      <span className="text-sm font-bold text-gray-300 w-6 text-right shrink-0">{rank}</span>
      <Avatar person={person} size={40} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-emerald-950 truncate">{person.display_name}</div>
        <div className="mt-1.5 relative h-2 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-emerald-600"
            style={{ width: `${barPct}%` }}
          />
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-xs text-gray-500">{person.total_payroll_hours.toFixed(1)} hrs</div>
        <div className={`text-xs font-semibold mt-0.5 ${person.labor_pct > 0.39 ? "text-red-500" : "text-emerald-600"}`}>
          {pct(person.labor_pct)} labor
        </div>
      </div>
    </div>
  );
}

function EfficiencyRow({ person, maxEff, rank }: { person: RankedPerson; maxEff: number; rank: number }) {
  const barPct = maxEff > 0 ? (person.efficiency_pct / maxEff) * 100 : 0;
  const isGreen = person.efficiency_pct >= 1;
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 border-t border-gray-100 first:border-t-0">
      <span className="text-sm font-bold text-gray-300 w-6 text-right shrink-0">{rank}</span>
      <Avatar person={person} size={40} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-emerald-950 truncate">{person.display_name}</div>
        <div className="mt-1.5 relative h-2 rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`absolute inset-y-0 left-0 rounded-full ${isGreen ? "bg-emerald-600" : "bg-amber-400"}`}
            style={{ width: `${barPct}%` }}
          />
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-xs text-gray-500">{person.total_payroll_hours.toFixed(1)} hrs</div>
        <div className={`text-sm font-bold mt-0.5 ${isGreen ? "text-emerald-600" : "text-amber-500"}`}>
          {pct(person.efficiency_pct)}
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function RankingsPage() {
  const [data, setData]         = useState<RankingsData | null>(null);
  const [period, setPeriod]     = useState<Period>("ytd");
  const [loading, setLoading]   = useState(true);
  const [isDisplay, setIsDisplay] = useState(false);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (p: Period) => {
    setLoading(true);
    const res = await fetch(`/api/operations-center/atlas-ops/lawn/rankings?period=${p}`, { cache: "no-store" });
    const d = await res.json();
    setData(d);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Check for display mode via URL param
    const params = new URLSearchParams(window.location.search);
    const display = params.get("display") === "true";
    setIsDisplay(display);
    load(period);
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isDisplay) {
      // Auto-refresh every 30 minutes in display/cast mode
      refreshRef.current = setInterval(() => load(period), 30 * 60 * 1000);
      return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
    }
  }, [isDisplay, period, load]);

  function changePeriod(p: Period) {
    setPeriod(p);
    load(p);
  }

  const producers  = data?.top_producers  ?? [];
  const efficient  = data?.most_efficient ?? [];
  const maxEarned  = producers[0]?.total_earned    ?? 0;
  const maxEff     = efficient[0]?.efficiency_pct  ?? 0;

  const dateRange = data ? `${fmtDateShort(data.start)} – ${fmtDateShort(data.end)}` : "";

  // ── Display / cast mode ──────────────────────────────────────────────────────

  if (isDisplay) {
    return (
      <div className="min-h-screen bg-[#0a2010] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-10 py-6 border-b border-white/10">
          <div>
            <div className="text-2xl font-bold text-white tracking-tight">Lawn Rankings</div>
            <div className="text-sm text-white/40 mt-0.5">{PERIOD_LABELS[period]} · {dateRange}</div>
          </div>
          <div className="text-xs text-white/25">Auto-refreshes every 30 min</div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-white/40 text-sm">Loading…</div>
        ) : (
          <div className="flex-1 grid grid-cols-2 gap-px bg-white/5">
            {/* Top Producers */}
            <div className="bg-[#0a2010] px-8 py-6">
              <div className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-4">Top Producers</div>
              <div className="space-y-0">
                {producers.slice(0, 10).map((p, i) => (
                  <div key={p.resource_name} className="flex items-center gap-5 py-4 border-t border-white/5 first:border-t-0">
                    <span className="text-2xl font-black text-white/20 w-8 text-right shrink-0">{i + 1}</span>
                    <Avatar person={p} size={52} />
                    <div className="flex-1 min-w-0">
                      <div className="text-base font-semibold text-white truncate">{p.display_name}</div>
                      <div className="mt-2 relative h-2.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-emerald-500"
                          style={{ width: `${maxEarned > 0 ? (p.total_earned / maxEarned) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-white/40">{p.total_payroll_hours.toFixed(1)} hrs</div>
                      <div className={`text-sm font-bold mt-0.5 ${p.labor_pct > 0.39 ? "text-red-400" : "text-emerald-400"}`}>
                        {pct(p.labor_pct)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Most Efficient */}
            <div className="bg-[#071a0e] px-8 py-6">
              <div className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-4">Most Efficient</div>
              <div className="space-y-0">
                {efficient.slice(0, 10).map((p, i) => {
                  const isGreen = p.efficiency_pct >= 1;
                  return (
                    <div key={p.resource_name} className="flex items-center gap-5 py-4 border-t border-white/5 first:border-t-0">
                      <span className="text-2xl font-black text-white/20 w-8 text-right shrink-0">{i + 1}</span>
                      <Avatar person={p} size={52} />
                      <div className="flex-1 min-w-0">
                        <div className="text-base font-semibold text-white truncate">{p.display_name}</div>
                        <div className="mt-2 relative h-2.5 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className={`absolute inset-y-0 left-0 rounded-full ${isGreen ? "bg-emerald-500" : "bg-amber-400"}`}
                            style={{ width: `${maxEff > 0 ? (p.efficiency_pct / maxEff) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-white/40">{p.total_payroll_hours.toFixed(1)} hrs</div>
                        <div className={`text-xl font-black mt-0.5 ${isGreen ? "text-emerald-400" : "text-amber-400"}`}>
                          {pct(p.efficiency_pct)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Normal mode ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="mx-auto max-w-[1200px] px-4 md:px-6 py-6 md:py-8">

        {/* Header */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-emerald-950">Lawn Rankings</h1>
            {data && <p className="text-sm text-emerald-900/60 mt-0.5">{dateRange} · {producers.length} qualified members</p>}
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/operations-center/atlas-ops/lawn/rankings?display=true"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
            >
              Cast Mode ↗
            </a>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-1.5 mb-6 bg-white border border-gray-200 rounded-lg p-1 w-fit">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button
              key={p}
              onClick={() => changePeriod(p)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                period === p
                  ? "bg-emerald-700 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-16 text-sm text-emerald-900/40">Loading rankings…</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Top Producers */}
            <div className="rounded-xl border border-emerald-100 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-emerald-100 bg-emerald-50/60 px-5 py-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-emerald-950">Top Producers</span>
                <span className="text-xs text-emerald-900/40">relative to leader · no $ shown</span>
              </div>
              {producers.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-gray-400">No data for this period</div>
              ) : (
                <div>
                  {producers.map((p, i) => (
                    <ProducerRow key={p.resource_name} person={p} maxEarned={maxEarned} rank={i + 1} />
                  ))}
                </div>
              )}
            </div>

            {/* Most Efficient */}
            <div className="rounded-xl border border-emerald-100 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-emerald-100 bg-emerald-50/60 px-5 py-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-emerald-950">Most Efficient</span>
                <span className="text-xs text-emerald-900/40">(earned × 39%) ÷ pay cost · ≥100% = on target</span>
              </div>
              {efficient.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-gray-400">No data for this period</div>
              ) : (
                <div>
                  {efficient.map((p, i) => (
                    <EfficiencyRow key={p.resource_name} person={p} maxEff={maxEff} rank={i + 1} />
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
