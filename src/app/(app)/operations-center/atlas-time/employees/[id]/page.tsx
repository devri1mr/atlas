"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useUser } from "@/lib/userContext";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function CostInput({ value, onChange, className }: { value: number | null; onChange: (v: number | null) => void; className: string }) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  return (
    <input
      type="text"
      inputMode="decimal"
      value={focused ? draft : (value != null ? value.toFixed(2) : "")}
      onFocus={() => { setFocused(true); setDraft(value != null ? String(value) : ""); }}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => {
        setFocused(false);
        const n = parseFloat(draft);
        onChange(isNaN(n) ? null : n);
      }}
      className={className}
    />
  );
}

function QtyInput({ value, onChange, className }: { value: number; onChange: (v: number) => void; className: string }) {
  return (
    <input
      type="number"
      min={1}
      step={1}
      value={value}
      onChange={e => {
        const n = parseInt(e.target.value, 10);
        onChange(isNaN(n) || n < 1 ? 1 : n);
      }}
      onBlur={e => { e.target.value = String(parseInt(e.target.value, 10) || 1); }}
      className={className}
    />
  );
}

const inputCls = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all";
const labelCls = "block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide";
const descCls = "text-xs text-gray-400 mb-2";

type Division = { id: string; name: string; active: boolean; time_clock_only: boolean; qb_class_name: string | null };
type PayRate = { id: string; division_id: string | null; division_name: string | null; qb_class: string | null; rate: number; effective_date: string; end_date: string | null; is_default: boolean };
type Employee = Record<string, any>;
type NavEmp = { id: string; first_name: string; last_name: string; photo_url: string | null };
type UniformItem = { key: string; item: string; cost: number | null; issued_date: string; issued_type: "company_issued" | "team_member_purchase"; subsection?: string; size?: string; qty?: number; color?: string; inventory_id?: string };
type Variant = { id: string; item_option_id: string; variant_type: "size" | "color"; label: string; cost: number | null; sort_order: number; active: boolean };
type SectionCfg = { id: string; section: string; label: string; sort_order: number; visible: boolean };
type FieldOpt = { id: string; label: string; cost?: number | null; is_default?: boolean; default_qty?: number | null; subsection?: string | null; requires_size?: boolean };
type CustomFieldDef = { id: string; label: string; field_key: string; field_type: string; section: string; sort_order: number; active: boolean; options: string[] };


const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-50 text-green-700",
  inactive: "bg-gray-100 text-gray-500",
  terminated: "bg-red-50 text-red-700",
  on_leave: "bg-amber-50 text-amber-700",
};

const DEFAULT_TERM_REASONS: FieldOpt[] = [
  { id: "voluntary", label: "Voluntary resignation" },
  { id: "involuntary", label: "Involuntary / let go" },
  { id: "layoff", label: "Layoff / seasonal end" },
  { id: "no_show", label: "Job abandonment" },
  { id: "contract_end", label: "Contract end" },
  { id: "other", label: "Other" },
];

