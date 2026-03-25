"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type SectionCfg = { id: string; section: string; label: string; sort_order: number; visible: boolean };
type FieldOption = { id: string; field_key: string; label: string; cost: number | null; sort_order: number; active: boolean };
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

const BUILT_IN_FIELDS: { key: string; label: string; hasCost?: boolean }[] = [
  { key: "job_title", label: "Job Title" },
  { key: "qb_class", label: "QB Class" },
  { key: "uniform_items", label: "Uniform Items", hasCost: true },
  { key: "uniform_deadline", label: "Uniform Repayment Deadline" },
  { key: "license_type", label: "License Type" },
  { key: "pto_plan", label: "PTO Plan" },
  { key: "electronic_devices", label: "Electronic Devices" },
  { key: "health_care_plan", label: "Health Care Plan" },
  { key: "t_shirt_size", label: "Shirt Size" },
  { key: "jacket_size", label: "Jacket / Hoodie Size" },
  { key: "pants_size", label: "Pants / Shorts Size" },
  { key: "hat_size", label: "Hat / Cap Size" },
  { key: "boot_size", label: "Boot / Shoe Size" },
  { key: "termination_reason", label: "Termination Reason" },
];

const inputCls = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#123b1f]/30 focus:border-[#123b1f] transition-all";

