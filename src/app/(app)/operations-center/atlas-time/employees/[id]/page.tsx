"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

const inputCls = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all";
const labelCls = "block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide";
const descCls = "text-xs text-gray-400 mb-2";

type Division = { id: string; name: string; active: boolean; time_clock_only: boolean; qb_class_name: string | null };
type PayRate = { id: string; division_id: string | null; division_name: string | null; qb_class: string | null; rate: number; effective_date: string; end_date: string | null; is_default: boolean };
type Employee = Record<string, any>;
type UniformItem = { key: string; item: string; cost: number | null; issued_date: string; issued_type: "company_issued" | "team_member_purchase"; subsection?: string; size?: string; qty?: number; color?: string };
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
  const [newItemCost, setNewItemCost] = useState("");
  const [newItemDate, setNewItemDate] = useState(new Date().toISOString().slice(0, 10));
  const [newItemType, setNewItemType] = useState<"company_issued" | "team_member_purchase">("company_issued");
  const [newItemSubsection, setNewItemSubsection] = useState("");
  const [newItemSize, setNewItemSize] = useState("");
  const [newItemQty, setNewItemQty] = useState("1");
  const [newItemColor, setNewItemColor] = useState("");
  const [uniformVariants, setUniformVariants] = useState<Record<string, { sizes: Variant[]; colors: Variant[] }>>({});

  const [addingRate, setAddingRate] = useState(false);
  const [newRateDivisionId, setNewRateDivisionId] = useState("");
  const [newRateClass, setNewRateClass] = useState("");
  const [newRateAmount, setNewRateAmount] = useState("");
  const [newRateDate, setNewRateDate] = useState(new Date().toISOString().slice(0, 10));
  const [newRateDefault, setNewRateDefault] = useState(false);
  const [rateSaving, setRateSaving] = useState(false);

  const [showTerminate, setShowTerminate] = useState(false);

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
      const [empRes, divRes, fcRes, foRes, cfRes, cvRes, uvRes] = await Promise.all([
        fetch(`/api/atlas-time/employees/${id}`, { cache: "no-store" }),
        fetch("/api/atlas-time/divisions", { cache: "no-store" }),
        fetch("/api/atlas-time/field-config", { cache: "no-store" }),
        fetch("/api/atlas-time/field-options", { cache: "no-store" }),
        fetch("/api/atlas-time/custom-fields", { cache: "no-store" }),
        fetch(`/api/atlas-time/employees/${id}/custom-values`, { cache: "no-store" }),
        fetch("/api/atlas-time/uniform-variants", { cache: "no-store" }),
      ]);
      const empJson = await empRes.json().catch(() => null);
      const divJson = await divRes.json().catch(() => null);
      const fcJson = await fcRes.json().catch(() => ({}));
      const foJson = await foRes.json().catch(() => ({}));
      const cfJson = await cfRes.json().catch(() => ({}));
      const cvJson = await cvRes.json().catch(() => ({}));
      const uvJson = await uvRes.json().catch(() => ({}));

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
          issued_date: new Date().toISOString().slice(0, 10),
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

  function addUniformItem() {
    if (!newItemName.trim()) return;
    setUniformItems(prev => [...prev, {
      key: `${Date.now()}`,
      item: newItemName.trim(),
      cost: newItemCost !== "" ? Number(newItemCost) : null,
      issued_date: newItemDate,
      issued_type: newItemType,
      subsection: newItemSubsection,
      size: newItemSize,
      qty: newItemQty !== "" ? Number(newItemQty) : 1,
      color: newItemColor,
    }]);
    setNewItemName(""); setNewItemCost(""); setNewItemType("company_issued");
    setNewItemSubsection(""); setNewItemSize(""); setNewItemQty("1"); setNewItemColor(""); setAddingItem(false);
  }

  function updateUniformItem(key: string, patch: Partial<UniformItem>) {
    setUniformItems(prev => prev.map(i => i.key === key ? { ...i, ...patch } : i));
  }

  function removeUniformItem(key: string) {
    setUniformItems(prev => prev.filter(i => i.key !== key));
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

  async function deletePayRate(rateId: string) {
    if (!confirm("Remove this pay rate?")) return;
    const res = await fetch(`/api/atlas-time/employees/${id}/pay-rates?rate_id=${rateId}`, { method: "DELETE" });
    if (res.ok) setPayRates(prev => prev.filter(r => r.id !== rateId));
    else { const j = await res.json().catch(() => null); setError(j?.error ?? "Failed"); }
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
            <div className="grid grid-cols-[1fr_80px_1fr] gap-3">
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
                        value={newPin !== "" ? newPin : (form.kiosk_pin ? "••••" : "")}
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

              <div className="max-w-xs">
                <label className={labelCls}>Status</label>
                <select value={form.status ?? "active"} onChange={e => set("status", e.target.value)} className={inputCls}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="on_leave">On Leave</option>
                  <option value="terminated">Terminated</option>
                </select>
              </div>
              {renderCustomFields("employment")}
            </Section>

            <Section title="Pay Rates"
              action={
                <button onClick={() => setAddingRate(true)} className="text-xs font-semibold text-[#123b1f] hover:text-[#1a5c2e] transition-colors flex items-center gap-1 shrink-0">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Add Rate
                </button>
              }
            >
              {payRates.length === 0 && !addingRate && (
                <p className="text-sm text-gray-400">No pay rates on file. The default rate above is used for payroll.</p>
              )}
              {payRates.length > 0 && (
                <div className="space-y-2">
                  {payRates.map(r => (
                    <div key={r.id} className="flex items-center gap-3 px-3.5 py-2.5 bg-gray-50 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-800">{r.division_name ?? "No Division"}</span>
                          {r.qb_class && <span className="text-xs text-gray-500">{r.qb_class}</span>}
                          {r.is_default && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Default</span>}
                        </div>
                        <span className="text-xs text-gray-400">
                          Effective {fmtDate(r.effective_date)}{r.end_date && ` → ${fmtDate(r.end_date)}`}
                        </span>
                      </div>
                      <span className="text-sm font-bold text-gray-800">${Number(r.rate).toFixed(2)}<span className="text-xs text-gray-400 font-normal">/hr</span></span>
                      <button onClick={() => deletePayRate(r.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
            </Section>
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
      <div className="px-4 md:px-8 py-6 md:py-8"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}>
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 text-white/50 text-xs mb-2">
            <Link href="/operations-center" className="hover:text-white/80 transition-colors">Operations Center</Link>
            <span>/</span>
            <Link href="/operations-center/atlas-time" className="hover:text-white/80 transition-colors">Atlas HR</Link>
            <span>/</span>
            <Link href="/operations-center/atlas-time/employees" className="hover:text-white/80 transition-colors">Team Members</Link>
            <span>/</span>
            <span className="text-white/80 truncate">{fullName}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight flex-1 truncate">{fullName}</h1>
            {form.status && (
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[form.status] ?? "bg-gray-100 text-gray-500"}`}>
                {form.status.charAt(0).toUpperCase() + form.status.slice(1).replace("_", " ")}
              </span>
            )}
          </div>
          {form.hire_date && (
            <p className="text-white/50 text-sm mt-1">
              Hired {fmtDate(form.hire_date)}{form.job_title && ` · ${form.job_title}`}
            </p>
          )}
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto space-y-4">
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
                ? "grid-cols-[1fr_68px_60px_60px_48px_108px_1fr_28px]"
                : anySize || anyColor
                ? "grid-cols-[1fr_68px_60px_48px_108px_1fr_28px]"
                : "grid-cols-[1fr_68px_48px_108px_1fr_28px]";
              return (
                <div className="space-y-3 mb-3">
                  {/* Shared column header across all groups */}
                  <div className={`grid gap-1.5 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide ${colClass}`}>
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
                            <div key={item.key} className={`grid gap-1.5 items-center bg-gray-50 rounded-xl px-3 py-2 ${colClass}`}>
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-800 truncate">{item.item}</div>
                                {(fieldOpts["uniform_subsections"] ?? []).length > 0 ? (
                                  <select value={item.subsection ?? ""} onChange={e => updateUniformItem(item.key, { subsection: e.target.value })}
                                    className="mt-0.5 w-full border border-gray-100 rounded-md px-1.5 py-0.5 text-[10px] bg-white text-gray-400 focus:outline-none focus:ring-1 focus:ring-green-500">
                                    <option value="">— section —</option>
                                    {(fieldOpts["uniform_subsections"] ?? []).map(o => <option key={o.id} value={o.label}>{o.label}</option>)}
                                  </select>
                                ) : (item.subsection ? <div className="text-[10px] text-gray-400 mt-0.5">{item.subsection}</div> : null)}
                              </div>
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                                <input type="number" min={0} step={0.01}
                                  value={item.cost ?? ""}
                                  onChange={e => updateUniformItem(item.key, { cost: e.target.value === "" ? null : Number(e.target.value) })}
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
                              <input type="number" min={1} step={1}
                                value={item.qty ?? 1}
                                onChange={e => updateUniformItem(item.key, { qty: Number(e.target.value) })}
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
                      </div>
                    </div>
                  ))}
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
                          <select value={newItemColor} onChange={e => setNewItemColor(e.target.value)} className={inputCls}>
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
                <div className="flex gap-2">
                  <button onClick={addUniformItem} disabled={!newItemName.trim()}
                    className="bg-[#123b1f] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-[#1a5c2e] disabled:opacity-60 transition-colors">Add Item</button>
                  <button onClick={() => { setAddingItem(false); setNewItemName(""); setNewItemCost(""); setNewItemType("company_issued"); setNewItemSubsection(""); setNewItemSize(""); setNewItemQty("1"); setNewItemColor(""); }}
                    className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2">Cancel</button>
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
    </div>
  );
}
