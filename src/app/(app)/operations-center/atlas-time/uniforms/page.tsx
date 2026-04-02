"use client";

import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ItemOption  = { id: string; label: string };
type SizeVariant = { id: string; label: string };
type ColorVariant= { id: string; label: string };

type LedgerEntry = {
  id: string;
  transaction_type: "receipt" | "issuance" | "return" | "adjustment";
  quantity: number;
  unit_cost: number | null;
  total_cost: number | null;
  transaction_date: string;
  vendor_name: string | null;
  reference_number: string | null;
  notes: string | null;
  item_option_id: string;
  size_variant_id: string | null;
  color_variant_id: string | null;
  employee_id: string | null;
  at_field_options: { id: string; label: string } | null;
  size: { id: string; label: string } | null;
  color: { id: string; label: string } | null;
  employee: { id: string; first_name: string; last_name: string } | null;
};

type SummaryRow = {
  item_name: string;
  size_label: string | null;
  color_label: string | null;
  qty_on_hand: number;
  avg_unit_cost: number | null;
  inventory_value: number | null;
};

const inputCls = "border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#123b1f]/30 focus:border-[#123b1f] transition-all w-full";

function fmt$(n: number | null) {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${parseInt(m)}/${parseInt(d)}/${y}`;
}

function typeBadge(type: string) {
  const cfg: Record<string, string> = {
    receipt:    "bg-green-100 text-green-800",
    issuance:   "bg-blue-100 text-blue-800",
    return:     "bg-amber-100 text-amber-800",
    adjustment: "bg-gray-100 text-gray-700",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${cfg[type] ?? "bg-gray-100 text-gray-700"}`}>
      {type}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

type IssuedRow = {
  item: string;
  size: string | null;
  color: string | null;
  qty: number;
  total_cost: number;
  employee_count: number;
};