export default function ProfileSettingsPage() {
  const [tab, setTab] = useState<"sections" | "custom" | "dropdowns">("sections");

  // ── Sections ──
  const [sections, setSections] = useState<SectionCfg[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [sectionSaving, setSectionSaving] = useState(false);
  const [sectionMsg, setSectionMsg] = useState("");
  const dragIdx = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

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

  const [error, setError] = useState("");

  useEffect(() => {
    loadSections();
    loadCustomFields();
  }, []);

  useEffect(() => { loadBuiltInOptions(selectedBuiltIn); }, [selectedBuiltIn]);

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
    const hasCost = BUILT_IN_FIELDS.find(f => f.key === selectedBuiltIn)?.hasCost;
    const r = await fetch("/api/atlas-time/field-options", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field_key: selectedBuiltIn, label: newOptionLabel.trim(), cost: hasCost && newOptionCost !== "" ? Number(newOptionCost) : null }),
    });
    const j = await r.json();
    if (r.ok) { setOptions(prev => [...prev, j]); setNewOptionLabel(""); setNewOptionCost(""); }
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
    const hasCost = BUILT_IN_FIELDS.find(f => f.key === selectedBuiltIn)?.hasCost;
    const cost = hasCost && editingOptCost !== "" ? Number(editingOptCost) : null;
    const r = await fetch(`/api/atlas-time/field-options/${editingOptId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: editingOptLabel.trim(), cost }),
    });
    if (r.ok) {
      setOptions(prev => prev.map(o => o.id === editingOptId ? { ...o, label: editingOptLabel.trim(), cost } : o));
      setEditingOptId(null);
      setEditingOptLabel("");
      setEditingOptCost("");
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
          {([["sections", "Sections"], ["custom", "Custom Fields"], ["dropdowns", "Dropdown Options"]] as const).map(([t, label]) => (
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
                  <div key={s.id} draggable
                    onDragStart={() => onDragStart(i)} onDragOver={e => onDragOver(e, i)}
                    onDrop={e => onDrop(e, i)} onDragEnd={onDragEnd}
                    className={`flex items-center gap-3 px-5 py-3 cursor-grab active:cursor-grabbing transition-colors ${dragOver === i ? "bg-blue-50" : "hover:bg-gray-50/50"}`}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-gray-300 shrink-0">
                      <circle cx="5" cy="4" r="1.5" fill="currentColor"/><circle cx="11" cy="4" r="1.5" fill="currentColor"/>
                      <circle cx="5" cy="8" r="1.5" fill="currentColor"/><circle cx="11" cy="8" r="1.5" fill="currentColor"/>
                      <circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="11" cy="12" r="1.5" fill="currentColor"/>
                    </svg>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-800">{s.label}</div>
                      <div className="text-xs text-gray-400">{s.section}</div>
                    </div>
                    {customBySection[s.section]?.length > 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">
                        {customBySection[s.section].filter(f => f.active).length} custom fields
                      </span>
                    )}
                    <button onClick={() => setSections(prev => prev.map(x => x.id === s.id ? { ...x, visible: !x.visible } : x))}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${s.visible ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-400 border-gray-200"}`}>
                      {s.visible ? "Visible" : "Hidden"}
                    </button>
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
            <div className="px-5 py-3 border-b border-gray-50">
              <div className="flex gap-2">
                <input type="text" value={newOptionLabel} onChange={e => setNewOptionLabel(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addBuiltInOption()}
                  placeholder={`Add ${BUILT_IN_FIELDS.find(f => f.key === selectedBuiltIn)?.label ?? "option"}…`}
                  className={inputCls} />
                {BUILT_IN_FIELDS.find(f => f.key === selectedBuiltIn)?.hasCost && (
                  <div className="relative w-28 shrink-0">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-semibold">$</span>
                    <input type="number" min={0} step={0.01} value={newOptionCost} onChange={e => setNewOptionCost(e.target.value)}
                      placeholder="0.00" className={inputCls + " pl-7"} />
                  </div>
                )}
                <button onClick={addBuiltInOption} disabled={addingOption || !newOptionLabel.trim()}
                  className="text-xs font-semibold bg-[#123b1f] text-white px-3 py-2 rounded-lg hover:bg-[#1a5c2e] disabled:opacity-60 shrink-0">
                  {addingOption ? "Adding…" : "Add"}
                </button>
              </div>
            </div>
            {optionsLoading ? (
              <div className="px-5 py-6 text-center text-sm text-gray-400">Loading…</div>
            ) : options.length === 0 ? (
              <div className="px-5 py-6 text-center text-sm text-gray-400">No options yet — add one above.</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {options.map(opt => (
                  <div key={opt.id} className="flex items-center gap-3 px-5 py-2.5">
                    {editingOptId === opt.id ? (
                      <>
                        <input
                          autoFocus
                          value={editingOptLabel}
                          onChange={e => setEditingOptLabel(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveEditOption(); if (e.key === "Escape") { setEditingOptId(null); setEditingOptLabel(""); setEditingOptCost(""); } }}
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#123b1f]/30 focus:border-[#123b1f]"
                        />
                        {BUILT_IN_FIELDS.find(f => f.key === selectedBuiltIn)?.hasCost && (
                          <div className="relative w-24 shrink-0">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-semibold">$</span>
                            <input type="number" min={0} step={0.01} value={editingOptCost} onChange={e => setEditingOptCost(e.target.value)}
                              placeholder="0.00" className="w-full border border-gray-200 rounded-lg pl-6 pr-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#123b1f]/30 focus:border-[#123b1f]" />
                          </div>
                        )}
                        <button onClick={saveEditOption} className="text-xs font-semibold text-white bg-[#123b1f] px-2.5 py-1 rounded-lg hover:bg-[#1a5c2e]">Save</button>
                        <button onClick={() => { setEditingOptId(null); setEditingOptLabel(""); setEditingOptCost(""); }} className="text-xs text-gray-400 hover:text-gray-600 px-1">Cancel</button>
                      </>
                    ) : (
                      <>
                        <span className={`flex-1 text-sm ${opt.active ? "text-gray-800" : "text-gray-400 line-through"}`}>
                          {opt.label}
                          {opt.cost != null && <span className="ml-2 text-xs text-gray-400">${Number(opt.cost).toFixed(2)}</span>}
                        </span>
                        <button onClick={() => { setEditingOptId(opt.id); setEditingOptLabel(opt.label); setEditingOptCost(opt.cost != null ? String(opt.cost) : ""); }} className="text-gray-300 hover:text-gray-600 transition-colors p-1" title="Edit">
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
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