function Section({ title, children, action, desc }: { title: string; children: React.ReactNode; action?: React.ReactNode; desc?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
          {desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
        </div>
        {action}
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </div>
  );
}

function TwoCol({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? "bg-[#123b1f]" : "bg-gray-200"}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

function FieldSelect({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: FieldOpt[];
  placeholder?: string;
}) {
  if (options.length === 0) {
    return <input value={value} onChange={e => onChange(e.target.value)} className={inputCls} placeholder="Configure in Profile Settings" />;
  }
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={inputCls}>
      <option value="">— {placeholder ?? "Select"} —</option>
      {options.map(o => <option key={o.id} value={o.label}>{o.label}</option>)}
    </select>
  );
}

export default function EmployeeDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const { can } = useUser();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [divisions, setDivisions] = useState<Division[]>([]);
  const [showPin, setShowPin] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [pinSuccess, setPinSuccess] = useState(false);
  const [payRates, setPayRates] = useState<PayRate[]>([]);
  const [form, setForm] = useState<Employee>({});

  const [sectionCfg, setSectionCfg] = useState<SectionCfg[]>([]);
  const [fieldOpts, setFieldOpts] = useState<Record<string, FieldOpt[]>>({});
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDef[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  const [uniformItems, setUniformItems] = useState<UniformItem[]>([]);
  const [addingItem, setAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemOptionId, setNewItemOptionId] = useState("");
  const [newItemSizeVariantId, setNewItemSizeVariantId] = useState("");
  const [newItemColorVariantId, setNewItemColorVariantId] = useState("");
  const [newItemCost, setNewItemCost] = useState("");
  const [newItemDate, setNewItemDate] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }));
  const [newItemType, setNewItemType] = useState<"company_issued" | "team_member_purchase">("company_issued");
  const [newItemSubsection, setNewItemSubsection] = useState("");
  const [newItemSize, setNewItemSize] = useState("");
  const [newItemQty, setNewItemQty] = useState("1");
  const [newItemColor, setNewItemColor] = useState("");
  const [newItemAdding, setNewItemAdding] = useState(false);
  const [uniformVariants, setUniformVariants] = useState<Record<string, { sizes: Variant[]; colors: Variant[] }>>({});

  const [addingRate, setAddingRate] = useState(false);
  const [newRateDivisionId, setNewRateDivisionId] = useState("");
  const [newRateClass, setNewRateClass] = useState("");
  const [newRateAmount, setNewRateAmount] = useState("");
  const [newRateDate, setNewRateDate] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }));
  const [newRateDefault, setNewRateDefault] = useState(false);
  const [rateSaving, setRateSaving] = useState(false);
  const [expandedRateGroup, setExpandedRateGroup] = useState<string | null>(null);
  const [addingRaiseFor, setAddingRaiseFor] = useState<string | null>(null);
  const [newRaiseAmount, setNewRaiseAmount] = useState("");
  const [newRaiseDate, setNewRaiseDate] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }));
  const [raiseSaving, setRaiseSaving] = useState(false);
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [editRateAmount, setEditRateAmount] = useState("");
  const [editRateDate, setEditRateDate] = useState("");
  const [editRateDivisionId, setEditRateDivisionId] = useState("");
  const [editRateSaving, setEditRateSaving] = useState(false);

  const [globalLunch, setGlobalLunch] = useState<{ auto_deduct: boolean; after_hours: number; minutes: number }>({ auto_deduct: false, after_hours: 6, minutes: 30 });

  const [showTerminate, setShowTerminate] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [navEmployees, setNavEmployees] = useState<NavEmp[]>([]);

  const photoFileRef = useRef<HTMLInputElement>(null);
  const photoCameraRef = useRef<HTMLInputElement>(null);
  const hasLoadedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef<() => Promise<void>>(async () => {});

  function set(key: string, value: any) {
    setForm((prev: Employee) => ({ ...prev, [key]: value }));
  }

  async function load() {
    try {
      setLoading(true);
      setError("");
      const [empRes, divRes, fcRes, foRes, cfRes, cvRes, uvRes, listRes, settingsRes] = await Promise.all([
        fetch(`/api/atlas-time/employees/${id}`, { cache: "no-store" }),
        fetch("/api/atlas-time/divisions", { cache: "no-store" }),
        fetch("/api/atlas-time/field-config", { cache: "no-store" }),
        fetch("/api/atlas-time/field-options", { cache: "no-store" }),
        fetch("/api/atlas-time/custom-fields", { cache: "no-store" }),
        fetch(`/api/atlas-time/employees/${id}/custom-values`, { cache: "no-store" }),
        fetch("/api/atlas-time/uniform-variants", { cache: "no-store" }),
        fetch("/api/atlas-time/employees", { cache: "no-store" }),
        fetch("/api/atlas-time/settings", { cache: "no-store" }),
      ]);
      const empJson = await empRes.json().catch(() => null);
      const divJson = await divRes.json().catch(() => null);
      const fcJson = await fcRes.json().catch(() => ({}));
      const foJson = await foRes.json().catch(() => ({}));
      const cfJson = await cfRes.json().catch(() => ({}));
      const cvJson = await cvRes.json().catch(() => ({}));
      const uvJson = await uvRes.json().catch(() => ({}));
      const listJson = await listRes.json().catch(() => ({ employees: [] }));
      const settingsJson = await settingsRes.json().catch(() => ({}));
      setNavEmployees(listJson.employees ?? []);
      if (settingsJson.settings) {
        const s = settingsJson.settings;
        setGlobalLunch({ auto_deduct: !!s.lunch_auto_deduct, after_hours: s.lunch_deduct_after_hours ?? 6, minutes: s.lunch_deduct_minutes ?? 30 });
      }

      if (!empRes.ok) throw new Error(empJson?.error ?? "Team member not found");
      setForm(empJson.employee ?? {});
      setPayRates(empJson.pay_rates ?? []);
      setDivisions((divJson?.divisions ?? []).filter((d: Division) => d.active));
      setSectionCfg(fcJson.sections ?? []);

      const grouped: Record<string, FieldOpt[]> = {};
      for (const opt of (foJson.options ?? [])) {
        if (!opt.active) continue;
        if (!grouped[opt.field_key]) grouped[opt.field_key] = [];
        grouped[opt.field_key].push({ id: opt.id, label: opt.label, cost: opt.cost ?? null, is_default: opt.is_default ?? false, default_qty: opt.default_qty ?? 1, subsection: opt.subsection ?? null, requires_size: opt.requires_size !== false });
      }
      setFieldOpts(grouped);

      const variantMap: Record<string, { sizes: Variant[]; colors: Variant[] }> = {};
      for (const v of (uvJson.variants ?? [])) {
        if (!v.active) continue;
        if (!variantMap[v.item_option_id]) variantMap[v.item_option_id] = { sizes: [], colors: [] };
        if (v.variant_type === "size") variantMap[v.item_option_id].sizes.push(v);
        else if (v.variant_type === "color") variantMap[v.item_option_id].colors.push(v);
      }
      setUniformVariants(variantMap);

      setCustomFieldDefs((cfJson.fields ?? []).filter((f: CustomFieldDef) => f.active));
      setCustomValues(cvJson.values ?? {});

      const raw = empJson.employee?.uniform_items;
      let items: UniformItem[] = Array.isArray(raw) ? raw : [];
      if (items.length === 0) {
        const defaults = (foJson.options ?? []).filter((o: any) => o.field_key === "uniform_items" && o.is_default && o.active);
        items = defaults.map((o: any) => ({
          key: `default_${o.id}_${Date.now()}_${Math.random()}`,
          item: o.label,
          cost: o.cost ?? null,
          issued_date: new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
          issued_type: "company_issued" as const,
          subsection: o.subsection ?? "",
          size: "",
          qty: o.default_qty ?? 1,
        }));
      }
      setUniformItems(items);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }

  async function save() {
    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const res = await fetch(`/api/atlas-time/employees/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, uniform_items: uniformItems }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to save");
      if (Object.keys(customValues).length > 0) {
        await fetch(`/api/atlas-time/employees/${id}/custom-values`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ values: customValues }),
        });
      }
      setSuccess("Saved.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function addUniformItem() {
    if (!newItemName.trim()) return;
    setNewItemAdding(true);

    let inventory_id: string | undefined;
    let resolvedCost = newItemCost !== "" ? Number(newItemCost) : null;

    // If item is linked to catalog, create inventory issuance + pay adjustments
    if (newItemOptionId) {
      try {
        const res = await fetch("/api/atlas-time/uniform-inventory/issue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employee_id:       id,
            item_option_id:    newItemOptionId,
            size_variant_id:   newItemSizeVariantId  || null,
            color_variant_id:  newItemColorVariantId || null,
            quantity:          newItemQty !== "" ? Number(newItemQty) : 1,
            issue_date:        newItemDate,
            issued_type:       newItemType,
            item_label:        newItemName.trim(),
            size_label:        newItemSize  || null,
            color_label:       newItemColor || null,
          }),
        });
        const json = await res.json();
        if (res.ok) {
          inventory_id  = json.inventory_id;
          // Use inventory avg cost if we don't have a manual cost override
          if (resolvedCost === null && json.unit_cost != null) {
            const qty = newItemQty !== "" ? Number(newItemQty) : 1;
            resolvedCost = +(json.unit_cost * qty).toFixed(2);
          }
        }
      } catch {
        // Non-fatal — inventory wiring failed but still add item to profile
      }
    }

    setUniformItems(prev => [...prev, {
      key: `${Date.now()}`,
      item: newItemName.trim(),
      cost: resolvedCost,
      issued_date: newItemDate,
      issued_type: newItemType,
      subsection: newItemSubsection,
      size: newItemSize,
      qty: newItemQty !== "" ? Number(newItemQty) : 1,
      color: newItemColor,
      inventory_id,
    }]);

    setNewItemName(""); setNewItemOptionId(""); setNewItemSizeVariantId(""); setNewItemColorVariantId("");
    setNewItemCost(""); setNewItemType("company_issued");
    setNewItemSubsection(""); setNewItemSize(""); setNewItemQty("1"); setNewItemColor("");
    setAddingItem(false);
    setNewItemAdding(false);
  }

  function updateUniformItem(key: string, patch: Partial<UniformItem>) {
    setUniformItems(prev => prev.map(i => i.key === key ? { ...i, ...patch } : i));
  }

  async function removeUniformItem(key: string) {
    const item = uniformItems.find(i => i.key === key);
    setUniformItems(prev => prev.filter(i => i.key !== key));

    // If item had an inventory issuance, create a return entry + cancel pay adjustments
    if (item?.inventory_id) {
      try {
        // Void the original issuance
        await fetch(`/api/atlas-time/uniform-inventory/${item.inventory_id}`, { method: "DELETE" });
        // Cancel any pending pay adjustments linked to this inventory entry
        const adjRes = await fetch(`/api/atlas-time/pay-adjustments?employee_id=${id}`);
        const adjJson = await adjRes.json();
        const linked = (adjJson.adjustments ?? []).filter((a: any) => a.source_inventory_id === item.inventory_id && a.status === "pending");
        await Promise.all(linked.map((a: any) => fetch(`/api/atlas-time/pay-adjustments/${a.id}`, { method: "DELETE" })));
      } catch {
        // Non-fatal
      }
    }
  }

  async function addPayRate() {
    if (!newRateAmount) return;
    try {
      setRateSaving(true);
      const res = await fetch(`/api/atlas-time/employees/${id}/pay-rates`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ division_id: newRateDivisionId || null, division_name: divisions.find(d => d.id === newRateDivisionId)?.name ?? null, qb_class: newRateClass || null, rate: Number(newRateAmount), effective_date: newRateDate, is_default: newRateDefault }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to add rate");
      if (newRateDefault) {
        setPayRates(prev => prev.map(r => ({ ...r, is_default: false })).concat(json.pay_rate));
        setForm((prev: Employee) => ({ ...prev, default_pay_rate: json.pay_rate?.rate ?? prev.default_pay_rate }));
      } else {
        setPayRates(prev => [...prev, json.pay_rate]);
      }
      setAddingRate(false); setNewRateDivisionId(""); setNewRateClass(""); setNewRateAmount(""); setNewRateDefault(false);
    } catch (e: any) { setError(e?.message ?? "Failed to add rate"); }
    finally { setRateSaving(false); }
  }

  async function savePin() {
    const trimmed = newPin.trim();
    if (!/^\d{4,6}$/.test(trimmed)) { setError("PIN must be 4–6 digits."); return; }
    try {
      setPinSaving(true);
      setError("");
      const res = await fetch(`/api/atlas-time/employees/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kiosk_pin: trimmed }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to save PIN");
      setForm((prev: Employee) => ({ ...prev, kiosk_pin: trimmed }));
      setNewPin(""); setPinSuccess(true);
      setTimeout(() => setPinSuccess(false), 3000);
    } catch (e: any) { setError(e?.message ?? "Failed to save PIN"); }
    finally { setPinSaving(false); }
  }

  async function uploadPhoto(file: File) {
    if (!file) return;
    try {
      setPhotoUploading(true);
      setPhotoError("");
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch(`/api/atlas-time/employees/${id}/photo`, { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Upload failed");
      setForm((prev: Employee) => ({ ...prev, photo_url: json.photo_url }));
    } catch (e: any) {
      setPhotoError(e?.message ?? "Upload failed");
      setTimeout(() => setPhotoError(""), 4000);
    } finally {
      setPhotoUploading(false);
    }
  }

  async function removePhoto() {
    try {
      setPhotoUploading(true);
      const res = await fetch(`/api/atlas-time/employees/${id}/photo`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove photo");
      setForm((prev: Employee) => ({ ...prev, photo_url: null }));
    } catch (e: any) {
      setPhotoError(e?.message ?? "Failed to remove photo");
      setTimeout(() => setPhotoError(""), 4000);
    } finally {
      setPhotoUploading(false);
    }
  }

  async function deletePayRate(rateId: string) {
    if (!confirm("Remove this pay rate?")) return;
    const res = await fetch(`/api/atlas-time/employees/${id}/pay-rates?rate_id=${rateId}`, { method: "DELETE" });
    if (res.ok) setPayRates(prev => prev.filter(r => r.id !== rateId));
    else { const j = await res.json().catch(() => null); setError(j?.error ?? "Failed"); }
  }

  async function addRaise(divisionId: string | null, divisionName: string | null, qbClass: string | null) {
    if (!newRaiseAmount) return;
    try {
      setRaiseSaving(true);
      setError("");
      const res = await fetch(`/api/atlas-time/employees/${id}/pay-rates`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ division_id: divisionId, division_name: divisionName, qb_class: qbClass, rate: Number(newRaiseAmount), effective_date: newRaiseDate, is_default: false }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to add raise");
      setPayRates(prev => [...prev, json.pay_rate]);
      setAddingRaiseFor(null);
      setNewRaiseAmount("");
      setNewRaiseDate(new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }));
    } catch (e: any) { setError(e?.message ?? "Failed to add raise"); }
    finally { setRaiseSaving(false); }
  }

  async function editRate(rateId: string) {
    const amount = parseFloat(editRateAmount);
    if (!amount || amount <= 0) { setError("Enter a valid rate."); return; }
    const divObj = divisions.find(d => d.id === editRateDivisionId);
    const newDivisionId = editRateDivisionId || null;
    const newDivisionName = divObj?.name ?? null;
    try {
      setEditRateSaving(true);
      setError("");
      const res = await fetch(`/api/atlas-time/employees/${id}/pay-rates`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate_id: rateId, rate: amount, effective_date: editRateDate || undefined, division_id: newDivisionId, division_name: newDivisionName }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to update rate");
      setPayRates(prev => prev.map(r => r.id === rateId ? { ...r, rate: amount, effective_date: editRateDate || r.effective_date, division_id: newDivisionId, division_name: newDivisionName } : r));
      setEditingRateId(null);
    } catch (e: any) { setError(e?.message ?? "Failed"); }
    finally { setEditRateSaving(false); }
  }

  async function setDefaultRate(rateId: string) {
    try {
      setError("");
      const res = await fetch(`/api/atlas-time/employees/${id}/pay-rates`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate_id: rateId, is_default: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed");
      setPayRates(prev => prev.map(r => ({ ...r, is_default: r.id === rateId })));
      setForm((prev: Employee) => ({ ...prev, default_pay_rate: json.pay_rate?.rate ?? prev.default_pay_rate }));
    } catch (e: any) { setError(e?.message ?? "Failed"); }
  }

  async function terminate() {
    if (!form.termination_date) { setError("Termination date is required."); return; }
    try {
      setSaving(true);
      setError("");
      const res = await fetch(`/api/atlas-time/employees/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "terminated",
          termination_date: form.termination_date,
          termination_reason: form.termination_reason,
          termination_notes: form.termination_notes,
          final_check_issued: form.final_check_issued ?? false,
          final_check_date: form.final_check_date,
          equipment_returned: form.equipment_returned ?? false,
          access_revoked_at: new Date().toISOString(),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Failed to terminate");
      setForm((prev: Employee) => ({ ...prev, status: "terminated" }));
      setShowTerminate(false);
      setSuccess("Team member terminated.");
    } catch (e: any) { setError(e?.message ?? "Failed to terminate"); }
    finally { setSaving(false); }
  }

  useEffect(() => { load(); }, [id]);

  // Keep saveRef pointing at the latest save closure
  useEffect(() => { saveRef.current = save; });

  // Autosave: debounce 1.5s after any form/items/custom change
  useEffect(() => {
    if (!hasLoadedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveRef.current(), 1500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [form, uniformItems, customValues]);

  const mi = form.middle_initial ? ` ${form.middle_initial}.` : "";
  const fullName = form.first_name ? `${form.last_name}, ${form.first_name}${mi}` : "Team Member";

  const navIdx = navEmployees.findIndex(e => e.id === id);
  const prevEmp = navIdx > 0 ? navEmployees[navIdx - 1] : null;
  const nextEmp = navIdx >= 0 && navIdx < navEmployees.length - 1 ? navEmployees[navIdx + 1] : null;
  const hasNav = prevEmp !== null || nextEmp !== null;

  const orderedSections = sectionCfg.length > 0
    ? [...sectionCfg].sort((a, b) => a.sort_order - b.sort_order).filter(s => s.visible).map(s => s.section)
    : ["personal", "employment", "address", "certifications", "benefits", "hr_records"];

  function renderCustomFields(section: string): React.ReactNode {
    const fields = customFieldDefs
      .filter(f => f.section === section)
      .sort((a, b) => a.sort_order - b.sort_order);
    if (fields.length === 0) return null;
    return (
      <>
        {fields.map(f => (
          <div key={f.id}>
            <label className={labelCls}>{f.label}</label>
            {f.field_type === "textarea" ? (
              <textarea
                value={customValues[f.id] ?? ""}
                onChange={e => setCustomValues(prev => ({ ...prev, [f.id]: e.target.value }))}
                rows={3} className={inputCls + " resize-none"}
              />
            ) : f.field_type === "toggle" ? (
              <div className="flex items-center gap-3 pt-1">
                <Toggle
                  checked={customValues[f.id] === "true"}
                  onChange={v => setCustomValues(prev => ({ ...prev, [f.id]: v ? "true" : "false" }))}
                />
              </div>
            ) : f.field_type === "dropdown" ? (
              <select
                value={customValues[f.id] ?? ""}
                onChange={e => setCustomValues(prev => ({ ...prev, [f.id]: e.target.value }))}
                className={inputCls}
              >
                <option value="">— Select —</option>
                {(f.options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : (
              <input
                type={f.field_type === "number" ? "number" : f.field_type === "date" ? "date" : "text"}
                value={customValues[f.id] ?? ""}
                onChange={e => setCustomValues(prev => ({ ...prev, [f.id]: e.target.value }))}
                className={inputCls}
              />
            )}
          </div>
        ))}
      </>
    );
  }

  const DEFAULT_SECTION_LABELS: Record<string, string> = {
    personal: "Personal",
    employment: "Employment",
    address: "Contact & Address",
    certifications: "Certifications & Licensing",
    benefits: "Benefits",
    hr_records: "HR Notes",
  };

  function sectionTitle(sk: string): string {
    return sectionCfg.find(s => s.section === sk)?.label ?? DEFAULT_SECTION_LABELS[sk] ?? sk;
  }

  function renderSection(sk: string): React.ReactNode {
    switch (sk) {
      case "personal":
        return (
          <Section title={sectionTitle(sk)}>
            <div className="grid grid-cols-[1fr_56px_1fr] sm:grid-cols-[1fr_80px_1fr] gap-2 sm:gap-3">
              <div>
                <label className={labelCls}>First Name</label>
                <input value={form.first_name ?? ""} onChange={e => set("first_name", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>M.I.</label>
                <input value={form.middle_initial ?? ""} onChange={e => set("middle_initial", e.target.value)} className={inputCls} maxLength={3} placeholder="A" />
              </div>
              <div>
                <label className={labelCls}>Last Name</label>
                <input value={form.last_name ?? ""} onChange={e => set("last_name", e.target.value)} className={inputCls} />
              </div>
            </div>
            <TwoCol>
              <div>
                <label className={labelCls}>Preferred / Nickname</label>
                <input value={form.preferred_name ?? ""} onChange={e => set("preferred_name", e.target.value)} className={inputCls} placeholder="Optional" />
              </div>
              <div>
                <label className={labelCls}>Date of Birth</label>
                <input type="date" value={form.date_of_birth ?? ""} onChange={e => set("date_of_birth", e.target.value)} className={inputCls} />
              </div>
            </TwoCol>
            {renderCustomFields("personal")}
          </Section>
        );

      case "employment":
        return (
          <Fragment>
            <Section title={sectionTitle(sk)}>
              <TwoCol>
                <div>
                  <label className={labelCls}>Hire Date</label>
                  <input type="date" value={form.hire_date ?? ""} onChange={e => set("hire_date", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>1st Working Day</label>
                  <input type="date" value={form.first_working_day ?? ""} onChange={e => set("first_working_day", e.target.value)} className={inputCls} />
                </div>
              </TwoCol>
              <TwoCol>
                <div>
                  <label className={labelCls}>Job Title</label>
                  <FieldSelect
                    value={form.job_title ?? ""}
                    onChange={v => set("job_title", v)}
                    options={fieldOpts["job_title"] ?? []}
                    placeholder="Job Title"
                  />
                </div>
                <div>
                  <label className={labelCls}>Kiosk PIN</label>
                  <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                      <input
                        type={showPin ? "text" : "password"}
                        inputMode="numeric"
                        maxLength={6}
                        value={newPin !== "" ? newPin : (form.kiosk_pin ? (showPin ? form.kiosk_pin : "••••") : "")}
                        onChange={e => setNewPin(e.target.value.replace(/\D/g, ""))}
                        onFocus={() => { if (newPin === "") setNewPin(""); }}
                        className={inputCls + " pr-10"}
                        placeholder={form.kiosk_pin ? "Change PIN" : "Set PIN"}
                      />
                      <button type="button" onClick={() => setShowPin(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showPin
                          ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                          : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        }
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={savePin}
                      disabled={pinSaving || newPin.length < 4}
                      className="shrink-0 text-xs font-semibold bg-[#123b1f] text-white px-3 py-2.5 rounded-xl hover:bg-[#1a5c2e] disabled:opacity-50 transition-colors"
                    >
                      {pinSaving ? "…" : pinSuccess ? "✓" : "Save"}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">4–6 digits. Used for time clock sign-in.</p>
                </div>
              </TwoCol>

              <TwoCol>
                <div>
                  <label className={labelCls}>Status</label>
                  <select value={form.status ?? "active"} onChange={e => set("status", e.target.value)} className={inputCls}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="on_leave">On Leave</option>
                    <option value="terminated">Terminated</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Current Division</label>
                  <select value={form.division_id ?? ""} onChange={e => set("division_id", e.target.value || null)} className={inputCls}>
                    <option value="">— None —</option>
                    {divisions.filter(d => !d.time_clock_only).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Shown in the Team Members list.</p>
                </div>
              </TwoCol>
              <TwoCol>
                <div>
                  <label className={labelCls}>Default Punch Item</label>
                  <select value={form.default_at_division_id ?? ""} onChange={e => set("default_at_division_id", e.target.value || null)} className={inputCls}>
                    <option value="">— None (use last used) —</option>
                    {divisions.filter(d => d.time_clock_only).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Pre-selected on the kiosk when they enter their PIN. They can still change it before clocking in.</p>
                </div>
              </TwoCol>
              {renderCustomFields("employment")}
            </Section>

            <Section title="Lunch Deduction" desc="Override global time clock settings for this team member. Leave blank to use the company default.">
              <TwoCol>
                <div>
                  <label className={labelCls}>Auto-Deduct Lunch</label>
                  <div className="flex items-center gap-3 mt-1">
                    <Toggle
                      checked={form.lunch_auto_deduct != null ? !!form.lunch_auto_deduct : globalLunch.auto_deduct}
                      onChange={v => set("lunch_auto_deduct", v)}
                    />
                    <span className="text-sm text-gray-600">
                      {form.lunch_auto_deduct != null
                        ? (form.lunch_auto_deduct ? "On (override)" : "Off (override)")
                        : `${globalLunch.auto_deduct ? "On" : "Off"} (company default)`}
                    </span>
                    {form.lunch_auto_deduct != null && (
                      <button type="button" onClick={() => set("lunch_auto_deduct", null)} className="text-xs text-gray-400 hover:text-gray-600 underline">
                        Reset
                      </button>
                    )}
                  </div>
                </div>
                <div />
              </TwoCol>
              <TwoCol>
                <div>
                  <label className={labelCls}>Deduct After (hours)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={form.lunch_deduct_after_hours ?? ""}
                    onChange={e => set("lunch_deduct_after_hours", e.target.value === "" ? null : Number(e.target.value))}
                    placeholder={`${globalLunch.after_hours} (default)`}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Deduct Minutes</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={form.lunch_deduct_minutes ?? ""}
                    onChange={e => set("lunch_deduct_minutes", e.target.value === "" ? null : Number(e.target.value))}
                    placeholder={`${globalLunch.minutes} (default)`}
                    className={inputCls}
                  />
                  <p className="text-xs text-gray-400 mt-1">Set to 0 to disable lunch deduction for this person.</p>
                </div>
              </TwoCol>
            </Section>

            {can("hr_labor_cost") && <Section title="Pay Rates"
              desc="Division-specific rates take priority. Punches with no matching division use the default rate."
              action={
                <button onClick={() => { setAddingRate(true); setNewRateDivisionId(form.division_id ?? ""); }} className="text-xs font-semibold text-[#123b1f] hover:text-[#1a5c2e] transition-colors flex items-center gap-1 shrink-0">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Add Rate
                </button>
              }
            >
              {payRates.length === 0 && !addingRate && (
                <p className="text-sm text-gray-400">No pay rates on file.</p>
              )}
              {payRates.length > 0 && (() => {
                // Group by division_id (null = no division)
                const groups = new Map<string, PayRate[]>();
                for (const r of payRates) {
                  const key = r.division_id ?? "__none__";
                  if (!groups.has(key)) groups.set(key, []);
                  groups.get(key)!.push(r);
                }
                // Sort each group newest first
                for (const g of groups.values()) g.sort((a, b) => b.effective_date.localeCompare(a.effective_date));
                return (
                  <div className="space-y-2">
                    {[...groups.entries()].map(([groupKey, rates]) => {
                      const latest = rates[0];
                      const isExpanded = expandedRateGroup === groupKey;
                      return (
                        <div key={groupKey} className="border border-gray-100 rounded-xl overflow-hidden">
                          {/* Latest rate row */}
                          <div className="flex items-center gap-3 px-3.5 py-2.5 bg-gray-50">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-gray-800">{latest.division_name ?? "No Division"}</span>
                                {latest.qb_class && <span className="text-xs text-gray-500">{latest.qb_class}</span>}
                                {latest.is_default && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Default</span>}
                                {rates.length > 1 && <span className="text-[10px] text-gray-400">{rates.length} rates</span>}
                              </div>
                              <span className="text-xs text-gray-400">Effective {fmtDate(latest.effective_date)}{latest.end_date && ` → ${fmtDate(latest.end_date)}`}</span>
                            </div>
                            <span className="text-sm font-bold text-gray-800">${Number(latest.rate).toFixed(2)}<span className="text-xs text-gray-400 font-normal">/hr</span></span>
                            {!latest.is_default && (
                              <button onClick={() => setDefaultRate(latest.id)}
                                className="text-[10px] font-semibold text-gray-400 hover:text-green-700 px-2 py-1 rounded hover:bg-green-50 transition-colors whitespace-nowrap">
                                Set default
                              </button>
                            )}
                            <button onClick={() => setExpandedRateGroup(isExpanded ? null : groupKey)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors" title="View history / add raise">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                {isExpanded ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
                              </svg>
                            </button>
                          </div>
                          {/* Expanded: history + add raise */}
                          {isExpanded && (
                            <div className="px-3.5 py-2.5 space-y-2 bg-white border-t border-gray-100">
                              <div className="space-y-1">
                                {rates.map(r => (
                                  <div key={r.id} className="border-b border-gray-50 last:border-0">
                                    {editingRateId === r.id ? (
                                      <div className="py-2 space-y-2">
                                        <select value={editRateDivisionId} onChange={e => setEditRateDivisionId(e.target.value)} className={inputCls + " py-1.5 text-sm"}>
                                          <option value="">— No division (default) —</option>
                                          {divisions.filter(d => !d.time_clock_only).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                        </select>
                                        <div className="flex gap-2">
                                          <div className="relative flex-1">
                                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">$</span>
                                            <input autoFocus type="number" min={0} step={0.01}
                                              value={editRateAmount}
                                              onChange={e => setEditRateAmount(e.target.value)}
                                              className={inputCls + " pl-6 py-1.5 text-sm"}
                                              placeholder="0.00" />
                                          </div>
                                          <input type="date" value={editRateDate} onChange={e => setEditRateDate(e.target.value)} className={inputCls + " py-1.5 text-sm"} />
                                        </div>
                                        <div className="flex gap-2">
                                          <button onClick={() => editRate(r.id)} disabled={editRateSaving || !editRateAmount}
                                            className="text-xs font-semibold px-3 py-1.5 bg-[#123b1f] text-white rounded-lg hover:bg-[#1a5c2e] disabled:opacity-60 transition-colors">
                                            {editRateSaving ? "Saving…" : "Save"}
                                          </button>
                                          <button onClick={() => setEditingRateId(null)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5">Cancel</button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2 text-xs py-1.5">
                                        <span className="text-gray-400 w-20 shrink-0">{fmtDate(r.effective_date)}</span>
                                        <span className="font-semibold text-gray-700">${Number(r.rate).toFixed(2)}/hr</span>
                                        {r.is_default && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">Default</span>}
                                        <div className="ml-auto flex items-center gap-1">
                                          {!r.is_default && (
                                            <button onClick={() => setDefaultRate(r.id)} title="Set as default rate"
                                              className="text-[10px] font-semibold text-gray-400 hover:text-green-700 px-1.5 py-1 rounded hover:bg-green-50 transition-colors">
                                              Set default
                                            </button>
                                          )}
                                          <button onClick={() => { setEditingRateId(r.id); setEditRateAmount(String(r.rate)); setEditRateDate(r.effective_date); setEditRateDivisionId(r.division_id ?? ""); }}
                                            className="p-1 text-gray-300 hover:text-blue-500 rounded transition-colors" title="Edit rate">
                                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                          </button>
                                          <button onClick={() => deletePayRate(r.id)} className="p-1 text-gray-300 hover:text-red-400 rounded transition-colors" title="Delete">
                                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                            </svg>
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                              {addingRaiseFor === groupKey ? (
                                <div className="border border-green-200 bg-green-50/40 rounded-lg p-3 space-y-2">
                                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Add Raise</p>
                                  <TwoCol>
                                    <div>
                                      <label className={labelCls}>New Rate</label>
                                      <div className="relative">
                                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">$</span>
                                        <input autoFocus type="number" min={0} step={0.01} value={newRaiseAmount} onChange={e => setNewRaiseAmount(e.target.value)} className={inputCls + " pl-7"} placeholder="0.00" />
                                      </div>
                                    </div>
                                    <div>
                                      <label className={labelCls}>Effective Date</label>
                                      <input type="date" value={newRaiseDate} onChange={e => setNewRaiseDate(e.target.value)} className={inputCls} />
                                    </div>
                                  </TwoCol>
                                  <div className="flex gap-2">
                                    <button onClick={() => addRaise(latest.division_id, latest.division_name, latest.qb_class)} disabled={!newRaiseAmount || raiseSaving}
                                      className="bg-[#123b1f] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-[#1a5c2e] disabled:opacity-60 transition-colors">
                                      {raiseSaving ? "Saving…" : "Save Raise"}
                                    </button>
                                    <button onClick={() => { setAddingRaiseFor(null); setNewRaiseAmount(""); }} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2">Cancel</button>
                                  </div>
                                </div>
                              ) : (
                                <button onClick={() => { setAddingRaiseFor(groupKey); setNewRaiseDate(new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })); }}
                                  className="text-xs font-semibold text-[#123b1f] hover:text-[#1a5c2e] flex items-center gap-1 transition-colors">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                                  </svg>
                                  Add Raise
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              {addingRate && (
                <div className="border border-green-200 bg-green-50/40 rounded-xl p-4 space-y-3">
                  <TwoCol>
                    <div>
                      <label className={labelCls}>Division</label>
                      <select autoFocus value={newRateDivisionId}
                        onChange={e => {
                          const div = divisions.find(d => d.id === e.target.value);
                          setNewRateDivisionId(e.target.value);
                          if (div?.qb_class_name) setNewRateClass(div.qb_class_name);
                        }}
                        className={inputCls}>
                        <option value="">— Select division —</option>
                        {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>QB Class</label>
                      <FieldSelect
                        value={newRateClass}
                        onChange={setNewRateClass}
                        options={fieldOpts["qb_class"] ?? []}
                        placeholder="QB Class"
                      />
                    </div>
                  </TwoCol>
                  <TwoCol>
                    <div>
                      <label className={labelCls}>Hourly Rate</label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">$</span>
                        <input type="number" min={0} step={0.01} value={newRateAmount} onChange={e => setNewRateAmount(e.target.value)} className={inputCls + " pl-7"} placeholder="0.00" />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Effective Date</label>
                      <input type="date" value={newRateDate} onChange={e => setNewRateDate(e.target.value)} className={inputCls} />
                    </div>
                  </TwoCol>
                  <div className="flex items-center gap-3">
                    <Toggle checked={newRateDefault} onChange={setNewRateDefault} />
                    <span className="text-xs text-gray-600 font-medium">Set as default rate</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={addPayRate} disabled={rateSaving || !newRateAmount}
                      className="bg-[#123b1f] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-[#1a5c2e] disabled:opacity-60 transition-colors">
                      {rateSaving ? "Saving…" : "Add Rate"}
                    </button>
                    <button onClick={() => { setAddingRate(false); setNewRateDivisionId(""); setNewRateClass(""); setNewRateAmount(""); }}
                      className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2">Cancel</button>
                  </div>
                </div>
              )}
            </Section>}
          </Fragment>
        );

      case "address":
        return (
          <Fragment>
            <Section title={sectionTitle(sk)}>
              <TwoCol>
                <div>
                  <label className={labelCls}>Mobile Phone</label>
                  <input value={form.phone ?? ""} onChange={e => set("phone", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Personal Email</label>
                  <input type="email" value={form.personal_email ?? ""} onChange={e => set("personal_email", e.target.value)} className={inputCls} />
                </div>
              </TwoCol>
              <div>
                <label className={labelCls}>Address</label>
                <input value={form.address_line1 ?? ""} onChange={e => set("address_line1", e.target.value)} className={inputCls + " mb-2"} placeholder="Street address" />
                <input value={form.address_line2 ?? ""} onChange={e => set("address_line2", e.target.value)} className={inputCls} placeholder="Apt, suite, etc." />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className={labelCls}>City</label>
                  <input value={form.city ?? ""} onChange={e => set("city", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>State</label>
                  <input value={form.state ?? ""} onChange={e => set("state", e.target.value)} className={inputCls} maxLength={2} />
                </div>
                <div>
                  <label className={labelCls}>ZIP</label>
                  <input value={form.zip ?? ""} onChange={e => set("zip", e.target.value)} className={inputCls} />
                </div>
              </div>
            </Section>
            <Section title="Emergency Contact">
              <TwoCol>
                <div>
                  <label className={labelCls}>Contact Name</label>
                  <input value={form.emergency_contact_name ?? ""} onChange={e => set("emergency_contact_name", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Contact Phone</label>
                  <input value={form.emergency_contact_phone ?? ""} onChange={e => set("emergency_contact_phone", e.target.value)} className={inputCls} />
                </div>
              </TwoCol>
              {renderCustomFields("address")}
            </Section>
          </Fragment>
        );

      case "certifications":
        return (
          <Section title={sectionTitle(sk)}>
            <TwoCol>
              <div>
                <label className={labelCls}>CPR Expiration</label>
                <input type="date" value={form.cpr_expiration ?? ""} onChange={e => set("cpr_expiration", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>First Aid Expiration</label>
                <input type="date" value={form.first_aid_expiration ?? ""} onChange={e => set("first_aid_expiration", e.target.value)} className={inputCls} />
              </div>
            </TwoCol>
            <TwoCol>
              <div>
                <label className={labelCls}>DOT Card Expiration</label>
                <input type="date" value={form.dot_card_expiration ?? ""} onChange={e => set("dot_card_expiration", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Fert License Expiration</label>
                <input type="date" value={form.fert_license_expiration ?? ""} onChange={e => set("fert_license_expiration", e.target.value)} className={inputCls} />
              </div>
            </TwoCol>
            <div className="flex items-center gap-3 pt-1">
              <Toggle checked={!!form.is_driver} onChange={v => set("is_driver", v)} />
              <span className="text-sm text-gray-700 font-medium">Licensed Driver</span>
            </div>
            {form.is_driver && (
              <>
                <TwoCol>
                  <div>
                    <label className={labelCls}>License Type</label>
                    <FieldSelect
                      value={form.license_type ?? ""}
                      onChange={v => set("license_type", v)}
                      options={fieldOpts["license_type"] ?? []}
                      placeholder="License Type"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>License #</label>
                    <input value={form.drivers_license_number ?? ""} onChange={e => set("drivers_license_number", e.target.value)} className={inputCls} />
                  </div>
                </TwoCol>
                <TwoCol>
                  <div>
                    <label className={labelCls}>License Expiration</label>
                    <input type="date" value={form.drivers_license_expiration ?? ""} onChange={e => set("drivers_license_expiration", e.target.value)} className={inputCls} />
                  </div>
                </TwoCol>
              </>
            )}
            {renderCustomFields("certifications")}
          </Section>
        );

      case "benefits":
        return (
          <Section title={sectionTitle(sk)}>
            <TwoCol>
              <div>
                <label className={labelCls}>Health Care Plan</label>
                <FieldSelect
                  value={form.health_care_plan ?? ""}
                  onChange={v => set("health_care_plan", v)}
                  options={fieldOpts["health_care_plan"] ?? []}
                  placeholder="Health Care Plan"
                />
              </div>
              <div>
                <label className={labelCls}>PTO Plan</label>
                <FieldSelect
                  value={form.pto_plan ?? ""}
                  onChange={v => set("pto_plan", v)}
                  options={fieldOpts["pto_plan"] ?? []}
                  placeholder="PTO Plan"
                />
              </div>
            </TwoCol>
            <div>
              <label className={labelCls}>Electronic Devices</label>
              <input
                value={Array.isArray(form.electronic_devices) ? form.electronic_devices.join(", ") : (form.electronic_devices ?? "")}
                onChange={e => set("electronic_devices", e.target.value ? e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) : [])}
                className={inputCls}
                placeholder="e.g. iPhone, iPad (comma separated)"
                list="device-options"
              />
              {(fieldOpts["electronic_devices"] ?? []).length > 0 && (
                <datalist id="device-options">
                  {(fieldOpts["electronic_devices"] ?? []).map(o => <option key={o.id} value={o.label} />)}
                </datalist>
              )}
              <p className="text-xs text-gray-400 mt-1">Comma-separated. Configure device options in Profile Settings.</p>
            </div>
            <TwoCol>
              <div className="flex items-center gap-3">
                <Toggle checked={form.i9_on_file === true} onChange={v => set("i9_on_file", v)} />
                <span className="text-sm text-gray-700 font-medium">I-9 On File</span>
              </div>
              <div>
                <label className={labelCls}>Eligible for Rehire</label>
                <select
                  value={form.eligible_for_rehire === true ? "yes" : form.eligible_for_rehire === false ? "no" : ""}
                  onChange={e => set("eligible_for_rehire", e.target.value === "yes" ? true : e.target.value === "no" ? false : null)}
                  className={inputCls}
                >
                  <option value="">— Not set —</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
            </TwoCol>
            {renderCustomFields("benefits")}
          </Section>
        );

      case "hr_records":
        return (
          <Section title={sectionTitle(sk)}>
            <textarea
              value={form.notes ?? ""}
              onChange={e => set("notes", e.target.value)}
              rows={3}
              className={inputCls + " resize-none"}
              placeholder="Internal notes…"
            />
            {renderCustomFields("hr_records")}
          </Section>
        );

      default: {
        const sectionLabel = sectionCfg.find(s => s.section === sk)?.label ?? sk;
        const customFields = renderCustomFields(sk);
        if (!customFields) return null;
        return (
          <Section title={sectionLabel}>
            {customFields}
          </Section>
        );
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f0f4f0] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f4f0]">
      {/* Hidden file inputs */}
      <input ref={photoFileRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ""; }} />
      <input ref={photoCameraRef} type="file" accept="image/*" capture="user" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ""; }} />

      <div className="sticky top-0 z-40 px-4 md:px-8 py-6 md:py-8"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 text-white/50 text-xs mb-4">
            <Link href="/operations-center" className="hover:text-white/80 transition-colors">Operations Center</Link>
            <span>/</span>
            <Link href="/operations-center/atlas-time" className="hover:text-white/80 transition-colors">Atlas HR</Link>
            <span>/</span>
            <Link href="/operations-center/atlas-time/employees" className="hover:text-white/80 transition-colors">Team Members</Link>
            <span>/</span>
            <span className="text-white/80 truncate">{fullName}</span>
          </div>
          <div className="flex items-center gap-4">
            {/* Photo widget */}
            <div className="relative shrink-0 group">
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl overflow-hidden border-2 border-white/20 bg-white/10 flex items-center justify-center">
                {form.photo_url
                  ? <img src={form.photo_url} alt={fullName} className="w-full h-full object-cover" />
                  : <span className="text-white font-bold text-xl md:text-2xl select-none">
                      {form.first_name?.[0] ?? ""}{form.last_name?.[0] ?? ""}
                    </span>
                }
                {photoUploading && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-2xl">
                    <svg className="animate-spin w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                  </div>
                )}
              </div>
              {/* Overlay: always visible on mobile, hover on desktop */}
              {!photoUploading && (
                <div className="absolute inset-0 rounded-2xl bg-black/50 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 cursor-pointer">
                  <button onClick={() => photoFileRef.current?.click()} className="text-white text-[10px] font-semibold hover:text-green-300 active:text-green-300 transition-colors leading-tight">Upload</button>
                  <button onClick={() => photoCameraRef.current?.click()} className="text-white text-[10px] font-semibold hover:text-green-300 active:text-green-300 transition-colors leading-tight">Camera</button>
                  {form.photo_url && <button onClick={removePhoto} className="text-white/60 text-[10px] hover:text-red-400 active:text-red-400 transition-colors leading-tight">Remove</button>}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight flex-1 truncate">{fullName}</h1>
                {form.status && (
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${STATUS_COLORS[form.status] ?? "bg-gray-100 text-gray-500"}`}>
                    {form.status.charAt(0).toUpperCase() + form.status.slice(1).replace("_", " ")}
                  </span>
                )}
              </div>
              {form.hire_date && (
                <p className="text-white/50 text-sm mt-1">
                  Hired {fmtDate(form.hire_date)}{form.job_title && ` · ${form.job_title}`}
                </p>
              )}
              {photoError && <p className="text-red-300 text-xs mt-1">{photoError}</p>}
            </div>
          </div>
        </div>
      </div>

      <div className={`px-4 md:px-8 py-6 max-w-4xl mx-auto space-y-4 ${hasNav ? "pb-24" : ""}`}>
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        {success && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            {success}
          </div>
        )}

        {orderedSections.map(sk => (
          <Fragment key={sk}>{renderSection(sk)}</Fragment>
        ))}

        {/* Uniforms & Gear — always visible */}
        <Section title="Uniforms & Gear" desc="Initial issue tracking. Costs wire to inventory management.">
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Issued Items</p>
              <button onClick={() => setAddingItem(true)} className="text-xs font-semibold text-[#123b1f] hover:text-[#1a5c2e] flex items-center gap-1 transition-colors">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add Item
              </button>
            </div>
            {uniformItems.length === 0 && !addingItem && <p className="text-xs text-gray-400 py-1">No items issued yet.</p>}
            {uniformItems.length > 0 && (() => {
              // Group by subsection
              const groups: { label: string; items: UniformItem[] }[] = [];
              const seen = new Map<string, UniformItem[]>();
              for (const item of uniformItems) {
                const key = item.subsection || "";
                if (!seen.has(key)) { seen.set(key, []); groups.push({ label: key, items: seen.get(key)! }); }
                seen.get(key)!.push(item);
              }
              // Compute anySize/anyColor across ALL items so every group uses the same columns
              const anySize = uniformItems.some(i => (fieldOpts["uniform_items"] ?? []).find(o => o.label === i.item)?.requires_size !== false);
              const anyColor = uniformItems.some(i => {
                const opt = (fieldOpts["uniform_items"] ?? []).find(o => o.label === i.item);
                return opt ? (uniformVariants[opt.id]?.colors.length ?? 0) > 0 : false;
              });
              const colClass = anySize && anyColor
                ? "grid-cols-[160px_72px_64px_64px_52px_112px_172px_32px]"
                : anySize || anyColor
                ? "grid-cols-[160px_72px_64px_52px_112px_172px_32px]"
                : "grid-cols-[160px_72px_52px_112px_172px_32px]";
              return (
                <div className="overflow-x-auto -mx-5 px-5">
                <div className="space-y-3 mb-3 min-w-max">
                  {/* Shared column header across all groups */}
                  <div className={`grid gap-x-2 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide ${colClass}`}>
                    <span>Item</span>
                    <span className="text-center">Cost</span>
                    {anySize && <span className="text-center">Size</span>}
                    {anyColor && <span className="text-center">Color</span>}
                    <span className="text-center">Qty</span>
                    <span className="text-center">Date Issued</span>
                    <span className="text-center">Type</span>
                    <span />
                  </div>
                  {groups.map(group => (
                    <div key={group.label}>
                      {group.label && (
                        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1 mb-1">{group.label}</div>
                      )}
                      <div className="space-y-1">
                        {group.items.map(item => {
                          const itemOpt = (fieldOpts["uniform_items"] ?? []).find(o => o.label === item.item);
                          const showSize = itemOpt?.requires_size !== false;
                          const sizeVars = uniformVariants[itemOpt?.id ?? ""]?.sizes ?? [];
                          const colorVars = uniformVariants[itemOpt?.id ?? ""]?.colors ?? [];
                          return (
                            <div key={item.key} className={`grid gap-x-2 items-center bg-gray-50 rounded-xl px-3 py-2 ${colClass}`}>
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-800 truncate">{item.item}</div>
                              </div>
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                                <CostInput
                                  value={item.cost}
                                  onChange={v => updateUniformItem(item.key, { cost: v })}
                                  className="w-full border border-gray-200 rounded-lg pl-5 pr-1 py-1 text-xs text-center bg-white focus:outline-none focus:ring-1 focus:ring-green-500" />
                              </div>
                              {anySize && (
                                showSize ? (
                                  sizeVars.length > 0 ? (
                                    <select value={item.size ?? ""} onChange={e => {
                                      const sv = sizeVars.find(v => v.label === e.target.value);
                                      const patch: Partial<UniformItem> = { size: e.target.value };
                                      if (sv?.cost != null) patch.cost = sv.cost;
                                      updateUniformItem(item.key, patch);
                                    }} className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs text-center bg-white focus:outline-none focus:ring-1 focus:ring-green-500">
                                      <option value="">—</option>
                                      {sizeVars.map(v => <option key={v.id} value={v.label}>{v.label}</option>)}
                                    </select>
                                  ) : (
                                    <input value={item.size ?? ""} onChange={e => updateUniformItem(item.key, { size: e.target.value })}
                                      placeholder="—" className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs text-center bg-white focus:outline-none focus:ring-1 focus:ring-green-500" />
                                  )
                                ) : <div />
                              )}
                              {anyColor && (
                                colorVars.length > 0 ? (
                                  <select value={item.color ?? ""} onChange={e => updateUniformItem(item.key, { color: e.target.value })}
                                    className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs text-center bg-white focus:outline-none focus:ring-1 focus:ring-green-500">
                                    <option value="">—</option>
                                    {colorVars.map(v => <option key={v.id} value={v.label}>{v.label}</option>)}
                                  </select>
                                ) : <div />
                              )}
                              <QtyInput
                                value={item.qty ?? 1}
                                onChange={v => updateUniformItem(item.key, { qty: v })}
                                className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs text-center bg-white focus:outline-none focus:ring-1 focus:ring-green-500" />
                              <input type="date" value={item.issued_date}
                                onChange={e => updateUniformItem(item.key, { issued_date: e.target.value })}
                                className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs text-center bg-white focus:outline-none focus:ring-1 focus:ring-green-500" />
                              <select value={item.issued_type ?? "company_issued"}
                                onChange={e => updateUniformItem(item.key, { issued_type: e.target.value as "company_issued" | "team_member_purchase" })}
                                className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs text-center bg-white focus:outline-none focus:ring-1 focus:ring-green-500">
                                <option value="company_issued">Company Issued</option>
                                <option value="team_member_purchase">Team Member Purchase</option>
                              </select>
                              <button onClick={() => removeUniformItem(item.key)} className="p-1 text-gray-300 hover:text-red-400 rounded transition-colors flex items-center justify-center">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                              </button>
                            </div>
                          );
                        })}
                        {(() => {
                          const subtotal = group.items.reduce((sum, i) => sum + (i.cost ?? 0) * (i.qty ?? 1), 0);
                          if (subtotal === 0) return null;
                          return (
                            <div className={`grid gap-x-2 px-3 pt-1 border-t border-gray-100 mt-1 ${colClass}`}>
                              <span className="text-[10px] text-gray-400 italic">Subtotal</span>
                              <span className="text-[10px] font-semibold text-gray-600 text-center">${subtotal.toFixed(2)}</span>
                              {anySize && <span />}{anyColor && <span />}<span /><span /><span /><span />
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
                </div>
              );
            })()}
            {addingItem && (
              <div className="border border-green-200 bg-green-50/40 rounded-xl p-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>Item</label>
                    {(fieldOpts["uniform_items"] ?? []).length > 0 ? (
                      <select autoFocus value={newItemName}
                        onChange={e => {
                          const opt = (fieldOpts["uniform_items"] ?? []).find(o => o.label === e.target.value);
                          setNewItemName(e.target.value);
                          setNewItemOptionId(opt?.id ?? "");
                          setNewItemSizeVariantId("");
                          setNewItemColorVariantId("");
                          setNewItemSize("");
                          setNewItemColor("");
                          if (opt?.cost != null) setNewItemCost(String(opt.cost));
                          if (opt?.subsection) setNewItemSubsection(opt.subsection);
                        }}
                        className={inputCls}>
                        <option value="">— Select item —</option>
                        {(fieldOpts["uniform_items"] ?? []).map(o => <option key={o.id} value={o.label}>{o.label}</option>)}
                      </select>
                    ) : (
                      <input autoFocus value={newItemName} onChange={e => setNewItemName(e.target.value)}
                        className={inputCls} placeholder="Add items in Profile Settings" />
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Cost</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-semibold">$</span>
                      <input type="number" min={0} step={0.01} value={newItemCost} onChange={e => setNewItemCost(e.target.value)}
                        className={inputCls + " pl-7"} placeholder="0.00" />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Subsection</label>
                    {(fieldOpts["uniform_subsections"] ?? []).length > 0 ? (
                      <select value={newItemSubsection} onChange={e => setNewItemSubsection(e.target.value)} className={inputCls}>
                        <option value="">— None —</option>
                        {(fieldOpts["uniform_subsections"] ?? []).map(o => <option key={o.id} value={o.label}>{o.label}</option>)}
                      </select>
                    ) : (
                      <input value={newItemSubsection} onChange={e => setNewItemSubsection(e.target.value)} className={inputCls} placeholder="e.g. Miscellaneous" />
                    )}
                  </div>
                </div>
                {(() => {
                  const addOpt = (fieldOpts["uniform_items"] ?? []).find(o => o.label === newItemName);
                  const addSizeVars = uniformVariants[addOpt?.id ?? ""]?.sizes ?? [];
                  const addColorVars = uniformVariants[addOpt?.id ?? ""]?.colors ?? [];
                  const addShowSize = addOpt?.requires_size !== false;
                  const addCols = (addShowSize ? 1 : 0) + (addColorVars.length > 0 ? 1 : 0) + 1;
                  const addColClass = addCols === 3 ? "grid-cols-3" : addCols === 2 ? "grid-cols-2" : "grid-cols-1";
                  return (
                    <div className={`grid gap-3 ${addColClass}`}>
                      {addShowSize && (
                        <div>
                          <label className={labelCls}>Size</label>
                          {addSizeVars.length > 0 ? (
                            <select value={newItemSize} onChange={e => {
                              setNewItemSize(e.target.value);
                              const sv = addSizeVars.find(v => v.label === e.target.value);
                              setNewItemSizeVariantId(sv?.id ?? "");
                              if (sv?.cost != null) setNewItemCost(String(sv.cost));
                            }} className={inputCls}>
                              <option value="">— Select size —</option>
                              {addSizeVars.map(v => <option key={v.id} value={v.label}>{v.label}</option>)}
                            </select>
                          ) : (
                            <input value={newItemSize} onChange={e => setNewItemSize(e.target.value)} className={inputCls} placeholder="e.g. L, XL" />
                          )}
                        </div>
                      )}
                      {addColorVars.length > 0 && (
                        <div>
                          <label className={labelCls}>Color</label>
                          <select value={newItemColor} onChange={e => {
                            setNewItemColor(e.target.value);
                            const cv = addColorVars.find(v => v.label === e.target.value);
                            setNewItemColorVariantId(cv?.id ?? "");
                          }} className={inputCls}>
                            <option value="">— Select color —</option>
                            {addColorVars.map(v => <option key={v.id} value={v.label}>{v.label}</option>)}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className={labelCls}>Qty</label>
                        <input type="number" min={1} step={1} value={newItemQty} onChange={e => setNewItemQty(e.target.value)} className={inputCls} />
                      </div>
                    </div>
                  );
                })()}
                <TwoCol>
                  <div>
                    <label className={labelCls}>Date Issued</label>
                    <input type="date" value={newItemDate} onChange={e => setNewItemDate(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Type</label>
                    <select value={newItemType} onChange={e => setNewItemType(e.target.value as "company_issued" | "team_member_purchase")} className={inputCls}>
                      <option value="company_issued">Company Issued</option>
                      <option value="team_member_purchase">Team Member Purchase</option>
                    </select>
                  </div>
                </TwoCol>
                <div className="flex gap-2 items-center">
                  <button onClick={addUniformItem} disabled={!newItemName.trim() || newItemAdding}
                    className="bg-[#123b1f] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-[#1a5c2e] disabled:opacity-60 transition-colors">
                    {newItemAdding ? "Adding…" : "Add Item"}
                  </button>
                  <button onClick={() => { setAddingItem(false); setNewItemName(""); setNewItemOptionId(""); setNewItemSizeVariantId(""); setNewItemColorVariantId(""); setNewItemCost(""); setNewItemType("company_issued"); setNewItemSubsection(""); setNewItemSize(""); setNewItemQty("1"); setNewItemColor(""); }}
                    className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2">Cancel</button>
                  {newItemAdding && <span className="text-[11px] text-gray-400">Creating inventory record…</span>}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className={labelCls}>Notes</label>
            <textarea value={form.uniform_notes ?? ""} onChange={e => set("uniform_notes", e.target.value)}
              rows={2} className={inputCls + " resize-none"} placeholder="Notes on issued items, fit, missing items…" />
          </div>
        </Section>

        {/* Termination */}
        {form.status !== "terminated" && (
          <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-red-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-red-700">Termination</h2>
              <button onClick={() => setShowTerminate(!showTerminate)} className="text-xs text-red-500 hover:text-red-700 font-semibold transition-colors">
                {showTerminate ? "Hide" : "Terminate Team Member"}
              </button>
            </div>
            {showTerminate && (
              <div className="px-5 py-4 space-y-4">
                <TwoCol>
                  <div>
                    <label className={labelCls}>Termination Date *</label>
                    <input type="date" value={form.termination_date ?? ""} onChange={e => set("termination_date", e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Reason</label>
                    <FieldSelect
                      value={form.termination_reason ?? ""}
                      onChange={v => set("termination_reason", v)}
                      options={fieldOpts["termination_reason"]?.length ? fieldOpts["termination_reason"] : DEFAULT_TERM_REASONS}
                      placeholder="Select reason"
                    />
                  </div>
                </TwoCol>
                <div>
                  <label className={labelCls}>Notes</label>
                  <textarea value={form.termination_notes ?? ""} onChange={e => set("termination_notes", e.target.value)}
                    rows={2} className={inputCls + " resize-none"} placeholder="Optional notes…" />
                </div>
                <TwoCol>
                  <div className="flex items-center gap-3">
                    <Toggle checked={form.final_check_issued ?? false} onChange={v => set("final_check_issued", v)} />
                    <span className="text-sm text-gray-700">Final paycheck issued</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Toggle checked={form.equipment_returned ?? false} onChange={v => set("equipment_returned", v)} />
                    <span className="text-sm text-gray-700">Equipment returned</span>
                  </div>
                </TwoCol>
                {form.final_check_issued && (
                  <div>
                    <label className={labelCls}>Final Check Date</label>
                    <input type="date" value={form.final_check_date ?? ""} onChange={e => set("final_check_date", e.target.value)} className={inputCls} />
                  </div>
                )}
                <button onClick={terminate} disabled={saving}
                  className="bg-red-600 text-white font-semibold py-2.5 px-6 rounded-xl hover:bg-red-700 disabled:opacity-60 transition-colors text-sm">
                  {saving ? "Processing…" : "Confirm Termination"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pb-6">
          <Link href="/operations-center/atlas-time/employees"
            className="border border-gray-200 bg-white text-gray-600 font-medium py-2.5 px-4 rounded-xl hover:bg-gray-50 transition-colors text-sm">
            ← Back to Team Members
          </Link>
          <span className="text-xs text-gray-400">
            {saving ? (
              <span className="flex items-center gap-1.5">
                <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                Saving…
              </span>
            ) : success ? (
              <span className="flex items-center gap-1.5 text-green-600">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                Saved
              </span>
            ) : "Changes save automatically"}
          </span>
        </div>
      </div>

      {/* Sticky prev/next navigation */}
      {hasNav && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-t border-gray-200 shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
          <div className="max-w-4xl mx-auto px-3 py-2 flex items-center gap-2">
            {/* Prev */}
            {prevEmp ? (
              <Link href={`/operations-center/atlas-time/employees/${prevEmp.id}`}
                className="flex items-center gap-2 flex-1 min-w-0 px-3 py-2 rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-gray-400"><polyline points="15 18 9 12 15 6"/></svg>
                <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 bg-[#123b1f]/10 flex items-center justify-center">
                  {prevEmp.photo_url
                    ? <img src={prevEmp.photo_url} alt="" className="w-full h-full object-cover" />
                    : <span className="text-[#123b1f] font-bold text-[10px]">{prevEmp.first_name[0]}{prevEmp.last_name[0]}</span>
                  }
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-400 leading-none mb-0.5">Previous</p>
                  <p className="text-xs font-semibold text-gray-700 truncate">{prevEmp.first_name} {prevEmp.last_name}</p>
                </div>
              </Link>
            ) : <div className="flex-1" />}

            {/* Center count */}
            {navIdx >= 0 && (
              <span className="shrink-0 text-[10px] text-gray-400 font-medium tabular-nums px-1">
                {navIdx + 1}/{navEmployees.length}
              </span>
            )}

            {/* Next */}
            {nextEmp ? (
              <Link href={`/operations-center/atlas-time/employees/${nextEmp.id}`}
                className="flex items-center gap-2 flex-row-reverse flex-1 min-w-0 px-3 py-2 rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-gray-400"><polyline points="9 18 15 12 9 6"/></svg>
                <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 bg-[#123b1f]/10 flex items-center justify-center">
                  {nextEmp.photo_url
                    ? <img src={nextEmp.photo_url} alt="" className="w-full h-full object-cover" />
                    : <span className="text-[#123b1f] font-bold text-[10px]">{nextEmp.first_name[0]}{nextEmp.last_name[0]}</span>
                  }
                </div>
                <div className="min-w-0 text-right">
                  <p className="text-[10px] text-gray-400 leading-none mb-0.5">Next</p>
                  <p className="text-xs font-semibold text-gray-700 truncate">{nextEmp.first_name} {nextEmp.last_name}</p>
                </div>
              </Link>
            ) : <div className="flex-1" />}
          </div>
        </div>
      )}
    </div>
  );
}
