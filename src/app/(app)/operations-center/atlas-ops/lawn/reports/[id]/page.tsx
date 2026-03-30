"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

type WidgetType = "stat_card" | "job_table" | "member_table" | "section_header";

type Widget = {
  id: string; // local uuid or db uuid
  widget_type: WidgetType;
  config: Record<string, any>;
  position: number;
};

type WidgetData = {
  loading: boolean;
  data: any;
  error?: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const DATE_RANGE_OPTIONS = [
  { value: "last_week", label: "Last Week" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "ytd", label: "Year to Date" },
  { value: "custom", label: "Custom Range" },
];

type MetricDef = {
  value: string;
  label: string;
  description: string;
  format: "currency" | "hours" | "percent" | "integer";
};

const METRICS: MetricDef[] = [
  { value: "total_revenue", label: "Total Revenue", description: "Sum of earned revenue from complete reports", format: "currency" },
  { value: "ot_hours", label: "OT Hours", description: "Total overtime hours from punches", format: "hours" },
  { value: "ot_cost", label: "OT Cost", description: "Total overtime payroll cost", format: "currency" },
  { value: "reg_hours", label: "Regular Hours", description: "Total regular hours from punches", format: "hours" },
  { value: "total_pay_hours", label: "Total Pay Hours", description: "Reg + OT + DT hours combined", format: "hours" },
  { value: "total_payroll", label: "Total Payroll", description: "Full payroll cost including burden", format: "currency" },
  { value: "labor_pct", label: "Labor %", description: "Total payroll divided by total revenue", format: "percent" },
  { value: "efficiency_pct", label: "Efficiency %", description: "Budgeted hours divided by actual hours", format: "percent" },
  { value: "job_count", label: "Job Count", description: "Number of jobs in complete reports", format: "integer" },
  { value: "budgeted_hours", label: "Budgeted Hrs", description: "Sum of budgeted hours from jobs", format: "hours" },
  { value: "actual_hours", label: "Actual Hrs", description: "Sum of actual hours from jobs", format: "hours" },
  { value: "team_members", label: "Team Members", description: "Distinct employees with punches in range", format: "integer" },
];

const JOB_TABLE_COLUMNS = [
  { key: "date", label: "Date" },
  { key: "client_name", label: "Client" },
  { key: "service", label: "Service" },
  { key: "crew_code", label: "Crew" },
  { key: "budgeted_hours", label: "Bud. Hrs" },
  { key: "actual_hours", label: "Act. Hrs" },
  { key: "revenue", label: "Revenue" },
  { key: "payroll_cost", label: "Payroll Cost" },
  { key: "labor_pct", label: "Labor %" },
  { key: "efficiency_pct", label: "Efficiency %" },
];

const MEMBER_TABLE_COLUMNS = [
  { key: "name",           label: "Name" },
  { key: "reg_hours",      label: "Reg Hrs" },
  { key: "ot_hours",       label: "OT Hrs" },
  { key: "total_pay_hours",label: "Total Hrs" },
  { key: "ot_cost",        label: "OT Cost" },
  { key: "labor_pct",      label: "Labor %" },
  { key: "efficiency_pct", label: "Efficiency %" },
  { key: "downtime_pct",   label: "DT %" },
];

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtCurrency(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}

function fmtHours(v: number) {
  return `${v.toFixed(1)} hrs`;
}

function fmtPct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function fmtMetricValue(value: number | null, format: string): string {
  if (value === null || value === undefined) return "—";
  if (format === "currency") return fmtCurrency(value);
  if (format === "hours") return fmtHours(value);
  if (format === "percent") return fmtPct(value);
  if (format === "integer") return Math.round(value).toLocaleString();
  return String(value);
}

function fmtDateShort(d: string) {
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtDateFull(d: string) {
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function laborPctColor(pct: number | null): string {
  if (pct === null) return "text-gray-500";
  const p = pct * 100;
  if (p <= 39) return "text-emerald-600 font-semibold";
  if (p <= 49) return "text-amber-600 font-semibold";
  return "text-red-600 font-semibold";
}

function localId(): string {
  return "local_" + Math.random().toString(36).slice(2, 10);
}

// ── Widget defaults ───────────────────────────────────────────────────────────

function defaultConfig(type: WidgetType): Record<string, any> {
  if (type === "stat_card") return { metric: "total_revenue", date_range: "last_week", label: "" };
  if (type === "job_table") return { date_range: "last_week", service_filter: "", columns: JOB_TABLE_COLUMNS.map((c) => c.key) };
  if (type === "member_table") return { date_range: "last_week", columns: MEMBER_TABLE_COLUMNS.map((c) => c.key) };
  if (type === "section_header") return { title: "Section Title", subtitle: "" };
  return {};
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />;
}

// ══════════════════════════════════════════════════════════════════════════════
// Widget Components
// ══════════════════════════════════════════════════════════════════════════════

// ── StatCardWidget ────────────────────────────────────────────────────────────

function StatCardWidget({
  widget,
  widgetData,
}: {
  widget: Widget;
  widgetData: WidgetData | undefined;
}) {
  const metric = METRICS.find((m) => m.value === widget.config.metric) ?? METRICS[0];
  const label = widget.config.label || metric.label;
  const loading = widgetData?.loading ?? true;
  const data = widgetData?.data;

  const value = data?.value ?? null;
  const start = data?.start;
  const end = data?.end;

  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div
        className="px-4 py-2.5 text-center"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)" }}
      >
        <div className="text-xs font-semibold text-white/90 text-center w-full">{label}</div>
      </div>
      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-5 text-center">
        {loading ? (
          <>
            <Skeleton className="h-9 w-28 mb-2" />
            <Skeleton className="h-3 w-20" />
          </>
        ) : widgetData?.error ? (
          <span className="text-xs text-red-400">{widgetData.error}</span>
        ) : (
          <>
            <div className="text-3xl font-bold text-gray-900 mb-1 tabular-nums text-center w-full">
              {fmtMetricValue(value, metric.format)}
            </div>
            {start && end && (
              <div className="text-xs text-gray-400 text-center w-full">
                {fmtDateShort(start)} – {fmtDateShort(end)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── JobTableWidget ────────────────────────────────────────────────────────────

function JobTableWidget({
  widget,
  widgetData,
  onConfigChange,
}: {
  widget: Widget;
  widgetData: WidgetData | undefined;
  onConfigChange?: (updates: Record<string, any>) => void;
}) {
  const loading = widgetData?.loading ?? true;
  const data = widgetData?.data;
  const rawRows: any[] = data?.rows ?? [];
  const columns: string[] = data?.columns ?? JOB_TABLE_COLUMNS.map((c) => c.key);
  const start = data?.start;
  const end = data?.end;

  const [sortKey, setSortKey] = useState<string>(widget.config.sort_key ?? "date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(widget.config.sort_dir ?? "asc");

  function handleSort(key: string) {
    const newDir: "asc" | "desc" = sortKey === key ? (sortDir === "asc" ? "desc" : "asc") : "asc";
    const newKey = key;
    setSortKey(newKey);
    setSortDir(newDir);
    onConfigChange?.({ sort_key: newKey, sort_dir: newDir });
  }

  const rows = [...rawRows].sort((a, b) => {
    const av = a[sortKey] ?? "";
    const bv = b[sortKey] ?? "";
    const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
    return sortDir === "asc" ? cmp : -cmp;
  });

  const serviceLabel = widget.config.service_filter
    ? ` · Service: ${widget.config.service_filter}`
    : "";

  const totalBudgetedHours = rawRows.reduce((s, r) => s + (r.budgeted_hours ?? 0), 0);
  const totalActualHours   = rawRows.reduce((s, r) => s + (r.actual_hours ?? 0), 0);
  const totalRevenue       = rawRows.reduce((s, r) => s + (r.revenue ?? 0), 0);
  const totalPayroll       = rawRows.reduce((s, r) => s + (r.payroll_cost ?? 0), 0);

  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div
        className="px-5 py-3 text-center"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)" }}
      >
        <div className="text-sm font-semibold text-white">Job Summary</div>
        {!loading && start && end && (
          <div className="text-xs text-white/50 mt-0.5">
            {fmtDateShort(start)} – {fmtDateShort(end)}
            {serviceLabel}
            {rows.length > 0 && ` · ${rows.length} job${rows.length !== 1 ? "s" : ""}`}
          </div>
        )}
      </div>

      {loading ? (
        <div className="p-5 space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-gray-400">
          No jobs found for this period
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                {JOB_TABLE_COLUMNS.filter((c) => columns.includes(c.key)).map((col) => (
                  <th
                    key={col.key}
                    className="px-4 py-2.5 text-center font-semibold text-gray-500 whitespace-nowrap cursor-pointer select-none hover:text-gray-800"
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                    {sortKey === col.key && (
                      <span className="ml-1 text-emerald-600">{sortDir === "asc" ? "↑" : "↓"}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  {columns.includes("date") && (
                    <td className="px-4 py-2.5 text-center text-gray-600 whitespace-nowrap">{fmtDateFull(row.date)}</td>
                  )}
                  {columns.includes("client_name") && (
                    <td className="px-4 py-2.5 text-center font-medium text-gray-800 max-w-[180px] truncate">{row.client_name}</td>
                  )}
                  {columns.includes("service") && (
                    <td className="px-4 py-2.5 text-center text-gray-600 whitespace-nowrap">{row.service}</td>
                  )}
                  {columns.includes("crew_code") && (
                    <td className="px-4 py-2.5 text-center text-gray-600">{row.crew_code}</td>
                  )}
                  {columns.includes("budgeted_hours") && (
                    <td className="px-4 py-2.5 text-center tabular-nums text-gray-700">{row.budgeted_hours.toFixed(1)}</td>
                  )}
                  {columns.includes("actual_hours") && (
                    <td className="px-4 py-2.5 text-center tabular-nums text-gray-700">{row.actual_hours.toFixed(1)}</td>
                  )}
                  {columns.includes("revenue") && (
                    <td className="px-4 py-2.5 text-center tabular-nums text-gray-800 font-medium">
                      {fmtCurrency(row.revenue)}
                    </td>
                  )}
                  {columns.includes("payroll_cost") && (
                    <td className="px-4 py-2.5 text-center tabular-nums text-gray-700">
                      {fmtCurrency(row.payroll_cost)}
                    </td>
                  )}
                  {columns.includes("labor_pct") && (
                    <td className={`px-4 py-2.5 text-center tabular-nums ${laborPctColor(row.labor_pct)}`}>
                      {row.labor_pct !== null ? fmtPct(row.labor_pct) : "—"}
                    </td>
                  )}
                  {columns.includes("efficiency_pct") && (
                    <td className={`px-4 py-2.5 text-center tabular-nums ${row.efficiency_pct >= 1 ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}`}>
                      {row.efficiency_pct !== null ? fmtPct(row.efficiency_pct) : "—"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {/* Totals */}
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                {columns.includes("date") && (
                  <td className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-center">TOTALS</td>
                )}
                {columns.includes("client_name") && <td />}
                {columns.includes("service") && <td />}
                {columns.includes("crew_code") && <td />}
                {columns.includes("budgeted_hours") && (
                  <td className="px-4 py-2.5 text-center font-bold text-gray-900 tabular-nums">
                    {totalBudgetedHours.toFixed(1)}
                  </td>
                )}
                {columns.includes("actual_hours") && (
                  <td className="px-4 py-2.5 text-center font-bold text-gray-900 tabular-nums">
                    {totalActualHours.toFixed(1)}
                  </td>
                )}
                {columns.includes("revenue") && (
                  <td className="px-4 py-2.5 text-center font-bold text-gray-900 tabular-nums">
                    {fmtCurrency(totalRevenue)}
                  </td>
                )}
                {columns.includes("payroll_cost") && (
                  <td className="px-4 py-2.5 text-center font-bold text-gray-900 tabular-nums">
                    {fmtCurrency(totalPayroll)}
                  </td>
                )}
                {columns.includes("labor_pct") && (
                  <td className={`px-4 py-2.5 text-center font-bold tabular-nums ${laborPctColor(totalRevenue > 0 ? totalPayroll / totalRevenue : null)}`}>
                    {totalRevenue > 0 ? fmtPct(totalPayroll / totalRevenue) : "—"}
                  </td>
                )}
                {columns.includes("efficiency_pct") && (
                  <td className={`px-4 py-2.5 text-center font-bold tabular-nums ${totalPayroll > 0 && (totalRevenue * 0.39) / totalPayroll >= 1 ? "text-emerald-600" : "text-amber-600"}`}>
                    {totalPayroll > 0 ? fmtPct((totalRevenue * 0.39) / totalPayroll) : "—"}
                  </td>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ── MemberTableWidget ─────────────────────────────────────────────────────────

function MemberTableWidget({
  widget,
  widgetData,
}: {
  widget: Widget;
  widgetData: WidgetData | undefined;
}) {
  const loading = widgetData?.loading ?? true;
  const data = widgetData?.data;
  const rows: any[] = data?.rows ?? [];
  const columns: string[] = data?.columns ?? MEMBER_TABLE_COLUMNS.map((c) => c.key);
  const start = data?.start;
  const end = data?.end;

  const totalRegHours  = rows.reduce((s, r) => s + (r.reg_hours ?? 0), 0);
  const totalOtHours   = rows.reduce((s, r) => s + (r.ot_hours ?? 0), 0);
  const totalDtHours   = rows.reduce((s, r) => s + (r.dt_hours ?? 0), 0);
  const totalOtCost    = rows.reduce((s, r) => s + (r.ot_cost ?? 0), 0);
  const totalHours     = rows.reduce((s, r) => s + (r.total_pay_hours ?? 0), 0);
  const totalPayroll   = rows.reduce((s, r) => s + (r.total_payroll ?? 0), 0);
  const totalEarned    = rows.reduce((s, r) => s + (r.total_earned ?? 0), 0);
  const hasAnyOt       = rows.some((r) => (r.ot_hours ?? 0) > 0);

  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div
        className="px-5 py-3 text-center"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)" }}
      >
        <div className="text-sm font-semibold text-white">Team Members</div>
        {!loading && start && end && (
          <div className="text-xs text-white/50 mt-0.5">
            {fmtDateShort(start)} – {fmtDateShort(end)}
            {rows.length > 0 && ` · ${rows.length} team member${rows.length !== 1 ? "s" : ""}`}
          </div>
        )}
      </div>

      {loading ? (
        <div className="p-5 space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-gray-400">
          No punch data found for this period
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                {MEMBER_TABLE_COLUMNS
                  .filter((c) => columns.includes(c.key))
                  .filter((c) => c.key !== "ot_hours" || hasAnyOt)
                  .map((col) => (
                    <th key={col.key} className={`px-4 py-2.5 font-semibold text-gray-500 whitespace-nowrap ${col.key === "name" ? "text-left" : "text-right"}`}>
                      {col.label}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  {columns.includes("name") && (
                    <td className="px-4 py-2.5 text-left font-medium text-gray-800">{row.name}</td>
                  )}
                  {columns.includes("reg_hours") && (
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 whitespace-nowrap">{(row.reg_hours ?? 0).toFixed(1)}</td>
                  )}
                  {columns.includes("ot_hours") && hasAnyOt && (
                    <td className={`px-4 py-2.5 text-right tabular-nums whitespace-nowrap ${(row.ot_hours ?? 0) > 0 ? "text-amber-600 font-semibold" : "text-gray-300"}`}>
                      {(row.ot_hours ?? 0) > 0 ? (row.ot_hours).toFixed(1) : "—"}
                    </td>
                  )}
                  {columns.includes("total_pay_hours") && (
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-800 whitespace-nowrap">{(row.total_pay_hours ?? 0).toFixed(1)}</td>
                  )}
                  {columns.includes("ot_cost") && (
                    <td className={`px-4 py-2.5 text-right tabular-nums whitespace-nowrap ${(row.ot_cost ?? 0) > 0 ? "text-amber-600" : "text-gray-300"}`}>
                      {(row.ot_cost ?? 0) > 0 ? fmtCurrency(row.ot_cost) : "—"}
                    </td>
                  )}
                  {columns.includes("labor_pct") && (
                    <td className={`px-4 py-2.5 text-right tabular-nums font-semibold whitespace-nowrap ${laborPctColor(row.labor_pct)}`}>
                      {row.labor_pct !== null ? fmtPct(row.labor_pct) : "—"}
                    </td>
                  )}
                  {columns.includes("efficiency_pct") && (
                    <td className={`px-4 py-2.5 text-right tabular-nums font-semibold whitespace-nowrap ${row.efficiency_pct !== null ? (row.efficiency_pct >= 1 ? "text-emerald-600" : "text-amber-600") : "text-gray-400"}`}>
                      {row.efficiency_pct !== null ? fmtPct(row.efficiency_pct) : "—"}
                    </td>
                  )}
                  {columns.includes("downtime_pct") && (
                    <td className={`px-4 py-2.5 text-right tabular-nums font-semibold whitespace-nowrap ${(row.downtime_pct ?? 0) > 0 ? "text-red-600" : "text-gray-300"}`}>
                      {(row.downtime_pct ?? 0) > 0 ? fmtPct(row.downtime_pct) : "—"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                {columns.includes("name") && (
                  <td className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">TOTALS</td>
                )}
                {columns.includes("reg_hours") && (
                  <td className="px-4 py-2.5 text-right font-bold text-gray-900 tabular-nums whitespace-nowrap">
                    {totalRegHours.toFixed(1)}
                  </td>
                )}
                {columns.includes("ot_hours") && hasAnyOt && (
                  <td className="px-4 py-2.5 text-right font-bold text-amber-600 tabular-nums whitespace-nowrap">
                    {totalOtHours > 0 ? totalOtHours.toFixed(1) : "—"}
                  </td>
                )}
                {columns.includes("total_pay_hours") && (
                  <td className="px-4 py-2.5 text-right font-bold text-gray-900 tabular-nums whitespace-nowrap">
                    {totalHours.toFixed(1)}
                  </td>
                )}
                {columns.includes("ot_cost") && (
                  <td className="px-4 py-2.5 text-right font-bold text-amber-600 tabular-nums whitespace-nowrap">
                    {totalOtCost > 0 ? fmtCurrency(totalOtCost) : "—"}
                  </td>
                )}
                {columns.includes("labor_pct") && (
                  <td className={`px-4 py-2.5 text-right font-bold tabular-nums whitespace-nowrap ${laborPctColor(totalEarned > 0 ? totalPayroll / totalEarned : null)}`}>
                    {totalEarned > 0 ? fmtPct(totalPayroll / totalEarned) : "—"}
                  </td>
                )}
                {columns.includes("efficiency_pct") && (
                  <td className={`px-4 py-2.5 text-right font-bold tabular-nums whitespace-nowrap ${totalPayroll > 0 && (totalEarned * 0.39) / totalPayroll >= 1 ? "text-emerald-600" : "text-amber-600"}`}>
                    {totalPayroll > 0 ? fmtPct((totalEarned * 0.39) / totalPayroll) : "—"}
                  </td>
                )}
                {columns.includes("downtime_pct") && (
                  <td className={`px-4 py-2.5 text-right font-bold tabular-nums whitespace-nowrap ${totalDtHours > 0 ? "text-red-600" : "text-gray-300"}`}>
                    {totalHours > 0 ? fmtPct(totalDtHours / totalHours) : "—"}
                  </td>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ── SectionHeaderWidget ───────────────────────────────────────────────────────

function SectionHeaderWidget({ widget }: { widget: Widget }) {
  const title = widget.config.title || "Section Title";
  const subtitle = widget.config.subtitle || "";

  return (
    <div
      className="rounded-xl overflow-hidden shadow-sm"
      style={{ background: "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)" }}
    >
      <div className="px-6 py-4 text-center">
        <div className="text-base font-bold text-white tracking-wide uppercase">{title}</div>
        {subtitle && <div className="text-sm text-white/50 mt-0.5">{subtitle}</div>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Config Panels
// ══════════════════════════════════════════════════════════════════════════════

function DateRangeConfig({
  config,
  onChange,
}: {
  config: Record<string, any>;
  onChange: (updates: Record<string, any>) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Date Range</label>
        <select
          value={config.date_range ?? "last_week"}
          onChange={(e) => onChange({ date_range: e.target.value })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
        >
          {DATE_RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      {config.date_range === "custom" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Start Date</label>
            <input
              type="date"
              value={config.custom_start ?? ""}
              onChange={(e) => onChange({ custom_start: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">End Date</label>
            <input
              type="date"
              value={config.custom_end ?? ""}
              onChange={(e) => onChange({ custom_end: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCardConfig({
  config,
  onChange,
}: {
  config: Record<string, any>;
  onChange: (updates: Record<string, any>) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Metric</label>
        <select
          value={config.metric ?? "total_revenue"}
          onChange={(e) => onChange({ metric: e.target.value })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
        >
          {METRICS.map((m) => (
            <option key={m.value} value={m.value}>{m.label} — {m.description}</option>
          ))}
        </select>
      </div>
      <DateRangeConfig config={config} onChange={onChange} />
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Label Override</label>
        <input
          type="text"
          value={config.label ?? ""}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Leave blank to use metric name"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
        />
      </div>
      <label className="flex items-center gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={!!config.full_width}
          onChange={(e) => onChange({ full_width: e.target.checked })}
          className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
        />
        <span className="text-xs font-semibold text-gray-600">Full width (own row)</span>
      </label>
    </div>
  );
}

function JobTableConfig({
  config,
  onChange,
}: {
  config: Record<string, any>;
  onChange: (updates: Record<string, any>) => void;
}) {
  const selectedCols: string[] = config.columns ?? JOB_TABLE_COLUMNS.map((c) => c.key);

  function toggleCol(key: string) {
    const next = selectedCols.includes(key)
      ? selectedCols.filter((c) => c !== key)
      : [...selectedCols, key];
    onChange({ columns: next });
  }

  return (
    <div className="space-y-3">
      <DateRangeConfig config={config} onChange={onChange} />
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Service Filter
        </label>
        <input
          type="text"
          value={config.service_filter ?? ""}
          onChange={(e) => onChange({ service_filter: e.target.value })}
          placeholder="e.g. Spring Cleanup, Mowing"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
        />
        <p className="text-xs text-gray-400 mt-1">Comma-separated. Leave blank for all services.</p>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Columns</label>
        <div className="grid grid-cols-2 gap-1.5">
          {JOB_TABLE_COLUMNS.map((col) => (
            <label key={col.key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedCols.includes(col.key)}
                onChange={() => toggleCol(col.key)}
                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-xs text-gray-700">{col.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function MemberTableConfig({
  config,
  onChange,
}: {
  config: Record<string, any>;
  onChange: (updates: Record<string, any>) => void;
}) {
  const selectedCols: string[] = config.columns ?? MEMBER_TABLE_COLUMNS.map((c) => c.key);

  function toggleCol(key: string) {
    const next = selectedCols.includes(key)
      ? selectedCols.filter((c) => c !== key)
      : [...selectedCols, key];
    onChange({ columns: next });
  }

  return (
    <div className="space-y-3">
      <DateRangeConfig config={config} onChange={onChange} />
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Columns</label>
        <div className="grid grid-cols-2 gap-1.5">
          {MEMBER_TABLE_COLUMNS.map((col) => (
            <label key={col.key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedCols.includes(col.key)}
                onChange={() => toggleCol(col.key)}
                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-xs text-gray-700">{col.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionHeaderConfig({
  config,
  onChange,
}: {
  config: Record<string, any>;
  onChange: (updates: Record<string, any>) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Title</label>
        <input
          type="text"
          value={config.title ?? ""}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Section Title"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Subtitle</label>
        <input
          type="text"
          value={config.subtitle ?? ""}
          onChange={(e) => onChange({ subtitle: e.target.value })}
          placeholder="Optional subtitle"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
        />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Edit Mode: Widget Canvas Item
// ══════════════════════════════════════════════════════════════════════════════

function WidgetCanvasItem({
  widget,
  widgetData,
  isConfiguring,
  isDragTarget,
  onToggleConfig,
  onDelete,
  onConfigChange,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  widget: Widget;
  widgetData: WidgetData | undefined;
  isConfiguring: boolean;
  isDragTarget: boolean;
  onToggleConfig: () => void;
  onDelete: () => void;
  onConfigChange: (updates: Record<string, any>) => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      className={`relative transition-all ${isDragTarget ? "ring-2 ring-emerald-500 ring-offset-2 rounded-xl" : ""}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => { e.preventDefault(); onDragOver(e); }}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
      onDragEnd={onDragEnd}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <div
          className="mt-2 flex flex-col gap-0.5 cursor-grab active:cursor-grabbing shrink-0 opacity-30 hover:opacity-70 transition-opacity"
          title="Drag to reorder"
        >
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex gap-0.5">
              <div className="w-1 h-1 rounded-full bg-gray-500" />
              <div className="w-1 h-1 rounded-full bg-gray-500" />
            </div>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          {/* Widget content */}
          {widget.widget_type === "stat_card" && (
            <StatCardWidget widget={widget} widgetData={widgetData} />
          )}
          {widget.widget_type === "job_table" && (
            <JobTableWidget widget={widget} widgetData={widgetData} onConfigChange={onConfigChange} />
          )}
          {widget.widget_type === "member_table" && (
            <MemberTableWidget widget={widget} widgetData={widgetData} />
          )}
          {widget.widget_type === "section_header" && (
            <SectionHeaderWidget widget={widget} />
          )}

          {/* Config panel */}
          {isConfiguring && (
            <div className="mt-2 border border-emerald-200 rounded-xl bg-emerald-50/60 p-4">
              <div className="text-xs font-bold text-emerald-800 uppercase tracking-wide mb-3">Configure Widget</div>
              {widget.widget_type === "stat_card" && (
                <StatCardConfig config={widget.config} onChange={onConfigChange} />
              )}
              {widget.widget_type === "job_table" && (
                <JobTableConfig config={widget.config} onChange={onConfigChange} />
              )}
              {widget.widget_type === "member_table" && (
                <MemberTableConfig config={widget.config} onChange={onConfigChange} />
              )}
              {widget.widget_type === "section_header" && (
                <SectionHeaderConfig config={widget.config} onChange={onConfigChange} />
              )}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-1 mt-2 shrink-0">
          <button
            onClick={onToggleConfig}
            title={isConfiguring ? "Close config" : "Configure"}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              isConfiguring
                ? "bg-emerald-600 text-white"
                : "bg-gray-100 text-gray-500 hover:bg-emerald-100 hover:text-emerald-700"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            title="Remove widget"
            className="w-7 h-7 rounded-lg bg-gray-100 text-gray-400 hover:bg-red-100 hover:text-red-500 flex items-center justify-center transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Palette
// ══════════════════════════════════════════════════════════════════════════════

function PaletteSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="text-xs font-bold text-white/40 uppercase tracking-widest px-4 mb-2">{title}</div>
      <div className="space-y-1 px-2">{children}</div>
    </div>
  );
}

function PaletteItem({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/80 hover:text-white hover:bg-white/10 transition-all group"
    >
      <span className="shrink-0 w-7 h-7 rounded-lg bg-white/10 group-hover:bg-white/20 flex items-center justify-center transition-colors">
        {icon}
      </span>
      <span className="font-medium">{label}</span>
      <span className="ml-auto text-white/30 group-hover:text-white/60 transition-colors text-lg leading-none">+</span>
    </button>
  );
}

function Palette({ onAdd }: { onAdd: (type: WidgetType, config?: Record<string, any>) => void }) {
  return (
    <div
      className="w-[260px] shrink-0 rounded-2xl overflow-y-auto"
      style={{
        background: "linear-gradient(180deg, #0d2616 0%, #102e1a 100%)",
        maxHeight: "calc(100vh - 180px)",
      }}
    >
      <div className="px-4 pt-5 pb-2">
        <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Add Widgets</div>
      </div>

      <PaletteSection title="Metric Cards">
        {METRICS.map((m) => (
          <PaletteItem
            key={m.value}
            label={m.label}
            icon={
              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
            onClick={() => onAdd("stat_card", { metric: m.value, date_range: "last_week", label: "" })}
          />
        ))}
      </PaletteSection>

      <PaletteSection title="Tables">
        <PaletteItem
          label="Job Summary Table"
          icon={
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M10 3v18M3 6a3 3 0 013-3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6z" />
            </svg>
          }
          onClick={() => onAdd("job_table")}
        />
        <PaletteItem
          label="Team Member Table"
          icon={
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
          onClick={() => onAdd("member_table")}
        />
      </PaletteSection>

      <PaletteSection title="Layout">
        <PaletteItem
          label="Section Header"
          icon={
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          }
          onClick={() => onAdd("section_header")}
        />
      </PaletteSection>

      <div className="pb-4" />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Canvas renderer — groups stat cards into flex rows (full_width stat cards break the row)
// ══════════════════════════════════════════════════════════════════════════════

function ViewCanvas({
  widgets,
  widgetDataMap,
}: {
  widgets: Widget[];
  widgetDataMap: Map<string, WidgetData>;
}) {
  const groups: Array<{ type: "stat_row"; items: Widget[] } | { type: "full"; item: Widget }> = [];
  let i = 0;
  while (i < widgets.length) {
    const w = widgets[i];
    if (w.widget_type === "stat_card" && !w.config.full_width) {
      const run: Widget[] = [];
      while (i < widgets.length && widgets[i].widget_type === "stat_card" && !widgets[i].config.full_width) {
        run.push(widgets[i]);
        i++;
      }
      groups.push({ type: "stat_row", items: run });
    } else {
      groups.push({ type: "full", item: w });
      i++;
    }
  }

  return (
    <div className="space-y-4">
      {groups.map((g, gi) => {
        if (g.type === "stat_row") {
          return (
            <div key={gi} className="flex flex-wrap gap-4 justify-center">
              {g.items.map((w) => (
                <div key={w.id} className="flex-1 min-w-[200px]">
                  <StatCardWidget widget={w} widgetData={widgetDataMap.get(w.id)} />
                </div>
              ))}
            </div>
          );
        }
        return (
          <div key={gi}>
            {g.item.widget_type === "stat_card" && (
              <StatCardWidget widget={g.item} widgetData={widgetDataMap.get(g.item.id)} />
            )}
            {g.item.widget_type === "job_table" && (
              <JobTableWidget widget={g.item} widgetData={widgetDataMap.get(g.item.id)} />
            )}
            {g.item.widget_type === "member_table" && (
              <MemberTableWidget widget={g.item} widgetData={widgetDataMap.get(g.item.id)} />
            )}
            {g.item.widget_type === "section_header" && (
              <SectionHeaderWidget widget={g.item} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function EditCanvas({
  widgets,
  widgetDataMap,
  configuringId,
  dragTargetId,
  onToggleConfig,
  onDelete,
  onConfigChange,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  widgets: Widget[];
  widgetDataMap: Map<string, WidgetData>;
  configuringId: string | null;
  dragTargetId: string | null;
  onToggleConfig: (id: string) => void;
  onDelete: (id: string) => void;
  onConfigChange: (id: string, updates: Record<string, any>) => void;
  onDragStart: (id: string) => void;
  onDragOver: (id: string, e: React.DragEvent) => void;
  onDrop: (id: string) => void;
  onDragEnd: () => void;
}) {
  // Group stat cards for rendering — full_width stat cards break into their own row
  const groups: Array<{ type: "stat_row"; items: Widget[] } | { type: "full"; item: Widget }> = [];
  let i = 0;
  while (i < widgets.length) {
    const w = widgets[i];
    if (w.widget_type === "stat_card" && !w.config.full_width) {
      const run: Widget[] = [];
      while (i < widgets.length && widgets[i].widget_type === "stat_card" && !widgets[i].config.full_width) {
        run.push(widgets[i]);
        i++;
      }
      groups.push({ type: "stat_row", items: run });
    } else {
      groups.push({ type: "full", item: w });
      i++;
    }
  }

  if (widgets.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[300px] border-2 border-dashed border-gray-200 rounded-2xl">
        <div className="text-center text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 4v16m8-8H4" />
          </svg>
          <p className="text-sm">Add widgets from the palette on the left</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4">
      {groups.map((g, gi) => {
        if (g.type === "stat_row") {
          return (
            <div key={gi} className="flex flex-wrap gap-4 justify-center">
              {g.items.map((w) => (
                <div key={w.id} className="flex-1 min-w-[200px]">
                  <WidgetCanvasItem
                    widget={w}
                    widgetData={widgetDataMap.get(w.id)}
                    isConfiguring={configuringId === w.id}
                    isDragTarget={dragTargetId === w.id}
                    onToggleConfig={() => onToggleConfig(w.id)}
                    onDelete={() => onDelete(w.id)}
                    onConfigChange={(updates) => onConfigChange(w.id, updates)}
                    onDragStart={() => onDragStart(w.id)}
                    onDragOver={(e) => onDragOver(w.id, e)}
                    onDrop={() => onDrop(w.id)}
                    onDragEnd={onDragEnd}
                  />
                </div>
              ))}
            </div>
          );
        }
        const w = g.item;
        return (
          <WidgetCanvasItem
            key={w.id}
            widget={w}
            widgetData={widgetDataMap.get(w.id)}
            isConfiguring={configuringId === w.id}
            isDragTarget={dragTargetId === w.id}
            onToggleConfig={() => onToggleConfig(w.id)}
            onDelete={() => onDelete(w.id)}
            onConfigChange={(updates) => onConfigChange(w.id, updates)}
            onDragStart={() => onDragStart(w.id)}
            onDragOver={(e) => onDragOver(w.id, e)}
            onDrop={() => onDrop(w.id)}
            onDragEnd={onDragEnd}
          />
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Page
// ══════════════════════════════════════════════════════════════════════════════

export default function ReportBuilderPage() {
  const router = useRouter();
  const params = useParams();
  const reportId = params.id as string;

  const [reportName, setReportName] = useState("New Report");
  const [reportDesc, setReportDesc] = useState("");
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [widgetDataMap, setWidgetDataMap] = useState<Map<string, WidgetData>>(new Map());
  const [configuringId, setConfiguringId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragTargetId, setDragTargetId] = useState<string | null>(null);

  const fetchTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ── Fetch widget data ──────────────────────────────────────────────────────

  const fetchWidgetData = useCallback(async (widget: Widget) => {
    if (widget.widget_type === "section_header") return;

    // Mark loading
    setWidgetDataMap((prev) => {
      const next = new Map(prev);
      next.set(widget.id, { loading: true, data: prev.get(widget.id)?.data });
      return next;
    });

    try {
      const res = await fetch("/api/operations-center/atlas-ops/lawn/report-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widget_type: widget.widget_type, config: widget.config }),
      });
      const data = await res.json();
      setWidgetDataMap((prev) => {
        const next = new Map(prev);
        next.set(widget.id, { loading: false, data: res.ok ? data : null, error: res.ok ? undefined : data.error });
        return next;
      });
    } catch (err: any) {
      setWidgetDataMap((prev) => {
        const next = new Map(prev);
        next.set(widget.id, { loading: false, data: null, error: err.message });
        return next;
      });
    }
  }, []);

  // Debounced fetch for a widget
  const scheduleFetch = useCallback((widget: Widget, delay = 600) => {
    const existing = fetchTimersRef.current.get(widget.id);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      fetchWidgetData(widget);
      fetchTimersRef.current.delete(widget.id);
    }, delay);
    fetchTimersRef.current.set(widget.id, t);
  }, [fetchWidgetData]);

  // ── Load report ────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetch(`/api/operations-center/atlas-ops/lawn/division-reports/${reportId}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (json.data) {
        setReportName(json.data.name);
        setReportDesc(json.data.description ?? "");
        const ws: Widget[] = (json.data.widgets ?? []).map((w: any) => ({
          id: w.id,
          widget_type: w.widget_type as WidgetType,
          config: w.config ?? {},
          position: w.position,
        }));
        setWidgets(ws);
        setLoading(false);
        // Fetch all widget data
        ws.forEach((w) => fetchWidgetData(w));
      } else {
        setLoading(false);
      }
    }
    load();
  }, [reportId, fetchWidgetData]);

  // ── Save ──────────────────────────────────────────────────────────────────

  async function save() {
    setSaving(true);
    const payload = {
      name: reportName,
      description: reportDesc || null,
      widgets: widgets.map((w, i) => ({
        widget_type: w.widget_type,
        config: w.config,
        position: i,
      })),
    };
    await fetch(`/api/operations-center/atlas-ops/lawn/division-reports/${reportId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    setDirty(false);
  }

  // ── Widget operations ─────────────────────────────────────────────────────

  function addWidget(type: WidgetType, overrideConfig?: Record<string, any>) {
    const newWidget: Widget = {
      id: localId(),
      widget_type: type,
      config: overrideConfig ?? defaultConfig(type),
      position: widgets.length,
    };
    setWidgets((prev) => [...prev, newWidget]);
    setDirty(true);
    // Fetch data for new widget
    fetchWidgetData(newWidget);
  }

  function deleteWidget(id: string) {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
    setConfiguring(id === configuringId ? null : configuringId);
    setDirty(true);
  }

  function setConfiguring(id: string | null) {
    setConfiguringId((prev) => (prev === id ? null : id));
  }

  function updateWidgetConfig(id: string, updates: Record<string, any>) {
    setWidgets((prev) =>
      prev.map((w) =>
        w.id === id
          ? { ...w, config: { ...w.config, ...updates } }
          : w
      )
    );
    setDirty(true);
    // Find updated widget and debounce fetch
    setWidgets((prev) => {
      const updated = prev.find((w) => w.id === id);
      if (updated) scheduleFetch({ ...updated, config: { ...updated.config, ...updates } });
      return prev;
    });
  }

  // ── Drag and drop ─────────────────────────────────────────────────────────

  function handleDragStart(id: string) {
    setDragId(id);
  }

  function handleDragOver(id: string, _e: React.DragEvent) {
    if (id !== dragId) setDragTargetId(id);
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    setWidgets((prev) => {
      const fromIdx = prev.findIndex((w) => w.id === dragId);
      const toIdx = prev.findIndex((w) => w.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const next = [...prev];
      const [removed] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, removed);
      return next.map((w, i) => ({ ...w, position: i }));
    });
    setDirty(true);
    setDragTargetId(null);
    setDragId(null);
  }

  function handleDragEnd() {
    setDragId(null);
    setDragTargetId(null);
  }

  // ── Name editing ──────────────────────────────────────────────────────────

  function handleNameChange(val: string) {
    setReportName(val);
    setDirty(true);
  }

  function handleDescChange(val: string) {
    setReportDesc(val);
    setDirty(true);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 animate-spin text-emerald-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <span className="text-sm text-gray-500">Loading report…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50">

      {/* Print-only header: Atlas logo centered */}
      <div className="hidden print:flex flex-col items-center justify-center pb-6 pt-2">
        <img src="/atlas-logo.png" alt="Atlas" className="print-logo" style={{ mixBlendMode: "multiply" }} />
      </div>

      {/* Sticky header */}
      <div
        className="no-print sticky top-0 z-30 border-b border-white/10 shadow-lg"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)" }}
      >
        <div className="mx-auto max-w-[1400px] px-6 py-3 flex items-center gap-4">
          {/* Back */}
          <button
            onClick={() => router.push("/operations-center/atlas-ops/lawn/reports")}
            className="shrink-0 w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Title / description */}
          <div className="flex-1 min-w-0">
            {editMode ? (
              <div className="flex flex-col gap-1">
                <input
                  type="text"
                  value={reportName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="bg-white/10 border border-white/20 rounded-lg px-3 py-1 text-base font-semibold text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/30 w-full max-w-xs"
                  placeholder="Report name"
                />
                <input
                  type="text"
                  value={reportDesc}
                  onChange={(e) => handleDescChange(e.target.value)}
                  className="bg-white/10 border border-white/20 rounded-lg px-3 py-1 text-xs text-white/70 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/30 w-full max-w-sm"
                  placeholder="Add a description…"
                />
              </div>
            ) : (
              <div>
                <div className="text-base font-semibold text-white truncate">{reportName}</div>
                {reportDesc && <div className="text-xs text-white/40 truncate">{reportDesc}</div>}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {editMode ? (
              <>
                <button
                  onClick={() => { setEditMode(false); setConfiguringId(null); }}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                >
                  Done
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm ${
                    dirty
                      ? "bg-amber-400 text-amber-900 hover:bg-amber-300"
                      : "bg-white/10 text-white/50 cursor-default"
                  } disabled:opacity-60`}
                >
                  {saving ? "Saving…" : dirty ? "Save" : "Saved"}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => window.print()}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-white/60 hover:text-white hover:bg-white/10 flex items-center gap-1.5 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print
                </button>
                <button
                  onClick={() => setEditMode(true)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-emerald-900 bg-emerald-400 hover:bg-emerald-300 transition-all shadow-sm"
                >
                  Edit Layout
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-[1400px] px-6 py-6">
        {editMode ? (
          /* Edit layout: palette + canvas side by side */
          <div className="flex gap-6 items-start">
            <Palette onAdd={addWidget} />
            <div className="flex-1 min-w-0">
              <EditCanvas
                widgets={widgets}
                widgetDataMap={widgetDataMap}
                configuringId={configuringId}
                dragTargetId={dragTargetId}
                onToggleConfig={setConfiguring}
                onDelete={deleteWidget}
                onConfigChange={updateWidgetConfig}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
              />
            </div>
          </div>
        ) : (
          /* View layout: full width */
          <div>
            {widgets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-gray-400 text-sm mb-4">This report has no widgets yet</p>
                <button
                  onClick={() => setEditMode(true)}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all shadow hover:shadow-md hover:scale-105"
                  style={{ background: "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)" }}
                >
                  Edit Layout
                </button>
              </div>
            ) : (
              <ViewCanvas widgets={widgets} widgetDataMap={widgetDataMap} />
            )}
          </div>
        )}
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          /* Release scroll containers so all pages render */
          .print-root, .print-root * {
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
          }
          /* Keep tables together where possible */
          table { break-inside: auto; }
          tr    { break-inside: avoid; }
          thead { display: table-header-group; }
        }
      `}</style>
    </div>
  );
}
