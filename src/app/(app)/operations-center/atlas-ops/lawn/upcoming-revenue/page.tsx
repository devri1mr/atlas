"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

type Category = "mowing" | "weeding" | "shrubs" | "cleanups" | "brush_hogging" | "string_trimming" | "other";

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "mowing",          label: "Mowing" },
  { key: "weeding",         label: "Weeding" },
  { key: "shrubs",          label: "Shrubs" },
  { key: "cleanups",        label: "Cleanups" },
  { key: "brush_hogging",   label: "Brush Hogging" },
  { key: "string_trimming", label: "String Trimming" },
  { key: "other",           label: "Other" },
];

type DayRow = {
  date: string;
  mowing: number; weeding: number; shrubs: number; cleanups: number;
  brush_hogging: number; string_trimming: number; other: number;
};

type MonthSummary = { actual: number; planned: number };
type LockedDate  = { date: string; actual_revenue: number };

// ── Date helpers (local time — avoids UTC-shift bug) ──────────────────────────

function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function localToday(): string { return localISO(new Date()); }

function isoWeekMon(d: Date): Date {
  const dt = new Date(d);
  const day = dt.getDay(); // 0=Sun
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

const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const money = (n: number) => n === 0 ? "—" : fmt.format(n);
const moneyFull = (n: number) => fmt.format(n);

function dayTotal(row: DayRow): number {
  return CATEGORIES.reduce((s, c) => s + (row[c.key] ?? 0), 0);
}
function weekTotal(data: Map<string, DayRow>, dates: string[]): number {
  return dates.reduce((s, d) => s + dayTotal(data.get(d) ?? {} as DayRow), 0);
}
function categoryWeekTotal(data: Map<string, DayRow>, dates: string[], cat: Category): number {
  return dates.reduce((s, d) => s + (data.get(d)?.[cat] ?? 0), 0);
}

// ── Editable cell ─────────────────────────────────────────────────────────────

function EditCell({ value, onSave, disabled }: { value: number; onSave: (v: number) => void; disabled?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    if (disabled) return;
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
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setEditing(false); } }}
        className="w-full text-center text-xs font-semibold bg-white border border-emerald-400 rounded px-1 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-300"
        autoFocus
      />
    );
  }
  return (
    <button
      onClick={startEdit}
      onFocus={startEdit}
      disabled={disabled}
      className={`w-full text-center text-xs rounded py-1.5 transition-colors ${
        disabled
          ? "text-gray-300 cursor-default"
          : value > 0
            ? "font-semibold text-gray-800 hover:bg-emerald-50 cursor-text"
            : "text-gray-300 hover:bg-gray-50 hover:text-gray-500 cursor-text"
      }`}
    >
      {value > 0 ? money(value) : "—"}
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

type SyncState = "idle" | "syncing" | "ok" | "error";

export default function UpcomingRevenuePage() {
  const [weekOffset, setWeekOffset]     = useState(0);
  const [data, setData]                 = useState<Map<string, DayRow>>(new Map());
  const [saving, setSaving]             = useState<Set<string>>(new Set());
  const [monthSummary, setMonthSummary] = useState<MonthSummary | null>(null);
  const [lockedDates, setLockedDates]   = useState<Map<string, number>>(new Map());
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

  // Load week planned revenue + locked dates (completed imports)
  const load = useCallback(async () => {
    const start = dates[0];
    const end   = dates[6];
    const [plannedRes, lockedRes] = await Promise.all([
      fetch(`/api/operations-center/atlas-ops/lawn/upcoming-revenue?start=${start}&end=${end}`),
      fetch(`/api/operations-center/atlas-ops/lawn/upcoming-revenue?locked_start=${start}&locked_end=${end}`),
    ]);
    if (plannedRes.ok) {
      const rows: DayRow[] = await plannedRes.json();
      setData(prev => {
        const next = new Map(prev);
        for (const d of dates) next.delete(d);
        for (const r of rows) next.set(r.date, r);
        return next;
      });
    }
    if (lockedRes.ok) {
      const locked: LockedDate[] = await lockedRes.json();
      setLockedDates(new Map(locked.map(l => [l.date, l.actual_revenue])));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  useEffect(() => { load(); }, [load]);

  // Load month summary (actual + planned) — always for current month
  useEffect(() => {
    const ym = today.slice(0, 7);
    fetch(`/api/operations-center/atlas-ops/lawn/upcoming-revenue?summary=${ym}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setMonthSummary(d));
  }, [today]);

  async function handleSave(date: string, cat: Category, value: number) {
    // Capture the fully-merged row inside the updater to avoid stale closure
    let rowToSave: DayRow = { date, mowing: 0, weeding: 0, shrubs: 0, cleanups: 0, brush_hogging: 0, string_trimming: 0, other: 0 };
    setData(prev => {
      const next = new Map(prev);
      const ex = next.get(date) ?? { date, mowing: 0, weeding: 0, shrubs: 0, cleanups: 0, brush_hogging: 0, string_trimming: 0, other: 0 };
      rowToSave = { ...ex, [cat]: value };
      next.set(date, rowToSave);
      return next;
    });
    setSaving(prev => new Set(prev).add(date));
    try {
      const res = await fetch("/api/operations-center/atlas-ops/lawn/upcoming-revenue", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rowToSave, date }),
      });
      if (!res.ok) {
        // Save failed — reload from DB so UI reflects truth
        load();
        return;
      }
      // Refresh month summary after successful save
      const ym = today.slice(0, 7);
      fetch(`/api/operations-center/atlas-ops/lawn/upcoming-revenue?summary=${ym}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => d && setMonthSummary(d));
    } finally {
      setSaving(prev => { const s = new Set(prev); s.delete(date); return s; });
    }
  }

  const weekRev = dates.reduce((s, d) =>
    s + (lockedDates.has(d) ? lockedDates.get(d)! : dayTotal(data.get(d) ?? {} as DayRow)), 0);
  const projection  = monthSummary ? monthSummary.actual + monthSummary.planned : null;
  const curMonthLabel = new Date(today + "T12:00:00").toLocaleDateString("en-US", { month: "long" });

  async function handleSyncSheets() {
    const webhookUrl = process.env.NEXT_PUBLIC_SHEETS_WEBHOOK_URL;
    if (!webhookUrl) { setSyncError("Not configured"); setSyncState("error"); return; }
    setSyncState("syncing");
    try {
      const ym = dates[0].slice(0, 7);
      // Fetch projection from Atlas
      const res = await fetch(`/api/operations-center/atlas-ops/lawn/upcoming-revenue?summary=${ym}`);
      if (!res.ok) throw new Error("Failed to fetch projection");
      const { actual, planned } = await res.json();
      const projection = actual + planned;
      // Call Apps Script via hidden iframe — full browser redirect + Google session
      const url = new URL(webhookUrl);
      url.searchParams.set("month", ym);
      url.searchParams.set("projection", String(projection));
      await new Promise<void>(resolve => {
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        iframe.src = url.toString();
        iframe.onload = () => { document.body.removeChild(iframe); resolve(); };
        document.body.appendChild(iframe);
        setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); resolve(); }, 8000);
      });
      setSyncState("ok");
    } catch (e: any) {
      setSyncError(e.message ?? "Error");
      setSyncState("error");
    }
    setTimeout(() => { setSyncState("idle"); setSyncError(""); }, 4000);
  }

  const BG_HEADER  = "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)";
  const BG_TOTAL   = "#0f3a1e";
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
            {/* Sync to Sheets button */}
            <button
              onClick={handleSyncSheets}
              disabled={syncState === "syncing"}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                syncState === "ok"
                  ? "bg-emerald-500/30 border-emerald-400/50 text-emerald-300"
                  : syncState === "error"
                  ? "bg-red-500/20 border-red-400/50 text-red-300"
                  : "bg-white/10 border-white/20 text-white/70 hover:bg-white/20 hover:text-white"
              }`}
            >
              {/* Google Sheets icon */}
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-7 14H7v-2h5v2zm5-4H7v-2h10v2zm0-4H7V7h10v2z"/>
              </svg>
              {syncState === "syncing" ? "Syncing…" : syncState === "ok" ? "Synced ✓" : syncState === "error" ? `Error: ${syncError}` : "Sync to Sheets"}
            </button>
            <div className="flex items-center gap-1 bg-white/10 rounded-xl px-2 py-1.5">
              <button
                onClick={() => setWeekOffset(w => Math.max(0, w - 1))}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
              >‹</button>
              <button
                onClick={() => setWeekOffset(0)}
                className={`text-xs font-semibold px-2 py-1 rounded-lg transition-colors ${weekOffset === 0 ? "bg-emerald-500 text-white" : "text-white/60 hover:text-white hover:bg-white/10"}`}
              >This Week</button>
              <button
                onClick={() => setWeekOffset(w => w + 1)}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
              >›</button>
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
                {/* Day / date headers */}
                <tr>
                  <th className="px-5 py-3 text-left border border-emerald-900/50" style={{ width: 160, background: BG_HEADER }}>
                    <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">Category</span>
                  </th>
                  {dates.map(date => {
                    const isToday  = date === today;
                    const isPast   = date < today;
                    const isLocked = lockedDates.has(date);
                    return (
                      <th key={date} className="px-2 py-3 text-center border border-emerald-900/50"
                        style={{ minWidth: 100, background: isToday ? BG_TODAY_H : BG_HEADER }}>
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={`text-xs font-bold uppercase tracking-widest ${isToday ? "text-emerald-300" : isPast ? "text-white/40" : "text-white/60"}`}>
                            {dayLabel(date)}
                          </span>
                          <span className={`text-sm font-semibold ${isToday ? "text-white" : isPast ? "text-white/50" : "text-white/80"}`}>
                            {dateLabel(date)}
                          </span>
                          {isToday && <span className="w-1 h-1 rounded-full bg-emerald-400 mt-0.5" />}
                          {isLocked && (
                            <span className="mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/30 text-emerald-300 border border-emerald-500/40">
                              Official
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                  <th className="px-3 py-3 text-center border border-emerald-900/50" style={{ minWidth: 100, background: BG_HEADER }}>
                    <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">Week Total</span>
                  </th>
                </tr>

                {/* Lawn Total row */}
                <tr>
                  <td className="px-5 py-3 border border-emerald-900/50" style={{ background: BG_TOTAL }}>
                    <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">Lawn Total</span>
                  </td>
                  {dates.map(date => {
                    const row      = data.get(date);
                    const isLocked = lockedDates.has(date);
                    const total    = isLocked ? lockedDates.get(date)! : (row ? dayTotal(row) : 0);
                    const isToday  = date === today;
                    return (
                      <td key={date} className="px-2 py-3 text-center border border-emerald-900/50"
                        style={{ background: isToday ? BG_TODAY_H : BG_TOTAL }}>
                        <span className={`text-sm font-bold ${total > 0 ? (isToday ? "text-emerald-300" : "text-white") : "text-white/20"}`}>
                          {total > 0 ? money(total) : "—"}
                        </span>
                        {saving.has(date) && <span className="block text-[10px] text-emerald-400/60 mt-0.5">saving…</span>}
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 text-center border border-emerald-900/50" style={{ background: BG_TOTAL }}>
                    <span className={`text-sm font-bold ${weekRev > 0 ? "text-emerald-300" : "text-white/20"}`}>
                      {weekRev > 0 ? money(weekRev) : "—"}
                    </span>
                  </td>
                </tr>
              </thead>

              {/* Category rows */}
              <tbody>
                {CATEGORIES.map((cat, ci) => {
                  const catWeek = categoryWeekTotal(data, dates, cat.key);
                  return (
                    <tr key={cat.key} className="group">
                      <td className="px-5 py-2.5 border border-gray-200" style={{ background: ci % 2 === 0 ? "#fff" : "#f9fafb" }}>
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                          <span className="text-xs font-semibold text-gray-600">{cat.label}</span>
                        </div>
                      </td>
                      {dates.map(date => {
                        const row      = data.get(date);
                        const val      = row?.[cat.key] ?? 0;
                        const isToday  = date === today;
                        const isLocked = lockedDates.has(date);
                        const bgColor  = isToday ? "#ecfdf5" : isLocked ? "#f0fdf4" : ci % 2 === 0 ? "#fff" : "#f9fafb";
                        return (
                          <td key={date} className="px-2 py-1.5 border border-gray-200" style={{ background: bgColor }}>
                            <EditCell value={val} disabled={isLocked} onSave={v => handleSave(date, cat.key, v)} />
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 text-center border border-gray-200" style={{ background: "#f0fdf4" }}>
                        <span className={`text-xs font-semibold ${catWeek > 0 ? "text-emerald-700" : "text-gray-300"}`}>
                          {catWeek > 0 ? money(catWeek) : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Daily total footer */}
              <tfoot>
                <tr>
                  <td className="px-5 py-3 text-xs font-bold text-white border border-emerald-900/50" style={{ background: BG_HEADER }}>Daily Total</td>
                  {dates.map(date => {
                    const row      = data.get(date);
                    const isLocked = lockedDates.has(date);
                    const total    = isLocked ? lockedDates.get(date)! : (row ? dayTotal(row) : 0);
                    const isToday  = date === today;
                    return (
                      <td key={date} className="px-2 py-3 text-center border border-emerald-900/50"
                        style={{ background: isToday ? BG_TODAY_H : BG_HEADER }}>
                        <span className={`text-xs font-bold ${total > 0 ? "text-emerald-300" : "text-white/20"}`}>
                          {total > 0 ? money(total) : "—"}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 text-center border border-emerald-900/50" style={{ background: BG_HEADER }}>
                    <span className={`text-xs font-bold ${weekRev > 0 ? "text-emerald-300" : "text-white/20"}`}>
                      {weekRev > 0 ? money(weekRev) : "—"}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── Month Projection ── */}
        {monthSummary !== null && (
          <div className="rounded-2xl overflow-hidden shadow-md" style={{ border: "1px solid rgba(16,64,32,0.12)" }}>
            <div className="px-5 py-3.5" style={{ background: BG_HEADER }}>
              <span className="text-sm font-semibold text-white">{curMonthLabel} Projection</span>
              <span className="text-xs text-white/40 ml-2">Actual thru yesterday + planned from today</span>
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
                <div className="text-xs text-gray-400 mt-0.5">Projected {curMonthLabel} total</div>
              </div>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-gray-400">
          Click any cell to enter planned revenue · Saves automatically · Official days (completed imports) are locked
        </p>
      </div>
    </div>
  );
}
