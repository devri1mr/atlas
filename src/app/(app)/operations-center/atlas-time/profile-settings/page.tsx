"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type SectionCfg = { id: string; section: string; label: string; sort_order: number; visible: boolean };
type FieldOption = { id: string; field_key: string; label: string; cost: number | null; sort_order: number; active: boolean; is_default?: boolean; default_qty?: number | null; subsection?: string | null; requires_size?: boolean };
type Variant = { id: string; item_option_id: string; variant_type: "size" | "color"; label: string; cost: number | null; sort_order: number; active: boolean };
type CustomFieldDef = {
  id: string; label: string; field_key: string; field_type: string;
  section: string; sort_order: number; active: boolean; options: string[];
};

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Long Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "toggle", label: "Yes / No" },
  { value: "dropdown", label: "Dropdown" },
];

const BUILT_IN_FIELDS: { key: string; label: string; hasCost?: boolean; hasDefault?: boolean; hasSubsection?: boolean; hasRequiresSize?: boolean }[] = [
  { key: "job_title", label: "Job Title" },
  { key: "qb_class", label: "QB Class" },
  { key: "uniform_subsections", label: "Uniform Subsections" },
  { key: "uniform_items", label: "Uniform Items", hasCost: true, hasDefault: true, hasSubsection: true, hasRequiresSize: true },
  { key: "license_type", label: "License Type" },
  { key: "pto_plan", label: "PTO Plan" },
  { key: "electronic_devices", label: "Electronic Devices" },
  { key: "health_care_plan", label: "Health Care Plan" },
  { key: "termination_reason", label: "Termination Reason" },
];

const inputCls = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#123b1f]/30 focus:border-[#123b1f] transition-all";

