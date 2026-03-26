"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@/lib/userContext";
import ImportPunchesModal from "./ImportPunchesModal";

type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  job_title: string | null;
  department_id: string | null;
  default_pay_rate: number | null;
  pay_type: string | null;
  at_departments: { name: string } | null;
  lunch_auto_deduct: boolean | null;
  lunch_deduct_after_hours: number | null;
  lunch_deduct_minutes: number | null;
};

type Punch = {
  id: string;
  employee_id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  date_for_payroll: string;
  punch_method: string;
  status: string;
  division_id: string | null;
  at_division_id: string | null;
  is_manual: boolean | null;
  regular_hours: number | null;
  ot_hours: number | null;
  dt_hours: number | null;
  lunch_deducted_mins: number | null;
  at_employees: Employee | null;
  divisions: { id: string; name: string } | null;
  at_divisions: { id: string; name: string } | null;
};

type Division = { id: string; name: string; source?: string };

type AtSettings = {
  ot_daily_threshold: number;
  dt_daily_threshold: number;
  lunch_auto_deduct: boolean;
  lunch_deduct_after_hours: number;
  lunch_deduct_minutes: number;
  pay_cycle: string;
  pay_period_start_day: number;
  pay_period_anchor_date: string | null;
  ot_weekly_threshold: number;
  ot_multiplier: number;
  dt_multiplier: number;
  labor_overhead_rate: number;
};

type BulkRow = {
  key: string;
  date: string;
  employee_id: string;
  division_id: string;
  clock_in: string;
  clock_out: string;
  punch_id: string | null;
  status: "draft" | "saving" | "saved" | "error";
  error_msg: string;
};

const DEFAULT_SETTINGS: AtSettings = {
  ot_daily_threshold: 8,
  dt_daily_threshold: 0,
  lunch_auto_deduct: false,
  lunch_deduct_after_hours: 6,
  lunch_deduct_minutes: 30,
  pay_cycle: "weekly",
  pay_period_start_day: 1,
  pay_period_anchor_date: null,
  ot_weekly_threshold: 40,
  ot_multiplier: 1.5,
  dt_multiplier: 2,
  labor_overhead_rate: 15,
};

function calcLaborCost(
  reg: number, ot: number, dt: number,
  rate: number, s: AtSettings
): number {
  return (reg * rate + ot * rate * s.ot_multiplier + dt * rate * s.dt_multiplier)
    * (1 + s.labor_overhead_rate / 100);
}

