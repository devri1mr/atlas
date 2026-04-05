"use client";

import { useEffect, useState } from "react";
import { nextPaycheckDate, fmtPaycheckDate, PayPeriodSettings } from "@/lib/atPayPeriod";

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
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function fmtN(n: number) {
  return n.toLocaleString("en-US");
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

type ConsumptionLine = {
  item_name: string;
  size_label: string | null;
  color_label: string | null;
  start_qty: number;
  receipts_qty: number;
  end_qty: number;
  consumed_qty: number;
  avg_cost: number | null;
  consumed_value: number | null;
};

type Consumption = {
  from_date: string;
  to_date: string;
  total_consumed_value: number;
  lines: ConsumptionLine[];
};

type CountItem = {
  item_name: string;
  size_label: string | null;
  color_label: string | null;
  item_option_id: string | null;
  size_variant_id: string | null;
  color_variant_id: string | null;
  current_on_hand: number;
  actual_qty: string;
  avg_cost: number | null;
};

type Employee = { id: string; first_name: string; last_name: string };

type IssueScheduleItem = {
  deduction_date:     string;
  amount:             number;
  reimbursement_date: string | null;
};

type IssueResult = {
  unit_cost: number | null;
  schedule:  IssueScheduleItem[];
  // legacy single-entry fields (still returned by API)
  deduction_paycheck_date:     string | null;
  reimbursement_paycheck_date: string | null;
};

export default function UniformsPage() {
  const [view, setView]           = useState<"inventory" | "orders" | "consumption" | "ledger">("inventory");
  const [ledger, setLedger]       = useState<LedgerEntry[]>([]);
  const [summary, setSummary]     = useState<SummaryRow[]>([]);
  const [issued, setIssued]       = useState<IssuedRow[]>([]); // kept for future use
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [employees,   setEmployees]   = useState<Employee[]>([]);
  const [paySettings, setPaySettings] = useState<PayPeriodSettings | null>(null);

  // Monthly count
  const [showCount,      setShowCount]      = useState(false);
  const [countDate,      setCountDate]      = useState("");
  const [countNotes,     setCountNotes]     = useState("");
  const [countItems,     setCountItems]     = useState<CountItem[]>([]);
  const [countSaving,    setCountSaving]    = useState(false);
  const [countError,     setCountError]     = useState("");
  const [consumption,    setConsumption]    = useState<Consumption | null>(null);
  const [consumptionLoading, setConsumptionLoading] = useState(false);

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

  // Issue uniform form
  const [showIssue,       setShowIssue]       = useState(false);
  const [issueMode,       setIssueMode]       = useState<"inventory" | "manual">("inventory");
  const [issueEmployee,   setIssueEmployee]   = useState("");
  const [issueItem,       setIssueItem]       = useState("");
  const [issueSize,       setIssueSize]       = useState("");
  const [issueColor,      setIssueColor]      = useState("");
  const [issueQty,        setIssueQty]        = useState("1");
  const [issueUnitCost,   setIssueUnitCost]   = useState("");
  const [issueDate,       setIssueDate]       = useState(new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }));
  const [issueType,       setIssueType]       = useState<"company_issued" | "team_member_purchase">("company_issued");
  const [issueManualItem, setIssueManualItem] = useState("");
  const [issueManualSize, setIssueManualSize] = useState("");
  const [issueManualColor,setIssueManualColor]= useState("");
  const [issueSplit,      setIssueSplit]      = useState(false);
  const [issueSplitCount, setIssueSplitCount] = useState("2");
  const [issueSaving,     setIssueSaving]     = useState(false);
  const [issueError,      setIssueError]      = useState("");
  const [issueResult,     setIssueResult]     = useState<IssueResult | null>(null);

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
      const [ledgerRes, summaryRes, issuedRes, optsRes, varRes, empRes, settingsRes] = await Promise.all([
        fetch("/api/atlas-time/uniform-inventory"),
        fetch("/api/atlas-time/uniform-inventory/summary"),
        fetch("/api/atlas-time/uniform-inventory/issued-summary"),
        fetch("/api/atlas-time/field-options?field_key=uniform_items"),
        fetch("/api/atlas-time/uniform-variants"),
        fetch("/api/atlas-time/employees?active=true"),
        fetch("/api/atlas-time/settings"),
      ]);
      const [lj, sj, ij, oj, vj, ej, stj] = await Promise.all([ledgerRes.json(), summaryRes.json(), issuedRes.json(), optsRes.json(), varRes.json(), empRes.json(), settingsRes.json()]);
      setLedger(lj.entries ?? []);
      setSummary(sj.summary ?? []);
      setIssued(ij.summary ?? []);
      setItems(oj.options ?? []);
      setEmployees((ej.employees ?? []).sort((a: Employee, b: Employee) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name)));
      if (stj.settings) {
        setPaySettings({
          pay_cycle:              stj.settings.pay_cycle              ?? "weekly",
          payday_day_of_week:     stj.settings.payday_day_of_week     ?? 5,
          pay_period_start_day:   stj.settings.pay_period_start_day   ?? 1,
          pay_period_anchor_date: stj.settings.pay_period_anchor_date ?? null,
        });
      }

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

  // ── Monthly count helpers ────────────────────────────────────────────────────

  function openCount(summaryRows: SummaryRow[]) {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    setCountDate(today);
    setCountNotes("");
    setCountError("");
    const rows = summaryRows
      .filter(r => r.item_name !== "Background Check")
      .map(r => ({
        item_name:        r.item_name,
        size_label:       r.size_label,
        color_label:      r.color_label,
        item_option_id:   null as string | null,
        size_variant_id:  null as string | null,
        color_variant_id: null as string | null,
        current_on_hand:  r.qty_on_hand,
        actual_qty:       String(Math.max(0, r.qty_on_hand)),
        avg_cost:         r.avg_unit_cost,
      }));
    setCountItems(rows);
    setShowCount(true);
  }

  async function submitCount() {
    if (!countDate) { setCountError("Count date is required"); return; }
    setCountSaving(true);
    setCountError("");
    try {
      const payload = {
        count_date: countDate,
        notes: countNotes || null,
        items: countItems.map(i => ({
          ...i,
          actual_qty: parseInt(i.actual_qty) || 0,
        })),
      };
      const res  = await fetch("/api/atlas-time/uniform-inventory/counts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save");
      setShowCount(false);
      await loadAll();
      await loadConsumption();
      setView("consumption");
    } catch (e: any) {
      setCountError(e.message ?? "Failed to save count");
    } finally {
      setCountSaving(false);
    }
  }

  async function loadConsumption() {
    setConsumptionLoading(true);
    try {
      const res  = await fetch("/api/atlas-time/uniform-inventory/counts");
      const json = await res.json();
      setConsumption(json.consumption ?? null);
    } catch { /* ignore */ } finally {
      setConsumptionLoading(false);
    }
  }

  useEffect(() => { loadConsumption(); }, []);

  // Auto-fill avg cost when item/size/color selected in issue form
  useEffect(() => {
    if (issueMode !== "inventory" || !issueItem) return;
    const itemLabel  = items.find(i => i.id === issueItem)?.label ?? "";
    const sizeLabel  = variants[issueItem]?.sizes.find(s => s.id === issueSize)?.label ?? null;
    const colorLabel = variants[issueItem]?.colors.find(c => c.id === issueColor)?.label ?? null;
    const match = summary.find(r =>
      r.item_name === itemLabel &&
      (r.size_label ?? null) === sizeLabel &&
      (r.color_label ?? null) === colorLabel
    );
    if (match?.avg_unit_cost != null) setIssueUnitCost(String(match.avg_unit_cost));
  }, [issueItem, issueSize, issueColor, issueMode]);

  function resetIssue() {
    setIssueEmployee(""); setIssueItem(""); setIssueSize(""); setIssueColor("");
    setIssueQty("1"); setIssueUnitCost(""); setIssueManualItem(""); setIssueManualSize(""); setIssueManualColor("");
    setIssueDate(new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }));
    setIssueType("company_issued"); setIssueMode("inventory");
    setIssueSplit(false); setIssueSplitCount("2");
    setIssueError(""); setIssueResult(null);
  }

  async function submitIssue() {
    if (!issueEmployee) { setIssueError("Select a team member"); return; }
    const qty = parseInt(issueQty);
    if (!qty || qty <= 0) { setIssueError("Quantity must be > 0"); return; }
    if (issueMode === "inventory" && !issueItem) { setIssueError("Select a uniform item"); return; }
    if (issueMode === "manual" && !issueManualItem.trim()) { setIssueError("Enter an item name"); return; }

    setIssueSaving(true); setIssueError("");
    try {
      const body: Record<string, any> = {
        employee_id:  issueEmployee,
        quantity:     qty,
        issue_date:   issueDate,
        issued_type:  issueType,
        unit_cost:    issueUnitCost ? Number(issueUnitCost) : undefined,
        split_checks: issueSplit ? Math.max(1, parseInt(issueSplitCount) || 1) : 1,
      };
      if (issueMode === "inventory") {
        body.item_option_id   = issueItem;
        body.size_variant_id  = issueSize  || null;
        body.color_variant_id = issueColor || null;
        body.item_label       = items.find(i => i.id === issueItem)?.label ?? "";
        body.size_label       = variants[issueItem]?.sizes.find(s => s.id === issueSize)?.label ?? null;
        body.color_label      = variants[issueItem]?.colors.find(c => c.id === issueColor)?.label ?? null;
      } else {
        body.manual_item_label = issueManualItem.trim();
        body.size_label        = issueManualSize.trim() || null;
        body.color_label       = issueManualColor.trim() || null;
      }
      const res  = await fetch("/api/atlas-time/uniform-inventory/issue", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to issue");
      setIssueResult({ schedule: json.schedule ?? [], unit_cost: json.unit_cost, deduction_paycheck_date: json.deduction_paycheck_date, reimbursement_paycheck_date: json.reimbursement_paycheck_date });
      await loadAll();
    } catch (e: any) {
      setIssueError(e.message ?? "Failed to issue");
    } finally {
      setIssueSaving(false);
    }
  }

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

  const SIZE_ORDER = ['XS','S','M','L','XL','2XL','3XL','4XL'];
  const sizeRank = (s: string | null | undefined) => { const i = SIZE_ORDER.indexOf(s ?? ''); return i === -1 ? 99 : i; };

  // Normalize rows like "Short Sleeve - Green" → group under "Short Sleeve" with color "Green"
  function normalizeRow(r: SummaryRow): SummaryRow {
    if (!r.color_label) {
      const m = r.item_name.match(/^(.+?) - ([A-Za-z]+)$/);
      if (m) return { ...r, item_name: m[1], color_label: m[2] };
    }
    return r;
  }

  const totalValue = summary.filter(r => r.item_name !== 'Background Check').reduce((s, r) => s + (r.inventory_value ?? 0), 0);
  const totalUnits = summary.filter(r => r.item_name !== 'Background Check').reduce((s, r) => s + r.qty_on_hand, 0);
  const itemsBelowZero = summary.filter(r => r.item_name !== 'Background Check' && r.qty_on_hand < 0).length;

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
          <div className="flex gap-2">
            <button
              onClick={() => { openCount(summary); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
              Monthly Count
            </button>
            <button
              onClick={() => { resetIssue(); setShowIssue(true); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
              Issue Uniform
            </button>
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add Receipt
            </button>
          </div>
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

        {/* Monthly Count form */}
        {showCount && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-gray-800">Monthly Count</h2>
                <p className="text-xs text-gray-400 mt-0.5">Enter actual quantities on hand. Atlas will auto-post adjustments and calculate consumption.</p>
              </div>
              <button onClick={() => setShowCount(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Count Date *</label>
                <input type="date" value={countDate} onChange={e => setCountDate(e.target.value)} className={inputCls} />
              </div>
              <div className="flex-[2]">
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</label>
                <input type="text" value={countNotes} onChange={e => setCountNotes(e.target.value)} className={inputCls} placeholder="e.g. March 2026 month-end" />
              </div>
            </div>
            {/* Item table */}
            <div className="border border-gray-100 rounded-xl overflow-hidden mb-4">
              <div className="grid grid-cols-[1fr_80px_80px_80px_80px] bg-gray-50 px-4 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide gap-3">
                <span>Item</span>
                <span className="text-center">Current</span>
                <span className="text-center">Actual</span>
                <span className="text-center">Diff</span>
                <span className="text-center">Avg Cost</span>
              </div>
              <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                {countItems.map((ci, idx) => {
                  const actual = parseInt(ci.actual_qty) || 0;
                  const diff = actual - ci.current_on_hand;
                  return (
                    <div key={idx} className="grid grid-cols-[1fr_80px_80px_80px_80px] px-4 py-2.5 gap-3 items-center">
                      <div>
                        <span className="text-sm font-medium text-gray-800">{ci.item_name}</span>
                        {(ci.size_label || ci.color_label) && (
                          <span className="text-xs text-gray-400 ml-2">{[ci.color_label, ci.size_label].filter(Boolean).join(" · ")}</span>
                        )}
                      </div>
                      <div className={`text-center text-sm font-semibold tabular-nums ${ci.current_on_hand < 0 ? 'text-red-500' : 'text-gray-600'}`}>{fmtN(ci.current_on_hand)}</div>
                      <input
                        type="number"
                        min="0"
                        value={ci.actual_qty}
                        onChange={e => setCountItems(prev => prev.map((r, i) => i === idx ? { ...r, actual_qty: e.target.value } : r))}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-sm text-center bg-white focus:outline-none focus:ring-1 focus:ring-green-600 w-full tabular-nums"
                      />
                      <div className={`text-center text-sm font-bold tabular-nums ${diff > 0 ? 'text-green-700' : diff < 0 ? 'text-red-600' : 'text-gray-300'}`}>
                        {diff === 0 ? '—' : (diff > 0 ? `+${fmtN(diff)}` : fmtN(diff))}
                      </div>
                      <div className="text-center text-xs text-gray-400 tabular-nums">{ci.avg_cost != null ? fmt$(ci.avg_cost) : '—'}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            {countError && <p className="mb-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{countError}</p>}
            <div className="flex gap-2">
              <button onClick={submitCount} disabled={countSaving}
                className="px-4 py-2 rounded-xl bg-[#123b1f] hover:bg-[#1a5c2e] text-white text-sm font-semibold transition-colors disabled:opacity-60">
                {countSaving ? "Saving…" : "Submit Count"}
              </button>
              <button onClick={() => setShowCount(false)} className="px-4 py-2 rounded-xl text-gray-600 hover:bg-gray-100 text-sm font-semibold transition-colors">Cancel</button>
            </div>
          </div>
        )}

        {/* Issue Uniform form */}
        {showIssue && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-gray-800">Issue Uniform</h2>
                <p className="text-xs text-gray-400 mt-0.5">Decrements inventory. Team member purchases auto-schedule deduction + 90-day reimbursement.</p>
              </div>
              <button onClick={() => { setShowIssue(false); setIssueResult(null); }} className="text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {issueResult ? (
              /* ── Success state ── */
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[#1a5c2a] bg-[#f0f7f0] rounded-xl px-4 py-3">
                  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  <span className="text-sm font-semibold">Issued successfully{issueResult.unit_cost != null ? ` — ${fmt$(issueResult.unit_cost)} per unit` : ""}</span>
                </div>
                {issueResult.schedule.length > 0 && (
                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    <div className="grid grid-cols-[24px_1fr_100px_1fr_100px] bg-gray-50 px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide gap-2 border-b border-gray-100">
                      <span className="text-center">#</span>
                      <span>Deduction Check</span>
                      <span className="text-center">Amount</span>
                      <span>Reimbursement Check</span>
                      <span className="text-center">Amount</span>
                    </div>
                    {issueResult.schedule.map((s, i) => (
                      <div key={i} className="grid grid-cols-[24px_1fr_100px_1fr_100px] px-3 py-2 gap-2 items-center border-b border-gray-50 last:border-0">
                        <span className="text-center text-[11px] text-gray-400 font-semibold">{i + 1}</span>
                        <span className="text-xs font-semibold text-red-600">{fmtPaycheckDate(s.deduction_date)}</span>
                        <span className="text-center text-xs tabular-nums font-semibold text-red-600">{fmt$(s.amount)}</span>
                        <span className="text-xs font-semibold text-[#1a5c2a]">{s.reimbursement_date ? fmtPaycheckDate(s.reimbursement_date) : "—"}</span>
                        <span className="text-center text-xs tabular-nums font-semibold text-[#1a5c2a]">{fmt$(s.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => { resetIssue(); }} className="px-4 py-2 rounded-xl bg-[#123b1f] hover:bg-[#1a5c2e] text-white text-sm font-semibold transition-colors">Issue Another</button>
                  <button onClick={() => { setShowIssue(false); setIssueResult(null); }} className="px-4 py-2 rounded-xl text-gray-600 hover:bg-gray-100 text-sm font-semibold transition-colors">Done</button>
                </div>
              </div>
            ) : (
              /* ── Form fields ── */
              <div className="space-y-4">
                {/* Mode toggle */}
                <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
                  {(["inventory", "manual"] as const).map(m => (
                    <button key={m} onClick={() => { setIssueMode(m); setIssueUnitCost(""); }}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${issueMode === m ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"}`}>
                      {m === "inventory" ? "From Inventory" : "Manual Entry"}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {/* Team member */}
                  <div className="col-span-2">
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Team Member *</label>
                    <select value={issueEmployee} onChange={e => setIssueEmployee(e.target.value)} className={inputCls}>
                      <option value="">— Select —</option>
                      {employees.map(e => <option key={e.id} value={e.id}>{e.last_name}, {e.first_name}</option>)}
                    </select>
                  </div>

                  {issueMode === "inventory" ? (
                    <>
                      {/* Item */}
                      <div className="col-span-2">
                        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Item *</label>
                        <select value={issueItem} onChange={e => { setIssueItem(e.target.value); setIssueSize(""); setIssueColor(""); setIssueUnitCost(""); }} className={inputCls}>
                          <option value="">— Select item —</option>
                          {items.filter(i => i.label !== "Background Check").map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
                        </select>
                      </div>
                      {/* Size */}
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Size</label>
                        <select value={issueSize} onChange={e => { setIssueSize(e.target.value); }} className={inputCls} disabled={!issueItem || !(variants[issueItem]?.sizes.length)}>
                          <option value="">{issueItem && variants[issueItem]?.sizes.length ? "— Any —" : "N/A"}</option>
                          {(variants[issueItem]?.sizes ?? []).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                      </div>
                      {/* Color */}
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Color</label>
                        <select value={issueColor} onChange={e => setIssueColor(e.target.value)} className={inputCls} disabled={!issueItem || !(variants[issueItem]?.colors.length)}>
                          <option value="">{issueItem && variants[issueItem]?.colors.length ? "— Any —" : "N/A"}</option>
                          {(variants[issueItem]?.colors ?? []).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Manual item name */}
                      <div className="col-span-2">
                        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Item Name *</label>
                        <input type="text" value={issueManualItem} onChange={e => setIssueManualItem(e.target.value)} className={inputCls} placeholder="e.g. Rain Jacket" />
                      </div>
                      {/* Manual size */}
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Size</label>
                        <input type="text" value={issueManualSize} onChange={e => setIssueManualSize(e.target.value)} className={inputCls} placeholder="e.g. XL" />
                      </div>
                      {/* Manual color */}
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Color</label>
                        <input type="text" value={issueManualColor} onChange={e => setIssueManualColor(e.target.value)} className={inputCls} placeholder="e.g. Green" />
                      </div>
                    </>
                  )}

                  {/* Qty */}
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Qty *</label>
                    <input type="number" min="1" value={issueQty} onChange={e => setIssueQty(e.target.value)} className={inputCls} />
                  </div>
                  {/* Unit cost */}
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Unit Cost {issueMode === "inventory" ? "(auto-filled)" : ""}</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input type="number" step="0.01" min="0" value={issueUnitCost} onChange={e => setIssueUnitCost(e.target.value)} className={inputCls + " pl-7"} placeholder="0.00" />
                    </div>
                  </div>
                  {/* Issue date */}
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Issue Date *</label>
                    <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className={inputCls} />
                  </div>
                  {/* Issued type */}
                  <div className="col-span-2">
                    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Issued As *</label>
                    <div className="flex gap-2">
                      {(["company_issued", "team_member_purchase"] as const).map(t => (
                        <button key={t} onClick={() => { setIssueType(t); setIssueSplit(false); }}
                          className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${issueType === t ? "bg-[#123b1f] text-white border-[#123b1f]" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                          {t === "company_issued" ? "Company Issued" : "Team Member Purchase"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── Paycheck preview (team_member_purchase only) ── */}
                {issueType === "team_member_purchase" && paySettings && (() => {
                  const totalCost  = issueUnitCost && issueQty ? +(Number(issueUnitCost) * Number(issueQty)).toFixed(2) : null;
                  const splitNum   = issueSplit ? Math.max(1, parseInt(issueSplitCount) || 1) : 1;
                  const perCheck   = totalCost ? Math.floor(totalCost * 100 / splitNum) / 100 : null;
                  const lastAmt    = totalCost ? +((totalCost - (perCheck ?? 0) * (splitNum - 1)).toFixed(2)) : null;
                  const baseDate   = new Date(issueDate + "T12:00:00");
                  const dedDates   = Array.from({ length: splitNum }, (_, i) => nextPaycheckDate(paySettings!, baseDate, i));
                  const reimDates  = dedDates.map(d => {
                    const r = new Date(d + "T12:00:00"); r.setDate(r.getDate() + 90);
                    return nextPaycheckDate(paySettings!, r);
                  });

                  return (
                    <div className="border border-amber-100 bg-amber-50/60 rounded-xl p-4 space-y-3">
                      {/* Split toggle */}
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={issueSplit} onChange={e => setIssueSplit(e.target.checked)}
                            className="w-4 h-4 rounded accent-[#123b1f]" />
                          <span className="text-xs font-semibold text-gray-700">Split over multiple paychecks</span>
                        </label>
                        {issueSplit && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">Checks:</span>
                            <input type="number" min="2" max="26" value={issueSplitCount}
                              onChange={e => setIssueSplitCount(e.target.value)}
                              className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-[#123b1f]" />
                          </div>
                        )}
                      </div>

                      {/* Schedule table */}
                      <div className="rounded-lg overflow-hidden border border-amber-100">
                        <div className="grid grid-cols-[24px_1fr_100px_1fr_100px] bg-amber-100/60 px-3 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide gap-2">
                          <span className="text-center">#</span>
                          <span>Deduction Check</span>
                          <span className="text-center">Amount</span>
                          <span>Reimbursement Check</span>
                          <span className="text-center">Amount</span>
                        </div>
                        <div className="divide-y divide-amber-100/60 bg-white">
                          {dedDates.map((dedDate, i) => {
                            const amt = i === splitNum - 1 ? lastAmt : perCheck;
                            return (
                              <div key={i} className="grid grid-cols-[24px_1fr_100px_1fr_100px] px-3 py-2 gap-2 items-center">
                                <span className="text-center text-[11px] text-gray-400 font-semibold">{i + 1}</span>
                                <span className="text-xs font-semibold text-red-600">{fmtPaycheckDate(dedDate)}</span>
                                <span className="text-center text-xs tabular-nums text-red-600 font-semibold">{amt != null ? fmt$(amt) : "—"}</span>
                                <span className="text-xs font-semibold text-[#1a5c2a]">{fmtPaycheckDate(reimDates[i])}</span>
                                <span className="text-center text-xs tabular-nums text-[#1a5c2a] font-semibold">{amt != null ? fmt$(amt) : "—"}</span>
                              </div>
                            );
                          })}
                        </div>
                        {totalCost != null && (
                          <div className="grid grid-cols-[24px_1fr_100px_1fr_100px] px-3 py-1.5 gap-2 bg-amber-50 border-t border-amber-100">
                            <span />
                            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Total</span>
                            <span className="text-center text-xs tabular-nums font-bold text-red-600">{fmt$(totalCost)}</span>
                            <span />
                            <span className="text-center text-xs tabular-nums font-bold text-[#1a5c2a]">{fmt$(totalCost)}</span>
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] text-amber-700">Reimbursements scheduled 90 days from each deduction paycheck.</p>
                    </div>
                  );
                })()}

                {issueError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{issueError}</p>}
                <div className="flex gap-2">
                  <button onClick={submitIssue} disabled={issueSaving}
                    className="px-4 py-2 rounded-xl bg-[#123b1f] hover:bg-[#1a5c2e] text-white text-sm font-semibold transition-colors disabled:opacity-60">
                    {issueSaving ? "Issuing…" : "Issue Uniform"}
                  </button>
                  <button onClick={() => setShowIssue(false)} className="px-4 py-2 rounded-xl text-gray-600 hover:bg-gray-100 text-sm font-semibold transition-colors">Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        {!loading && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Units on Hand",   value: fmtN(totalUnits),      alert: totalUnits < 0,    positive: totalUnits > 0 },
              { label: "Inventory Value", value: fmt$(totalValue),       alert: totalValue < 0,    positive: totalValue > 0 },
              { label: "Items Below Zero", value: fmtN(itemsBelowZero), alert: itemsBelowZero > 0, positive: false },
            ].map(s => (
              <div key={s.label} className={`bg-white rounded-2xl border-l-4 border border-gray-100 shadow-sm px-5 py-4 ${s.alert ? 'border-l-red-400' : 'border-l-[#1a5c2a]'}`}>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{s.label}</p>
                <p className={`text-2xl font-bold mt-1 tabular-nums ${s.alert ? 'text-red-600' : s.positive ? 'text-[#1a5c2a]' : 'text-gray-800'}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 bg-white rounded-xl border border-gray-100 shadow-sm p-1 w-fit">
          {([
            { key: "inventory",   label: "On Hand" },
            { key: "orders",      label: "Orders" },
            { key: "consumption", label: "Consumption" },
            { key: "ledger",      label: "Ledger" },
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

        {/* ── ON HAND (inventory) view ── */}
        {!loading && view === "inventory" && (() => {
          const filtered = summary.filter(r => r.item_name !== 'Background Check').map(normalizeRow);
          const groups = Object.entries(
            filtered.reduce((acc, r) => { (acc[r.item_name] ??= []).push(r); return acc; }, {} as Record<string, SummaryRow[]>)
          ).map(([name, rows]) => {
            const sorted = [...rows].sort((a, b) => sizeRank(a.size_label) - sizeRank(b.size_label) || (a.color_label ?? '').localeCompare(b.color_label ?? ''));
            const byColor: Record<string, SummaryRow[]> = {};
            for (const r of sorted) (byColor[r.color_label ?? ''] ??= []).push(r);
            return { name, byColor, totalUnits: rows.reduce((s, r) => s + r.qty_on_hand, 0), totalValue: rows.reduce((s, r) => s + (r.inventory_value ?? 0), 0), avgCost: rows[0]?.avg_unit_cost ?? null };
          }).sort((a, b) => a.name.localeCompare(b.name));
          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {groups.length === 0 && (
                <div className="col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-12 text-center text-sm text-gray-400">No inventory yet. Add a receipt to get started.</div>
              )}
              {groups.map(g => (
                <div key={g.name} className={`bg-white rounded-2xl border-l-4 border border-gray-100 shadow-sm overflow-hidden ${g.totalUnits < 0 ? 'border-l-red-400' : 'border-l-[#1a5c2a]'}`}>
                  {/* Card header */}
                  <div className={`flex items-start justify-between px-5 pt-4 pb-3 ${g.totalUnits >= 0 ? 'bg-gradient-to-r from-[#f0f7f0] to-white' : 'bg-gradient-to-r from-red-50/60 to-white'}`}>
                    <div>
                      <div className="text-base font-bold text-gray-800">{g.name}</div>
                      {g.avgCost != null && <div className="text-[11px] text-gray-400 mt-0.5">avg cost {fmt$(g.avgCost)}</div>}
                    </div>
                    <div className="text-right">
                      <div className={`text-2xl font-bold tabular-nums leading-none ${g.totalUnits < 0 ? 'text-red-600' : 'text-[#1a5c2a]'}`}>{fmtN(g.totalUnits)}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">{fmt$(g.totalValue)}</div>
                    </div>
                  </div>
                  {/* Size/color tiles */}
                  <div className="px-5 pb-4 space-y-2.5 border-t border-gray-100 pt-3">
                    {Object.entries(g.byColor).map(([color, rows]) => (
                      <div key={color} className="flex items-center gap-2 flex-wrap">
                        {color && <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide w-10 shrink-0">{color}</span>}
                        {rows.map(r => (
                          <div key={`${r.size_label}-${r.color_label}`} className={`text-center rounded-xl px-3 pt-1.5 pb-2 min-w-[52px] ${r.qty_on_hand < 0 ? 'bg-red-50' : r.qty_on_hand === 0 ? 'bg-gray-50' : 'bg-[#f0f7f0]'}`}>
                            {r.size_label && <div className="text-[10px] font-semibold text-gray-400 mb-0.5">{r.size_label}</div>}
                            <div className={`text-base font-bold tabular-nums leading-none ${r.qty_on_hand < 0 ? 'text-red-600' : r.qty_on_hand === 0 ? 'text-gray-300' : 'text-[#1a5c2a]'}`}>{fmtN(r.qty_on_hand)}</div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* ── ORDERS view ── */}
        {!loading && view === "orders" && (() => {
          const orders = ledger.filter(r => r.transaction_type === "issuance");
          return (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {orders.length === 0 && (
                <div className="px-6 py-12 text-center text-sm text-gray-400">No issuances yet. Use "Issue Uniform" to record orders.</div>
              )}
              {orders.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Team Member</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Item</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Size</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Color</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Qty</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit Cost</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {orders.map(row => (
                        <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-3 text-center text-gray-600 tabular-nums whitespace-nowrap">{fmtDate(row.transaction_date)}</td>
                          <td className="px-4 py-3 text-center font-medium text-gray-800">
                            {row.employee ? `${row.employee.last_name}, ${row.employee.first_name}` : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-700">{row.at_field_options?.label ?? <span className="text-gray-400 italic text-xs">Manual</span>}</td>
                          <td className="px-4 py-3 text-center text-gray-600">{row.size?.label ?? <span className="text-gray-300">—</span>}</td>
                          <td className="px-4 py-3 text-center text-gray-600">{row.color?.label ?? <span className="text-gray-300">—</span>}</td>
                          <td className="px-4 py-3 text-center font-semibold tabular-nums text-gray-800">{Math.abs(row.quantity)}</td>
                          <td className="px-4 py-3 text-center tabular-nums text-gray-600">{fmt$(row.unit_cost)}</td>
                          <td className="px-4 py-3 text-center tabular-nums text-gray-800 font-semibold">{row.total_cost != null ? fmt$(Math.abs(row.total_cost)) : "—"}</td>
                          <td className="px-4 py-3 text-center text-xs text-gray-400">{row.notes ?? <span className="text-gray-200">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── CONSUMPTION view ── */}
        {!loading && view === "consumption" && (
          <div className="space-y-4">
            {consumptionLoading && (
              <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 border-2 border-[#123b1f] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {!consumptionLoading && !consumption && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-12 text-center text-sm text-gray-400">
                No consumption data yet. Submit at least two monthly counts to see usage between periods.
              </div>
            )}
            {!consumptionLoading && consumption && (() => {
              // Normalize "Item - Color" names same as On Hand view
              const normalizedLines = consumption.lines.map(l => {
                if (!l.color_label) {
                  const m = l.item_name.match(/^(.+?) - ([A-Za-z]+)$/);
                  if (m) return { ...l, item_name: m[1], color_label: m[2] };
                }
                return l;
              });
              const grouped = Object.entries(
                normalizedLines.reduce((acc, l) => {
                  (acc[l.item_name] ??= []).push(l);
                  return acc;
                }, {} as Record<string, ConsumptionLine[]>)
              ).map(([name, lines]) => ({
                name,
                lines: [...lines].sort((a, b) =>
                  sizeRank(a.size_label) - sizeRank(b.size_label) ||
                  (a.color_label ?? "").localeCompare(b.color_label ?? "")
                ),
                totalConsumed: lines.reduce((s, l) => s + l.consumed_qty, 0),
                totalValue: lines.reduce((s, l) => s + (l.consumed_value ?? 0), 0),
              })).sort((a, b) => a.name.localeCompare(b.name));

              return (
                <>
                  {/* Period header */}
                  <div className="rounded-2xl border border-[#1a5c2a]/20 shadow-sm px-5 py-4 flex items-center justify-between" style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 60%, #1a5c2a 100%)" }}>
                    <div>
                      <p className="text-xs text-white/50 font-medium uppercase tracking-wide">Period</p>
                      <p className="text-base font-bold text-white mt-0.5">{fmtDate(consumption.from_date)} — {fmtDate(consumption.to_date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-white/50 font-medium uppercase tracking-wide">Total $ Used</p>
                      <p className="text-2xl font-bold text-white tabular-nums mt-0.5">{fmt$(consumption.total_consumed_value)}</p>
                    </div>
                  </div>

                  {/* Per-item cards */}
                  {grouped.map(g => (
                    <div key={g.name} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      {/* Card header */}
                      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50">
                        <span className="text-sm font-bold text-gray-800">{g.name}</span>
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-gray-400">{fmtN(g.totalConsumed)} units used</span>
                          <span className={`text-sm font-bold tabular-nums ${g.totalValue < 0 ? "text-red-600" : "text-gray-800"}`}>{fmt$(g.totalValue)}</span>
                        </div>
                      </div>
                      {/* Line table */}
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-5 py-2 text-center font-semibold text-gray-400 uppercase tracking-wide">Size</th>
                            <th className="px-5 py-2 text-center font-semibold text-gray-400 uppercase tracking-wide">Color</th>
                            <th className="px-5 py-2 text-center font-semibold text-gray-400 uppercase tracking-wide">Start Qty</th>
                            <th className="px-5 py-2 text-center font-semibold text-gray-400 uppercase tracking-wide">Receipts</th>
                            <th className="px-5 py-2 text-center font-semibold text-gray-400 uppercase tracking-wide">End Qty</th>
                            <th className="px-5 py-2 text-center font-semibold text-gray-400 uppercase tracking-wide">Used</th>
                            <th className="px-5 py-2 text-center font-semibold text-gray-400 uppercase tracking-wide">Avg Cost</th>
                            <th className="px-5 py-2 text-center font-semibold text-gray-400 uppercase tracking-wide">$ Used</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {g.lines.map((l, i) => (
                            <tr key={i} className="hover:bg-gray-50/40">
                              <td className="px-5 py-2.5 text-center text-gray-600">{l.size_label ?? <span className="text-gray-300">—</span>}</td>
                              <td className="px-5 py-2.5 text-center text-gray-600">{l.color_label ?? <span className="text-gray-300">—</span>}</td>
                              <td className="px-5 py-2.5 text-center tabular-nums text-gray-600">{fmtN(l.start_qty)}</td>
                              <td className="px-5 py-2.5 text-center tabular-nums text-gray-600">{l.receipts_qty > 0 ? `+${fmtN(l.receipts_qty)}` : <span className="text-gray-300">—</span>}</td>
                              <td className="px-5 py-2.5 text-center tabular-nums text-gray-600">{fmtN(l.end_qty)}</td>
                              <td className={`px-5 py-2.5 text-center tabular-nums font-semibold ${l.consumed_qty < 0 ? "text-red-600" : l.consumed_qty === 0 ? "text-gray-300" : "text-gray-800"}`}>
                                {l.consumed_qty === 0 ? "—" : fmtN(l.consumed_qty)}
                              </td>
                              <td className="px-5 py-2.5 text-center tabular-nums text-gray-400">{fmt$(l.avg_cost)}</td>
                              <td className={`px-5 py-2.5 text-center tabular-nums font-semibold ${(l.consumed_value ?? 0) < 0 ? "text-red-600" : "text-gray-800"}`}>
                                {l.consumed_value != null ? fmt$(l.consumed_value) : <span className="text-gray-300">—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </>
              );
            })()}
          </div>
        )}

        {/* ── LEDGER view ── */}
        {!loading && view === "ledger" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Item</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Size</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Color</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Qty</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit Cost</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Team Member</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Vendor / Ref</th>
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
                        <td className={`px-4 py-3 text-center font-semibold tabular-nums ${row.quantity < 0 ? "text-blue-600" : "text-gray-800"}`}>
                          {row.quantity > 0 ? `+${fmtN(row.quantity)}` : fmtN(row.quantity)}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600 tabular-nums">
                          {isEditing && isReceipt
                            ? <div className="relative"><span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span><input type="number" step="0.01" value={editUnitCost} onChange={e => setEditUnitCost(e.target.value)} className="border border-gray-200 rounded-lg pl-5 pr-2 py-1 text-xs w-24" /></div>
                            : fmt$(row.unit_cost)}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600 tabular-nums">{fmt$(row.total_cost)}</td>
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
