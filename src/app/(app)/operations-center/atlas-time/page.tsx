"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────────
type RetentionBands = { lt1: number; yr1_2: number; yr2_5: number; yr5_10: number; yr10plus: number };
type CriticalZone  = { name: string; months: number };
type ComplianceAlert = { name: string; type: string; expiry: string; severity: "expired" | "urgent" | "warning" };
type Anniversary   = { name: string; hire_date: string; years: number; day: number };
type Birthday      = { name: string; date_of_birth: string; age: number; day: number };
type VelocityMonth = { month: string; hired: number; still_active: number };
type Completeness  = { total: number; photo: number; emergency_contact: number; i9: number; kiosk_pin: number; dob: number; phone: number; department: number };

type DashData = {
  as_of: string;
  current_month: string;
  current_year: number;
  total_active: number;
  retention:         { bands: RetentionBands; new_this_month: number; critical_zone: CriticalZone[] };
  compliance_alerts: ComplianceAlert[];
  anniversaries:     Anniversary[];
  birthdays:         Birthday[];
  hiring_velocity:   VelocityMonth[];
  completeness:      Completeness;
  pto:               { total_accrued: number; total_used: number; pending_count: number };
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ordinal(n: number) {
  const s = ["th","st","nd","rd"], v = n % 100;
  return n + (s[(v-20)%10] ?? s[v] ?? s[0]);
}

function pct(n: number, total: number) {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

// Colors for anniversary cards by years
function anniversaryStyle(years: number): { bg: string; accent: string; badge: string } {
  if (years >= 15) return { bg: "linear-gradient(135deg, #78350f 0%, #92400e 100%)", accent: "#fcd34d", badge: "#fef3c7" };
  if (years >= 10) return { bg: "linear-gradient(135deg, #1e3a5f 0%, #1e40af 100%)",  accent: "#93c5fd", badge: "#dbeafe" };
  if (years >= 5)  return { bg: "linear-gradient(135deg, #064e3b 0%, #065f46 100%)",  accent: "#6ee7b7", badge: "#d1fae5" };
  if (years >= 3)  return { bg: "linear-gradient(135deg, #4c1d95 0%, #6d28d9 100%)",  accent: "#c4b5fd", badge: "#ede9fe" };
  return                  { bg: "linear-gradient(135deg, #0d2616 0%, #1a5c2a 100%)",  accent: "#86efac", badge: "#dcfce7" };
}

// ── Quick Nav Items ─────────────────────────────────────────────────────────────
const NAV_LINKS = [
  { label: "Punch Log",  href: "/operations-center/atlas-time/clock" },
  { label: "Kiosk",      href: "/operations-center/atlas-time/punch" },
  { label: "Roster",     href: "/operations-center/atlas-time/employees" },
  { label: "Payroll",    href: "/operations-center/atlas-time/payroll" },
  { label: "Timesheets", href: "/operations-center/atlas-time/timesheets" },
  { label: "PTO",        href: "/operations-center/atlas-time/pto" },
  { label: "Uniforms",   href: "/operations-center/atlas-time/uniforms" },
  { label: "Settings",   href: "/operations-center/atlas-time/settings" },
];

// ── Main Component ─────────────────────────────────────────────────────────────
export default function AtlasTimePage() {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/atlas-time/dashboard", { cache: "no-store" })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "#f0f4f1" }}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }} className="px-6 md:px-10 py-8">
        <div className="mx-auto max-w-[1200px]">
          <div className="text-white/40 text-xs mb-1">Operations Center</div>
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">Atlas HR</h1>
              <p className="text-white/50 text-sm mt-0.5">Workforce · Payroll · Compliance</p>
            </div>
            {data && (
              <div className="flex items-center gap-6 text-right">
                <div>
                  <div className="text-2xl font-bold text-white">{data.total_active}</div>
                  <div className="text-white/50 text-xs">Active Team Members</div>
                </div>
                {data.compliance_alerts.filter(a => a.severity === "expired").length > 0 && (
                  <div className="bg-red-500/20 border border-red-400/40 rounded-xl px-4 py-2 text-center">
                    <div className="text-red-300 font-bold text-xl">{data.compliance_alerts.filter(a => a.severity === "expired").length}</div>
                    <div className="text-red-300/80 text-xs">Expired Certs</div>
                  </div>
                )}
                {data.pto.pending_count > 0 && (
                  <div className="bg-amber-500/20 border border-amber-400/40 rounded-xl px-4 py-2 text-center">
                    <div className="text-amber-300 font-bold text-xl">{data.pto.pending_count}</div>
                    <div className="text-amber-300/80 text-xs">PTO Pending</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Nav */}
          <div className="flex flex-wrap gap-2 mt-5">
            {NAV_LINKS.map(n => (
              <Link key={n.href} href={n.href}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors">
                {n.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] px-4 md:px-6 py-7 space-y-6">
        {loading && (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading dashboard…</div>
        )}

        {data && (
          <>
            {/* ── Row 1: Retention + PTO ──────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

              {/* Retention Tracker */}
              <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Retention Tracker</div>
                    <div className="text-sm text-gray-500 mt-0.5">{data.total_active} active employees</div>
                  </div>
                  <div className="flex gap-3">
                    <div className="text-center">
                      <div className="text-xl font-bold text-emerald-700">{data.retention.new_this_month}</div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide">New in {data.current_month}</div>
                    </div>
                    {data.retention.critical_zone.length > 0 && (
                      <div className="text-center">
                        <div className="text-xl font-bold text-amber-600">{data.retention.critical_zone.length}</div>
                        <div className="text-[10px] text-gray-400 uppercase tracking-wide">Critical Zone</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tenure band bars */}
                {(() => {
                  const { bands } = data.retention;
                  const total = data.total_active;
                  const items = [
                    { label: "< 1 Year",   count: bands.lt1,      color: "#ef4444", light: "#fee2e2" },
                    { label: "1 – 2 Yrs",  count: bands.yr1_2,    color: "#f97316", light: "#ffedd5" },
                    { label: "2 – 5 Yrs",  count: bands.yr2_5,    color: "#eab308", light: "#fef9c3" },
                    { label: "5 – 10 Yrs", count: bands.yr5_10,   color: "#22c55e", light: "#dcfce7" },
                    { label: "10+ Yrs",    count: bands.yr10plus,  color: "#3b82f6", light: "#dbeafe" },
                  ];
                  const maxCount = Math.max(...items.map(i => i.count), 1);
                  return (
                    <div className="space-y-3">
                      {items.map(item => (
                        <div key={item.label} className="flex items-center gap-3">
                          <div className="w-20 text-xs text-gray-500 text-right shrink-0">{item.label}</div>
                          <div className="flex-1 h-7 rounded-lg overflow-hidden" style={{ background: item.light }}>
                            <div
                              className="h-full rounded-lg flex items-center pl-3 transition-all duration-500"
                              style={{ width: `${(item.count / maxCount) * 100}%`, background: item.color, minWidth: item.count > 0 ? "2.5rem" : "0" }}
                            >
                              {item.count > 0 && <span className="text-white text-xs font-bold">{item.count}</span>}
                            </div>
                          </div>
                          <div className="w-10 text-xs font-semibold text-gray-500 text-right shrink-0">{pct(item.count, total)}%</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Critical zone callout */}
                {data.retention.critical_zone.length > 0 && (
                  <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                    <div className="text-xs font-semibold text-amber-800 mb-1.5">⚠ Critical Zone — Approaching 3 / 6 / 9 Month Mark</div>
                    <div className="flex flex-wrap gap-2">
                      {data.retention.critical_zone.map((e, i) => (
                        <span key={i} className="text-xs bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full font-semibold">
                          {e.name} · {e.months} mo
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* PTO Status */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-4">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{data.current_year} PTO Status</div>

                <div className="flex flex-col gap-3">
                  <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, #0d2616, #1a5c2a)" }}>
                    <div className="text-white/60 text-xs mb-1">Total Accrued</div>
                    <div className="text-white font-bold text-2xl">{Math.round(data.pto.total_accrued).toLocaleString()} <span className="text-base font-semibold text-white/60">hrs</span></div>
                  </div>
                  <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
                    <div className="text-blue-500 text-xs mb-1">Used YTD</div>
                    <div className="text-blue-800 font-bold text-2xl">{Math.round(data.pto.total_used).toLocaleString()} <span className="text-base font-semibold text-blue-400">hrs</span></div>
                  </div>
                  {data.pto.pending_count > 0 ? (
                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                      <div className="text-amber-600 text-xs mb-1">Pending Requests</div>
                      <div className="text-amber-800 font-bold text-2xl">{data.pto.pending_count}</div>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-gray-50 border border-gray-100 p-4">
                      <div className="text-gray-400 text-xs mb-1">Pending Requests</div>
                      <div className="text-gray-500 font-semibold text-lg">None</div>
                    </div>
                  )}
                </div>

                <Link href="/operations-center/atlas-time/pto"
                  className="text-center text-xs font-semibold text-emerald-700 hover:text-emerald-600 transition-colors mt-auto">
                  View PTO Details →
                </Link>
              </div>
            </div>

            {/* ── Row 2: Anniversaries + Birthdays ───────────────── */}
            {(data.anniversaries.length > 0 || data.birthdays.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                {/* Anniversaries */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <span className="text-xl">🎉</span>
                    <div>
                      <div className="text-sm font-bold text-gray-900">{data.current_month} Anniversaries</div>
                      <div className="text-xs text-gray-400">{data.anniversaries.length} team member{data.anniversaries.length !== 1 ? "s" : ""} celebrating</div>
                    </div>
                  </div>
                  {data.anniversaries.length === 0 ? (
                    <div className="text-gray-300 text-sm text-center py-6">No anniversaries this month</div>
                  ) : (
                    <div className="space-y-3">
                      {data.anniversaries.map((a, i) => {
                        const style = anniversaryStyle(a.years);
                        return (
                          <div key={i} className="rounded-xl overflow-hidden flex items-stretch min-h-[68px]"
                            style={{ background: style.bg }}>
                            <div className="flex-1 px-4 py-3 flex flex-col justify-center">
                              <div className="text-white font-bold text-sm leading-tight">{a.name}</div>
                              <div className="text-white/60 text-xs mt-0.5">{fmtDate(a.hire_date)}</div>
                            </div>
                            <div className="flex flex-col items-center justify-center px-5 text-center"
                              style={{ background: "rgba(0,0,0,0.2)", minWidth: "80px" }}>
                              <div className="font-black text-2xl leading-none" style={{ color: style.accent }}>
                                {a.years}
                              </div>
                              <div className="text-xs font-semibold mt-0.5" style={{ color: style.accent + "cc" }}>
                                {a.years === 1 ? "Year" : "Years"}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Birthdays */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <span className="text-xl">🎂</span>
                    <div>
                      <div className="text-sm font-bold text-gray-900">{data.current_month} Birthdays</div>
                      <div className="text-xs text-gray-400">{data.birthdays.length} team member{data.birthdays.length !== 1 ? "s" : ""} celebrating</div>
                    </div>
                  </div>
                  {data.birthdays.length === 0 ? (
                    <div className="text-gray-300 text-sm text-center py-6">No birthdays this month</div>
                  ) : (
                    <div className="space-y-3">
                      {data.birthdays.map((b, i) => {
                        const palettes = [
                          { bg: "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)", accent: "#f0abfc" },
                          { bg: "linear-gradient(135deg, #db2777 0%, #ec4899 100%)", accent: "#fbcfe8" },
                          { bg: "linear-gradient(135deg, #ea580c 0%, #f97316 100%)", accent: "#fed7aa" },
                          { bg: "linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)", accent: "#a5f3fc" },
                          { bg: "linear-gradient(135deg, #65a30d 0%, #84cc16 100%)", accent: "#d9f99d" },
                        ];
                        const p = palettes[i % palettes.length];
                        return (
                          <div key={i} className="rounded-xl overflow-hidden flex items-stretch min-h-[68px]"
                            style={{ background: p.bg }}>
                            <div className="flex-1 px-4 py-3 flex flex-col justify-center">
                              <div className="text-white font-bold text-sm leading-tight">{b.name}</div>
                              <div className="text-white/60 text-xs mt-0.5">{fmtDate(b.date_of_birth)}</div>
                            </div>
                            <div className="flex flex-col items-center justify-center px-5 text-center"
                              style={{ background: "rgba(0,0,0,0.15)", minWidth: "80px" }}>
                              <div className="font-black text-2xl leading-none" style={{ color: p.accent }}>
                                {ordinal(b.age)}
                              </div>
                              <div className="text-xs font-semibold mt-0.5" style={{ color: p.accent + "cc" }}>Birthday</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Row 3: Compliance Alerts ────────────────────────── */}
            {data.compliance_alerts.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Compliance Alert Board</div>
                    <div className="text-sm text-gray-500 mt-0.5">
                      {data.compliance_alerts.filter(a => a.severity === "expired").length} expired ·{" "}
                      {data.compliance_alerts.filter(a => a.severity === "urgent").length} expiring within 30 days ·{" "}
                      {data.compliance_alerts.filter(a => a.severity === "warning").length} within 90 days
                    </div>
                  </div>
                  <Link href="/operations-center/atlas-time/employees"
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-600">
                    View Roster →
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-50 bg-gray-50/60">
                        <th className="px-5 py-3 text-left">Team Member</th>
                        <th className="px-4 py-3 text-center">Credential</th>
                        <th className="px-4 py-3 text-center">Expiry</th>
                        <th className="px-4 py-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.compliance_alerts.map((a, i) => {
                        const cfg = {
                          expired: { dot: "bg-red-500",    badge: "bg-red-100 text-red-700",    label: "Expired" },
                          urgent:  { dot: "bg-orange-500", badge: "bg-orange-100 text-orange-700", label: "< 30 Days" },
                          warning: { dot: "bg-yellow-500", badge: "bg-yellow-100 text-yellow-700", label: "< 90 Days" },
                        }[a.severity];
                        return (
                          <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                            <td className="px-5 py-3 font-semibold text-gray-800">{a.name}</td>
                            <td className="px-4 py-3 text-center text-gray-600">{a.type}</td>
                            <td className="px-4 py-3 text-center text-gray-600">{fmtDate(a.expiry)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.badge}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                {cfg.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Row 4: Hiring Velocity + Completeness ───────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              {/* Hiring Velocity */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Hiring Velocity</div>
                <div className="text-sm text-gray-500 mb-5">New hires per month · last 13 months</div>

                {(() => {
                  const maxHired = Math.max(...data.hiring_velocity.map(m => m.hired), 1);
                  return (
                    <div className="flex items-end gap-1.5 h-40">
                      {data.hiring_velocity.map((m, i) => {
                        const heightPct = (m.hired / maxHired) * 100;
                        const activePct = m.hired > 0 ? (m.still_active / m.hired) * 100 : 0;
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full group relative">
                            {/* Tooltip */}
                            <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                              <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap text-center shadow-xl">
                                <div className="font-bold">{m.month}</div>
                                <div>{m.hired} hired</div>
                                <div className="text-green-400">{m.still_active} still active</div>
                              </div>
                              <div className="w-2 h-2 bg-gray-900 rotate-45 -mt-1" />
                            </div>
                            {/* Bar */}
                            <div className="relative w-full rounded-t-md overflow-hidden transition-all duration-300"
                              style={{ height: `${heightPct}%`, minHeight: m.hired > 0 ? "4px" : "0", background: "#e5e7eb" }}>
                              <div className="absolute bottom-0 left-0 right-0 rounded-t-md transition-all duration-300"
                                style={{ height: `${activePct}%`, background: "linear-gradient(180deg, #1a5c2a, #0d2616)" }} />
                            </div>
                            {/* Label */}
                            {m.hired > 0 && (
                              <div className="text-[9px] font-bold text-gray-600 -mb-0.5">{m.hired}</div>
                            )}
                            <div className="text-[8px] text-gray-400 rotate-[-40deg] origin-top-left translate-y-1 translate-x-1 whitespace-nowrap"
                              style={{ fontSize: "8px" }}>
                              {m.month}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                <div className="flex items-center gap-4 mt-6 text-xs text-gray-500">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm" style={{ background: "linear-gradient(180deg, #1a5c2a, #0d2616)" }} />
                    Still Active
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-gray-200" />
                    Departed
                  </div>
                </div>
              </div>

              {/* Workforce Completeness */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Workforce Completeness</div>
                <div className="text-sm text-gray-500 mb-5">Profile data coverage across {data.completeness.total} active employees</div>

                {(() => {
                  const { completeness: c } = data;
                  const fields = [
                    { label: "Phone Number",       count: c.phone,             color: "#22c55e" },
                    { label: "Date of Birth",       count: c.dob,               color: "#22c55e" },
                    { label: "Emergency Contact",   count: c.emergency_contact, color: "#3b82f6" },
                    { label: "I-9 on File",         count: c.i9,                color: "#f97316" },
                    { label: "Kiosk PIN",           count: c.kiosk_pin,         color: "#f97316" },
                    { label: "Department",          count: c.department,        color: "#ef4444" },
                    { label: "Profile Photo",       count: c.photo,             color: "#ef4444" },
                  ];
                  return (
                    <div className="space-y-3">
                      {fields.map(f => {
                        const p2 = pct(f.count, c.total);
                        return (
                          <div key={f.label}>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-xs text-gray-600">{f.label}</span>
                              <span className="text-xs font-semibold text-gray-700">{f.count} / {c.total} <span className="text-gray-400 font-normal">({p2}%)</span></span>
                            </div>
                            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${p2}%`, background: f.color, minWidth: f.count > 0 ? "4px" : "0" }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                <div className="mt-4 pt-4 border-t border-gray-100">
                  <Link href="/operations-center/atlas-time/employees"
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-600 transition-colors">
                    Update Roster Data →
                  </Link>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
