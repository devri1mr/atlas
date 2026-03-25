"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type FieldConfig = {
  id: string;
  field_key: string;
  label: string;
  section: string;
  sort_order: number;
  visible: boolean;
};

type FieldOption = {
  id: string;
  field_key: string;
  label: string;
  sort_order: number;
  active: boolean;
};

const DROPDOWN_FIELDS: { key: string; label: string }[] = [
  { key: "license_type", label: "License Type" },
  { key: "pto_plan", label: "PTO Plan" },
  { key: "electronic_devices", label: "Electronic Devices" },
  { key: "health_care_plan", label: "Health Care Plan" },
  { key: "t_shirt_size", label: "Shirt Size" },
  { key: "termination_reason", label: "Termination Reason" },
];

export default function ProfileSettingsPage() {
  const [sections, setSections] = useState<FieldConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [error, setError] = useState("");

  // Drag state
  const dragIdx = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  // Dropdown options state
  const [selectedField, setSelectedField] = useState(DROPDOWN_FIELDS[0].key);
  const [options, setOptions] = useState<FieldOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [newOptionLabel, setNewOptionLabel] = useState("");
  const [addingOption, setAddingOption] = useState(false);
  const [optError, setOptError] = useState("");

  useEffect(() => {
    fetch("/api/atlas-time/field-config")
      .then(r => r.json())
      .then(j => { setSections(j.sections ?? []); setLoading(false); })
      .catch(() => { setError("Failed to load section config"); setLoading(false); });
  }, []);

  useEffect(() => {
    loadOptions(selectedField);
  }, [selectedField]);

  async function loadOptions(fieldKey: string) {
    setOptionsLoading(true);
    setOptError("");
    try {
      const r = await fetch(`/api/atlas-time/field-options?field_key=${fieldKey}`);
      const j = await r.json();
      setOptions(j.options ?? []);
    } catch {
      setOptError("Failed to load options");
    } finally {
      setOptionsLoading(false);
    }
  }

  // ── Drag-to-reorder sections ──
  function onDragStart(i: number) { dragIdx.current = i; }
  function onDragOver(e: React.DragEvent, i: number) {
    e.preventDefault();
    setDragOver(i);
  }
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

  function toggleVisible(id: string) {
    setSections(prev => prev.map(s => s.id === id ? { ...s, visible: !s.visible } : s));
  }

  async function saveOrder() {
    setSaving(true);
    setSaveMsg("");
    setError("");
    try {
      const updates = sections.map((s, i) => ({ id: s.id, sort_order: i + 1, visible: s.visible }));
      const r = await fetch("/api/atlas-time/field-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Save failed");
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // ── Dropdown option management ──
  async function addOption() {
    if (!newOptionLabel.trim()) return;
    setAddingOption(true);
    setOptError("");
    try {
      const r = await fetch("/api/atlas-time/field-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field_key: selectedField, label: newOptionLabel.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Failed to add");
      setOptions(prev => [...prev, j]);
      setNewOptionLabel("");
    } catch (e: any) {
      setOptError(e?.message ?? "Failed to add option");
    } finally {
      setAddingOption(false);
    }
  }

  async function toggleOption(opt: FieldOption) {
    try {
      const r = await fetch(`/api/atlas-time/field-options/${opt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !opt.active }),
      });
      if (r.ok) setOptions(prev => prev.map(o => o.id === opt.id ? { ...o, active: !o.active } : o));
    } catch {}
  }

  async function deleteOption(id: string) {
    try {
      const r = await fetch(`/api/atlas-time/field-options/${id}`, { method: "DELETE" });
      if (r.ok) setOptions(prev => prev.filter(o => o.id !== id));
    } catch {}
  }

  // Group sections by their section name for display
  const sectionGroups = sections.reduce<Record<string, FieldConfig[]>>((acc, s) => {
    if (!acc[s.section]) acc[s.section] = [];
    acc[s.section].push(s);
    return acc;
  }, {});

  const uniqueSections = Array.from(new Set(sections.map(s => s.section)));

  return (
    <div className="min-h-screen bg-[#f0f4f0]">
      {/* Header */}
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
          <p className="text-white/50 text-sm mt-1">Control section visibility & order on team member profiles, and manage dropdown options.</p>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-6">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
            {error}
            <button onClick={() => setError("")} className="ml-2 text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {/* Section ordering */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Profile Sections</h2>
              <p className="text-xs text-gray-400 mt-0.5">Drag to reorder how sections appear on team member profiles. Toggle to show/hide.</p>
            </div>
            <button
              onClick={saveOrder}
              disabled={saving || loading}
              className="text-xs font-semibold bg-[#123b1f] text-white px-3 py-1.5 rounded-lg hover:bg-[#1a5c2e] disabled:opacity-60"
            >
              {saving ? "Saving…" : saveMsg ? "Saved ✓" : "Save Order"}
            </button>
          </div>

          {loading ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">Loading…</div>
          ) : sections.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              No section config found. Run the SQL migration to seed at_field_config.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {sections.map((s, i) => (
                <div
                  key={s.id}
                  draggable
                  onDragStart={() => onDragStart(i)}
                  onDragOver={e => onDragOver(e, i)}
                  onDrop={e => onDrop(e, i)}
                  onDragEnd={onDragEnd}
                  className={`flex items-center gap-3 px-5 py-3 cursor-grab active:cursor-grabbing transition-colors ${
                    dragOver === i ? "bg-blue-50 border-blue-200" : "hover:bg-gray-50/50"
                  }`}
                >
                  {/* Drag handle */}
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-gray-300 shrink-0">
                    <circle cx="5" cy="4" r="1.5" fill="currentColor"/>
                    <circle cx="11" cy="4" r="1.5" fill="currentColor"/>
                    <circle cx="5" cy="8" r="1.5" fill="currentColor"/>
                    <circle cx="11" cy="8" r="1.5" fill="currentColor"/>
                    <circle cx="5" cy="12" r="1.5" fill="currentColor"/>
                    <circle cx="11" cy="12" r="1.5" fill="currentColor"/>
                  </svg>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800">{s.label || s.section}</div>
                    <div className="text-xs text-gray-400">{s.section}</div>
                  </div>
                  <button
                    onClick={() => toggleVisible(s.id)}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                      s.visible
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-gray-100 text-gray-400 border-gray-200"
                    }`}
                  >
                    {s.visible ? "Visible" : "Hidden"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dropdown options */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-gray-800">Dropdown Options</h2>
            <p className="text-xs text-gray-400 mt-0.5">Manage the choices available in dropdown fields on team member profiles.</p>
          </div>

          {/* Field selector */}
          <div className="px-5 pt-4 pb-3 border-b border-gray-50">
            <div className="flex flex-wrap gap-2">
              {DROPDOWN_FIELDS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setSelectedField(f.key)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                    selectedField === f.key
                      ? "bg-[#123b1f] text-white border-[#123b1f]"
                      : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Add new option */}
          <div className="px-5 py-3 border-b border-gray-50">
            <div className="flex gap-2">
              <input
                type="text"
                value={newOptionLabel}
                onChange={e => setNewOptionLabel(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addOption()}
                placeholder={`Add ${DROPDOWN_FIELDS.find(f => f.key === selectedField)?.label ?? "option"}…`}
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#123b1f] focus:ring-1 focus:ring-[#123b1f]/20"
              />
              <button
                onClick={addOption}
                disabled={addingOption || !newOptionLabel.trim()}
                className="text-xs font-semibold bg-[#123b1f] text-white px-3 py-2 rounded-lg hover:bg-[#1a5c2e] disabled:opacity-60"
              >
                {addingOption ? "Adding…" : "Add"}
              </button>
            </div>
            {optError && <p className="text-xs text-red-600 mt-1">{optError}</p>}
          </div>

          {/* Options list */}
          {optionsLoading ? (
            <div className="px-5 py-6 text-center text-sm text-gray-400">Loading…</div>
          ) : options.length === 0 ? (
            <div className="px-5 py-6 text-center text-sm text-gray-400">No options yet — add one above.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {options.map(opt => (
                <div key={opt.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className={`flex-1 text-sm ${opt.active ? "text-gray-800" : "text-gray-400 line-through"}`}>
                    {opt.label}
                  </span>
                  <button
                    onClick={() => toggleOption(opt)}
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                      opt.active
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-gray-100 text-gray-400 border-gray-200"
                    }`}
                  >
                    {opt.active ? "Active" : "Inactive"}
                  </button>
                  <button
                    onClick={() => deleteOption(opt.id)}
                    className="text-gray-300 hover:text-red-500 transition-colors"
                    title="Delete"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
