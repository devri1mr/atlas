"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────────

type DayRow = {
  date: string;
  mowing: number; weeding: number; shrubs: number; cleanups: number;
  brush_hogging: number; string_trimming: number; other: number;
};

type MonthSummary = { actual: number; planned: number };

// ── Date helpers (local time — avoids UTC-shift bug) ──────────────────────────

function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function localToday(): string { return localISO(new Date()); }

function isoWeekMon(d: Date): Date {
  const dt = new Date(d);
  const day = dt.getDay();
  dt.setDate(dt.getDate() - (day === 0 ? 6 : day - 1));
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function addWeeks(d: Date, n: number): Date {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n * 7);
  return dt;
}

function weekDates(mon: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return localISO(d);
  });
}

function dayLabel(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
}
function dateLabel(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const fmt      = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const money    = (n: number) => n === 0 ? "—" : fmt.format(n);
const moneyFull = (n: number) => fmt.format(n);

function dayTotal(row: DayRow): number {
  return (row.mowing ?? 0) + (row.weeding ?? 0) + (row.shrubs ?? 0) + (row.cleanups ?? 0) +
         (row.brush_hogging ?? 0) + (row.string_trimming ?? 0) + (row.other ?? 0);
}

// ── Editable cell ─────────────────────────────────────────────────────────────

function EditCell({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(value === 0 ? "" : String(value));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }
  function commit() {
    onSave(parseFloat(draft.replace(/[^0-9.]/g, "")) || 0);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        className="w-full text-center text-sm font-semibold bg-white border border-emerald-400 rounded px-1 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300"
        autoFocus
      />
    );
  }
  return (
    <button
      onClick={startEdit}
      onFocus={startEdit}
      className={`w-full text-center text-sm rounded py-2.5 transition-colors ${
        value > 0
          ? "font-bold text-gray-800 hover:bg-emerald-50 cursor-text"
          : "text-gray-300 hover:bg-gray-50 hover:text-gray-500 cursor-text"
      }`}
    >
      {value > 0 ? money(value) : "—"}
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function DivisionUpcomingRevenuePage() {
  const { division } = useParams<{ division: string }>();

  const divisionLabel = division
    .split("-")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  const apiBase = `/api/operations-center/atlas-ops/${division}/upcoming-revenue`;

  type SyncState = "idle" | "syncing" | "ok" | "error";

  const [weekOffset, setWeekOffset]     = useState(0);
  const [data, setData]                 = useState<Map<string, DayRow>>(new Map());
  const [lockedDates, setLockedDates]   = useState<Map<string, number>>(new Map());
  const [saving, setSaving]             = useState<Set<string>>(new Set());
  const [monthSummary, setMonthSummary] = useState<MonthSummary | null>(null);
  const [syncState, setSyncState]       = useState<SyncState>("idle");
  const [syncError, setSyncError]       = useState("");

  const today   = localToday();
  const curMon  = isoWeekMon(new Date());
  const weekMon = addWeeks(curMon, weekOffset);
  const dates   = weekDates(weekMon);

  const monthLabel = (() => {
    const months = [...new Set(dates.map(d =>
      new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })
    ))];
    return months.join(" / ");
  })();

  const load = useCallback(async () => {
    const [res, lockedRes] = await Promise.all([
      fetch(`${apiBase}?start=${dates[0]}&end=${dates[6]}`),
      fetch(`${apiBase}?locked_start=${dates[0]}&locked_end=${dates[6]}`),
    ]);
    if (res.ok) {
      const rows: DayRow[] = await res.json();
      setData(prev => {
        const next = new Map(prev);
        for (const d of dates) next.delete(d);
        for (const r of rows) next.set(r.date, r);
        return next;
      });
    }
    if (lockedRes.ok) {
      const locked: { date: string; actual_revenue: number }[] = await lockedRes.json();
      setLockedDates(prev => {
        const next = new Map(prev);
        for (const d of dates) next.delete(d);
        for (const r of locked) next.set(r.date, r.actual_revenue);
        return next;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // Use the month with the most days in the visible week
    const monthCounts = new Map<string, number>();
    for (const d of dates) {
      const ym = d.slice(0, 7);
      monthCounts.set(ym, (monthCounts.get(ym) ?? 0) + 1);
    }
    const ym = [...monthCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    setMonthSummary(null);
    fetch(`${apiBase}?summary=${ym}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setMonthSummary(d));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  async function handleSave(date: string, value: number) {
    const blank = { date, mowing: 0, weeding: 0, shrubs: 0, cleanups: 0, brush_hogging: 0, string_trimming: 0, other: 0 };
    const rowToSave = { ...blank, other: value };
    setData(prev => { const next = new Map(prev); next.set(date, rowToSave); return next; });
    setSaving(prev => new Set(prev).add(date));
    try {
      const res = await fetch(apiBase, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rowToSave),
      });
      if (!res.ok) { load(); return; }
      const mc = new Map<string, number>();
      for (const d of dates) { const ym = d.slice(0, 7); mc.set(ym, (mc.get(ym) ?? 0) + 1); }
      const ym = [...mc.entries()].sort((a, b) => b[1] - a[1])[0][0];
      fetch(`${apiBase}?summary=${ym}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => d && setMonthSummary(d));
    } finally {
      setSaving(prev => { const s = new Set(prev); s.delete(date); return s; });
    }
  }

  function handleSyncSheets() {
    if (!monthSummary) return;
    const webhookUrl = process.env.NEXT_PUBLIC_SHEETS_WEBHOOK_URL?.replace(/\s+/g, "");
    if (!webhookUrl) { setSyncError("Not configured"); setSyncState("error"); setTimeout(() => { setSyncState("idle"); setSyncError(""); }, 4000); return; }
    const mc   = new Map<string, number>();
    for (const d of dates) { const ym2 = d.slice(0, 7); mc.set(ym2, (mc.get(ym2) ?? 0) + 1); }
    const ym   = [...mc.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const proj = monthSummary.actual + monthSummary.planned;
    const url  = new URL(webhookUrl);
    url.searchParams.set("month",      ym);
    url.searchParams.set("projection", String(proj));
    url.searchParams.set("division",   division.replace(/-/g, " "));
    const win = window.open(url.toString(), "_blank");
    setTimeout(() => win?.close(), 4000);
    setSyncState("ok");
    setTimeout(() => { setSyncState("idle"); setSyncError(""); }, 4000);
  }

  const dominantMonth    = (() => {
    const mc = new Map<string, number>();
    for (const d of dates) { const ym = d.slice(0, 7); mc.set(ym, (mc.get(ym) ?? 0) + 1); }
    return [...mc.entries()].sort((a, b) => b[1] - a[1])[0][0];
  })();
  const viewedMonthLabel = new Date(dominantMonth + "-01T12:00:00").toLocaleDateString("en-US", { month: "long" });

  const weekRev          = dates.reduce((s, d) => {
    if (lockedDates.has(d)) return s + (lockedDates.get(d) ?? 0);
    return s + dayTotal(data.get(d) ?? {} as DayRow);
  }, 0);
  const projection       = monthSummary ? monthSummary.actual + monthSummary.planned : null;

  const BG_HEADER  = "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)";
  const BG_TODAY_H = "#0f4a25";

  return (
    <div className="min-h-screen" style={{ background: "#f0f4f0" }}>

      {/* ── Hero ── */}
      <div className="px-6 py-5" style={{ background: BG_HEADER }}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">Upcoming Revenue</span>
            </div>
            <div className="text-2xl font-black text-white">{monthLabel}</div>
          </div>
          <div className="flex items-center gap-4">
            {weekRev > 0 && (
              <div className="text-right">
                <div className="text-xs text-white/40 uppercase tracking-wider">Week Total</div>
                <div className="text-xl font-bold text-emerald-300">{moneyFull(weekRev)}</div>
              </div>
            )}
            <button
              onClick={handleSyncSheets}
              disabled={syncState === "syncing"}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                syncState === "ok"    ? "bg-emerald-500/30 border-emerald-400/50 text-emerald-300"
                : syncState === "error" ? "bg-red-500/20 border-red-400/50 text-red-300"
                : "bg-white/10 border-white/20 text-white/70 hover:bg-white/20 hover:text-white"
              }`}
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-7 14H7v-2h5v2zm5-4H7v-2h10v2zm0-4H7V7h10v2z"/>
              </svg>
              {syncState === "syncing" ? "Syncing…" : syncState === "ok" ? "Synced ✓" : syncState === "error" ? `Error: ${syncError}` : "Sync to Sheets"}
            </button>
            <div className="flex items-center gap-1 bg-white/10 rounded-xl px-2 py-1.5">
              <button onClick={() => setWeekOffset(w => Math.max(0, w - 1))} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">‹</button>
              <button onClick={() => setWeekOffset(0)} className={`text-xs font-semibold px-2 py-1 rounded-lg transition-colors ${weekOffset === 0 ? "bg-emerald-500 text-white" : "text-white/60 hover:text-white hover:bg-white/10"}`}>This Week</button>
              <button onClick={() => setWeekOffset(w => w + 1)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">›</button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">

        {/* ── Grid ── */}
        <div className="rounded-2xl overflow-hidden shadow-md" style={{ border: "1px solid rgba(16,64,32,0.12)" }}>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ minWidth: 720, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th className="px-5 py-3 text-left border border-emerald-900/50" style={{ width: 160, background: BG_HEADER }}>
                    <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">{divisionLabel}</span>
                  </th>
                  {dates.map(date => {
                    const isToday = date === today;
                    const isPast  = date < today;
                    return (
                      <th key={date} className="px-2 py-3 text-center border border-emerald-900/50"
                        style={{ minWidth: 110, background: isToday ? BG_TODAY_H : BG_HEADER }}>
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={`text-xs font-bold uppercase tracking-widest ${isToday ? "text-emerald-300" : isPast ? "text-white/40" : "text-white/60"}`}>
                            {dayLabel(date)}
                          </span>
                          <span className={`text-sm font-semibold ${isToday ? "text-white" : isPast ? "text-white/50" : "text-white/80"}`}>
                            {dateLabel(date)}
                          </span>
                          {isToday && <span className="w-1 h-1 rounded-full bg-emerald-400 mt-0.5" />}
                        </div>
                      </th>
                    );
                  })}
                  <th className="px-3 py-3 text-center border border-emerald-900/50" style={{ minWidth: 110, background: BG_HEADER }}>
                    <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">Week Total</span>
                  </th>
                </tr>
              </thead>

              <tbody>
                <tr>
                  <td className="px-5 py-2 border border-gray-200" style={{ background: "#fff" }}>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <span className="text-xs font-semibold text-gray-600">Daily Revenue</span>
                    </div>
                  </td>
                  {dates.map(date => {
                    const isLocked  = lockedDates.has(date);
                    const lockedRev = lockedDates.get(date) ?? 0;
                    const val       = dayTotal(data.get(date) ?? {} as DayRow);
                    const isToday   = date === today;
                    if (isLocked) {
                      return (
                        <td key={date} className="px-2 py-1 border border-gray-200" style={{ background: "#f0fdf4" }}>
                          <div className="flex flex-col items-center gap-0.5 py-1.5">
                            <span className="text-sm font-bold text-emerald-700">{money(lockedRev)}</span>
                            <span className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wide flex items-center gap-0.5">
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                              Official
                            </span>
                          </div>
                        </td>
                      );
                    }
                    return (
                      <td key={date} className="px-2 py-1 border border-gray-200" style={{ background: isToday ? "#ecfdf5" : "#fff" }}>
                        <EditCell value={val} onSave={v => handleSave(date, v)} />
                        {saving.has(date) && <div className="text-center text-[10px] text-emerald-400/60">saving…</div>}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center border border-gray-200" style={{ background: "#f0fdf4" }}>
                    <span className={`text-sm font-bold ${weekRev > 0 ? "text-emerald-700" : "text-gray-300"}`}>
                      {weekRev > 0 ? money(weekRev) : "—"}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Month Projection ── */}
        {monthSummary !== null && (
          <div className="rounded-2xl overflow-hidden shadow-md" style={{ border: "1px solid rgba(16,64,32,0.12)" }}>
            <div className="px-5 py-3.5" style={{ background: BG_HEADER }}>
              <span className="text-sm font-semibold text-white">{viewedMonthLabel} Projection</span>
              <span className="text-xs text-white/40 ml-2">Actual completed + planned upcoming</span>
            </div>
            <div className="bg-white px-6 py-4 flex items-center gap-8 flex-wrap">
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Actual Revenue</div>
                <div className="text-2xl font-bold text-gray-800">{moneyFull(monthSummary.actual)}</div>
                <div className="text-xs text-gray-400 mt-0.5">From completed work</div>
              </div>
              <div className="text-2xl text-gray-200 font-light">+</div>
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Planned Revenue</div>
                <div className="text-2xl font-bold text-emerald-600">{moneyFull(monthSummary.planned)}</div>
                <div className="text-xs text-gray-400 mt-0.5">From upcoming entries</div>
              </div>
              <div className="text-2xl text-gray-200 font-light">=</div>
              <div className="ml-auto text-right">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Month Projection</div>
                <div className="text-3xl font-black text-gray-900">{moneyFull(projection!)}</div>
                <div className="text-xs text-gray-400 mt-0.5">Projected {viewedMonthLabel} total</div>
              </div>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-gray-400">
          Click any cell to enter planned revenue · Saves automatically
        </p>
      </div>
    </div>
  );
}
