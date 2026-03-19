"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────────
type Division = { id: string; name: string; is_active?: boolean | null };

type InventoryMaterial = {
  id: string;
  name: string;
  display_name?: string | null;
  unit?: string | null;
  inventory_unit?: string | null;
  vendor?: string | null;
  sku?: string | null;
  division_id?: string | null;
  is_active?: boolean | null;
};

type SummaryRow = {
  material_id: string;
  material_name: string;
  location_id: string | null;
  location_name: string | null;
  qty_on_hand: number;
  avg_unit_cost: number;
  inventory_value: number;
  negative_flag: boolean;
  inventory_unit: string | null;
  inventory_enabled: boolean;
  division_id?: string | null;
};

type LedgerRow = {
  id: string;
  material_id: string;
  division_id?: string | null;
  quantity: number;
  unit_cost: number | null;
  total_cost: number | null;
  transaction_type: string;
  transaction_date: string;
  reference_number: string | null;
  notes: string | null;
  invoiced_final?: boolean | null;
  vendor_name?: string | null;
  materials?: { id?: string; name?: string; display_name?: string; inventory_unit?: string | null };
  inventory_locations?: { id?: string; name?: string } | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const UNITS = [
  { label: "yd(s)", value: "yd" },
  { label: "ea", value: "ea" },
  { label: "lin ft", value: "lf" },
  { label: "sq ft", value: "sqft" },
  { label: "tons", value: "ton" },
  { label: "bags", value: "bag" },
  { label: "gallons", value: "gal" },
  { label: "roll", value: "roll" },
  { label: "flat", value: "flat" },
];

function money(n: number) {
  return (Number(n) || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function fmtQty(n: number) {
  return Number((Number(n) || 0).toFixed(2)).toString();
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  const [y, m, d] = String(v).slice(0, 10).split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
}

function titleize(s: string) {
  return String(s || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

const today = () => new Date().toISOString().slice(0, 10);

// ── Page ───────────────────────────────────────────────────────────────────────
export default function InventoryPage() {
  // ── Data ──────────────────────────────────────────────────────────────────
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [activeDivisionId, setActiveDivisionId] = useState("");
  const [materials, setMaterials] = useState<InventoryMaterial[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ── Add receipt form ───────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [matSearch, setMatSearch] = useState("");
  const [matResults, setMatResults] = useState<InventoryMaterial[]>([]);
  const [showDrop, setShowDrop] = useState(false);
  const [selectedMatId, setSelectedMatId] = useState("");
  const [unit, setUnit] = useState("yd");
  const [unitLocked, setUnitLocked] = useState(false);
  const [qty, setQty] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [date, setDate] = useState(today);
  const [refNum, setRefNum] = useState("");
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [invoicedFinal, setInvoicedFinal] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [summarySearch, setSummarySearch] = useState("");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [noteModal, setNoteModal] = useState<string | null>(null);
  const [voidConfirm, setVoidConfirm] = useState<string | null>(null);

  const dropRef = useRef<HTMLDivElement>(null);

  // ── Load ───────────────────────────────────────────────────────────────────
  async function loadLookups() {
    const [dRes, mRes] = await Promise.all([
      fetch("/api/divisions", { cache: "no-store" }),
      fetch("/api/materials-search?limit=50", { cache: "no-store" }),
    ]);
    const dJson = await dRes.json();
    const mJson = await mRes.json();
    const divs: Division[] = (dJson?.divisions ?? dJson?.data ?? dJson ?? []).filter((d: any) => d?.is_active !== false);
    setDivisions(divs);
    if (!activeDivisionId && divs.length > 0) {
      const def = divs.find(d => d.name.toLowerCase() === "landscaping") ?? divs[0];
      setActiveDivisionId(def.id);
    }
    const mRows: InventoryMaterial[] = mJson?.data ?? mJson?.rows ?? mJson ?? [];
    setMaterials(Array.isArray(mRows) ? mRows.filter(m => m?.is_active !== false) : []);
  }

  async function loadData() {
    if (!activeDivisionId) return;
    setLoading(true);
    setError("");
    try {
      const [sRes, lRes] = await Promise.all([
        fetch(`/api/inventory/summary?division_id=${activeDivisionId}`, { cache: "no-store" }),
        fetch(`/api/inventory/ledger?division_id=${activeDivisionId}`, { cache: "no-store" }),
      ]);
      const sJson = await sRes.json();
      const lJson = await lRes.json();
      setSummary(Array.isArray(sJson?.data) ? sJson.data : []);
      setLedger(Array.isArray(lJson?.data) ? lJson.data : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load inventory.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadLookups(); }, []);
  useEffect(() => { loadData(); }, [activeDivisionId]);

  // Close dropdown on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (dropRef.current && e.target instanceof Node && !dropRef.current.contains(e.target)) setShowDrop(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // ── Material search ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!matSearch.trim()) { setMatResults(materials.slice(0, 20)); return; }
    const q = matSearch.toLowerCase();
    setMatResults(
      materials.filter(m => `${m.name} ${m.display_name ?? ""}`.toLowerCase().includes(q)).slice(0, 20)
    );
  }, [matSearch, materials]);

  function selectMaterial(m: InventoryMaterial) {
    const name = (m.display_name || m.name || "").trim();
    setSelectedMatId(m.id);
    setMatSearch(name);
    setShowDrop(false);
    const u = (m.inventory_unit || m.unit || "").trim();
    if (u) { setUnit(u); setUnitLocked(true); } else { setUnitLocked(false); }
    if (!vendor && m.vendor) setVendor(m.vendor);
  }

  function clearForm() {
    setEditingId(null);
    setSelectedMatId("");
    setMatSearch("");
    setUnit("yd");
    setUnitLocked(false);
    setQty("");
    setTotalCost("");
    setDate(today());
    setRefNum("");
    setVendor("");
    setNotes("");
    setInvoicedFinal(false);
  }

  function startEdit(row: LedgerRow) {
    setEditingId(row.id);
    setSelectedMatId(row.material_id || "");
    const name = row.materials?.display_name || row.materials?.name || "";
    setMatSearch(name);
    setUnit(row.materials?.inventory_unit || "yd");
    setUnitLocked(false);
    setQty(String(row.quantity || ""));
    setTotalCost(String(row.total_cost ?? ""));
    setDate(String(row.transaction_date || "").slice(0, 10));
    setRefNum(row.reference_number || "");
    setVendor(row.vendor_name || "");
    setNotes(row.notes || "");
    setInvoicedFinal(Boolean(row.invoiced_final));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!matSearch.trim()) { setError("Material is required."); return; }
    if (Number(qty) <= 0) { setError("Quantity must be greater than 0."); return; }
    setSaving(true);
    setError("");
    try {
      let res: Response;
      if (editingId) {
        const q = Number(qty);
        const tc = Number(totalCost);
        res = await fetch(`/api/inventory/receipt/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quantity: q, total_cost: tc,
            unit_cost: q > 0 ? Number((tc / q).toFixed(4)) : 0,
            transaction_date: date,
            reference_number: refNum.trim() || null,
            vendor_name: vendor.trim() || null,
            notes: notes.trim() || null,
            invoiced_final: invoicedFinal,
          }),
        });
      } else {
        res = await fetch("/api/inventory/receipt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            material_id: selectedMatId || null,
            material_name: matSearch.trim(),
            inventory_unit: unit,
            quantity: Number(qty),
            total_cost: Number(totalCost),
            transaction_date: date,
            reference_number: refNum.trim() || null,
            vendor_name: vendor.trim() || null,
            notes: notes.trim() || null,
            invoiced_final: invoicedFinal,
            division_id: activeDivisionId || null,
          }),
        });
      }
      if (!res.ok) { const j = await res.json().catch(() => null); throw new Error(j?.error || "Failed to save."); }
      clearForm();
      await loadData();
    } catch (e: any) {
      setError(e?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleVoid(id: string) {
    try {
      const res = await fetch(`/api/inventory/receipt/${id}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json().catch(() => null); throw new Error(j?.error || "Failed to void."); }
      if (editingId === id) clearForm();
      await loadData();
    } catch (e: any) {
      setError(e?.message || "Failed to void transaction.");
    }
  }

  // ── Computed ───────────────────────────────────────────────────────────────
  const activeDivision = divisions.find(d => d.id === activeDivisionId);

  const filteredSummary = useMemo(() => {
    const q = summarySearch.toLowerCase();
    return summary
      .filter(r => !q || `${r.material_name} ${r.location_name ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => b.inventory_value - a.inventory_value);
  }, [summary, summarySearch]);

  const filteredLedger = useMemo(() => {
    const q = ledgerSearch.toLowerCase();
    return ledger.filter(r => {
      const t = `${r.materials?.display_name ?? r.materials?.name ?? ""} ${r.transaction_type} ${r.reference_number ?? ""} ${r.vendor_name ?? ""} ${r.notes ?? ""}`.toLowerCase();
      return !q || t.includes(q);
    });
  }, [ledger, ledgerSearch]);

  const totalValue = filteredSummary.reduce((s, r) => s + (r.inventory_value || 0), 0);
  const negCount = filteredSummary.filter(r => r.negative_flag).length;
  const openReceipts = filteredLedger.filter(r => r.transaction_type === "receipt" && !r.invoiced_final).length;

  const unitCostCalc = Number(qty) > 0 ? Number(totalCost) / Number(qty) : 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f6f8f6]">
      {/* Header */}
      <div className="bg-[#123b1f] px-8 py-4 flex items-center justify-between">
        <div className="text-2xl font-extrabold text-white uppercase tracking-[0.2em]">Inventory</div>
        <Link href="/operations-center" className="text-white/60 hover:text-white text-sm">← Operations Center</Link>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">

        {/* Division tabs */}
        <div className="flex gap-2 flex-wrap">
          {divisions.map(d => (
            <button key={d.id} onClick={() => setActiveDivisionId(d.id)}
              className={`px-5 py-2 rounded-full text-sm font-semibold border transition-colors ${
                d.id === activeDivisionId
                  ? "bg-[#123b1f] text-white border-[#123b1f]"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}>
              {d.name}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Value", value: money(totalValue), color: "text-[#123b1f]" },
            { label: "Items Tracked", value: filteredSummary.length, color: "text-gray-900" },
            { label: "Open Receipts", value: openReceipts, color: openReceipts > 0 ? "text-amber-600" : "text-gray-900" },
            { label: "Negative Items", value: negCount, color: negCount > 0 ? "text-red-600" : "text-gray-900" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-[#d7e6db] shadow-sm px-5 py-4">
              <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">{s.label}</div>
              <div className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError("")} className="underline ml-4">dismiss</button>
          </div>
        )}

        {/* Main grid: form left, summary right */}
        <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6 items-start">

          {/* ── Add Receipt Form ───────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-[#d7e6db] shadow-sm overflow-hidden">
            <div className={`px-5 py-4 border-b ${editingId ? "bg-amber-50" : "bg-gray-50"}`}>
              <h2 className="font-bold text-gray-900 text-base">
                {editingId ? "✎ Edit Receipt" : "Add Receipt"}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {editingId ? "Update the selected receipt below." : `Add incoming stock to ${activeDivision?.name || "inventory"}.`}
              </p>
            </div>

            <div className="px-5 py-5 space-y-4">
              {/* Material search */}
              <div ref={dropRef} className="relative">
                <label className="block text-xs font-semibold text-gray-500 mb-1">Material *</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Search registered materials…"
                  value={matSearch}
                  onChange={e => { setMatSearch(e.target.value); setSelectedMatId(""); setShowDrop(true); }}
                  onFocus={() => setShowDrop(true)}
                />
                {showDrop && matResults.length > 0 && (
                  <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-52 overflow-y-auto">
                    {matResults.map(m => (
                      <button key={m.id} onClick={() => selectMaterial(m)}
                        className="w-full text-left px-3 py-2.5 hover:bg-green-50 text-sm border-b last:border-0">
                        <div className="font-medium text-gray-900">{m.display_name || m.name}</div>
                        <div className="text-xs text-gray-400">
                          {m.vendor ? `${m.vendor} · ` : ""}Unit: {m.inventory_unit || m.unit || "—"}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Qty + Unit + Cost */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Qty *</label>
                  <input type="number" min="0" step="any"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="0" value={qty} onChange={e => setQty(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Unit</label>
                  <select
                    className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${unitLocked ? "bg-gray-100 text-gray-500" : ""}`}
                    value={unit} disabled={unitLocked} onChange={e => setUnit(e.target.value)}>
                    {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Total Cost</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input type="number" min="0" step="0.01"
                      className="w-full border border-gray-200 rounded-lg pl-6 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="0.00" value={totalCost} onChange={e => setTotalCost(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Unit cost display */}
              {unitCostCalc > 0 && (
                <div className="text-xs text-gray-400 -mt-1">
                  Unit cost: <span className="font-semibold text-gray-600">{money(unitCostCalc)}/{unit}</span>
                </div>
              )}

              {/* Date + Reference */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Date</label>
                  <input type="date"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    value={date} onChange={e => setDate(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Reference #</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Invoice / PO" value={refNum} onChange={e => setRefNum(e.target.value)} />
                </div>
              </div>

              {/* Vendor + Final */}
              <div className="grid grid-cols-2 gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Vendor</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Optional" value={vendor} onChange={e => setVendor(e.target.value)} />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer pb-2">
                  <button type="button" onClick={() => setInvoicedFinal(v => !v)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${invoicedFinal ? "bg-green-500" : "bg-gray-300"}`}>
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${invoicedFinal ? "translate-x-4" : "translate-x-1"}`} />
                  </button>
                  Final invoice
                </label>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Notes</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Optional" value={notes} onChange={e => setNotes(e.target.value)} />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button onClick={handleSubmit} disabled={saving || !matSearch.trim() || Number(qty) <= 0}
                  className="flex-1 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white font-bold text-sm py-2.5 rounded-lg shadow-sm transition-colors disabled:opacity-40">
                  {saving ? "Saving…" : editingId ? "Save Changes" : "Add Receipt"}
                </button>
                {editingId && (
                  <button onClick={clearForm} className="px-4 py-2.5 text-sm border border-gray-200 rounded-lg text-gray-500 hover:text-gray-700 hover:border-gray-400 transition-colors">
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── Inventory Summary ─────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-[#d7e6db] shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-bold text-gray-900 text-base">Inventory Summary</h2>
                <p className="text-xs text-gray-500 mt-0.5">On-hand position for {activeDivision?.name || "—"}</p>
              </div>
              <input
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Search…" value={summarySearch} onChange={e => setSummarySearch(e.target.value)} />
            </div>

            {loading ? (
              <div className="px-5 py-10 text-sm text-gray-400 text-center">Loading…</div>
            ) : filteredSummary.length === 0 ? (
              <div className="px-5 py-10 text-sm text-gray-400 text-center">
                No inventory on hand for this division yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50/60 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <th className="text-left px-4 py-3">Material</th>
                      <th className="text-left px-4 py-3">Location</th>
                      <th className="text-right px-4 py-3">Qty On Hand</th>
                      <th className="text-right px-4 py-3">Avg Cost</th>
                      <th className="text-right px-4 py-3">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSummary.map(row => (
                      <tr key={`${row.material_id}_${row.location_id ?? "none"}`}
                        className={`border-b last:border-0 ${row.negative_flag ? "bg-red-50" : ""}`}>
                        <td className="px-4 py-3 font-medium text-gray-900">{row.material_name}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{row.location_name || "—"}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={row.negative_flag ? "text-red-600 font-semibold" : ""}>
                            {fmtQty(row.qty_on_hand)} {row.inventory_unit || ""}
                          </span>
                          {row.negative_flag && <span className="ml-1 text-[10px] text-red-500 font-bold">LOW</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">{money(row.avg_unit_cost)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{money(row.inventory_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-gray-50">
                      <td colSpan={4} className="px-4 py-3 font-semibold text-gray-700 text-sm">Total</td>
                      <td className="px-4 py-3 text-right font-bold text-[#123b1f]">{money(totalValue)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── Ledger ────────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-[#d7e6db] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-bold text-gray-900 text-base">Transaction Ledger</h2>
              <p className="text-xs text-gray-500 mt-0.5">All receipts and usage for {activeDivision?.name || "—"}</p>
            </div>
            <input
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Search…" value={ledgerSearch} onChange={e => setLedgerSearch(e.target.value)} />
          </div>

          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="sticky top-0 z-10 bg-gray-50 border-b">
                <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Material</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-right px-4 py-3">Qty</th>
                  <th className="text-right px-4 py-3">Unit Cost</th>
                  <th className="text-right px-4 py-3">Total</th>
                  <th className="text-left px-4 py-3">Vendor</th>
                  <th className="text-left px-4 py-3">Reference</th>
                  <th className="text-center px-4 py-3">Final</th>
                  <th className="text-center px-4 py-3">Notes</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLedger.length === 0 ? (
                  <tr><td colSpan={11} className="px-4 py-10 text-sm text-gray-400 text-center">No transactions found.</td></tr>
                ) : filteredLedger.map(row => {
                  const matName = row.materials?.display_name || row.materials?.name || "—";
                  const rowUnit = row.materials?.inventory_unit || "";
                  return (
                    <tr key={row.id} className={`border-b last:border-0 hover:bg-gray-50 transition-colors ${editingId === row.id ? "bg-amber-50" : ""}`}>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(row.transaction_date)}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{matName}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          row.transaction_type === "receipt" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                        }`}>{titleize(row.transaction_type)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">{fmtQty(row.quantity)} {rowUnit}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{row.unit_cost != null ? money(row.unit_cost) : "—"}</td>
                      <td className="px-4 py-3 text-right font-medium">{row.total_cost != null ? money(row.total_cost) : "—"}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{row.vendor_name || "—"}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{row.reference_number || "—"}</td>
                      <td className="px-4 py-3 text-center">
                        {row.invoiced_final
                          ? <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-green-600 text-white text-[10px] font-bold">✓</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row.notes
                          ? <button onClick={() => setNoteModal(row.notes)} className="inline-flex items-center justify-center w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs">✎</button>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {!row.invoiced_final && (
                            <button onClick={() => startEdit(row)} className="text-xs font-semibold text-blue-600 hover:underline">Edit</button>
                          )}
                          <button onClick={() => setVoidConfirm(row.id)} className="text-xs font-semibold text-red-500 hover:underline">Void</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Void confirm modal */}
      {voidConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-[380px]">
            <h3 className="font-bold text-gray-900 mb-2">Void Transaction?</h3>
            <p className="text-sm text-gray-500 mb-5">This will reverse the transaction and update your on-hand qty.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setVoidConfirm(null)} className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:border-gray-400">Cancel</button>
              <button onClick={() => { handleVoid(voidConfirm); setVoidConfirm(null); }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-sm">Void</button>
            </div>
          </div>
        </div>
      )}

      {/* Note modal */}
      {noteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-[420px] max-w-full">
            <h3 className="font-bold text-gray-900 mb-3">Notes</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{noteModal}</p>
            <div className="mt-5 flex justify-end">
              <button onClick={() => setNoteModal(null)} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