export default function UniformsPage() {
  const [view, setView]           = useState<"issued" | "inventory" | "ledger">("issued");
  const [ledger, setLedger]       = useState<LedgerEntry[]>([]);
  const [summary, setSummary]     = useState<SummaryRow[]>([]);
  const [issued, setIssued]       = useState<IssuedRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");

  // Catalog for new entry form
  const [items,   setItems]   = useState<ItemOption[]>([]);
  const [variants, setVariants] = useState<Record<string, { sizes: SizeVariant[]; colors: ColorVariant[] }>>({});

  // New receipt form
  const [showForm,      setShowForm]      = useState(false);
  const [formItem,      setFormItem]      = useState("");
  const [formSize,      setFormSize]      = useState("");
  const [formColor,     setFormColor]     = useState("");
  const [formQty,       setFormQty]       = useState("1");
  const [formUnitCost,  setFormUnitCost]  = useState("");
  const [formDate,      setFormDate]      = useState(new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }));
  const [formVendor,    setFormVendor]    = useState("");
  const [formRef,       setFormRef]       = useState("");
  const [formNotes,     setFormNotes]     = useState("");
  const [formSaving,    setFormSaving]    = useState(false);
  const [formError,     setFormError]     = useState("");

  // Edit state
  const [editId,       setEditId]       = useState<string | null>(null);
  const [editVendor,   setEditVendor]   = useState("");
  const [editRef,      setEditRef]      = useState("");
  const [editNotes,    setEditNotes]    = useState("");
  const [editDate,     setEditDate]     = useState("");
  const [editUnitCost, setEditUnitCost] = useState("");
  const [editSaving,   setEditSaving]   = useState(false);

  // ── Load data ────────────────────────────────────────────────────────────────

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [ledgerRes, summaryRes, issuedRes, optsRes, varRes] = await Promise.all([
        fetch("/api/atlas-time/uniform-inventory"),
        fetch("/api/atlas-time/uniform-inventory/summary"),
        fetch("/api/atlas-time/uniform-inventory/issued-summary"),
        fetch("/api/atlas-time/field-options?field_key=uniform_items"),
        fetch("/api/atlas-time/uniform-variants"),
      ]);
      const [lj, sj, ij, oj, vj] = await Promise.all([ledgerRes.json(), summaryRes.json(), issuedRes.json(), optsRes.json(), varRes.json()]);
      setLedger(lj.entries ?? []);
      setSummary(sj.summary ?? []);
      setIssued(ij.summary ?? []);
      setItems(oj.options ?? []);

      // Build variant map: item_option_id → {sizes, colors}
      const vmap: Record<string, { sizes: SizeVariant[]; colors: ColorVariant[] }> = {};
      for (const v of vj.variants ?? []) {
        if (!vmap[v.item_option_id]) vmap[v.item_option_id] = { sizes: [], colors: [] };
        if (v.variant_type === "size")  vmap[v.item_option_id].sizes.push(v);
        if (v.variant_type === "color") vmap[v.item_option_id].colors.push(v);
      }
      setVariants(vmap);
    } catch {
      setError("Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  // ── Form helpers ─────────────────────────────────────────────────────────────

  const selectedItemOpt = items.find(i => i.id === formItem);
  const sizeOpts   = formItem ? (variants[formItem]?.sizes  ?? []) : [];
  const colorOpts  = formItem ? (variants[formItem]?.colors ?? []) : [];

  function resetForm() {
    setFormItem(""); setFormSize(""); setFormColor("");
    setFormQty("1"); setFormUnitCost(""); setFormDate(new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }));
    setFormVendor(""); setFormRef(""); setFormNotes("");
    setFormError("");
  }

  async function submitReceipt() {
    if (!formItem) { setFormError("Select a uniform item"); return; }
    const qty = parseInt(formQty);
    if (!qty || qty <= 0) { setFormError("Quantity must be > 0"); return; }
    setFormSaving(true);
    setFormError("");
    try {
      const res = await fetch("/api/atlas-time/uniform-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_type: "receipt",
          item_option_id:   formItem,
          size_variant_id:  formSize  || null,
          color_variant_id: formColor || null,
          quantity:         qty,
          unit_cost:        formUnitCost ? Number(formUnitCost) : null,
          total_cost:       formUnitCost ? Number(formUnitCost) * qty : null,
          transaction_date: formDate,
          vendor_name:      formVendor || null,
          reference_number: formRef    || null,
          notes:            formNotes  || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save");
      resetForm();
      setShowForm(false);
      loadAll();
    } catch (e: any) {
      setFormError(e.message ?? "Failed to save");
    } finally {
      setFormSaving(false);
    }
  }

  function startEdit(row: LedgerEntry) {
    setEditId(row.id);
    setEditVendor(row.vendor_name ?? "");
    setEditRef(row.reference_number ?? "");
    setEditNotes(row.notes ?? "");
    setEditDate(row.transaction_date);
    setEditUnitCost(row.unit_cost != null ? String(row.unit_cost) : "");
  }

  async function saveEdit(id: string) {
    setEditSaving(true);
    try {
      const res = await fetch(`/api/atlas-time/uniform-inventory/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor_name:      editVendor   || null,
          reference_number: editRef      || null,
          notes:            editNotes    || null,
          transaction_date: editDate,
          unit_cost:        editUnitCost ? Number(editUnitCost) : null,
        }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      setEditId(null);
      loadAll();
    } catch (e: any) {
      alert(e.message ?? "Failed to save");
    } finally {
      setEditSaving(false);
    }
  }

  async function voidEntry(id: string) {
    if (!confirm("Void this entry? This cannot be undone.")) return;
    await fetch(`/api/atlas-time/uniform-inventory/${id}`, { method: "DELETE" });
    loadAll();
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const totalValue = summary.reduce((s, r) => s + (r.inventory_value ?? 0), 0);
  const totalUnits = summary.reduce((s, r) => s + r.qty_on_hand, 0);

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f0f4f0]">
      {/* Header */}
      <div className="px-4 md:px-8 py-6" style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Uniforms Inventory</h1>
            <p className="text-white/50 text-sm mt-0.5">Track stock, costs, and issuances</p>
          </div>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add Receipt
          </button>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto space-y-4">

        {/* Add Receipt form */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-800">New Receipt</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {/* Item */}
              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Uniform Item *</label>
                <select value={formItem} onChange={e => { setFormItem(e.target.value); setFormSize(""); setFormColor(""); }} className={inputCls}>
                  <option value="">— Select item —</option>
                  {items.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
                </select>
              </div>
              {/* Size */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Size</label>
                <select value={formSize} onChange={e => setFormSize(e.target.value)} className={inputCls} disabled={!sizeOpts.length}>
                  <option value="">{sizeOpts.length ? "— Any —" : "N/A"}</option>
                  {sizeOpts.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              {/* Color */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Color</label>
                <select value={formColor} onChange={e => setFormColor(e.target.value)} className={inputCls} disabled={!colorOpts.length}>
                  <option value="">{colorOpts.length ? "— Any —" : "N/A"}</option>
                  {colorOpts.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              {/* Qty */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Qty *</label>
                <input type="number" min="1" value={formQty} onChange={e => setFormQty(e.target.value)} className={inputCls} />
              </div>
              {/* Unit cost */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Unit Cost</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input type="number" step="0.01" min="0" value={formUnitCost} onChange={e => setFormUnitCost(e.target.value)} className={inputCls + " pl-7"} placeholder="0.00" />
                </div>
              </div>
              {/* Total preview */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Total Cost</label>
                <div className="border border-gray-100 rounded-xl px-3 py-2 text-sm bg-gray-50 text-gray-600">
                  {formUnitCost && formQty ? fmt$(Number(formUnitCost) * Number(formQty)) : "—"}
                </div>
              </div>
              {/* Date */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Date *</label>
                <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className={inputCls} />
              </div>
              {/* Vendor */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Vendor</label>
                <input type="text" value={formVendor} onChange={e => setFormVendor(e.target.value)} className={inputCls} placeholder="e.g. SanMar" />
              </div>
              {/* PO / Ref */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">PO / Reference #</label>
                <input type="text" value={formRef} onChange={e => setFormRef(e.target.value)} className={inputCls} />
              </div>
              {/* Notes */}
              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</label>
                <input type="text" value={formNotes} onChange={e => setFormNotes(e.target.value)} className={inputCls} />
              </div>
            </div>
            {formError && <p className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={submitReceipt} disabled={formSaving}
                className="px-4 py-2 rounded-xl bg-[#123b1f] hover:bg-[#1a5c2e] text-white text-sm font-semibold transition-colors disabled:opacity-60">
                {formSaving ? "Saving…" : "Save Receipt"}
              </button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-gray-600 hover:bg-gray-100 text-sm font-semibold transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Stats */}
        {!loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Items in Catalog", value: String(items.length) },
              { label: "Total Issued to Employees", value: String(issued.reduce((s, r) => s + r.qty, 0)) },
              { label: "Units on Hand", value: String(totalUnits) },
              { label: "Inventory Value", value: fmt$(totalValue) },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
                <p className="text-xs text-gray-400 font-medium">{s.label}</p>
                <p className="text-xl font-bold text-gray-800 mt-0.5">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 bg-white rounded-xl border border-gray-100 shadow-sm p-1 w-fit">
          {([
            { key: "issued",    label: "Issued to Employees" },
            { key: "inventory", label: "On Hand" },
            { key: "ledger",    label: "Ledger" },
          ] as const).map(v => (
            <button key={v.key} onClick={() => setView(v.key)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${view === v.key ? "bg-[#123b1f] text-white" : "text-gray-500 hover:text-gray-700"}`}>
              {v.label}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#123b1f] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* ── ISSUED TO EMPLOYEES view ── */}
        {!loading && view === "issued" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Item</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Size</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Color</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Qty Issued</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Cost</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Employees</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {issued.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">No uniform items found in employee profiles.</td></tr>
                  )}
                  {issued.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-800">{row.item}</td>
                      <td className="px-4 py-3 text-gray-600">{row.size ?? <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-gray-600">{row.color ?? <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800 tabular-nums">{row.qty}</td>
                      <td className="px-4 py-3 text-right text-gray-600 tabular-nums">{row.total_cost > 0 ? fmt$(row.total_cost) : <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-right text-gray-500 tabular-nums">{row.employee_count}</td>
                    </tr>
                  ))}
                </tbody>
                {issued.length > 0 && (
                  <tfoot className="border-t border-gray-200 bg-gray-50">
                    <tr>
                      <td colSpan={3} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-800 tabular-nums">{issued.reduce((s, r) => s + r.qty, 0)}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-800 tabular-nums">{fmt$(issued.reduce((s, r) => s + r.total_cost, 0))}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* ── ON HAND (inventory) view ── */}
        {!loading && view === "inventory" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Item</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Size</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Color</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">On Hand</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Avg Cost</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {summary.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">No inventory yet. Add a receipt to get started.</td></tr>
                  )}
                  {summary.map((row, i) => (
                    <tr key={i} className={`hover:bg-gray-50/50 ${row.qty_on_hand < 0 ? "bg-red-50/40" : ""}`}>
                      <td className="px-4 py-3 font-medium text-gray-800">{row.item_name}</td>
                      <td className="px-4 py-3 text-gray-600">{row.size_label ?? <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-gray-600">{row.color_label ?? <span className="text-gray-300">—</span>}</td>
                      <td className={`px-4 py-3 text-right font-semibold tabular-nums ${row.qty_on_hand < 0 ? "text-red-600" : row.qty_on_hand === 0 ? "text-gray-400" : "text-gray-800"}`}>
                        {row.qty_on_hand}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 tabular-nums">{fmt$(row.avg_unit_cost)}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800 tabular-nums">{fmt$(row.inventory_value)}</td>
                    </tr>
                  ))}
                </tbody>
                {summary.length > 0 && (
                  <tfoot className="border-t border-gray-200 bg-gray-50">
                    <tr>
                      <td colSpan={3} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-800 tabular-nums">{totalUnits}</td>
                      <td />
                      <td className="px-4 py-3 text-right font-bold text-gray-800 tabular-nums">{fmt$(totalValue)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* ── LEDGER view ── */}
        {!loading && view === "ledger" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Item</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Size</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Color</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Qty</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit Cost</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Employee</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Vendor / Ref</th>
                    <th className="px-4 py-3 w-16" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {ledger.length === 0 && (
                    <tr><td colSpan={11} className="px-4 py-12 text-center text-sm text-gray-400">No entries yet.</td></tr>
                  )}
                  {ledger.map(row => {
                    const isEditing = editId === row.id;
                    const isReceipt = row.transaction_type === "receipt";
                    return (
                      <tr key={row.id} className={`hover:bg-gray-50/50 transition-colors ${isEditing ? "bg-blue-50/30" : ""}`}>
                        <td className="px-4 py-3">{typeBadge(row.transaction_type)}</td>
                        <td className="px-4 py-3 text-gray-600 tabular-nums whitespace-nowrap">
                          {isEditing && isReceipt
                            ? <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-32" />
                            : fmtDate(row.transaction_date)}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-800">{row.at_field_options?.label ?? "—"}</td>
                        <td className="px-4 py-3 text-gray-600">{row.size?.label ?? <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3 text-gray-600">{row.color?.label ?? <span className="text-gray-300">—</span>}</td>
                        <td className={`px-4 py-3 text-right font-semibold tabular-nums ${row.quantity < 0 ? "text-blue-600" : "text-gray-800"}`}>
                          {row.quantity > 0 ? `+${row.quantity}` : row.quantity}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 tabular-nums">
                          {isEditing && isReceipt
                            ? <div className="relative"><span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span><input type="number" step="0.01" value={editUnitCost} onChange={e => setEditUnitCost(e.target.value)} className="border border-gray-200 rounded-lg pl-5 pr-2 py-1 text-xs w-24" /></div>
                            : fmt$(row.unit_cost)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 tabular-nums">{fmt$(row.total_cost)}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {row.employee ? `${row.employee.last_name}, ${row.employee.first_name}` : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {isEditing && isReceipt ? (
                            <div className="space-y-1">
                              <input type="text" placeholder="Vendor" value={editVendor} onChange={e => setEditVendor(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-full" />
                              <input type="text" placeholder="Ref #" value={editRef} onChange={e => setEditRef(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-full" />
                            </div>
                          ) : (
                            <>
                              {row.vendor_name && <div>{row.vendor_name}</div>}
                              {row.reference_number && <div className="text-gray-400">{row.reference_number}</div>}
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <div className="flex gap-1">
                              <button onClick={() => saveEdit(row.id)} disabled={editSaving}
                                className="text-[10px] font-semibold text-white bg-[#123b1f] hover:bg-[#1a5c2e] px-2 py-1 rounded-md disabled:opacity-60">
                                {editSaving ? "…" : "Save"}
                              </button>
                              <button onClick={() => setEditId(null)} className="text-[10px] font-semibold text-gray-500 hover:text-gray-700 px-2 py-1 rounded-md hover:bg-gray-100">✕</button>
                            </div>
                          ) : isReceipt ? (
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                              <button onClick={() => startEdit(row)} className="text-gray-400 hover:text-gray-600 p-1 rounded transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                              </button>
                              <button onClick={() => voidEntry(row.id)} className="text-red-300 hover:text-red-500 p-1 rounded transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
