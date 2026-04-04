"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@/lib/userContext";

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

// ── Types ──────────────────────────────────────────────────────────────────────

type DayBreakdown = {
  date: string;
  jobs: { work_order: string; client_name: string; service: string; earned_amount: number; actual_hours: number }[];
  total_earned: number;
  payroll_cost: number;
  payroll_hours: number;
};

type PersonDetail = {
  days: DayBreakdown[];
  totals: { earned: number; cost: number; hours: number };
  start: string;
  end: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const pct = (n: number) => `${Math.round(n * 100)}%`;

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
function fmtMoney(n: number) { return money.format(n); }

function fmtDateLong(d: string) {
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  });
}

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

const MEDAL_COLORS = ["text-yellow-400", "text-gray-400", "text-amber-600"];
function medalColor(rank: number) { return rank <= 3 ? MEDAL_COLORS[rank - 1] : "text-gray-300"; }

function ProducerRow({ person, maxEarned, rank, onClick, selected }: { person: RankedPerson; maxEarned: number; rank: number; onClick: () => void; selected: boolean }) {
  const barPct = maxEarned > 0 ? (person.total_earned / maxEarned) * 100 : 0;
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-4 px-5 py-3.5 border-t border-gray-100 first:border-t-0 cursor-pointer transition-colors ${selected ? "bg-emerald-50" : "hover:bg-gray-50/60"}`}
    >
      <span className={`text-sm font-bold w-6 text-right shrink-0 ${medalColor(rank)}`}>{rank}</span>
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
      <span className="text-[10px] text-emerald-600 font-semibold shrink-0">View ›</span>
    </div>
  );
}

function EfficiencyRow({ person, maxEff, rank, onClick, selected }: { person: RankedPerson; maxEff: number; rank: number; onClick: () => void; selected: boolean }) {
  const barPct = maxEff > 0 ? (person.efficiency_pct / maxEff) * 100 : 0;
  const isGreen = person.efficiency_pct >= 1;
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-4 px-5 py-3.5 border-t border-gray-100 first:border-t-0 cursor-pointer transition-colors ${selected ? "bg-emerald-50" : "hover:bg-gray-50/60"}`}
    >
      <span className={`text-sm font-bold w-6 text-right shrink-0 ${medalColor(rank)}`}>{rank}</span>
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
      <span className="text-[10px] text-emerald-600 font-semibold shrink-0 ml-1">View ›</span>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function RankingsPage() {
  const { can } = useUser();
  const [data, setData]         = useState<RankingsData | null>(null);
  const [period, setPeriod]     = useState<Period>("ytd");
  const [loading, setLoading]   = useState(true);
  const [isDisplay, setIsDisplay] = useState(false);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Person breakdown
  const [selectedPerson,       setSelectedPerson]       = useState<RankedPerson | null>(null);
  const [personDetail,         setPersonDetail]         = useState<PersonDetail | null>(null);
  const [personDetailLoading,  setPersonDetailLoading]  = useState(false);

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
    setSelectedPerson(null);
    setPersonDetail(null);
  }

  async function loadPersonDetail(person: RankedPerson) {
    if (selectedPerson?.resource_name === person.resource_name) {
      setSelectedPerson(null);
      setPersonDetail(null);
      return;
    }
    setSelectedPerson(person);
    setPersonDetail(null);
    setPersonDetailLoading(true);
    try {
      const params = new URLSearchParams({ period });
      if (person.employee_id) params.set("employee_id", person.employee_id);
      else params.set("resource_name", person.resource_name);
      const res = await fetch(`/api/operations-center/atlas-ops/lawn/rankings/person?${params}`, { cache: "no-store" });
      const d = await res.json();
      setPersonDetail(d);
    } catch { /* ignore */ }
    setPersonDetailLoading(false);
  }

  const producers  = data?.top_producers  ?? [];
  const efficient  = data?.most_efficient ?? [];
  const maxEarned  = producers[0]?.total_earned    ?? 0;
  const maxEff     = efficient[0]?.efficiency_pct  ?? 0;

  const dateRange = data ? `${fmtDateShort(data.start)} – ${fmtDateShort(data.end)}` : "";

  // ── Display / cast mode ──────────────────────────────────────────────────────

  if (isDisplay) {
    return (
      <div className="fixed inset-0 z-[9999] bg-[#0a2010] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-3.5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-6">
            <div>
              <div className="text-lg font-bold text-white tracking-tight leading-none">Lawn Rankings</div>
              <div className="text-xs text-white/35 mt-0.5">{dateRange}</div>
            </div>
            {/* Period selector in cast mode */}
            <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
              {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
                <button
                  key={p}
                  onClick={() => changePeriod(p)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                    period === p
                      ? "bg-emerald-700 text-white"
                      : "text-white/40 hover:text-white/70 hover:bg-white/5"
                  }`}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => document.documentElement.requestFullscreen?.()}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            >
              ⛶ Fullscreen
            </button>
            <button
              onClick={() => {
                document.exitFullscreen?.().catch(() => {});
                window.close();
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-white/10 hover:bg-white/20 transition-colors"
            >
              ✕ Exit Cast Mode
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-white/40 text-sm">Loading…</div>
        ) : (
          <div className="flex-1 grid grid-cols-2 gap-px bg-white/5 overflow-hidden">
            {/* Top Producers */}
            <div className="bg-[#0a2010] px-8 py-5 flex flex-col overflow-hidden">
              <div className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-3 shrink-0">Top Producers</div>
              <div className="flex-1 overflow-hidden">
                {producers.slice(0, 12).map((p, i) => (
                  <div key={p.resource_name} className="flex items-center gap-3 py-2 border-t border-white/5 first:border-t-0">
                    <span className={`text-base font-black w-6 text-right shrink-0 ${medalColor(i + 1)}`}>{i + 1}</span>
                    <Avatar person={p} size={36} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{p.display_name}</div>
                      <div className="mt-1.5 relative h-2 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-emerald-500"
                          style={{ width: `${maxEarned > 0 ? (p.total_earned / maxEarned) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Most Efficient */}
            <div className="bg-[#071a0e] px-8 py-5 flex flex-col overflow-hidden">
              <div className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-3 shrink-0">Most Efficient</div>
              <div className="flex-1 overflow-hidden">
                {efficient.slice(0, 12).map((p, i) => {
                  const isGreen = p.efficiency_pct >= 1;
                  return (
                    <div key={p.resource_name} className="flex items-center gap-3 py-2 border-t border-white/5 first:border-t-0">
                      <span className={`text-base font-black w-6 text-right shrink-0 ${medalColor(i + 1)}`}>{i + 1}</span>
                      <Avatar person={p} size={36} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white truncate">{p.display_name}</div>
                        <div className="mt-1.5 relative h-2 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className={`absolute inset-y-0 left-0 rounded-full ${isGreen ? "bg-emerald-500" : "bg-amber-400"}`}
                            style={{ width: `${maxEff > 0 ? (p.efficiency_pct / maxEff) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-white/40">{p.total_payroll_hours.toFixed(1)} hrs</div>
                        <div className={`text-base font-black mt-0.5 ${isGreen ? "text-emerald-400" : "text-amber-400"}`}>
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
                <span className="text-xs text-emerald-900/40">sorted by revenue generated</span>
              </div>
              {producers.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-gray-400">No data for this period</div>
              ) : (
                <div>
                  {producers.map((p, i) => (
                    <ProducerRow key={p.resource_name} person={p} maxEarned={maxEarned} rank={i + 1}
                      onClick={() => loadPersonDetail(p)}
                      selected={selectedPerson?.resource_name === p.resource_name} />
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
                    <EfficiencyRow key={p.resource_name} person={p} maxEff={maxEff} rank={i + 1}
                      onClick={() => loadPersonDetail(p)}
                      selected={selectedPerson?.resource_name === p.resource_name} />
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </div>

      {/* ── Person breakdown modal ── */}
      {selectedPerson && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 py-8 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col my-auto">

            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
              <Avatar person={selectedPerson} size={44} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 text-sm">{selectedPerson.display_name}</div>
                <div className="text-xs text-gray-400 mt-0.5">{PERIOD_LABELS[period]} · {dateRange}</div>
              </div>
              <button
                onClick={() => { setSelectedPerson(null); setPersonDetail(null); }}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1"
              >✕</button>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-px bg-gray-100 border-b border-gray-100">
              {[
                { label: "Revenue Earned", value: fmtMoney(selectedPerson.total_earned) },
                ...(can("hr_labor_cost") ? [{ label: "Payroll Cost", value: fmtMoney(selectedPerson.payroll_cost) }] : []),
                { label: "Hours Worked",   value: `${selectedPerson.total_payroll_hours.toFixed(1)} hrs` },
                { label: "Efficiency",     value: pct(selectedPerson.efficiency_pct),
                  color: selectedPerson.efficiency_pct >= 1 ? "text-emerald-600" : "text-amber-500" },
              ].map(row => (
                <div key={row.label} className="bg-gray-50/80 px-5 py-3">
                  <div className="text-[10px] text-gray-400 uppercase tracking-wide">{row.label}</div>
                  <div className={`text-base font-semibold mt-0.5 ${(row as any).color ?? "text-gray-900"}`}>{row.value}</div>
                </div>
              ))}
            </div>

            {/* Per-day breakdown */}
            <div className="px-5 py-4 overflow-y-auto max-h-[55vh]">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Day-by-Day Breakdown</div>
              {personDetailLoading ? (
                <div className="text-center text-sm text-gray-400 py-8">Loading…</div>
              ) : !personDetail?.days?.length ? (
                <div className="text-center text-sm text-gray-400 py-8">No detail data for this period.</div>
              ) : (
                <div className="space-y-3">
                  {personDetail.days.map(day => (
                    <div key={day.date} className="rounded-xl border border-gray-100 overflow-hidden">
                      <div className="px-4 py-2 bg-gray-50/80 flex items-center justify-between flex-wrap gap-2">
                        <span className="text-xs font-semibold text-gray-700">{fmtDateLong(day.date)}</span>
                        <span className="text-[11px] text-gray-400">
                          {fmtMoney(day.total_earned)} earned{can("hr_labor_cost") ? ` · ${fmtMoney(day.payroll_cost)} payroll` : ""} · {day.payroll_hours.toFixed(1)} hrs
                        </span>
                      </div>
                      <table className="w-full text-xs">
                        <tbody className="divide-y divide-gray-50">
                          {day.jobs.map((job, i) => (
                            <tr key={i} className="hover:bg-gray-50/40">
                              <td className="px-4 py-1.5 text-gray-400 whitespace-nowrap">{job.work_order}</td>
                              <td className="px-2 py-1.5 text-gray-700 font-medium truncate max-w-[120px]">{job.client_name}</td>
                              <td className="px-2 py-1.5 text-gray-400">{job.service}</td>
                              <td className="px-4 py-1.5 text-right font-semibold text-gray-700 whitespace-nowrap">{fmtMoney(job.earned_amount)}</td>
                              <td className="px-4 py-1.5 text-right text-gray-400 whitespace-nowrap">{job.actual_hours.toFixed(1)} hrs</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                  {/* Grand total */}
                  <div className="flex items-center justify-between px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-xs font-semibold text-emerald-900">
                    <span>{personDetail.days.length} day{personDetail.days.length !== 1 ? "s" : ""} worked</span>
                    <span>{fmtMoney(personDetail.totals.earned)} earned · {fmtMoney(personDetail.totals.cost)} payroll · {personDetail.totals.hours.toFixed(1)} hrs</span>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