export default function ProfileSettingsPage() {
  const [tab, setTab] = useState<"sections" | "custom" | "dropdowns" | "columns">("sections");

  // ── Sections ──
  const [sections, setSections] = useState<SectionCfg[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [sectionSaving, setSectionSaving] = useState(false);
  const [sectionMsg, setSectionMsg] = useState("");
  const dragIdx = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionLabel, setEditingSectionLabel] = useState("");

  // ── Custom fields ──
  const [customFields, setCustomFields] = useState<CustomFieldDef[]>([]);
  const [customLoading, setCustomLoading] = useState(true);
  const [showAddField, setShowAddField] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState("text");
  const [newSection, setNewSection] = useState("");
  const [newSectionName, setNewSectionName] = useState("");
  const [isNewSection, setIsNewSection] = useState(false);
  const [newOptions, setNewOptions] = useState<string[]>([]);
  const [newOptionInput, setNewOptionInput] = useState("");
  const [addingField, setAddingField] = useState(false);
  const [editingField, setEditingField] = useState<CustomFieldDef | null>(null);

  // ── Dropdown options ──
  const [selectedBuiltIn, setSelectedBuiltIn] = useState(BUILT_IN_FIELDS[0].key);
  const [options, setOptions] = useState<FieldOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [newOptionLabel, setNewOptionLabel] = useState("");
  const [newOptionCost, setNewOptionCost] = useState("");
  const [addingOption, setAddingOption] = useState(false);
  const [editingOptId, setEditingOptId] = useState<string | null>(null);
  const [editingOptLabel, setEditingOptLabel] = useState("");
  const [editingOptCost, setEditingOptCost] = useState("");
  const [editingOptIsDefault, setEditingOptIsDefault] = useState(false);
  const [editingOptDefaultQty, setEditingOptDefaultQty] = useState("1");
  const [editingOptSubsection, setEditingOptSubsection] = useState("");
  const [editingOptRequiresSize, setEditingOptRequiresSize] = useState(true);

  const [newOptionIsDefault, setNewOptionIsDefault] = useState(false);
  const [newOptionDefaultQty, setNewOptionDefaultQty] = useState("1");
  const [newOptionSubsection, setNewOptionSubsection] = useState("");
  const [newOptionRequiresSize, setNewOptionRequiresSize] = useState(true);
  const [subsectionOpts, setSubsectionOpts] = useState<FieldOption[]>([]);

  // ── Uniform variants ──
  const [expandedVariantItemId, setExpandedVariantItemId] = useState<string | null>(null);
  const [itemVariants, setItemVariants] = useState<Record<string, { sizes: Variant[]; colors: Variant[] }>>({});
  const [newSizeLabel, setNewSizeLabel] = useState("");
  const [newSizeCost, setNewSizeCost] = useState("");
  const [newColorLabel, setNewColorLabel] = useState("");
  const [addingVariant, setAddingVariant] = useState(false);
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [editingVariantLabel, setEditingVariantLabel] = useState("");
  const [editingVariantCost, setEditingVariantCost] = useState("");

  const [error, setError] = useState("");

  // ── Column visibility ──
  const TEAM_COLS = [
    { key: "status", label: "Status" },
    { key: "job_title", label: "Job Title" },
    { key: "department", label: "Department" },
    { key: "division", label: "Division" },
    { key: "hire_date", label: "Hire Date" },
    { key: "pay_rate", label: "Pay Rate" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
  ] as const;
  const CLOCK_COLS = [
    { key: "job_title", label: "Job Title" },
    { key: "division", label: "Division" },
    { key: "department", label: "Department" },
    { key: "clock_in_time", label: "Clock In Time" },
    { key: "elapsed", label: "Elapsed" },
    { key: "punch_method", label: "Method" },
  ] as const;
  type TeamColKey = typeof TEAM_COLS[number]["key"];
  type ClockColKey = typeof CLOCK_COLS[number]["key"];

  const defaultTeamCols: Record<TeamColKey, boolean> = { status: true, job_title: true, department: true, division: false, hire_date: true, pay_rate: true, phone: false, email: false };
  const defaultClockCols: Record<ClockColKey, boolean> = { job_title: true, division: true, department: true, clock_in_time: true, elapsed: true, punch_method: false };

  const [teamCols, setTeamCols] = useState<Record<TeamColKey, boolean>>(defaultTeamCols);
  const [clockCols, setClockCols] = useState<Record<ClockColKey, boolean>>(defaultClockCols);

  useEffect(() => {
    try {
      const t = localStorage.getItem("tm-list-cols");
      const c = localStorage.getItem("tm-clock-cols");
      if (t) setTeamCols({ ...defaultTeamCols, ...JSON.parse(t) });
      if (c) setClockCols({ ...defaultClockCols, ...JSON.parse(c) });
    } catch {}
  }, []);

  function saveTeamCol(key: TeamColKey, val: boolean) {
    const next = { ...teamCols, [key]: val };
    setTeamCols(next);
    try {
      localStorage.setItem("tm-list-cols", JSON.stringify(next));
      window.dispatchEvent(new StorageEvent("storage", { key: "tm-list-cols", newValue: JSON.stringify(next) }));
    } catch {}
  }
  function saveClockCol(key: ClockColKey, val: boolean) {
    const next = { ...clockCols, [key]: val };
    setClockCols(next);
    try {
      localStorage.setItem("tm-clock-cols", JSON.stringify(next));
      window.dispatchEvent(new StorageEvent("storage", { key: "tm-clock-cols", newValue: JSON.stringify(next) }));
    } catch {}
  }

  useEffect(() => {
    loadSections();
    loadCustomFields();
  }, []);

  useEffect(() => { loadBuiltInOptions(selectedBuiltIn); }, [selectedBuiltIn]);

  useEffect(() => {
    if (selectedBuiltIn === "uniform_items") {
      fetch("/api/atlas-time/field-options?field_key=uniform_subsections")
        .then(r => r.json()).then(j => setSubsectionOpts(j.options ?? []));
    }
  }, [selectedBuiltIn]);

  async function loadSections() {
    setSectionsLoading(true);
    const r = await fetch("/api/atlas-time/field-config");
    const j = await r.json();
    setSections(j.sections ?? []);
    setSectionsLoading(false);
  }

  async function loadCustomFields() {
    setCustomLoading(true);
    const r = await fetch("/api/atlas-time/custom-fields");
    const j = await r.json();
    setCustomFields(j.fields ?? []);
    setCustomLoading(false);
  }

  async function loadBuiltInOptions(fieldKey: string) {
    setOptionsLoading(true);
    const r = await fetch(`/api/atlas-time/field-options?field_key=${fieldKey}`);
    const j = await r.json();
    setOptions(j.options ?? []);
    setOptionsLoading(false);
  }

  // ── Section drag ──
  function onDragStart(i: number) { dragIdx.current = i; }
  function onDragOver(e: React.DragEvent, i: number) { e.preventDefault(); setDragOver(i); }
  function onDrop(e: React.DragEvent, i: number) {
    e.preventDefault();
    const from = dragIdx.current;
    if (from == null || from === i) { setDragOver(null); return; }
    const reordered = [...sections];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(i, 0, moved);
    setSections(reordered);
    setDragOver(null);
    dragIdx.current = null;
  }
  function onDragEnd() { setDragOver(null); dragIdx.current = null; }

  async function saveSectionLabel() {
    if (!editingSectionId || !editingSectionLabel.trim()) return;
    const r = await fetch(`/api/atlas-time/field-config/${editingSectionId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: editingSectionLabel.trim() }),
    });
    if (r.ok) {
      setSections(prev => prev.map(s => s.id === editingSectionId ? { ...s, label: editingSectionLabel.trim() } : s));
      setEditingSectionId(null);
      setEditingSectionLabel("");
    }
  }

  async function saveSectionOrder() {
    setSectionSaving(true);
    const updates = sections.map((s, i) => ({ id: s.id, sort_order: i + 1, visible: s.visible }));
    const r = await fetch("/api/atlas-time/field-config", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    });
    setSectionSaving(false);
    if (r.ok) { setSectionMsg("Saved"); setTimeout(() => setSectionMsg(""), 2000); }
  }

  // ── Add custom field ──
  async function addCustomField() {
    if (!newLabel.trim() || !newType) return;
    const sectionKey = isNewSection
      ? newSectionName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")
      : newSection;
    if (!sectionKey) { setError("Select or create a section"); return; }

    setAddingField(true);
    setError("");
    const r = await fetch("/api/atlas-time/custom-fields", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: newLabel.trim(),
        field_type: newType,
        section: sectionKey,
        options: newOptions,
        ...(isNewSection ? { new_section_label: newSectionName.trim() } : {}),
      }),
    });
    const j = await r.json();
    if (!r.ok) { setError(j?.error ?? "Failed"); setAddingField(false); return; }
    setCustomFields(prev => [...prev, j]);
    // If new section was created, reload sections list
    if (isNewSection) await loadSections();
    setShowAddField(false);
    setNewLabel(""); setNewType("text"); setNewSection(""); setNewSectionName("");
    setIsNewSection(false); setNewOptions([]); setNewOptionInput("");
    setAddingField(false);
  }

  async function toggleCustomField(field: CustomFieldDef) {
    const r = await fetch(`/api/atlas-time/custom-fields/${field.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !field.active }),
    });
    if (r.ok) setCustomFields(prev => prev.map(f => f.id === field.id ? { ...f, active: !f.active } : f));
  }

  async function deleteCustomField(id: string) {
    if (!confirm("Delete this custom field? All data entered for this field will also be deleted.")) return;
    const r = await fetch(`/api/atlas-time/custom-fields/${id}`, { method: "DELETE" });
    if (r.ok) setCustomFields(prev => prev.filter(f => f.id !== id));
  }

  async function saveEditField() {
    if (!editingField) return;
    const r = await fetch(`/api/atlas-time/custom-fields/${editingField.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: editingField.label, options: editingField.options }),
    });
    if (r.ok) {
      setCustomFields(prev => prev.map(f => f.id === editingField.id ? editingField : f));
      setEditingField(null);
    }
  }

  // ── Built-in dropdown options ──
  async function addBuiltInOption() {
    if (!newOptionLabel.trim()) return;
    setAddingOption(true);
    const fieldDef = BUILT_IN_FIELDS.find(f => f.key === selectedBuiltIn);
    const r = await fetch("/api/atlas-time/field-options", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        field_key: selectedBuiltIn,
        label: newOptionLabel.trim(),
        cost: fieldDef?.hasCost && newOptionCost !== "" ? Number(newOptionCost) : null,
        is_default: fieldDef?.hasDefault ? newOptionIsDefault : undefined,
        default_qty: fieldDef?.hasDefault && newOptionIsDefault && newOptionDefaultQty !== "" ? Number(newOptionDefaultQty) : undefined,
        subsection: fieldDef?.hasSubsection ? (newOptionSubsection || null) : undefined,
        requires_size: fieldDef?.hasRequiresSize ? newOptionRequiresSize : undefined,
      }),
    });
    const j = await r.json();
    if (r.ok) {
      setOptions(prev => [...prev, j]);
      setNewOptionLabel(""); setNewOptionCost(""); setNewOptionIsDefault(false); setNewOptionDefaultQty("1"); setNewOptionSubsection(""); setNewOptionRequiresSize(true);
    }
    setAddingOption(false);
  }

  async function toggleBuiltInOption(opt: FieldOption) {
    const r = await fetch(`/api/atlas-time/field-options/${opt.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !opt.active }),
    });
    if (r.ok) setOptions(prev => prev.map(o => o.id === opt.id ? { ...o, active: !o.active } : o));
  }

  async function deleteBuiltInOption(id: string) {
    const r = await fetch(`/api/atlas-time/field-options/${id}`, { method: "DELETE" });
    if (r.ok) setOptions(prev => prev.filter(o => o.id !== id));
  }

  async function saveEditOption() {
    if (!editingOptId || !editingOptLabel.trim()) return;
    const fieldDef = BUILT_IN_FIELDS.find(f => f.key === selectedBuiltIn);
    const cost = fieldDef?.hasCost && editingOptCost !== "" ? Number(editingOptCost) : null;
    const body: Record<string, any> = { label: editingOptLabel.trim(), cost };
    if (fieldDef?.hasDefault) {
      body.is_default = editingOptIsDefault;
      body.default_qty = editingOptIsDefault && editingOptDefaultQty !== "" ? Number(editingOptDefaultQty) : 1;
    }
    if (fieldDef?.hasSubsection) body.subsection = editingOptSubsection || null;
    if (fieldDef?.hasRequiresSize) body.requires_size = editingOptRequiresSize;
    const r = await fetch(`/api/atlas-time/field-options/${editingOptId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      setOptions(prev => prev.map(o => o.id === editingOptId
        ? { ...o, label: editingOptLabel.trim(), cost, is_default: editingOptIsDefault, default_qty: editingOptIsDefault ? Number(editingOptDefaultQty) : 1, subsection: editingOptSubsection || null, requires_size: editingOptRequiresSize }
        : o));
      setEditingOptId(null); setEditingOptLabel(""); setEditingOptCost("");
      setEditingOptIsDefault(false); setEditingOptDefaultQty("1"); setEditingOptSubsection(""); setEditingOptRequiresSize(true);
    }
  }

  // ── Variant management ──
  async function loadVariants(itemId: string) {
    if (itemVariants[itemId]) return;
    const r = await fetch(`/api/atlas-time/uniform-variants?item_option_id=${itemId}`);
    const j = await r.json();
    const sizes = (j.variants ?? []).filter((v: Variant) => v.variant_type === "size");
    const colors = (j.variants ?? []).filter((v: Variant) => v.variant_type === "color");
    setItemVariants(prev => ({ ...prev, [itemId]: { sizes, colors } }));
  }

  function toggleVariantPanel(itemId: string) {
    if (expandedVariantItemId === itemId) { setExpandedVariantItemId(null); return; }
    setExpandedVariantItemId(itemId);
    loadVariants(itemId);
    setNewSizeLabel(""); setNewSizeCost(""); setNewColorLabel(""); setEditingVariantId(null);
  }

  async function addVariant(itemId: string, type: "size" | "color", label: string, cost?: string) {
    if (!label.trim()) return;
    setAddingVariant(true);
    const r = await fetch("/api/atlas-time/uniform-variants", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_option_id: itemId, variant_type: type, label: label.trim(), cost: cost && cost !== "" ? Number(cost) : null }),
    });
    const j = await r.json();
    if (r.ok) {
      setItemVariants(prev => {
        const cur = prev[itemId] ?? { sizes: [], colors: [] };
        return { ...prev, [itemId]: type === "size" ? { ...cur, sizes: [...cur.sizes, j] } : { ...cur, colors: [...cur.colors, j] } };
      });
      if (type === "size") { setNewSizeLabel(""); setNewSizeCost(""); }
      else setNewColorLabel("");
    }
    setAddingVariant(false);
  }

  async function saveEditVariant(itemId: string) {
    if (!editingVariantId || !editingVariantLabel.trim()) return;
    const r = await fetch(`/api/atlas-time/uniform-variants/${editingVariantId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: editingVariantLabel.trim(), cost: editingVariantCost !== "" ? Number(editingVariantCost) : null }),
    });
    if (r.ok) {
      const j = await r.json();
      setItemVariants(prev => {
        const cur = prev[itemId] ?? { sizes: [], colors: [] };
        const update = (arr: Variant[]) => arr.map(v => v.id === editingVariantId ? j : v);
        return { ...prev, [itemId]: { sizes: update(cur.sizes), colors: update(cur.colors) } };
      });
      setEditingVariantId(null); setEditingVariantLabel(""); setEditingVariantCost("");
    }
  }

  async function deleteVariant(itemId: string, variantId: string, type: "size" | "color") {
    const r = await fetch(`/api/atlas-time/uniform-variants/${variantId}`, { method: "DELETE" });
    if (r.ok) {
      setItemVariants(prev => {
        const cur = prev[itemId] ?? { sizes: [], colors: [] };
        return { ...prev, [itemId]: type === "size" ? { ...cur, sizes: cur.sizes.filter(v => v.id !== variantId) } : { ...cur, colors: cur.colors.filter(v => v.id !== variantId) } };
      });
    }
  }

  const customBySection = customFields.reduce<Record<string, CustomFieldDef[]>>((acc, f) => {
    if (!acc[f.section]) acc[f.section] = [];
    acc[f.section].push(f);
    return acc;
  }, {});

  const sectionLabel = (key: string) => sections.find(s => s.section === key)?.label ?? key;

  return (
    <div className="min-h-screen bg-[#f0f4f0]">
      <div className="px-4 md:px-8 py-6 md:py-8"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}>
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 text-white/50 text-xs mb-2">
            <Link href="/operations-center" className="hover:text-white/80">Operations Center</Link>
            <span>/</span>
            <Link href="/operations-center/atlas-time" className="hover:text-white/80">Atlas HR</Link>
            <span>/</span>
            <span className="text-white/80">Profile Settings</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Profile Settings</h1>
          <p className="text-white/50 text-sm mt-1">Manage sections, custom fields, and dropdown options on team member profiles.</p>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
            {error}
            <button onClick={() => setError("")} className="ml-2 text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit">
          {([["sections", "Sections"], ["custom", "Custom Fields"], ["dropdowns", "Dropdown Options"], ["columns", "Column Display"]] as const).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === t ? "bg-[#123b1f] text-white" : "text-gray-500 hover:text-gray-800"}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── SECTIONS TAB ── */}
        {tab === "sections" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Profile Sections</h2>
                <p className="text-xs text-gray-400 mt-0.5">Drag to reorder. Toggle to show/hide on team member profiles.</p>
              </div>
              <button onClick={saveSectionOrder} disabled={sectionSaving || sectionsLoading}
                className="text-xs font-semibold bg-[#123b1f] text-white px-3 py-1.5 rounded-lg hover:bg-[#1a5c2e] disabled:opacity-60">
                {sectionSaving ? "Saving…" : sectionMsg ? "Saved ✓" : "Save Order"}
              </button>
            </div>
            {sectionsLoading ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">Loading…</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {sections.map((s, i) => (
                  <div key={s.id}
                    draggable={editingSectionId !== s.id}
                    onDragStart={() => onDragStart(i)} onDragOver={e => onDragOver(e, i)}
                    onDrop={e => onDrop(e, i)} onDragEnd={onDragEnd}
                    className={`flex items-center gap-3 px-5 py-3 transition-colors ${editingSectionId === s.id ? "bg-gray-50" : `cursor-grab active:cursor-grabbing ${dragOver === i ? "bg-blue-50" : "hover:bg-gray-50/50"}`}`}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-gray-300 shrink-0">
                      <circle cx="5" cy="4" r="1.5" fill="currentColor"/><circle cx="11" cy="4" r="1.5" fill="currentColor"/>
                      <circle cx="5" cy="8" r="1.5" fill="currentColor"/><circle cx="11" cy="8" r="1.5" fill="currentColor"/>
                      <circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="11" cy="12" r="1.5" fill="currentColor"/>
                    </svg>
                    {editingSectionId === s.id ? (
                      <>
                        <input
                          autoFocus
                          value={editingSectionLabel}
                          onChange={e => setEditingSectionLabel(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveSectionLabel(); if (e.key === "Escape") { setEditingSectionId(null); setEditingSectionLabel(""); } }}
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#123b1f]/30 focus:border-[#123b1f]"
                        />
                        <button onClick={saveSectionLabel} className="text-xs font-semibold text-white bg-[#123b1f] px-2.5 py-1 rounded-lg hover:bg-[#1a5c2e]">Save</button>
                        <button onClick={() => { setEditingSectionId(null); setEditingSectionLabel(""); }} className="text-xs text-gray-400 hover:text-gray-600 px-1">Cancel</button>
                      </>
                    ) : (
                      <>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-800">{s.label}</div>
                          <div className="text-xs text-gray-400">{s.section}</div>
                        </div>
                        {customBySection[s.section]?.length > 0 && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">
                            {customBySection[s.section].filter(f => f.active).length} custom fields
                          </span>
                        )}
                        <button onClick={() => { setEditingSectionId(s.id); setEditingSectionLabel(s.label); }} className="text-gray-300 hover:text-gray-600 transition-colors p-1" title="Rename">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button onClick={() => setSections(prev => prev.map(x => x.id === s.id ? { ...x, visible: !x.visible } : x))}
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${s.visible ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-400 border-gray-200"}`}>
                          {s.visible ? "Visible" : "Hidden"}
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── CUSTOM FIELDS TAB ── */}
        {tab === "custom" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">Custom Fields</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Add any field you need to team member profiles — text, dates, dropdowns, toggles.</p>
                </div>
                <button onClick={() => setShowAddField(true)}
                  className="text-xs font-semibold bg-[#123b1f] text-white px-3 py-1.5 rounded-lg hover:bg-[#1a5c2e] flex items-center gap-1.5">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Add Field
                </button>
              </div>

              {/* Add field form */}
              {showAddField && (
                <div className="px-5 py-4 border-b border-gray-50 bg-gray-50/50 space-y-4">
                  <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">New Custom Field</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Label *</label>
                      <input value={newLabel} onChange={e => setNewLabel(e.target.value)} className={inputCls} placeholder="e.g. OSHA 10 Expiration" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Field Type *</label>
                      <select value={newType} onChange={e => setNewType(e.target.value)} className={inputCls}>
                        {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Section *</label>
                    <div className="flex gap-2 flex-wrap">
                      {sections.map(s => (
                        <button key={s.section} onClick={() => { setNewSection(s.section); setIsNewSection(false); }}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${!isNewSection && newSection === s.section ? "bg-[#123b1f] text-white border-[#123b1f]" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                          {s.label}
                        </button>
                      ))}
                      <button onClick={() => { setIsNewSection(true); setNewSection(""); }}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${isNewSection ? "bg-[#123b1f] text-white border-[#123b1f]" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                        + New Section
                      </button>
                    </div>
                    {isNewSection && (
                      <input value={newSectionName} onChange={e => setNewSectionName(e.target.value)}
                        className={inputCls + " mt-2"} placeholder="New section name, e.g. Training & Certifications" />
                    )}
                  </div>

                  {newType === "dropdown" && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Dropdown Options</label>
                      <div className="flex gap-2 mb-2">
                        <input value={newOptionInput} onChange={e => setNewOptionInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter" && newOptionInput.trim()) { setNewOptions(p => [...p, newOptionInput.trim()]); setNewOptionInput(""); }}}
                          className={inputCls} placeholder="Type option and press Enter" />
                        <button onClick={() => { if (newOptionInput.trim()) { setNewOptions(p => [...p, newOptionInput.trim()]); setNewOptionInput(""); }}}
                          className="text-xs font-semibold bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200">Add</button>
                      </div>
                      {newOptions.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {newOptions.map((o, i) => (
                            <span key={i} className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 bg-violet-100 text-violet-800 rounded-full">
                              {o}
                              <button onClick={() => setNewOptions(p => p.filter((_, j) => j !== i))} className="text-violet-500 hover:text-violet-800">×</button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={addCustomField} disabled={addingField || !newLabel.trim()}
                      className="text-xs font-semibold bg-[#123b1f] text-white px-4 py-2 rounded-lg hover:bg-[#1a5c2e] disabled:opacity-60">
                      {addingField ? "Saving…" : "Save Field"}
                    </button>
                    <button onClick={() => { setShowAddField(false); setNewLabel(""); setNewType("text"); setNewSection(""); setIsNewSection(false); setNewOptions([]); }}
                      className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2">Cancel</button>
                  </div>
                </div>
              )}

              {customLoading ? (
                <div className="px-5 py-8 text-center text-sm text-gray-400">Loading…</div>
              ) : customFields.length === 0 && !showAddField ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm text-gray-400 mb-2">No custom fields yet.</p>
                  <button onClick={() => setShowAddField(true)} className="text-sm font-semibold text-[#123b1f] hover:underline">Add your first custom field</button>
                </div>
              ) : (
                <div>
                  {Object.entries(customBySection).map(([sectionKey, fields]) => (
                    <div key={sectionKey}>
                      <div className="px-5 py-2 bg-gray-50 border-b border-gray-100">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{sectionLabel(sectionKey)}</span>
                      </div>
                      {fields.map(field => (
                        <div key={field.id} className="border-b border-gray-50 last:border-0">
                          {editingField?.id === field.id ? (
                            <div className="px-5 py-3 space-y-3 bg-gray-50/50">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Label</label>
                                  <input value={editingField.label} onChange={e => setEditingField({ ...editingField, label: e.target.value })} className={inputCls} />
                                </div>
                                <div className="flex items-center gap-2 pt-5">
                                  <span className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-600 font-medium">
                                    {FIELD_TYPES.find(t => t.value === field.field_type)?.label ?? field.field_type}
                                  </span>
                                  <span className="text-xs text-gray-400">Type cannot be changed after creation</span>
                                </div>
                              </div>
                              {field.field_type === "dropdown" && (
                                <div>
                                  <label className="block text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Options</label>
                                  <div className="flex flex-wrap gap-1.5 mb-2">
                                    {editingField.options.map((o, i) => (
                                      <span key={i} className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 bg-violet-100 text-violet-800 rounded-full">
                                        {o}
                                        <button onClick={() => setEditingField({ ...editingField, options: editingField.options.filter((_, j) => j !== i) })} className="text-violet-500 hover:text-violet-800">×</button>
                                      </span>
                                    ))}
                                  </div>
                                  <div className="flex gap-2">
                                    <input id="edit-opt-input" className={inputCls} placeholder="Add option…"
                                      onKeyDown={e => {
                                        const v = (e.target as HTMLInputElement).value.trim();
                                        if (e.key === "Enter" && v) { setEditingField({ ...editingField, options: [...editingField.options, v] }); (e.target as HTMLInputElement).value = ""; }
                                      }} />
                                    <button onClick={() => {
                                      const inp = document.getElementById("edit-opt-input") as HTMLInputElement;
                                      if (inp?.value.trim()) { setEditingField({ ...editingField, options: [...editingField.options, inp.value.trim()] }); inp.value = ""; }
                                    }} className="text-xs font-semibold bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 shrink-0">Add</button>
                                  </div>
                                </div>
                              )}
                              <div className="flex gap-2">
                                <button onClick={saveEditField} className="text-xs font-semibold bg-[#123b1f] text-white px-4 py-2 rounded-lg hover:bg-[#1a5c2e]">Save</button>
                                <button onClick={() => setEditingField(null)} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/50">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`text-sm font-medium ${field.active ? "text-gray-800" : "text-gray-400"}`}>{field.label}</span>
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                                    {FIELD_TYPES.find(t => t.value === field.field_type)?.label ?? field.field_type}
                                  </span>
                                  {field.field_type === "dropdown" && field.options.length > 0 && (
                                    <span className="text-[10px] text-gray-400">{field.options.length} options</span>
                                  )}
                                </div>
                              </div>
                              <button onClick={() => setEditingField(field)} className="text-gray-400 hover:text-gray-700 p-1 rounded transition-colors" title="Edit">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                              </button>
                              <button onClick={() => toggleCustomField(field)}
                                className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${field.active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-400 border-gray-200"}`}>
                                {field.active ? "Active" : "Hidden"}
                              </button>
                              <button onClick={() => deleteCustomField(field.id)} className="text-gray-300 hover:text-red-500 transition-colors p-1" title="Delete">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                                  <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── DROPDOWN OPTIONS TAB ── */}
        {tab === "dropdowns" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <h2 className="text-sm font-semibold text-gray-800">Built-in Dropdown Options</h2>
              <p className="text-xs text-gray-400 mt-0.5">Manage choices for built-in dropdown fields on team member profiles.</p>
            </div>
            <div className="px-5 pt-4 pb-3 border-b border-gray-50">
              <div className="flex flex-wrap gap-2">
                {BUILT_IN_FIELDS.map(f => (
                  <button key={f.key} onClick={() => setSelectedBuiltIn(f.key)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${selectedBuiltIn === f.key ? "bg-[#123b1f] text-white border-[#123b1f]" : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"}`}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-5 py-3 border-b border-gray-50 space-y-2">
              <div className="flex gap-2">
                <input type="text" value={newOptionLabel} onChange={e => setNewOptionLabel(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !BUILT_IN_FIELDS.find(f => f.key === selectedBuiltIn)?.hasDefault && addBuiltInOption()}
                  placeholder={`Add ${BUILT_IN_FIELDS.find(f => f.key === selectedBuiltIn)?.label ?? "option"}…`}
                  className={inputCls} />
                {BUILT_IN_FIELDS.find(f => f.key === selectedBuiltIn)?.hasCost && (
                  <div className="relative w-28 shrink-0">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-semibold">$</span>
                    <input type="number" min={0} step={0.01} value={newOptionCost} onChange={e => setNewOptionCost(e.target.value)}
                      placeholder="0.00" className={inputCls + " pl-7"} />
                  </div>
                )}
                {!BUILT_IN_FIELDS.find(f => f.key === selectedBuiltIn)?.hasDefault && (
                  <button onClick={addBuiltInOption} disabled={addingOption || !newOptionLabel.trim()}
                    className="text-xs font-semibold bg-[#123b1f] text-white px-3 py-2 rounded-lg hover:bg-[#1a5c2e] disabled:opacity-60 shrink-0">
                    {addingOption ? "Adding…" : "Add"}
                  </button>
                )}
              </div>
              {BUILT_IN_FIELDS.find(f => f.key === selectedBuiltIn)?.hasDefault && (
                <div className="flex flex-wrap items-center gap-3">
                  {BUILT_IN_FIELDS.find(f => f.key === selectedBuiltIn)?.hasSubsection && (
                    <div className="flex-1 min-w-[140px]">
                      <select value={newOptionSubsection} onChange={e => setNewOptionSubsection(e.target.value)}
                        className={inputCls}>
                        <option value="">— No subsection —</option>
                        {subsectionOpts.map(s => <option key={s.id} value={s.label}>{s.label}</option>)}
                      </select>
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none shrink-0">
                    <input type="checkbox" checked={newOptionIsDefault} onChange={e => setNewOptionIsDefault(e.target.checked)}
                      className="rounded border-gray-300 text-[#123b1f] focus:ring-[#123b1f]" />
                    Default item
                  </label>
                  {newOptionIsDefault && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs text-gray-500">Qty:</span>
                      <input type="number" min={1} step={1} value={newOptionDefaultQty} onChange={e => setNewOptionDefaultQty(e.target.value)}
                        className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#123b1f]/30 focus:border-[#123b1f]" />
                    </div>
                  )}
                  {BUILT_IN_FIELDS.find(f => f.key === selectedBuiltIn)?.hasRequiresSize && (
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none shrink-0">
                      <input type="checkbox" checked={newOptionRequiresSize} onChange={e => setNewOptionRequiresSize(e.target.checked)}
                        className="rounded border-gray-300 text-[#123b1f] focus:ring-[#123b1f]" />
                      Size required
                    </label>
                  )}
                  <button onClick={addBuiltInOption} disabled={addingOption || !newOptionLabel.trim()}
                    className="text-xs font-semibold bg-[#123b1f] text-white px-3 py-2 rounded-lg hover:bg-[#1a5c2e] disabled:opacity-60 shrink-0">
                    {addingOption ? "Adding…" : "Add"}
                  </button>
                </div>
              )}
            </div>
            {optionsLoading ? (
              <div className="px-5 py-6 text-center text-sm text-gray-400">Loading…</div>
            ) : options.length === 0 ? (
              <div className="px-5 py-6 text-center text-sm text-gray-400">No options yet — add one above.</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {options.map(opt => (
                  <div key={opt.id}>
                  <div className="flex items-center gap-3 px-5 py-2.5">
                    {editingOptId === opt.id ? (
                      <div className="flex-1 space-y-2">
                        <div className="flex gap-2">
                          <input
                            autoFocus
                            value={editingOptLabel}
                            onChange={e => setEditingOptLabel(e.target.value)}
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#123b1f]/30 focus:border-[#123b1f]"
                          />
                          {BUILT_IN_FIELDS.find(f => f.key === selectedBuiltIn)?.hasCost && (
                            <div className="relative w-24 shrink-0">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-semibold">$</span>
                              <input type="number" min={0} step={0.01} value={editingOptCost} onChange={e => setEditingOptCost(e.target.value)}
                                placeholder="0.00" className="w-full border border-gray-200 rounded-lg pl-6 pr-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#123b1f]/30 focus:border-[#123b1f]" />
                            </div>
                          )}
                          <button onClick={saveEditOption} className="text-xs font-semibold text-white bg-[#123b1f] px-2.5 py-1 rounded-lg hover:bg-[#1a5c2e] shrink-0">Save</button>
                          <button onClick={() => { setEditingOptId(null); setEditingOptLabel(""); setEditingOptCost(""); setEditingOptIsDefault(false); setEditingOptDefaultQty("1"); setEditingOptSubsection(""); }} className="text-xs text-gray-400 hover:text-gray-600 px-1 shrink-0">Cancel</button>
                        </div>
                        {BUILT_IN_FIELDS.find(f => f.key === selectedBuiltIn)?.hasDefault && (
                          <div className="flex flex-wrap items-center gap-3">
                            {BUILT_IN_FIELDS.find(f => f.key === selectedBuiltIn)?.hasSubsection && (
                              <div className="flex-1 min-w-[140px]">
                                <select value={editingOptSubsection} onChange={e => setEditingOptSubsection(e.target.value)}
                                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#123b1f]/30 focus:border-[#123b1f]">
                                  <option value="">— No subsection —</option>
                                  {subsectionOpts.map(s => <option key={s.id} value={s.label}>{s.label}</option>)}
                                </select>
                              </div>
                            )}
                            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none shrink-0">
                              <input type="checkbox" checked={editingOptIsDefault} onChange={e => setEditingOptIsDefault(e.target.checked)}
                                className="rounded border-gray-300 text-[#123b1f] focus:ring-[#123b1f]" />
                              Default item
                            </label>
                            {editingOptIsDefault && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-xs text-gray-500">Qty:</span>
                                <input type="number" min={1} step={1} value={editingOptDefaultQty} onChange={e => setEditingOptDefaultQty(e.target.value)}
                                  className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#123b1f]/30 focus:border-[#123b1f]" />
                              </div>
                            )}
                            {BUILT_IN_FIELDS.find(f => f.key === selectedBuiltIn)?.hasRequiresSize && (
                              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none shrink-0">
                                <input type="checkbox" checked={editingOptRequiresSize} onChange={e => setEditingOptRequiresSize(e.target.checked)}
                                  className="rounded border-gray-300 text-[#123b1f] focus:ring-[#123b1f]" />
                                Size required
                              </label>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm ${opt.active ? "text-gray-800" : "text-gray-400 line-through"}`}>
                            {opt.label}
                            {opt.cost != null && <span className="ml-2 text-xs text-gray-400">${Number(opt.cost).toFixed(2)}</span>}
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {opt.is_default && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">Default{opt.default_qty && opt.default_qty !== 1 ? ` ×${opt.default_qty}` : ""}</span>}
                            {opt.requires_size === false && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">No size</span>}
                            {opt.subsection && <span className="text-[10px] text-gray-400">{opt.subsection}</span>}
                          </div>
                        </div>
                        <button onClick={() => { setEditingOptId(opt.id); setEditingOptLabel(opt.label); setEditingOptCost(opt.cost != null ? String(opt.cost) : ""); setEditingOptIsDefault(!!opt.is_default); setEditingOptDefaultQty(opt.default_qty != null ? String(opt.default_qty) : "1"); setEditingOptSubsection(opt.subsection ?? ""); setEditingOptRequiresSize(opt.requires_size !== false); }} className="text-gray-300 hover:text-gray-600 transition-colors p-1" title="Edit">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button onClick={() => toggleBuiltInOption(opt)}
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full border transition-colors ${opt.active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-400 border-gray-200"}`}>
                          {opt.active ? "Active" : "Inactive"}
                        </button>
                        <button onClick={() => deleteBuiltInOption(opt.id)} className="text-gray-300 hover:text-red-500 transition-colors p-1">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                        {selectedBuiltIn === "uniform_items" && (
                          <button onClick={() => toggleVariantPanel(opt.id)} className={`p-1 transition-colors ${expandedVariantItemId === opt.id ? "text-[#123b1f]" : "text-gray-300 hover:text-gray-600"}`} title="Sizes & Colors">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                              <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                            </svg>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  {selectedBuiltIn === "uniform_items" && expandedVariantItemId === opt.id && (() => {
                    const vars = itemVariants[opt.id] ?? { sizes: [], colors: [] };
                    return (
                      <div className="px-5 py-3 bg-gray-50/60 border-t border-gray-100 space-y-4">
                        {/* Sizes */}
                        <div>
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Sizes <span className="text-gray-300 normal-case font-normal">(cost per size overrides base cost)</span></p>
                          {vars.sizes.length > 0 && (
                            <div className="space-y-1 mb-2">
                              {vars.sizes.map(v => (
                                <div key={v.id} className="flex items-center gap-2">
                                  {editingVariantId === v.id ? (
                                    <>
                                      <input autoFocus value={editingVariantLabel} onChange={e => setEditingVariantLabel(e.target.value)}
                                        className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#123b1f]" />
                                      <div className="relative w-20 shrink-0">
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                                        <input type="number" min={0} step={0.01} value={editingVariantCost} onChange={e => setEditingVariantCost(e.target.value)}
                                          className="w-full border border-gray-200 rounded-lg pl-5 pr-1 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#123b1f]" placeholder="0.00" />
                                      </div>
                                      <button onClick={() => saveEditVariant(opt.id)} className="text-xs font-semibold text-white bg-[#123b1f] px-2 py-1 rounded-lg">Save</button>
                                      <button onClick={() => { setEditingVariantId(null); setEditingVariantLabel(""); setEditingVariantCost(""); }} className="text-xs text-gray-400 hover:text-gray-600 px-1">Cancel</button>
                                    </>
                                  ) : (
                                    <>
                                      <span className="flex-1 text-sm text-gray-700">{v.label}</span>
                                      {v.cost != null && <span className="text-xs text-gray-400">${Number(v.cost).toFixed(2)}</span>}
                                      <button onClick={() => { setEditingVariantId(v.id); setEditingVariantLabel(v.label); setEditingVariantCost(v.cost != null ? String(v.cost) : ""); }} className="text-gray-300 hover:text-gray-600 p-1">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                      </button>
                                      <button onClick={() => deleteVariant(opt.id, v.id, "size")} className="text-gray-300 hover:text-red-500 p-1">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                                      </button>
                                    </>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <input value={newSizeLabel} onChange={e => setNewSizeLabel(e.target.value)} onKeyDown={e => e.key === "Enter" && addVariant(opt.id, "size", newSizeLabel, newSizeCost)}
                              placeholder="e.g. S, M, L, XL, 4XL" className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#123b1f]" />
                            <div className="relative w-20 shrink-0">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                              <input type="number" min={0} step={0.01} value={newSizeCost} onChange={e => setNewSizeCost(e.target.value)}
                                placeholder="0.00" className="w-full border border-gray-200 rounded-lg pl-5 pr-1 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#123b1f]" />
                            </div>
                            <button onClick={() => addVariant(opt.id, "size", newSizeLabel, newSizeCost)} disabled={addingVariant || !newSizeLabel.trim()}
                              className="text-xs font-semibold bg-[#123b1f] text-white px-3 py-1.5 rounded-lg hover:bg-[#1a5c2e] disabled:opacity-60 shrink-0">Add</button>
                          </div>
                        </div>
                        {/* Colors */}
                        <div>
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Colors</p>
                          {vars.colors.length > 0 && (
                            <div className="space-y-1 mb-2">
                              {vars.colors.map(v => (
                                <div key={v.id} className="flex items-center gap-2">
                                  {editingVariantId === v.id ? (
                                    <>
                                      <input autoFocus value={editingVariantLabel} onChange={e => setEditingVariantLabel(e.target.value)}
                                        className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#123b1f]" />
                                      <button onClick={() => saveEditVariant(opt.id)} className="text-xs font-semibold text-white bg-[#123b1f] px-2 py-1 rounded-lg">Save</button>
                                      <button onClick={() => { setEditingVariantId(null); setEditingVariantLabel(""); }} className="text-xs text-gray-400 hover:text-gray-600 px-1">Cancel</button>
                                    </>
                                  ) : (
                                    <>
                                      <span className="flex-1 text-sm text-gray-700">{v.label}</span>
                                      <button onClick={() => { setEditingVariantId(v.id); setEditingVariantLabel(v.label); setEditingVariantCost(""); }} className="text-gray-300 hover:text-gray-600 p-1">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                      </button>
                                      <button onClick={() => deleteVariant(opt.id, v.id, "color")} className="text-gray-300 hover:text-red-500 p-1">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                                      </button>
                                    </>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <input value={newColorLabel} onChange={e => setNewColorLabel(e.target.value)} onKeyDown={e => e.key === "Enter" && addVariant(opt.id, "color", newColorLabel)}
                              placeholder="e.g. Green, Blue, Black" className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#123b1f]" />
                            <button onClick={() => addVariant(opt.id, "color", newColorLabel)} disabled={addingVariant || !newColorLabel.trim()}
                              className="text-xs font-semibold bg-[#123b1f] text-white px-3 py-1.5 rounded-lg hover:bg-[#1a5c2e] disabled:opacity-60 shrink-0">Add</button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* ── COLUMNS TAB ── */}
        {tab === "columns" && (
          <div className="space-y-4">
            {/* Team Members list */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50">
                <h2 className="text-sm font-semibold text-gray-800">Team Members List Columns</h2>
                <p className="text-xs text-gray-400 mt-0.5">Name is always shown. Toggle additional columns on or off.</p>
              </div>
              <div className="divide-y divide-gray-50">
                {TEAM_COLS.map(col => (
                  <div key={col.key} className="flex items-center justify-between px-5 py-3.5">
                    <span className="text-sm text-gray-700 font-medium">{col.label}</span>
                    <button
                      onClick={() => saveTeamCol(col.key, !teamCols[col.key])}
                      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${teamCols[col.key] ? "bg-[#123b1f]" : "bg-gray-200"}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${teamCols[col.key] ? "translate-x-5" : ""}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Time Clock view */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50">
                <h2 className="text-sm font-semibold text-gray-800">Time Clock View Columns</h2>
                <p className="text-xs text-gray-400 mt-0.5">Name is always shown. Clock Out button is always present.</p>
              </div>
              <div className="divide-y divide-gray-50">
                {CLOCK_COLS.map(col => (
                  <div key={col.key} className="flex items-center justify-between px-5 py-3.5">
                    <span className="text-sm text-gray-700 font-medium">{col.label}</span>
                    <button
                      onClick={() => saveClockCol(col.key, !clockCols[col.key])}
                      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${clockCols[col.key] ? "bg-[#123b1f]" : "bg-gray-200"}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${clockCols[col.key] ? "translate-x-5" : ""}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-gray-400 text-center pb-2">Column preferences are saved per browser. Changes take effect immediately on list and clock pages.</p>
          </div>
        )}
      </div>
    </div>
  );
}
