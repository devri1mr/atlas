"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type BidRow = {
  id: string;
  client_name: string | null;
  client_last_name: string | null;
  customer_name: string | null;
  created_at: string | null;
  created_by_name: string | null;
  city: string | null;
  state: string | null;
  sell_rounded: number | null;
  total_cost: number | null;
  target_gp_pct: number | null;
  division_id: string | null;
  internal_notes: string | null;
  statuses: { id: number; name: string; color: string | null } | null;
  divisions: { id: string; name: string } | null;
};

type SortKey = "client" | "division" | "location" | "value" | "cost" | "gp" | "status" | "date" | "createdBy";
type SortDir = "asc" | "desc";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtMoney(n: number | null) {
  if (n == null || n === 0) return "—";
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000 ? `$${(n / 1_000).toFixed(1)}K`
    : `$${n.toLocaleString()}`;
}

function cleanStr(v?: string | null) {
  const s = String(v ?? "").trim();
  return s && s.toLowerCase() !== "null" ? s : "";
}

function clientName(b: BidRow) {
  return cleanStr(b.customer_name) ||
    [cleanStr(b.client_name), cleanStr(b.client_last_name)].filter(Boolean).join(" ") ||
    "—";
}

const STATUS_COLORS: Record<string, string> = {
  draft:       "bg-gray-100 text-gray-600",
  sent:        "bg-blue-50 text-blue-700",
  won:         "bg-emerald-50 text-emerald-700",
  lost:        "bg-red-50 text-red-600",
  "in review": "bg-amber-50 text-amber-700",
  archived:    "bg-gray-100 text-gray-400",
};