function getWeekStart(dateStr: string, startDay = 1): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay(); // 0=Sun
  const diff = ((day - startDay) + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

function getPeriodStart(dateStr: string, s: AtSettings): string {
  const date = new Date(dateStr + "T12:00:00");
  switch (s.pay_cycle) {
    case "biweekly": {
      const anchor = s.pay_period_anchor_date
        ? new Date(s.pay_period_anchor_date + "T12:00:00")
        : new Date(getWeekStart(dateStr, s.pay_period_start_day) + "T12:00:00");
      const diffDays = Math.floor((date.getTime() - anchor.getTime()) / 86_400_000);
      const periodDay = ((diffDays % 14) + 14) % 14;
      const start = new Date(date);
      start.setDate(date.getDate() - periodDay);
      return start.toISOString().slice(0, 10);
    }
    case "semi_monthly": {
      const day = date.getDate();
      return day <= 15 ? `${dateStr.slice(0, 7)}-01` : `${dateStr.slice(0, 7)}-16`;
    }
    case "monthly":
      return `${dateStr.slice(0, 7)}-01`;
    default: // "weekly"
      return getWeekStart(dateStr, s.pay_period_start_day);
  }
}

function newBulkRow(date: string): BulkRow {
  return { key: `${Date.now()}_${Math.random()}`, date, employee_id: "", division_id: "", clock_in: "", clock_out: "", punch_id: null, status: "draft", error_msg: "" };
}

function calcPunchHours(clockIn: string, clockOut: string, s: AtSettings) {
  if (!clockIn || !clockOut) return null;
  const base = "2000-01-01T";
  let inMs  = new Date(base + clockIn).getTime();
  let outMs = new Date(base + clockOut).getTime();
  if (outMs <= inMs) outMs += 86_400_000; // overnight
  let mins = (outMs - inMs) / 60_000;
  let lunchMins = 0;
  if (s.lunch_auto_deduct && mins / 60 >= s.lunch_deduct_after_hours) {
    lunchMins = s.lunch_deduct_minutes;
    mins -= lunchMins;
  }
  const total = Math.round(mins / 60 * 100) / 100;
  const otThresh = s.ot_daily_threshold;  // 0 = daily OT disabled
  const dtThresh = s.dt_daily_threshold;  // 0 = DT disabled
  let reg = total, ot = 0, dt = 0;
  if (otThresh > 0) { // only apply daily OT when threshold is set
    if (dtThresh > 0 && total > dtThresh) {
      dt  = Math.round((total - dtThresh) * 100) / 100;
      ot  = Math.round((dtThresh - otThresh) * 100) / 100;
      reg = otThresh;
    } else if (total > otThresh) {
      ot  = Math.round((total - otThresh) * 100) / 100;
      reg = otThresh;
    }
  }
  return { total, reg, ot, dt, lunchMins };
}

const EMPTY_MANUAL = {
  employee_id: "",
  date: new Date().toISOString().slice(0, 10),
  clock_in_time: "09:00",
  clock_out_time: "",
  division_id: "",
  note: "",
};

function elapsed(clockIn: string): string {
  const ms = Date.now() - new Date(clockIn).getTime();
  const totalMins = Math.floor(ms / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function fmtHours(clockIn: string, clockOut: string): string {
  const diff = (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 3_600_000;
  return diff.toFixed(2);
}

/** Build an ISO-8601 string with the browser's local timezone offset so the server stores the correct UTC time. */
function localIso(dateStr: string, timeStr: string): string {
  const off  = new Date().getTimezoneOffset(); // minutes west of UTC (positive = behind UTC)
  const sign = off <= 0 ? "+" : "-";
  const abs  = Math.abs(off);
  const hh   = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm   = String(abs % 60).padStart(2, "0");
  return `${dateStr}T${timeStr}:00${sign}${hh}:${mm}`;
}

/** Merge per-employee lunch overrides onto global settings. */
function empSettings(global: AtSettings, emp: Employee | null): AtSettings {
  if (!emp) return global;
  return {
    ...global,
    lunch_auto_deduct:        emp.lunch_auto_deduct        ?? global.lunch_auto_deduct,
    lunch_deduct_after_hours: emp.lunch_deduct_after_hours ?? global.lunch_deduct_after_hours,
    lunch_deduct_minutes:     emp.lunch_deduct_minutes     ?? global.lunch_deduct_minutes,
  };
}

/** Decode a punch-item dropdown value ("d:UUID" or "a:UUID") into the right FK fields. */
function decodePunchItem(val: string): { division_id: string | null; at_division_id: string | null } {
  if (val.startsWith("d:")) return { division_id: val.slice(2), at_division_id: null };
  if (val.startsWith("a:")) return { division_id: null, at_division_id: val.slice(2) };
  return { division_id: null, at_division_id: null };
}

function initials(e: Employee) {
  return `${e.first_name[0] ?? ""}${e.last_name[0] ?? ""}`.toUpperCase();
}

function displayName(e: Employee) {
  return `${e.last_name}, ${e.preferred_name ?? e.first_name}`;
}

const DEFAULT_CLOCK_COLS = { job_title: true, division: true, department: true, clock_in_time: true, elapsed: true, punch_method: false };
type ClockColKey = keyof typeof DEFAULT_CLOCK_COLS;

function useClockCols() {
  const [cols, setCols] = useState(DEFAULT_CLOCK_COLS);
  useEffect(() => {
    function read() {
      try {
        const saved = localStorage.getItem("tm-clock-cols");
        if (saved) setCols({ ...DEFAULT_CLOCK_COLS, ...JSON.parse(saved) });
      } catch {}
    }
    read();
    function onStorage(e: StorageEvent) {
      if (e.key === "tm-clock-cols") read();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return cols;
}

export default function ClockPage() {
  return <Suspense><ClockPageInner /></Suspense>;
}

function ClockPageInner() {
  const { can } = useUser();
  const showLaborCost = can("hr_labor_cost");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [now, setNow] = useState(new Date());
  const [punches, setPunches] = useState<Punch[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const cols = useClockCols();

  // Date navigation — persisted in URL query string so refresh keeps the date
  const todayStr = new Date().toISOString().slice(0, 10);
  const urlDate  = searchParams.get("date");
  const [viewDate, setViewDateState] = useState(urlDate ?? todayStr);

  function setViewDate(date: string) {
    setViewDateState(date);
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", date);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  // Stats (week + period punches for per-employee totals)
  const [statsPunches, setStatsPunches] = useState<Punch[]>([]);

  // Bulk entry
  const [showBulkEntry, setShowBulkEntry] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>(() => [newBulkRow(new Date().toISOString().slice(0, 10))]);
  const [atSettings, setAtSettings] = useState<AtSettings>(DEFAULT_SETTINGS);
  const bulkRowsRef = useRef<BulkRow[]>([]);
  const atSettingsRef = useRef<AtSettings>(DEFAULT_SETTINGS);
  const employeesRef = useRef<Employee[]>([]);
  const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  bulkRowsRef.current = bulkRows;
  atSettingsRef.current = atSettings;
  employeesRef.current = employees;

  // Import punches modal
  const [showImport, setShowImport] = useState(false);

  // Manual punch drawer
  const [showManual, setShowManual] = useState(false);
  const [manualForm, setManualForm] = useState(EMPTY_MANUAL);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState("");
  const [manualSuccess, setManualSuccess] = useState(false);

  // Hours breakdown popover
  const [breakdownId, setBreakdownId] = useState<string | null>(null);

  // Column sort
  const [sortCol, setSortCol] = useState<string>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  function handleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  }
  function SortIcon({ col }: { col: string }) {
    if (sortCol !== col) return <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-30"><polyline points="6 9 12 15 18 9"/></svg>;
    return sortDir === "asc"
      ? <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
      : <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>;
  }

  // Inline punch editing
  const [editingPunchId, setEditingPunchId] = useState<string | null>(null);
  const [editClockIn, setEditClockIn] = useState("");
  const [editClockOut, setEditClockOut] = useState("");
  const [editDivisionId, setEditDivisionId] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setNow(new Date()), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  useEffect(() => { loadStatic(); }, []);
  useEffect(() => { load(); loadStats(); }, [viewDate]);

  // Load employees, divisions, and settings once on mount
  async function loadStatic() {
    try {
      const [empRes, divRes, settingsRes] = await Promise.all([
        fetch("/api/atlas-time/employees", { cache: "no-store" }),
        fetch("/api/atlas-time/divisions", { cache: "no-store" }),
        fetch("/api/atlas-time/settings", { cache: "no-store" }),
      ]);
      const empJson      = await empRes.json().catch(() => null);
      const divJson      = await divRes.json().catch(() => null);
      const settingsJson = await settingsRes.json().catch(() => ({}));
      setEmployees(empJson?.employees ?? []);
      setDivisions(divJson?.divisions ?? []);
      const s = settingsJson.settings ?? {};
      const freshSettings: AtSettings = {
        ot_daily_threshold:       s.ot_daily_threshold       ?? 8,
        dt_daily_threshold:       s.dt_daily_threshold       ?? 0,
        lunch_auto_deduct:        s.lunch_auto_deduct        ?? false,
        lunch_deduct_after_hours: s.lunch_deduct_after_hours ?? 6,
        lunch_deduct_minutes:     s.lunch_deduct_minutes     ?? 30,
        pay_cycle:                s.pay_cycle                ?? "weekly",
        pay_period_start_day:     s.pay_period_start_day     ?? 1,
        pay_period_anchor_date:   s.pay_period_anchor_date   ?? null,
        ot_weekly_threshold:      s.ot_weekly_threshold      ?? 40,
        ot_multiplier:            s.ot_multiplier            ?? 1.5,
        dt_multiplier:            s.dt_multiplier            ?? 2,
        labor_overhead_rate:      s.labor_overhead_rate      ?? 15,
      };
      setAtSettings(freshSettings);
      atSettingsRef.current = freshSettings;
      loadStats(freshSettings);
    } catch { /* non-fatal */ }
  }

  async function loadStats(settings?: AtSettings) {
    try {
      const s = settings ?? atSettingsRef.current;
      const wStart  = getWeekStart(viewDate, s.pay_period_start_day);
      const pStart  = getPeriodStart(viewDate, s);
      const from    = wStart < pStart ? wStart : pStart;
      if (from >= viewDate) { setStatsPunches([]); return; }
      const res  = await fetch(`/api/atlas-time/punches?date_from=${from}&date_to=${viewDate}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok) setStatsPunches(json.punches ?? []);
    } catch { /* non-fatal */ }
  }

  // Reload punches whenever the viewed date changes
  async function load() {
    try {
      setLoading(true);
      setError("");
      const res  = await fetch(`/api/atlas-time/punches?date_from=${viewDate}&date_to=${viewDate}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to load");
      setPunches(json.punches ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function submitManualPunch() {
    setManualError("");
    if (!manualForm.employee_id) { setManualError("Please select a team member."); return; }
    if (!manualForm.clock_in_time) { setManualError("Clock-in time is required."); return; }

    const clockInISO  = localIso(manualForm.date, manualForm.clock_in_time);
    const clockOutISO = manualForm.clock_out_time ? localIso(manualForm.date, manualForm.clock_out_time) : null;

    if (clockOutISO && new Date(clockOutISO) <= new Date(clockInISO)) {
      setManualError("Clock-out must be after clock-in.");
      return;
    }

    try {
      setManualSaving(true);
      const divPayload = decodePunchItem(manualForm.division_id);
      const manualEmp = employees.find(e => e.id === manualForm.employee_id) ?? null;
      const hrs = clockOutISO ? calcPunchHours(manualForm.clock_in_time, manualForm.clock_out_time, empSettings(atSettings, manualEmp)) : null;
      const res = await fetch("/api/atlas-time/punches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id:   manualForm.employee_id,
          is_manual:     true,
          clock_in_at:   clockInISO,
          clock_out_at:  clockOutISO,
          date_for_payroll: manualForm.date,
          ...divPayload,
          note:          manualForm.note || null,
          ...(hrs ? { regular_hours: hrs.reg, ot_hours: hrs.ot, dt_hours: hrs.dt, lunch_deducted_mins: hrs.lunchMins } : {}),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to save punch");
      setManualSuccess(true);
      setManualForm({ ...EMPTY_MANUAL, date: manualForm.date });
      setTimeout(() => setManualSuccess(false), 3000);
      await load();
    } catch (e: any) {
      setManualError(e?.message ?? "Failed to save punch");
    } finally {
      setManualSaving(false);
    }
  }

  async function clockIn(employeeId: string) {
    try {
      setActing(employeeId);
      const res = await fetch("/api/atlas-time/punches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: employeeId, punch_method: "admin" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to clock in");
      await load();
      setSearch("");
    } catch (e: any) {
      setError(e?.message ?? "Clock in failed");
    } finally {
      setActing(null);
    }
  }

  async function clockOut(punchId: string, employeeId: string) {
    try {
      setActing(employeeId);
      const res = await fetch(`/api/atlas-time/punches/${punchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clock_out: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to clock out");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Clock out failed");
    } finally {
      setActing(null);
    }
  }

  // ── Bulk entry ────────────────────────────────────────────────
  async function saveBulkRowNow(key: string) {
    const row = bulkRowsRef.current.find(r => r.key === key);
    if (!row || !row.employee_id || !row.date || !row.clock_in || !row.clock_out) return;
    setBulkRows(prev => prev.map(r => r.key === key ? { ...r, status: "saving" } : r));
    const clockInISO  = localIso(row.date, row.clock_in);
    const clockOutISO = localIso(row.date, row.clock_out);
    const rowEmp = employeesRef.current.find(e => e.id === row.employee_id) ?? null;
    const hrs = calcPunchHours(row.clock_in, row.clock_out, empSettings(atSettingsRef.current, rowEmp));
    const divPayload = decodePunchItem(row.division_id);
    try {
      if (row.punch_id) {
        const res = await fetch(`/api/atlas-time/punches/${row.punch_id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clock_in_at: clockInISO, clock_out_at: clockOutISO, ...divPayload, ...(hrs ? { regular_hours: hrs.reg, ot_hours: hrs.ot, dt_hours: hrs.dt, lunch_deducted_mins: hrs.lunchMins } : {}) }),
        });
        if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? "Failed"); }
        setBulkRows(prev => prev.map(r => r.key === key ? { ...r, status: "saved" } : r));
      } else {
        const res = await fetch("/api/atlas-time/punches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employee_id: row.employee_id, is_manual: true, clock_in_at: clockInISO, clock_out_at: clockOutISO, date_for_payroll: row.date, ...divPayload, ...(hrs ? { regular_hours: hrs.reg, ot_hours: hrs.ot, dt_hours: hrs.dt, lunch_deducted_mins: hrs.lunchMins } : {}) }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "Failed");
        setBulkRows(prev => prev.map(r => r.key === key ? { ...r, punch_id: json.punch.id, status: "saved" } : r));
      }
    } catch (e: any) {
      setBulkRows(prev => prev.map(r => r.key === key ? { ...r, status: "error", error_msg: e?.message ?? "Failed" } : r));
    }
  }

  function scheduleBulkSave(key: string) {
    if (saveTimersRef.current.has(key)) clearTimeout(saveTimersRef.current.get(key)!);
    saveTimersRef.current.set(key, setTimeout(() => {
      saveTimersRef.current.delete(key);
      saveBulkRowNow(key);
    }, 350));
  }

  function updateBulkRow(key: string, patch: Partial<BulkRow>) {
    setBulkRows(prev => {
      const next = prev.map(r => r.key === key ? { ...r, ...patch, status: "draft" as const, error_msg: "" } : r);
      const row = next.find(r => r.key === key);
      if (row && row.employee_id && row.date && row.clock_in && row.clock_out) scheduleBulkSave(key);
      return next;
    });
  }

  async function deleteBulkRow(key: string) {
    if (saveTimersRef.current.has(key)) clearTimeout(saveTimersRef.current.get(key)!);
    const row = bulkRowsRef.current.find(r => r.key === key);
    if (row?.punch_id) await fetch(`/api/atlas-time/punches/${row.punch_id}`, { method: "DELETE" });
    setBulkRows(prev => prev.filter(r => r.key !== key));
  }
  // ── End bulk entry ─────────────────────────────────────────────

  function startEditPunch(p: Punch) {
    setEditingPunchId(p.id);
    const inD = new Date(p.clock_in_at);
    setEditClockIn(`${String(inD.getHours()).padStart(2,"0")}:${String(inD.getMinutes()).padStart(2,"0")}`);
    if (p.clock_out_at) {
      const outD = new Date(p.clock_out_at);
      setEditClockOut(`${String(outD.getHours()).padStart(2,"0")}:${String(outD.getMinutes()).padStart(2,"0")}`);
    } else {
      setEditClockOut("");
    }
    setEditDivisionId(
      p.division_id    ? `d:${p.division_id}`    :
      p.at_division_id ? `a:${p.at_division_id}` : ""
    );
  }

  async function savePunchEdit(punchId: string) {
    if (!editClockIn) { setError("Clock-in time is required."); return; }
    try {
      setEditSaving(true);
      setError("");
      const clockInISO  = localIso(viewDate, editClockIn);
      const clockOutISO = editClockOut ? localIso(viewDate, editClockOut) : null;
      const punchEmp = employees.find(e => e.id === (punches.find(p => p.id === punchId)?.employee_id)) ?? null;
      const hrs = editClockOut ? calcPunchHours(editClockIn, editClockOut, empSettings(atSettings, punchEmp)) : null;
      const divPayload = decodePunchItem(editDivisionId);
      const res = await fetch(`/api/atlas-time/punches/${punchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clock_in_at: clockInISO, clock_out_at: clockOutISO,
          division_id: divPayload.division_id, at_division_id: divPayload.at_division_id,
          ...(hrs ? { regular_hours: hrs.reg, ot_hours: hrs.ot, dt_hours: hrs.dt, lunch_deducted_mins: hrs.lunchMins } : {}),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to save");
      const matchedDiv = divPayload.division_id ? divisions.find(d => d.id === divPayload.division_id) ?? null : null;
      const matchedAtDiv = divPayload.at_division_id ? divisions.find(d => d.id === divPayload.at_division_id) ?? null : null;
      setPunches(prev => prev.map(p => p.id === punchId
        ? { ...p, clock_in_at: json.punch.clock_in_at, clock_out_at: json.punch.clock_out_at,
            regular_hours: json.punch.regular_hours, ot_hours: json.punch.ot_hours,
            dt_hours: json.punch.dt_hours, lunch_deducted_mins: json.punch.lunch_deducted_mins,
            division_id: divPayload.division_id, at_division_id: divPayload.at_division_id,
            divisions: matchedDiv ? { id: matchedDiv.id, name: matchedDiv.name } : null,
            at_divisions: matchedAtDiv ? { id: matchedAtDiv.id, name: matchedAtDiv.name } : null }
        : p));
      setEditingPunchId(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save");
    } finally {
      setEditSaving(false);
    }
  }

  async function deletePunch(punchId: string) {
    if (!confirm("Delete this punch? This cannot be undone.")) return;
    const res = await fetch(`/api/atlas-time/punches/${punchId}`, { method: "DELETE" });
    if (res.ok) {
      setPunches(prev => prev.filter(p => p.id !== punchId));
    } else {
      const j = await res.json().catch(() => null);
      setError(j?.error ?? "Failed to delete punch");
    }
  }

  const isToday = viewDate === todayStr;
  const openPunches = punches.filter((p) => !p.clock_out_at);
  const closedPunches = punches.filter((p) => p.clock_out_at);
  const clockedInIds = new Set(openPunches.map((p) => p.employee_id));

  const searchResults = search.trim()
    ? employees.filter((e) => {
        const q = search.toLowerCase();
        return (
          e.first_name.toLowerCase().includes(q) ||
          e.last_name.toLowerCase().includes(q) ||
          (e.preferred_name?.toLowerCase().includes(q)) ||
          (e.job_title?.toLowerCase().includes(q))
        );
      }).slice(0, 6)
    : [];

  // Use stored reg+OT+DT hours (lunch already deducted) rather than raw elapsed time
  function punchTotalHrs(p: Punch): number {
    if (!p.clock_out_at) return 0;
    if (p.regular_hours != null) return (p.regular_hours ?? 0) + (p.ot_hours ?? 0) + (p.dt_hours ?? 0);
    // Fallback: raw elapsed (for legacy punches without stored hours)
    return (new Date(p.clock_out_at).getTime() - new Date(p.clock_in_at).getTime()) / 3_600_000;
  }

  const totalHoursToday = closedPunches.reduce((acc, p) => acc + punchTotalHrs(p), 0);

  function sortPunches<T extends Punch>(list: T[]): T[] {
    return [...list].sort((a, b) => {
      const emp_a = a.at_employees, emp_b = b.at_employees;
      let cmp = 0;
      switch (sortCol) {
        case "name":
          cmp = `${emp_a?.last_name ?? ""}${emp_a?.first_name ?? ""}`.localeCompare(`${emp_b?.last_name ?? ""}${emp_b?.first_name ?? ""}`);
          break;
        case "punch_item":
          cmp = ((a.divisions ?? a.at_divisions)?.name ?? "").localeCompare((b.divisions ?? b.at_divisions)?.name ?? "");
          break;
        case "clock_in":
          cmp = a.clock_in_at.localeCompare(b.clock_in_at);
          break;
        case "clock_out":
          cmp = (a.clock_out_at ?? "").localeCompare(b.clock_out_at ?? "");
          break;
        case "hours":
          cmp = punchTotalHrs(a) - punchTotalHrs(b);
          break;
        default:
          cmp = `${emp_a?.last_name ?? ""}`.localeCompare(`${emp_b?.last_name ?? ""}`);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }

  // Per-employee stats from the broader date range
  const weekStart   = getWeekStart(viewDate, atSettings.pay_period_start_day);
  const periodStart = getPeriodStart(viewDate, atSettings);
  const empStatsMap = new Map<string, { today: number; week: number; period: number }>();
  for (const p of statsPunches) {
    if (!p.clock_out_at) continue;
    const hrs = punchTotalHrs(p);
    const cur = empStatsMap.get(p.employee_id) ?? { today: 0, week: 0, period: 0 };
    if (p.date_for_payroll === viewDate) cur.today += hrs;
    if (p.date_for_payroll >= weekStart && p.date_for_payroll <= viewDate) cur.week += hrs;
    if (p.date_for_payroll >= periodStart && p.date_for_payroll <= viewDate) cur.period += hrs;
    empStatsMap.set(p.employee_id, cur);
  }

  return (
    <div className="min-h-screen bg-[#f0f4f0]">
      {/* Import Punches Modal */}
      {showImport && (
        <ImportPunchesModal
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); load(); }}
        />
      )}

      {/* Manual Punch Drawer */}
      {showManual && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="flex-1 bg-black/40" onClick={() => { setShowManual(false); setManualError(""); }} />
          {/* Panel */}
          <div className="w-full max-w-md bg-white shadow-2xl flex flex-col h-full overflow-y-auto">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">Manual Punch</h2>
                <p className="text-xs text-gray-400 mt-0.5">Add a punch for any date and time</p>
              </div>
              <button onClick={() => { setShowManual(false); setManualError(""); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <div className="px-6 py-5 space-y-5 flex-1">
              {manualSuccess && (
                <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
                  Punch saved successfully.
                </div>
              )}
              {manualError && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {manualError}
                </div>
              )}

              {/* Employee */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Team Member <span className="text-red-500">*</span></label>
                <select
                  value={manualForm.employee_id}
                  onChange={e => setManualForm(f => ({ ...f, employee_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">— Select team member —</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>
                      {`${e.last_name}, ${e.preferred_name ?? e.first_name}`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Date <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={manualForm.date}
                  onChange={e => setManualForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* Clock-in / Clock-out times */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Clock In <span className="text-red-500">*</span></label>
                  <input
                    type="time"
                    value={manualForm.clock_in_time}
                    onChange={e => setManualForm(f => ({ ...f, clock_in_time: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Clock Out <span className="text-gray-400">(optional)</span></label>
                  <input
                    type="time"
                    value={manualForm.clock_out_time}
                    onChange={e => setManualForm(f => ({ ...f, clock_out_time: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              {/* Punch Item */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Punch Item</label>
                <select
                  value={manualForm.division_id}
                  onChange={e => setManualForm(f => ({ ...f, division_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">— None —</option>
                  {divisions.filter(d => d.source === "company" || !d.source).map(d => (
                    <option key={d.id} value={`d:${d.id}`}>{d.name}</option>
                  ))}
                  {divisions.some(d => d.source === "time_clock") && (
                    <optgroup label="── Time Clock Only ──">
                      {divisions.filter(d => d.source === "time_clock").map(d => (
                        <option key={d.id} value={`a:${d.id}`}>{d.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Note</label>
                <textarea
                  value={manualForm.note}
                  onChange={e => setManualForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Optional note about this punch…"
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => { setShowManual(false); setManualError(""); }}
                className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitManualPunch}
                disabled={manualSaving}
                className="flex-1 bg-[#123b1f] hover:bg-[#0d2616] text-white rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {manualSaving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</> : "Save Punch"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="px-4 md:px-8 py-6 md:py-8" style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-2 text-white/50 text-xs mb-2">
            <Link href="/operations-center" className="hover:text-white/80 transition-colors">Settings</Link>
            <span>/</span>
            <Link href="/operations-center/atlas-time" className="hover:text-white/80 transition-colors">Atlas HR</Link>
            <span>/</span>
            <span className="text-white/80">Time Clock</span>
          </div>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Time Clock</h1>
              <button
                onClick={() => { setShowBulkEntry(v => !v); if (!showBulkEntry) setBulkRows([newBulkRow(viewDate)]); }}
                className={`mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${showBulkEntry ? "bg-white text-[#123b1f] border-white" : "bg-white/10 hover:bg-white/20 text-white border-white/20"}`}
              >
                {showBulkEntry ? "✕ Exit Bulk Entry" : "⊞ Bulk Entry"}
              </button>
              <p className="text-white/50 text-sm mt-1">
                {isToday
                  ? now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
                  : new Date(viewDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </p>
            </div>
            <div className="text-right flex flex-col items-end gap-2">
              {isToday && (
                <div className="text-3xl md:text-4xl font-mono font-bold text-white tracking-tight">
                  {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })}
                </div>
              )}
              <div className="flex flex-col items-end gap-1.5">
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={viewDate}
                    max={todayStr}
                    onChange={e => { if (e.target.value) setViewDate(e.target.value); }}
                    className="bg-white/10 border border-white/20 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/30 [color-scheme:dark]"
                  />
                  <button
                    onClick={() => setShowImport(true)}
                    className="bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-lg border border-white/20 transition-colors"
                  >
                    Import
                  </button>
                  <button
                    onClick={() => { setManualForm({ ...EMPTY_MANUAL, date: viewDate }); setManualError(""); setManualSuccess(false); setShowManual(true); }}
                    className="bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-lg border border-white/20 transition-colors"
                  >
                    + Manual Punch
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      const d = new Date(viewDate + "T12:00:00");
                      d.setDate(d.getDate() - 1);
                      setViewDate(d.toISOString().slice(0, 10));
                    }}
                    className="text-white/60 hover:text-white text-[11px] font-medium px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                  >
                    ← Prev Day
                  </button>
                  {!isToday && (
                    <>
                      <button
                        onClick={() => {
                          const d = new Date(viewDate + "T12:00:00");
                          d.setDate(d.getDate() + 1);
                          const next = d.toISOString().slice(0, 10);
                          if (next <= todayStr) setViewDate(next);
                        }}
                        className="text-white/60 hover:text-white text-[11px] font-medium px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                      >
                        Next Day →
                      </button>
                      <button
                        onClick={() => setViewDate(todayStr)}
                        className="text-white/60 hover:text-white text-[11px] font-medium px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                      >
                        Today ↠
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-3 sm:flex sm:flex-wrap gap-2 sm:gap-4">
            <div className="bg-white/10 rounded-xl px-4 py-2.5 text-center min-w-[80px]">
              <div className="text-2xl font-bold text-white">{openPunches.length}</div>
              <div className="text-xs text-white/60">{isToday ? "Clocked In" : "Open"}</div>
            </div>
            <div className="bg-white/10 rounded-xl px-4 py-2.5 text-center min-w-[80px]">
              <div className="text-2xl font-bold text-white">{closedPunches.length}</div>
              <div className="text-xs text-white/60">Completed</div>
            </div>
            <div className="bg-white/10 rounded-xl px-4 py-2.5 text-center min-w-[80px]">
              <div className="text-2xl font-bold text-white">{totalHoursToday.toFixed(2)}</div>
              <div className="text-xs text-white/60">Total Hrs</div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-5 max-w-6xl mx-auto space-y-5">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
            {error}
            <button onClick={() => setError("")} className="text-red-400 hover:text-red-600">✕</button>

          </div>
        )}

        {/* ── Bulk Entry grid ────────────────────────────────────── */}
        {showBulkEntry && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Bulk Punch Entry</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Autosaves each row when complete · OT after {atSettings.ot_daily_threshold}h
                  {atSettings.lunch_auto_deduct && ` · ${atSettings.lunch_deduct_minutes}min lunch deducted after ${atSettings.lunch_deduct_after_hours}h`}
                </p>
              </div>
              <span className="text-xs text-gray-400">{bulkRows.filter(r => r.status === "saved").length} saved</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: atSettings.dt_daily_threshold > 0 ? 920 : 860 }}>
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    <th className="px-3 py-2 text-left w-32">Date</th>
                    <th className="px-3 py-2 text-left">Team Member</th>
                    <th className="px-3 py-2 text-left w-36">Punch Item</th>
                    <th className="px-3 py-2 text-center w-24">In</th>
                    <th className="px-3 py-2 text-center w-24">Out</th>
                    <th className="px-3 py-2 text-center w-16">Reg</th>
                    <th className="px-3 py-2 text-center w-16">OT</th>
                    {atSettings.dt_daily_threshold > 0 && <th className="px-3 py-2 text-center w-14">DT</th>}
                    <th className="px-3 py-2 text-center w-16">Total</th>
                    <th className="px-2 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {bulkRows.map((row) => {
                    const hrs = calcPunchHours(row.clock_in, row.clock_out, atSettings);
                    const isComplete = !!(row.employee_id && row.date && row.clock_in && row.clock_out);
                    return (
                      <tr key={row.key} className={`${row.status === "error" ? "bg-red-50/40" : row.status === "saved" ? "bg-green-50/20" : ""}`}>
                        <td className="px-3 py-2">
                          <input type="date" value={row.date} max={todayStr}
                            onChange={e => updateBulkRow(row.key, { date: e.target.value })}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500" />
                        </td>
                        <td className="px-3 py-2">
                          <select value={row.employee_id}
                            onChange={e => updateBulkRow(row.key, { employee_id: e.target.value })}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500">
                            <option value="">— Select —</option>
                            {employees.map(e => <option key={e.id} value={e.id}>{`${e.last_name}, ${e.preferred_name ?? e.first_name}`}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select value={row.division_id}
                            onChange={e => updateBulkRow(row.key, { division_id: e.target.value })}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500">
                            <option value="">— None —</option>
                            {divisions.filter(d => d.source === "company" || !d.source).map(d => <option key={d.id} value={`d:${d.id}`}>{d.name}</option>)}
                            {divisions.some(d => d.source === "time_clock") && (
                              <optgroup label="── Time Clock Only ──">
                                {divisions.filter(d => d.source === "time_clock").map(d => <option key={d.id} value={`a:${d.id}`}>{d.name}</option>)}
                              </optgroup>
                            )}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input type="time" value={row.clock_in}
                            onChange={e => updateBulkRow(row.key, { clock_in: e.target.value })}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="time" value={row.clock_out}
                            onChange={e => updateBulkRow(row.key, { clock_out: e.target.value })}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500" />
                        </td>
                        <td className="px-3 py-2 text-center text-xs font-semibold text-gray-700 tabular-nums">
                          {hrs ? hrs.reg.toFixed(2) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-center text-xs font-semibold tabular-nums">
                          {hrs ? <span className={hrs.ot > 0 ? "text-amber-600" : "text-gray-300"}>{hrs.ot > 0 ? hrs.ot.toFixed(2) : "—"}</span> : <span className="text-gray-300">—</span>}
                        </td>
                        {atSettings.dt_daily_threshold > 0 && (
                          <td className="px-3 py-2 text-center text-xs font-semibold tabular-nums">
                            {hrs ? <span className={hrs.dt > 0 ? "text-red-600" : "text-gray-300"}>{hrs.dt > 0 ? hrs.dt.toFixed(2) : "—"}</span> : <span className="text-gray-300">—</span>}
                          </td>
                        )}
                        <td className="px-3 py-2 text-center text-xs font-bold text-gray-800 tabular-nums relative">
                          {hrs ? (
                            <>
                              <button onClick={() => setBreakdownId(breakdownId === `b_${row.key}` ? null : `b_${row.key}`)}
                                className="underline decoration-dotted underline-offset-2 hover:text-[#123b1f]">
                                {hrs.total.toFixed(2)}
                              </button>
                              {breakdownId === `b_${row.key}` && (
                                <div className="absolute left-1/2 -translate-x-1/2 top-7 z-30 bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2.5 text-left min-w-[140px]">
                                  <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Breakdown</div>
                                  <div className="space-y-1 text-xs text-gray-700 tabular-nums font-normal">
                                    <div className="flex justify-between gap-4"><span>Reg</span><span className="font-semibold">{hrs.reg.toFixed(2)}</span></div>
                                    {hrs.ot > 0 && <div className="flex justify-between gap-4"><span className="text-amber-600">OT</span><span className="font-semibold text-amber-600">{hrs.ot.toFixed(2)}</span></div>}
                                    {hrs.dt > 0 && <div className="flex justify-between gap-4"><span className="text-red-600">DT</span><span className="font-semibold text-red-600">{hrs.dt.toFixed(2)}</span></div>}
                                    {hrs.lunchMins > 0 && <div className="flex justify-between gap-4 text-gray-400"><span>Lunch</span><span>−{hrs.lunchMins}m</span></div>}
                                    <div className="border-t border-gray-100 pt-1 flex justify-between gap-4 font-bold"><span>Total</span><span>{hrs.total.toFixed(2)}</span></div>
                                  </div>
                                </div>
                              )}
                            </>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {row.status === "saving" && (
                            <svg className="animate-spin w-4 h-4 text-gray-400 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                          )}
                          {row.status === "saved" && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-500 mx-auto"><polyline points="20 6 9 17 4 12"/></svg>
                          )}
                          {row.status === "error" && (
                            <button title={row.error_msg} onClick={() => saveBulkRowNow(row.key)} className="text-red-400 hover:text-red-600 mx-auto block">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            </button>
                          )}
                          {row.status === "draft" && isComplete && (
                            <svg className="w-4 h-4 text-gray-200 mx-auto animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                          )}
                          {row.status === "draft" && !isComplete && bulkRows.length > 1 && (
                            <button onClick={() => deleteBulkRow(row.key)} className="text-gray-300 hover:text-red-400 transition-colors mx-auto block">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-3 border-t border-gray-50 flex items-center justify-between">
              <button
                onClick={() => setBulkRows(prev => [...prev, newBulkRow(viewDate)])}
                className="text-xs font-semibold text-[#123b1f] hover:text-[#1a5c2e] flex items-center gap-1.5 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Row
              </button>
              {(() => {
                const savedRows = bulkRows.filter(r => r.punch_id);
                if (savedRows.length === 0) return null;
                const totals = savedRows.reduce((acc, row) => {
                  const hrs = calcPunchHours(row.clock_in, row.clock_out, atSettings);
                  if (!hrs) return acc;
                  return { reg: acc.reg + hrs.reg, ot: acc.ot + hrs.ot, dt: acc.dt + hrs.dt, total: acc.total + hrs.total };
                }, { reg: 0, ot: 0, dt: 0, total: 0 });
                return (
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-gray-500">Session totals:</span>
                    <span className="text-gray-700 font-semibold">{totals.reg.toFixed(2)} reg</span>
                    {totals.ot > 0 && <span className="text-amber-600 font-semibold">{totals.ot.toFixed(2)} OT</span>}
                    {totals.dt > 0 && <span className="text-red-600 font-semibold">{totals.dt.toFixed(2)} DT</span>}
                    <span className="text-gray-900 font-bold">{totals.total.toFixed(2)} total</span>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
        {/* ── End Bulk Entry ─────────────────────────────────────── */}

        {/* Clock-in search (today only) */}
        {!showBulkEntry && isToday && <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-visible">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-gray-800">Clock In a Team Member</h2>
          </div>
          <div className="px-5 py-4 relative">
            <div className="relative">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                placeholder="Search team member name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            {searchResults.length > 0 && (
              <div className="absolute left-5 right-5 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
                {searchResults.map((emp) => {
                  const isIn = clockedInIds.has(emp.id);
                  return (
                    <button
                      key={emp.id}
                      disabled={isIn || acting === emp.id}
                      onClick={() => !isIn && clockIn(emp.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-gray-50 last:border-0
                        ${isIn ? "opacity-50 cursor-not-allowed bg-gray-50" : "hover:bg-green-50/60 cursor-pointer"}`}
                    >
                      <div className="shrink-0 w-9 h-9 rounded-xl bg-[#123b1f]/10 flex items-center justify-center text-[#123b1f] font-bold text-xs">
                        {initials(emp)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900">{displayName(emp)}</div>
                        <div className="text-xs text-gray-400">{emp.job_title ?? emp.at_departments?.name ?? ""}</div>
                      </div>
                      {isIn ? (
                        <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">In</span>
                      ) : acting === emp.id ? (
                        <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <span className="text-xs font-semibold text-[#123b1f] bg-green-50 px-2.5 py-1 rounded-lg border border-green-200">Clock In</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>}

        {/* Historical view — past dates */}
        {!showBulkEntry && !isToday && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">
                  Punches for {new Date(viewDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">{punches.length} punch{punches.length !== 1 ? "es" : ""}</p>
              </div>
              <button onClick={() => setViewDate(todayStr)} className="text-xs text-[#123b1f] font-semibold hover:underline">← Back to Today</button>
            </div>
            {loading ? (
              <div className="p-5 space-y-3">{[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}</div>
            ) : punches.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-gray-400">No punches recorded for this date.</div>
            ) : (
              <>
                <div className={`sticky top-0 z-10 grid gap-2 px-5 py-2 bg-gray-50 border-b border-gray-100 text-[10px] font-semibold text-gray-400 uppercase tracking-wider ${showLaborCost ? "grid-cols-[1fr_110px_100px_100px_56px_56px_64px_88px_80px]" : "grid-cols-[1fr_110px_100px_100px_56px_56px_64px_80px]"}`}>
                  {[["name","Name"],["punch_item","Punch Item"],["clock_in","In"],["clock_out","Out"]].map(([col, label]) => (
                    <button key={col} onClick={() => handleSort(col)} className={`flex items-center gap-1 hover:text-gray-600 transition-colors ${col !== "name" ? "justify-center" : ""}`}>
                      {label}<SortIcon col={col} />
                    </button>
                  ))}
                  <span className="text-center">Reg</span>
                  <span className="text-center">OT</span>
                  <button onClick={() => handleSort("hours")} className="flex items-center justify-center gap-1 hover:text-gray-600 transition-colors">Total<SortIcon col="hours" /></button>
                  {showLaborCost && <span className="text-right">Rate / Cost</span>}
                  <span className="text-right">Actions</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {(() => {
                    const sorted = sortPunches(punches);
                    const groupMap = new Map<string, typeof sorted>();
                    for (const p of sorted) {
                      if (!groupMap.has(p.employee_id)) groupMap.set(p.employee_id, []);
                      groupMap.get(p.employee_id)!.push(p);
                    }
                    const groups = [...groupMap.values()];
                    return groups.flatMap(group => {
                      const rows = group.map((p, gi) => {
                        const emp = p.at_employees;
                        if (!emp) return null;
                        const isEditing = editingPunchId === p.id;
                        const hrs = p.clock_out_at ? punchTotalHrs(p).toFixed(2) : null;
                        const showBD = breakdownId === p.id;
                        const isFirstInGroup = gi === 0;
                        return (
                          <div key={p.id} className={`px-5 py-3 ${isEditing ? "bg-blue-50/30" : group.length > 1 ? "bg-gray-50/30" : ""}`}>
                            {!isEditing ? (
                              <div className={`grid gap-2 items-center ${showLaborCost ? "grid-cols-[1fr_110px_100px_100px_56px_56px_64px_88px_80px]" : "grid-cols-[1fr_110px_100px_100px_56px_56px_64px_80px]"}`}>
                                <div className="flex items-center gap-2 min-w-0">
                                  {isFirstInGroup ? (
                                    <>
                                      <div className="shrink-0 w-7 h-7 rounded-lg bg-[#123b1f]/10 flex items-center justify-center text-[#123b1f] font-bold text-[10px]">{initials(emp)}</div>
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-sm font-medium text-gray-800 truncate">{displayName(emp)}</span>
                                          {p.is_manual && <span className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">Manual</span>}
                                        </div>
                                        {(() => { const st = empStatsMap.get(p.employee_id); return st ? (
                                          <div className="text-[9px] text-gray-400 tabular-nums mt-0.5">
                                            Day {st.today.toFixed(2)} · Wk {st.week.toFixed(2)} · Period {st.period.toFixed(2)}
                                          </div>
                                        ) : null; })()}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <div className="shrink-0 w-7 h-7 flex items-center justify-center text-gray-300 text-sm">↳</div>
                                      {p.is_manual && <span className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">Manual</span>}
                                    </div>
                                  )}
                                </div>
                            <div className="text-center">{(p.divisions || p.at_divisions) ? <span className="text-[10px] font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-full">{(p.divisions ?? p.at_divisions)!.name}</span> : <span className="text-gray-300 text-xs">—</span>}</div>
                            <span className="text-xs text-gray-600 text-center tabular-nums">{fmtTime(p.clock_in_at)}</span>
                            <span className="text-xs text-center tabular-nums">{p.clock_out_at ? fmtTime(p.clock_out_at) : <span className="text-amber-500 font-semibold">Open</span>}</span>
                            <span className="text-xs text-gray-600 text-center tabular-nums">{group.length === 1 ? (p.regular_hours != null ? p.regular_hours.toFixed(2) : (hrs ? Number(hrs).toFixed(2) : <span className="text-gray-300">—</span>)) : <span className="text-gray-300">—</span>}</span>
                            <span className={`text-xs text-center tabular-nums font-semibold ${group.length === 1 && (p.ot_hours ?? 0) > 0 ? "text-amber-600" : "text-gray-300"}`}>{group.length === 1 && (p.ot_hours ?? 0) > 0 ? p.ot_hours!.toFixed(2) : "—"}</span>
                            <div className="relative text-center">
                              {group.length === 1 && hrs ? (
                                <button onClick={() => setBreakdownId(showBD ? null : p.id)}
                                  className="text-xs font-bold text-gray-700 tabular-nums underline decoration-dotted underline-offset-2 cursor-pointer hover:text-[#123b1f]">
                                  {hrs}
                                </button>
                              ) : <span className="text-gray-300 text-xs">—</span>}
                              {showBD && group.length === 1 && p.clock_out_at && (
                                <div className="absolute left-1/2 -translate-x-1/2 top-5 z-30 bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2.5 text-left min-w-[140px]">
                                  <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Breakdown</div>
                                  <div className="space-y-1 text-xs text-gray-700 tabular-nums">
                                    <div className="flex justify-between gap-4"><span>Reg</span><span className="font-semibold">{(p.regular_hours ?? punchTotalHrs(p)).toFixed(2)}</span></div>
                                    {(p.ot_hours ?? 0) > 0 && <div className="flex justify-between gap-4"><span className="text-amber-600">OT</span><span className="font-semibold text-amber-600">{(p.ot_hours!).toFixed(2)}</span></div>}
                                    {(p.dt_hours ?? 0) > 0 && <div className="flex justify-between gap-4"><span className="text-red-600">DT</span><span className="font-semibold text-red-600">{(p.dt_hours!).toFixed(2)}</span></div>}
                                    {(p.lunch_deducted_mins ?? 0) > 0 && <div className="flex justify-between gap-4 text-gray-400"><span>Lunch</span><span>−{p.lunch_deducted_mins}m</span></div>}
                                    <div className="border-t border-gray-100 pt-1 flex justify-between gap-4 font-bold"><span>Total</span><span>{hrs}</span></div>
                                  </div>
                                </div>
                              )}
                            </div>
                            {showLaborCost && (group.length === 1 ? (() => {
                              const cost = hrs != null && emp.default_pay_rate
                                ? calcLaborCost(p.regular_hours ?? Number(hrs), p.ot_hours ?? 0, p.dt_hours ?? 0, emp.default_pay_rate, atSettings) : null;
                              return (
                                <div className="text-right">
                                  {emp.default_pay_rate ? (
                                    <>
                                      <div className="text-[10px] text-gray-400 tabular-nums">${emp.default_pay_rate.toFixed(2)}/hr</div>
                                      {cost != null && <div className="text-[10px] font-semibold text-emerald-700 tabular-nums">${cost.toFixed(2)}</div>}
                                    </>
                                  ) : <span className="text-gray-300 text-xs">—</span>}
                                </div>
                              );
                            })() : <span />)}
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => startEditPunch(p)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                              <button onClick={() => deletePunch(p.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-7 h-7 rounded-lg bg-[#123b1f]/10 flex items-center justify-center text-[#123b1f] font-bold text-[10px]">{initials(emp)}</div>
                              <span className="text-sm font-semibold text-gray-800">{displayName(emp)}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Clock In</label>
                                <input type="time" value={editClockIn} onChange={e => setEditClockIn(e.target.value)}
                                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Clock Out</label>
                                <input type="time" value={editClockOut} onChange={e => setEditClockOut(e.target.value)}
                                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Punch Item</label>
                              <select value={editDivisionId} onChange={e => setEditDivisionId(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                                <option value="">— None —</option>
                                {divisions.filter(d => d.source === "company" || !d.source).map(d => <option key={d.id} value={`d:${d.id}`}>{d.name}</option>)}
                                {divisions.some(d => d.source === "time_clock") && (
                                  <optgroup label="── Time Clock Only ──">
                                    {divisions.filter(d => d.source === "time_clock").map(d => <option key={d.id} value={`a:${d.id}`}>{d.name}</option>)}
                                  </optgroup>
                                )}
                              </select>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => savePunchEdit(p.id)} disabled={editSaving}
                                className="flex-1 bg-[#123b1f] text-white text-xs font-semibold py-2 rounded-lg hover:bg-[#1a5c2e] disabled:opacity-60 transition-colors">
                                {editSaving ? "Saving…" : "Save"}
                              </button>
                              <button onClick={() => setEditingPunchId(null)}
                                className="flex-1 border border-gray-200 text-gray-600 text-xs font-semibold py-2 rounded-lg hover:bg-gray-50 transition-colors">
                                Cancel
                              </button>
                            </div>
                          </div>
                            )}
                          </div>
                        );
                      });
                      const emp0 = group[0].at_employees;
                      const dayTotal = group.reduce((sum, p) => sum + (p.clock_out_at ? punchTotalHrs(p) : 0), 0);
                      const dayDt    = group.reduce((sum, p) => sum + (p.dt_hours ?? 0), 0);
                      const dayCost = showLaborCost && emp0?.default_pay_rate
                        ? calcLaborCost(dayReg, dayOt, dayDt, emp0.default_pay_rate, atSettings)
                        : null;
                      const dayReg   = group.reduce((sum, p) => sum + (p.regular_hours ?? 0), 0);
                      const dayOt    = group.reduce((sum, p) => sum + (p.ot_hours ?? 0), 0);
                      const dayTotalRow = group.length > 1 ? (
                        <div key={`total_${group[0].employee_id}`} className={`px-5 py-2 bg-[#123b1f]/5 border-t border-[#123b1f]/10 grid gap-2 items-center ${showLaborCost ? "grid-cols-[1fr_110px_100px_100px_56px_56px_64px_88px_80px]" : "grid-cols-[1fr_110px_100px_100px_56px_56px_64px_80px]"}`}>
                          <span className="text-[10px] font-semibold text-[#123b1f] uppercase tracking-wide pl-9">Day Total</span>
                          <span /><span /><span />
                          <span className="text-xs text-gray-600 text-center tabular-nums">{dayReg.toFixed(2)}</span>
                          <span className={`text-xs text-center tabular-nums font-semibold ${dayOt > 0 ? "text-amber-600" : "text-gray-300"}`}>{dayOt > 0 ? dayOt.toFixed(2) : "—"}</span>
                          <span className="text-xs font-bold text-[#123b1f] text-center tabular-nums">{dayTotal.toFixed(2)}</span>
                          {showLaborCost && <span className="text-[10px] font-semibold text-emerald-700 text-right tabular-nums">{dayCost != null ? `$${dayCost.toFixed(2)}` : ""}</span>}
                          <span />
                        </div>
                      ) : null;
                      return [...rows, dayTotalRow].filter((x): x is React.JSX.Element => x != null);
                    })
                  })()}
                </div>
                <div className="px-5 py-3 border-t border-gray-50 flex justify-end">
                  <span className="text-xs text-gray-500">Total: <strong>{totalHoursToday.toFixed(2)} hrs</strong></span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Currently clocked in — table layout (today only) */}
        {!showBulkEntry && isToday && <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">Currently Clocked In</h2>
            <button onClick={load} className="text-xs text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.02-4.63"/>
              </svg>
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="p-5 space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-gray-100 rounded-xl animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-gray-100 rounded w-1/3 animate-pulse" />
                    <div className="h-3 bg-gray-100 rounded w-1/4 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : openPunches.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-gray-400">Nobody is clocked in right now.</p>
            </div>
          ) : (
            <>
              {/* Column headers — built dynamically from col prefs */}
              <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-2 bg-gray-50 border-b border-gray-100 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                <button onClick={() => handleSort("name")} className="flex items-center gap-1 flex-1 min-w-[120px] hover:text-gray-600 transition-colors"><span>Name</span><SortIcon col="name" /></button>
                {cols.job_title && <span className="hidden sm:block w-32 shrink-0">Job Title</span>}
                {cols.division && <button onClick={() => handleSort("punch_item")} className="hidden sm:flex items-center gap-1 w-32 shrink-0 hover:text-gray-600 transition-colors"><span>Punch Item</span><SortIcon col="punch_item" /></button>}
                {cols.department && <span className="hidden md:block w-28 shrink-0">Department</span>}
                {cols.clock_in_time && <button onClick={() => handleSort("clock_in")} className="hidden sm:flex items-center gap-1 w-20 shrink-0 hover:text-gray-600 transition-colors"><span>Clock In</span><SortIcon col="clock_in" /></button>}
                {cols.elapsed && <span className="w-16 shrink-0 text-right">Elapsed</span>}
                {cols.punch_method && <span className="hidden sm:block w-16 shrink-0">Method</span>}
                <span className="w-20 sm:w-24 shrink-0 text-right">Action</span>
              </div>
              <div className="divide-y divide-gray-50">
                {sortPunches(openPunches).map((p) => {
                  const emp = p.at_employees;
                  if (!emp) return null;
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-5 py-3.5">
                      <div className="flex items-center gap-3 flex-1 min-w-[120px]">
                        <div className="shrink-0 w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center text-green-700 font-bold text-xs">
                          {initials(emp)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-gray-900 truncate">{displayName(emp)}</div>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">● Live</span>
                          {(() => { const st = empStatsMap.get(emp.id); return st ? (
                            <div className="text-[9px] text-gray-400 tabular-nums mt-0.5">Wk {st.week.toFixed(2)} · Period {st.period.toFixed(2)}</div>
                          ) : null; })()}
                        </div>
                      </div>
                      {cols.job_title && <div className="hidden sm:block w-32 shrink-0 text-xs text-gray-600 truncate">{emp.job_title ?? <span className="text-gray-300">—</span>}</div>}
                      {cols.division && (
                        <div className="hidden sm:block w-32 shrink-0">
                          {(p.divisions || p.at_divisions) ? <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">{(p.divisions ?? p.at_divisions)!.name}</span> : <span className="text-gray-300 text-xs">—</span>}
                        </div>
                      )}
                      {cols.department && <div className="hidden md:block w-28 shrink-0 text-xs text-gray-500 truncate">{emp.at_departments?.name ?? <span className="text-gray-300">—</span>}</div>}
                      {cols.clock_in_time && <div className="hidden sm:block w-20 shrink-0 text-xs text-gray-500">{fmtTime(p.clock_in_at)}</div>}
                      {cols.elapsed && <div className="w-16 shrink-0 text-sm font-bold text-gray-800 tabular-nums text-right">{elapsed(p.clock_in_at)}</div>}
                      {cols.punch_method && <div className="hidden sm:block w-16 shrink-0 text-xs text-gray-400">{p.punch_method}</div>}
                      <div className="w-20 sm:w-24 shrink-0 flex justify-end">
                        <button
                          onClick={() => clockOut(p.id, emp.id)}
                          disabled={acting === emp.id}
                          className="bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 transition-colors disabled:opacity-60"
                        >
                          {acting === emp.id ? <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> : "Clock Out"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>}

        {/* Completed today (today only) */}
        {!showBulkEntry && isToday && closedPunches.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <h2 className="text-sm font-semibold text-gray-800">Completed Today</h2>
            </div>
            <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-2 bg-gray-50 border-b border-gray-100 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              <button onClick={() => handleSort("name")} className="flex items-center gap-1 flex-1 min-w-[120px] hover:text-gray-600 transition-colors"><span>Name</span><SortIcon col="name" /></button>
              {cols.job_title && <span className="hidden sm:block w-32 shrink-0">Job Title</span>}
              {cols.division && <button onClick={() => handleSort("punch_item")} className="hidden sm:flex items-center gap-1 w-32 shrink-0 hover:text-gray-600 transition-colors"><span>Punch Item</span><SortIcon col="punch_item" /></button>}
              {cols.department && <span className="hidden md:block w-28 shrink-0">Department</span>}
              <span className="w-28 sm:w-36 shrink-0">In → Out</span>
              <span className="w-16 sm:w-20 shrink-0 text-right">Hours</span>
              {showLaborCost && <span className="hidden sm:block w-28 shrink-0 text-right">Rate / Cost</span>}
              <span className="w-14 shrink-0 text-right">Actions</span>
            </div>
            <div className="divide-y divide-gray-50">
              {sortPunches(closedPunches).map((p) => {
                const emp = p.at_employees;
                if (!emp) return null;
                const isEditing = editingPunchId === p.id;
                const punchHrs = p.clock_out_at ? punchTotalHrs(p) : null;
                const punchHrsStr = punchHrs != null ? punchHrs.toFixed(2) : null;
                const laborCost = showLaborCost && punchHrs != null && emp.default_pay_rate
                  ? calcLaborCost(p.regular_hours ?? punchHrs, p.ot_hours ?? 0, p.dt_hours ?? 0, emp.default_pay_rate, atSettings)
                  : null;
                const showBDC = breakdownId === `c_${p.id}`;
                if (isEditing) return (
                  <div key={p.id} className="px-5 py-3 bg-blue-50/30">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-7 h-7 rounded-lg bg-[#123b1f]/10 flex items-center justify-center text-[#123b1f] font-bold text-[10px]">{initials(emp)}</div>
                        <span className="text-sm font-semibold text-gray-800">{displayName(emp)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Clock In</label>
                          <input type="time" value={editClockIn} onChange={e => setEditClockIn(e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Clock Out</label>
                          <input type="time" value={editClockOut} onChange={e => setEditClockOut(e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Punch Item</label>
                        <select value={editDivisionId} onChange={e => setEditDivisionId(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                          <option value="">— None —</option>
                          {divisions.filter(d => d.source === "company" || !d.source).map(d => <option key={d.id} value={`d:${d.id}`}>{d.name}</option>)}
                          {divisions.some(d => d.source === "time_clock") && (
                            <optgroup label="── Time Clock Only ──">
                              {divisions.filter(d => d.source === "time_clock").map(d => <option key={d.id} value={`a:${d.id}`}>{d.name}</option>)}
                            </optgroup>
                          )}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => savePunchEdit(p.id)} disabled={editSaving}
                          className="flex-1 bg-[#123b1f] text-white text-xs font-semibold py-2 rounded-lg hover:bg-[#1a5c2e] disabled:opacity-60 transition-colors">
                          {editSaving ? "Saving…" : "Save"}
                        </button>
                        <button onClick={() => setEditingPunchId(null)}
                          className="flex-1 border border-gray-200 text-gray-600 text-xs font-semibold py-2 rounded-lg hover:bg-gray-50 transition-colors">
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                );
                return (
                  <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex items-center gap-3 flex-1 min-w-[120px]">
                      <div className="shrink-0 w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 font-bold text-xs">{initials(emp)}</div>
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-gray-700 truncate block">{displayName(emp)}</span>
                        {(() => { const st = empStatsMap.get(emp.id); return st ? (
                          <div className="text-[9px] text-gray-400 tabular-nums">Day {st.today.toFixed(2)} · Wk {st.week.toFixed(2)} · Period {st.period.toFixed(2)}</div>
                        ) : null; })()}
                      </div>
                    </div>
                    {cols.job_title && <div className="hidden sm:block w-32 shrink-0 text-xs text-gray-500 truncate">{emp.job_title ?? <span className="text-gray-300">—</span>}</div>}
                    {cols.division && (
                      <div className="hidden sm:block w-32 shrink-0">
                        {(p.divisions || p.at_divisions) ? <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">{(p.divisions ?? p.at_divisions)!.name}</span> : <span className="text-gray-300 text-xs">—</span>}
                      </div>
                    )}
                    {cols.department && <div className="hidden md:block w-28 shrink-0 text-xs text-gray-400 truncate">{emp.at_departments?.name ?? <span className="text-gray-300">—</span>}</div>}
                    <div className="w-28 sm:w-36 shrink-0 text-xs text-gray-400 tabular-nums">{fmtTime(p.clock_in_at)} → {fmtTime(p.clock_out_at!)}</div>
                    <div className="w-16 sm:w-20 shrink-0 text-right relative">
                      <button onClick={() => setBreakdownId(showBDC ? null : `c_${p.id}`)}
                        className="text-sm font-semibold text-gray-600 tabular-nums underline decoration-dotted underline-offset-2 hover:text-[#123b1f]">
                        {punchHrsStr ?? "—"}
                      </button>
                      {showBDC && (
                        <div className="absolute right-0 top-5 z-30 bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2.5 text-left min-w-[140px]">
                          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Breakdown</div>
                          <div className="space-y-1 text-xs text-gray-700 tabular-nums">
                            <div className="flex justify-between gap-4"><span>Reg</span><span className="font-semibold">{(p.regular_hours ?? punchHrs ?? 0).toFixed(2)}</span></div>
                            {(p.ot_hours ?? 0) > 0 && <div className="flex justify-between gap-4"><span className="text-amber-600">OT</span><span className="font-semibold text-amber-600">{p.ot_hours!.toFixed(2)}</span></div>}
                            {(p.dt_hours ?? 0) > 0 && <div className="flex justify-between gap-4"><span className="text-red-600">DT</span><span className="font-semibold text-red-600">{p.dt_hours!.toFixed(2)}</span></div>}
                            {(p.lunch_deducted_mins ?? 0) > 0 && <div className="flex justify-between gap-4 text-gray-400"><span>Lunch</span><span>−{p.lunch_deducted_mins}m</span></div>}
                            <div className="border-t border-gray-100 pt-1 flex justify-between gap-4 font-bold"><span>Total</span><span>{punchHrsStr}</span></div>
                          </div>
                        </div>
                      )}
                    </div>
                    {showLaborCost && (
                      <div className="hidden sm:block w-28 shrink-0 text-right">
                        {emp.default_pay_rate ? (
                          <div>
                            <div className="text-xs text-gray-500 tabular-nums">${emp.default_pay_rate.toFixed(2)}/hr</div>
                            {laborCost != null && <div className="text-xs font-semibold text-emerald-700 tabular-nums">${laborCost.toFixed(2)}</div>}
                          </div>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </div>
                    )}
                    <div className="w-14 shrink-0 flex items-center justify-end gap-1">
                      <button onClick={() => startEditPunch(p)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button onClick={() => deletePunch(p.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-3 border-t border-gray-50 flex justify-end">
              <span className="text-xs text-gray-500">Total today: <strong>{totalHoursToday.toFixed(2)} hrs</strong></span>
            </div>
          </div>
        )}

        <p className="text-xs text-gray-400 pb-4 text-center">
          <Link href="/operations-center/atlas-time/employees" className="underline hover:text-gray-600">Manage team members →</Link>
        </p>
      </div>
    </div>
  );
}
