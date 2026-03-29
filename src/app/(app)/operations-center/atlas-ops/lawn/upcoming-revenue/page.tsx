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
  mowing: number;
  weeding: number;
  shrubs: number;
  cleanups: number;
  brush_hogging: number;
  string_trimming: number;
  other: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function isoWeekStart(d: Date): Date {
  const dt = new Date(d);
  const day = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() - (day === 0 ? 6 : day - 1));
  dt.setUTCHours(0, 0, 0, 0);
  return dt;
}

function addDays(d: Date, n: number): Date {
  const dt = new Date(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt;
}

function toISO(d: Date) { return d.toISOString().slice(0, 10); }

function weekDates(mon: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => toISO(addDays(mon, i)));
}

const money = (n: number) =>
  n === 0 ? "—" :
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const moneyInput = (n: number) => n === 0 ? "" : String(n);

function dayLabel(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

function dateLabel(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function isWeekend(dateStr: string) {
  const dow = new Date(dateStr + "T12:00:00Z").getUTCDay();
  return dow === 0 || dow === 6;
}

function dayTotal(row: DayRow): number {
  return CATEGORIES.reduce((s, c) => s + (row[c.key] ?? 0), 0);
}

function weekTotal(data: Map<string, DayRow>, dates: string[]): number {
  return dates.reduce((s, d) => {
    const r = data.get(d);
    return s + (r ? dayTotal(r) : 0);
  }, 0);
}

function categoryWeekTotal(data: Map<string, DayRow>, dates: string[], cat: Category): number {
  return dates.reduce((s, d) => s + (data.get(d)?.[cat] ?? 0), 0);
}

// ── Editable cell ─────────────────────────────────────────────────────────────

function EditCell({
  value,
  onSave,
  disabled,
}: {
  value: number;
  onSave: (v: number) => void;
  disabled?: boolean;
}) {
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
    const parsed = parseFloat(draft.replace(/[^0-9.]/g, "")) || 0;
    onSave(parsed);
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
        className="w-full text-center text-xs font-semibold bg-white border border-emerald-400 rounded px-1 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-300"
        autoFocus
      />
    );
  }

  return (
    <button
      onClick={startEdit}
      disabled={disabled}
      className={`w-full text-center text-xs rounded py-1.5 transition-colors ${
        disabled
          ? "text-gray-300 cursor-default"
          : value > 0
            ? "font-semibold text-gray-800 hover:bg-emerald-50 cursor-text"
            : "text-gray-300 hover:bg-gray-50 hover:text-gray-500 cursor-text"
      }`}
    >
      {value > 0 ? money(value) : disabled ? "—" : <span className="opacity-0 group-hover:opacity-100">+</span>}
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function UpcomingRevenuePage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [data, setData] = useState<Map<string, DayRow>>(new Map());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const today = toISO(new Date());

  // Compute current displayed week (Mon–Sun)
  const baseMon = isoWeekStart(new Date());
  const mon = addDays(baseMon, weekOffset * 7);
  const dates = weekDates(mon);

  const monthLabel = (() => {
    const months = [...new Set(dates.map(d => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })))];
    return months.join(" / ");
  })();

  const load = useCallback(async () => {
    const start = dates[0];
    const end   = dates[6];
    const res = await fetch(`/api/operations-center/atlas-ops/lawn/upcoming-revenue?start=${start}&end=${end}`);
    if (!res.ok) return;
    const rows: DayRow[] = await res.json();
    setData(prev => {
      const next = new Map(prev);
      // Clear this week's dates first
      for (const d of dates) next.delete(d);
      for (const r of rows) next.set(r.date, r);
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(date: string, cat: Category, value: number) {
    // Optimistic update
    setData(prev => {
      const next = new Map(prev);
      const existing = next.get(date) ?? {
        date, mowing: 0, weeding: 0, shrubs: 0, cleanups: 0,
        brush_hogging: 0, string_trimming: 0, other: 0,
      };
      next.set(date, { ...existing, [cat]: value });
      return next;
    });

    setSaving(prev => new Set(prev).add(date));
    try {
      const row = data.get(date) ?? {
        date, mowing: 0, weeding: 0, shrubs: 0, cleanups: 0,
        brush_hogging: 0, string_trimming: 0, other: 0,
      };
      await fetch("/api/operations-center/atlas-ops/lawn/upcoming-revenue", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...row, [cat]: value, date }),
      });
    } finally {
      setSaving(prev => { const s = new Set(prev); s.delete(date); return s; });
    }
  }

  const weekRev = weekTotal(data, dates);

  return (
    <div className="min-h-screen" style={{ background: "#f0f4f0" }}>

      {/* ── Hero header ── */}
      <div
        className="px-6 py-5"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)" }}
      >
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
          <div className="flex items-center gap-3">
            {weekRev > 0 && (
              <div className="text-right">
                <div className="text-xs text-white/40 uppercase tracking-wider">Week Total</div>
                <div className="text-xl font-bold text-emerald-300">
                  {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(weekRev)}
                </div>
              </div>
            )}
            {/* Week nav */}
            <div className="flex items-center gap-1 bg-white/10 rounded-xl px-2 py-1.5">
              <button
                onClick={() => setWeekOffset(w => w - 1)}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
              >
                ‹
              </button>
              <button
                onClick={() => setWeekOffset(0)}
                className={`text-xs font-semibold px-2 py-1 rounded-lg transition-colors ${weekOffset === 0 ? "bg-emerald-500 text-white" : "text-white/60 hover:text-white hover:bg-white/10"}`}
              >
                This Week
              </button>
              <button
                onClick={() => setWeekOffset(w => w + 1)}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
              >
                ›
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="p-4">
        <div className="rounded-2xl overflow-hidden shadow-md" style={{ border: "1px solid rgba(16,64,32,0.12)" }}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 700 }}>

              {/* Column headers — day names + dates */}
              <thead>
                <tr style={{ background: "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)" }}>
                  {/* Category label column */}
                  <th className="px-5 py-0 text-left" style={{ width: 160 }}>
                    <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">Category</span>
                  </th>
                  {dates.map(date => {
                    const isToday = date === today;
                                        return (
                      <th key={date} className="px-2 py-3 text-center" style={{ minWidth: 90 }}>
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={`text-xs font-bold uppercase tracking-widest ${isToday ? "text-emerald-300" : "text-white/50"}`}>
                            {dayLabel(date)}
                          </span>
                          <span className={`text-sm font-semibold ${isToday ? "text-white" : "text-white/70"}`}>
                            {dateLabel(date)}
                          </span>
                          {isToday && <span className="w-1 h-1 rounded-full bg-emerald-400 mt-0.5" />}
                        </div>
                      </th>
                    );
                  })}
                  {/* Week total column */}
                  <th className="px-3 py-3 text-center" style={{ minWidth: 90 }}>
                    <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">Week</span>
                  </th>
                </tr>

                {/* Lawn Total row */}
                <tr className="border-b-2 border-emerald-900/30" style={{ background: "linear-gradient(90deg, #0f3a1e 0%, #1a4a28 100%)" }}>
                  <td className="px-5 py-3">
                    <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">Lawn Total</span>
                  </td>
                  {dates.map(date => {
                    const row = data.get(date);
                    const total = row ? dayTotal(row) : 0;
                    const weekend = isWeekend(date);
                    const isToday = date === today;
                    return (
                      <td key={date} className={`px-2 py-3 text-center `}>
                        <span className={`text-sm font-bold ${total > 0 ? (isToday ? "text-emerald-300" : "text-white") : "text-white/25"}`}>
                          {total > 0 ? money(total) : "—"}
                        </span>
                        {saving.has(date) && (
                          <span className="block text-[10px] text-emerald-400/60 mt-0.5">saving…</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 text-center">
                    <span className={`text-sm font-bold ${weekRev > 0 ? "text-emerald-300" : "text-white/25"}`}>
                      {weekRev > 0 ? money(weekRev) : "—"}
                    </span>
                  </td>
                </tr>
              </thead>

              {/* Category rows */}
              <tbody className="bg-white divide-y divide-gray-50">
                {CATEGORIES.map((cat, ci) => {
                  const catWeek = categoryWeekTotal(data, dates, cat.key);
                  return (
                    <tr
                      key={cat.key}
                      className={`transition-colors hover:bg-emerald-50/30 group ${ci % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}
                    >
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                          <span className="text-xs font-semibold text-gray-600">{cat.label}</span>
                        </div>
                      </td>
                      {dates.map(date => {
                        const row = data.get(date);
                        const val = row?.[cat.key] ?? 0;
                        const weekend = isWeekend(date);
                        const isToday = date === today;
                        return (
                          <td
                            key={date}
                            className={`px-2 py-1.5 ${isToday ? "bg-emerald-50/60" : ""} ${weekend ? "bg-gray-50/60" : ""}`}
                          >
                            <EditCell
                              value={val}
                              onSave={v => handleSave(date, cat.key, v)}
                            />
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-xs font-semibold ${catWeek > 0 ? "text-emerald-700" : "text-gray-200"}`}>
                          {catWeek > 0 ? money(catWeek) : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Footer total row */}
              <tfoot>
                <tr style={{ background: "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)" }}>
                  <td className="px-5 py-3 text-xs font-bold text-white">Daily Total</td>
                  {dates.map(date => {
                    const row = data.get(date);
                    const total = row ? dayTotal(row) : 0;
                    const weekend = isWeekend(date);
                    return (
                      <td key={date} className={`px-2 py-3 text-center `}>
                        <span className={`text-xs font-bold ${total > 0 ? "text-emerald-300" : "text-white/25"}`}>
                          {total > 0 ? money(total) : "—"}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 text-center">
                    <span className={`text-xs font-bold ${weekRev > 0 ? "text-emerald-300" : "text-white/25"}`}>
                      {weekRev > 0 ? money(weekRev) : "—"}
                    </span>
                  </td>
                </tr>
              </tfoot>

            </table>
          </div>
        </div>

        {/* Tip */}
        <p className="text-center text-xs text-gray-400 mt-4">
          Click any cell to enter planned revenue · Saves automatically
        </p>
      </div>
    </div>
  );
}