export default function BidsPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<BidRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  async function load() {
    setLoading(true);
    setError(null);
    setSelected(new Set());
    try {
      const res = await fetch("/api/bids", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Failed to load bids");
      setRows(json?.data ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "date" ? "desc" : "asc");
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(b =>
      !q ||
      clientName(b).toLowerCase().includes(q) ||
      (b.city ?? "").toLowerCase().includes(q) ||
      (b.divisions?.name ?? "").toLowerCase().includes(q) ||
      (b.statuses?.name ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "client":   cmp = clientName(a).localeCompare(clientName(b)); break;
        case "division": cmp = (a.divisions?.name ?? "").localeCompare(b.divisions?.name ?? ""); break;
        case "location": cmp = (a.city ?? "").localeCompare(b.city ?? ""); break;
        case "value":    cmp = (a.sell_rounded ?? 0) - (b.sell_rounded ?? 0); break;
        case "cost":     cmp = (a.total_cost ?? 0) - (b.total_cost ?? 0); break;
        case "gp":        cmp = (a.target_gp_pct ?? 0) - (b.target_gp_pct ?? 0); break;
        case "status":    cmp = (a.statuses?.name ?? "").localeCompare(b.statuses?.name ?? ""); break;
        case "date":      cmp = (a.created_at ?? "").localeCompare(b.created_at ?? ""); break;
        case "createdBy": cmp = (a.created_by_name ?? "").localeCompare(b.created_by_name ?? ""); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  function toggleRow(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === sorted.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sorted.map(r => r.id)));
    }
  }

  async function deleteSelected() {
    if (!selected.size) return;
    if (!confirm(`Delete ${selected.size} bid${selected.size !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await Promise.all(
        [...selected].map(id =>
          fetch(`/api/bids/${id}`, { method: "DELETE" })
        )
      );
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function duplicateBid(id: string) {
    setDuplicatingId(id);
    try {
      const res = await fetch(`/api/bids/${id}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Duplicate failed");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Duplicate failed");
    } finally {
      setDuplicatingId(null);
    }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-green-600 ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  function Th({ label, k, align = "left" }: { label: string; k: SortKey; align?: "left" | "center" | "right" }) {
    const cls = align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";
    return (
      <th
        onClick={() => toggleSort(k)}
        className={`px-4 py-3 font-semibold cursor-pointer select-none hover:text-gray-700 transition-colors whitespace-nowrap ${cls}`}
      >
        {label}<SortIcon k={k} />
      </th>
    );
  }

  const totalValue = sorted.reduce((s, r) => s + (r.sell_rounded ?? 0), 0);
  const allChecked = sorted.length > 0 && selected.size === sorted.length;
  const someChecked = selected.size > 0 && selected.size < sorted.length;

  return (
    <div className="min-h-screen bg-[#f0f4f0]">
      {/* Header */}
      <div
        className="px-4 md:px-8 py-6 md:py-8"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}
      >
        <div className="max-w-7xl mx-auto flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Bids</h1>
            {!loading && (
              <p className="text-white/50 text-sm mt-1">
                {sorted.length} bid{sorted.length !== 1 ? "s" : ""}
                {totalValue > 0 && ` · ${fmtMoney(totalValue)} total value`}
              </p>
            )}
          </div>
          <Link
            href="/atlasbid/new"
            className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-lg shadow-green-900/30 transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Bid
          </Link>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-7xl mx-auto space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search bids…"
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          {selected.size > 0 && (
            <button
              onClick={deleteSelected}
              disabled={deleting}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl disabled:opacity-60 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
              </svg>
              {deleting ? "Deleting…" : `Delete ${selected.size} selected`}
            </button>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-11 bg-gray-50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="text-4xl mb-3">📋</div>
              <div className="text-gray-900 font-semibold mb-1">{search ? "No matching bids" : "No bids yet"}</div>
              <p className="text-gray-500 text-sm mb-5">
                {search ? "Try a different search." : "Create your first bid to get started."}
              </p>
              {!search && (
                <Link href="/atlasbid/new"
                  className="inline-flex items-center gap-2 bg-[#123b1f] text-white font-semibold text-sm px-5 py-2.5 rounded-xl hover:bg-[#1a5c2e] transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Create Bid
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-50">
                    {/* Checkbox */}
                    <th className="pl-5 pr-3 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        ref={el => { if (el) el.indeterminate = someChecked; }}
                        onChange={toggleAll}
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                      />
                    </th>
                    <Th label="Client" k="client" />
                    <Th label="Division" k="division" align="center" />
                    <Th label="Location" k="location" />
                    <Th label="Value" k="value" align="center" />
                    <Th label="Cost" k="cost" align="center" />
                    <Th label="GP%" k="gp" align="center" />
                    <Th label="Status" k="status" align="center" />
                    <Th label="Created By" k="createdBy" align="center" />
                    <Th label="Date" k="date" align="center" />
                    <th className="px-4 py-3 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((b) => {
                    const name = clientName(b);
                    const statusName = (b.statuses?.name ?? "draft").toLowerCase();
                    const badgeCls = STATUS_COLORS[statusName] ?? "bg-gray-100 text-gray-600";
                    const isSelected = selected.has(b.id);
                    const gp = b.target_gp_pct;
                    const gpColor = gp == null ? "text-gray-400" : gp >= 50 ? "text-emerald-700 font-semibold" : gp >= 40 ? "text-amber-600" : "text-red-600";

                    return (
                      <tr
                        key={b.id}
                        className={`border-b border-gray-50 last:border-0 transition-colors ${isSelected ? "bg-green-50/50" : "hover:bg-gray-50/50"}`}
                      >
                        <td className="pl-5 pr-3 py-3.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRow(b.id)}
                            className="rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-3.5 font-medium text-gray-900 whitespace-nowrap">{name}</td>
                        <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap text-center">{b.divisions?.name ?? "—"}</td>
                        <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap">
                          {b.city || b.state
                            ? [b.city, b.state].filter(Boolean).join(", ")
                            : (b as any).address1 || (b as any).address
                              ? ((b as any).address1 || (b as any).address)
                              : "—"}
                        </td>
                        <td className="px-4 py-3.5 text-center font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                          {fmtMoney(b.sell_rounded)}
                        </td>
                        <td className="px-4 py-3.5 text-center text-gray-500 tabular-nums whitespace-nowrap">
                          {fmtMoney(b.total_cost)}
                        </td>
                        <td className={`px-4 py-3.5 text-center tabular-nums whitespace-nowrap ${gpColor}`}>
                          {gp != null ? `${gp.toFixed(1)}%` : "—"}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${badgeCls}`}>
                            {b.statuses?.name ?? "Draft"}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-gray-500 text-xs whitespace-nowrap text-center">{b.created_by_name || <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3.5 text-gray-400 text-xs whitespace-nowrap text-center">{fmtDate(b.created_at)}</td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => duplicateBid(b.id)}
                              disabled={duplicatingId === b.id}
                              title="Duplicate bid"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-500 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-50"
                            >
                              {duplicatingId === b.id ? (
                                <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                              ) : (
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                              )}
                            </button>
                            <Link href={`/atlasbid/bids/${b.id}`}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all whitespace-nowrap">
                              Open
                              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9L9 3M9 3H5M9 3v4"/></svg>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
