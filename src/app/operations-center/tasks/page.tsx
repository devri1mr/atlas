"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Division = { id: string; name: string };

type TaskMaterial = {
  id: string;
  material_id: string | null;
  material_name: string | null;
  qty_per_unit: number;
  unit: string | null;
  materials?: { id: string; name: string; unit: string | null; unit_cost: number | null } | null;
};

type Task = {
  id: string;
  division_id: string;
  name: string;
  unit: string | null;
  minutes_per_unit: number | null;
  default_qty: number | null;
  client_facing_template: string | null;
  notes: string | null;
  spring_multiplier: number | null;
  summer_multiplier: number | null;
  fall_multiplier: number | null;
  winter_multiplier: number | null;
};

type MaterialSearchResult = {
  id: string;
  name: string;
  unit: string | null;
  unit_cost: number | null;
};

const UNITS = ["yd", "sqft", "lft", "ea", "hr", "bag", "lb", "gal", "ton", "load", "visit"];

const labelCls = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1";
const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

function hrsToMin(hrs: string | number): number | null {
  const n = Number(hrs);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 60 * 1000) / 1000 : null;
}

function minToHrs(min: number | null): string {
  if (min == null) return "";
  return String(Math.round((min / 60) * 10000) / 10000);
}

export default function TaskCatalogPage() {
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [divisionId, setDivisionId] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Panel state
  const [panel, setPanel] = useState<"none" | "add" | "edit">("none");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskMaterials, setTaskMaterials] = useState<TaskMaterial[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);

  // Task form
  const [fName, setFName] = useState("");
  const [fUnit, setFUnit] = useState("");
  const [fRateUnits, setFRateUnits] = useState("");   // "X units..."
  const [fRateHours, setFRateHours] = useState("");   // "...in Y hours"
  const [fDefaultQty, setFDefaultQty] = useState(""); // default qty when added to bid
  const [fTemplate, setFTemplate] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [fSpringMultiplier, setFSpringMultiplier] = useState("");
  const [fSummerMultiplier, setFSummerMultiplier] = useState("");
  const [fFallMultiplier, setFFallMultiplier] = useState("");
  const [fWinterMultiplier, setFWinterMultiplier] = useState("");
  const [saving, setSaving] = useState(false);

  // Material form
  const [matSearch, setMatSearch] = useState("");
  const [matResults, setMatResults] = useState<MaterialSearchResult[]>([]);
  const [matSearchOpen, setMatSearchOpen] = useState(false);
  const [selectedMat, setSelectedMat] = useState<MaterialSearchResult | null>(null);
  const [matQty, setMatQty] = useState("");
  const [matUnit, setMatUnit] = useState("");
  const [addingMat, setAddingMat] = useState(false);

  // Preview
  const [previewQty, setPreviewQty] = useState("10");

  // Load divisions
  useEffect(() => {
    fetch("/api/divisions", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const list: Division[] = j?.data ?? [];
        setDivisions(list);
        if (list.length > 0) setDivisionId(list[0].id);
      })
      .catch(() => setError("Failed to load divisions"));
  }, []);

  // Load tasks when division changes
  useEffect(() => {
    if (!divisionId) return;
    setLoadingTasks(true);
    setTasks([]);
    closePanel();
    fetch(`/api/task-catalog?division_id=${divisionId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setTasks(j?.data ?? []))
      .catch(() => setError("Failed to load tasks"))
      .finally(() => setLoadingTasks(false));
  }, [divisionId]);

  // Material search
  useEffect(() => {
    if (matSearch.length < 2) { setMatResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/materials-catalog?q=${encodeURIComponent(matSearch)}`, { cache: "no-store" });
        const j = await res.json();
        setMatResults(Array.isArray(j?.data) ? j.data : []);
        setMatSearchOpen(true);
      } catch { setMatResults([]); }
    }, 250);
    return () => clearTimeout(timer);
  }, [matSearch]);

  function closePanel() {
    setPanel("none");
    setEditingTask(null);
    setTaskMaterials([]);
    resetForm();
  }

  function resetForm() {
    setFName(""); setFUnit(""); setFRateUnits(""); setFRateHours(""); setFDefaultQty(""); setFTemplate(""); setFNotes("");
    setFSpringMultiplier(""); setFSummerMultiplier(""); setFFallMultiplier(""); setFWinterMultiplier("");
    setMatSearch(""); setMatResults([]); setSelectedMat(null); setMatQty(""); setMatUnit("");
  }

  function openAdd() {
    closePanel();
    setPanel("add");
  }

  async function openEdit(task: Task) {
    closePanel();
    setPanel("edit");
    setEditingTask(task);
    setFName(task.name);
    setFUnit(task.unit ?? "");
    setFRateUnits("1");
    setFRateHours(minToHrs(task.minutes_per_unit));
    setFDefaultQty(task.default_qty != null ? String(task.default_qty) : "");
    setFTemplate(task.client_facing_template ?? "");
    setFNotes(task.notes ?? "");
    setFSpringMultiplier(task.spring_multiplier != null ? String(task.spring_multiplier) : "");
    setFSummerMultiplier(task.summer_multiplier != null ? String(task.summer_multiplier) : "");
    setFFallMultiplier(task.fall_multiplier != null ? String(task.fall_multiplier) : "");
    setFWinterMultiplier(task.winter_multiplier != null ? String(task.winter_multiplier) : "");
    // Load materials
    setLoadingMaterials(true);
    try {
      const res = await fetch(`/api/task-catalog-materials?task_catalog_id=${task.id}`, { cache: "no-store" });
      const j = await res.json();
      setTaskMaterials(j?.rows ?? []);
    } catch { setTaskMaterials([]); }
    setLoadingMaterials(false);
  }

  async function handleSave() {
    if (!fName.trim()) { setError("Task name is required."); return; }
    setSaving(true); setError(null);
    try {
      const payload = {
        division_id: divisionId,
        name: fName.trim(),
        unit: fUnit.trim() || null,
        minutes_per_unit: fRateUnits && fRateHours && Number(fRateUnits) > 0
          ? Math.round((Number(fRateHours) / Number(fRateUnits)) * 60 * 1000) / 1000
          : null,
        default_qty: fDefaultQty ? Number(fDefaultQty) : null,
        client_facing_template: fTemplate.trim() || null,
        notes: fNotes.trim() || null,
        spring_multiplier: fSpringMultiplier ? Number(fSpringMultiplier) : null,
        summer_multiplier: fSummerMultiplier ? Number(fSummerMultiplier) : null,
        fall_multiplier: fFallMultiplier ? Number(fFallMultiplier) : null,
        winter_multiplier: fWinterMultiplier ? Number(fWinterMultiplier) : null,
      };

      if (panel === "add") {
        const res = await fetch("/api/task-catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error || "Failed to create task");
        setTasks((prev) => [...prev, j.data].sort((a, b) => a.name.localeCompare(b.name)));
        openEdit(j.data);
        flash("Task created — now add materials below.");
      } else if (editingTask) {
        const res = await fetch(`/api/task-catalog/${editingTask.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error || "Failed to save task");
        setTasks((prev) => prev.map((t) => t.id === editingTask.id ? j.data : t));
        setEditingTask(j.data);
        flash("Saved.");
      }
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTask() {
    if (!editingTask) return;
    if (!confirm(`Delete "${editingTask.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/task-catalog/${editingTask.id}`, { method: "DELETE" });
    if (!res.ok) { setError("Delete failed"); return; }
    setTasks((prev) => prev.filter((t) => t.id !== editingTask.id));
    closePanel();
    flash("Task deleted.");
  }

  async function handleAddMaterial() {
    if (!editingTask) return;
    const qty = Number(matQty);
    if (!Number.isFinite(qty) || qty <= 0) { setError("Qty must be > 0"); return; }
    if (!selectedMat && !matSearch.trim()) { setError("Select or type a material name"); return; }
    setAddingMat(true); setError(null);
    try {
      const payload = {
        task_catalog_id: editingTask.id,
        material_id: selectedMat?.id || null,
        material_name: selectedMat?.name || matSearch.trim(),
        qty_per_unit: qty,
        unit: matUnit.trim() || selectedMat?.unit || fUnit.trim() || null,
      };
      const res = await fetch("/api/task-catalog-materials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Failed to add material");
      setTaskMaterials((prev) => [...prev, j.row]);
      setMatSearch(""); setMatResults([]); setSelectedMat(null); setMatQty(""); setMatUnit("");
    } catch (e: any) {
      setError(e?.message || "Failed to add material");
    } finally {
      setAddingMat(false);
    }
  }

  async function handleDeleteMaterial(matId: string) {
    const res = await fetch(`/api/task-catalog-materials/${matId}`, { method: "DELETE" });
    if (!res.ok) { setError("Failed to remove material"); return; }
    setTaskMaterials((prev) => prev.filter((m) => m.id !== matId));
  }

  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  function matDisplayName(m: TaskMaterial) {
    return m.materials?.name || m.material_name || "Unknown";
  }

  const previewN = Number(previewQty) || 0;
  const hrsPerUnit = fRateUnits && fRateHours && Number(fRateUnits) > 0
    ? Number(fRateHours) / Number(fRateUnits)
    : null;
  const previewHrs = hrsPerUnit && previewN
    ? `${(previewN * hrsPerUnit).toFixed(2)} hrs labor`
    : null;
  const previewMats = taskMaterials.map((m) => ({
    name: matDisplayName(m),
    qty: (previewN * m.qty_per_unit).toFixed(2),
    unit: m.unit || "",
  }));

  return (
    <div className="min-h-screen bg-[#f6f8f6]">
      {/* Banner */}
      <div className="bg-[#123b1f] px-8 py-4 text-center">
        <div className="text-2xl font-extrabold text-white uppercase tracking-[0.2em]">Task Catalog</div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-6 space-y-6">
        <Link href="/operations-center" className="text-sm text-emerald-700 hover:underline">← Back to Operations Center</Link>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
        {successMsg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-4 py-3 text-sm">{successMsg}</div>}

        {/* Division tabs */}
        <div className="flex gap-2 flex-wrap">
          {divisions.map((d) => (
            <button
              key={d.id}
              onClick={() => setDivisionId(d.id)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                divisionId === d.id
                  ? "bg-[#123b1f] text-white border-[#123b1f]"
                  : "bg-white text-[#123b1f] border-[#d7e6db] hover:bg-[#eef6f0]"
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Task list */}
          <div className="bg-white rounded-xl border border-[#d7e6db] shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <span className="font-semibold text-[#123b1f] text-sm">
                {loadingTasks ? "Loading…" : `${tasks.length} task${tasks.length !== 1 ? "s" : ""}`}
              </span>
              <button
                onClick={openAdd}
                className="bg-emerald-600 text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-emerald-700"
              >
                + New Task
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {tasks.length === 0 && !loadingTasks && (
                <div className="px-5 py-8 text-sm text-gray-400 text-center">No tasks yet. Add your first one →</div>
              )}
              {tasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => openEdit(t)}
                  className={`w-full text-left px-5 py-3 hover:bg-[#f6f8f6] transition-colors ${editingTask?.id === t.id ? "bg-[#eef6f0] border-l-4 border-emerald-600" : ""}`}
                >
                  <div className="font-medium text-gray-900 text-sm">{t.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5 flex gap-3 flex-wrap">
                    {t.unit && <span>{t.unit}</span>}
                    {t.minutes_per_unit != null && <span>{minToHrs(t.minutes_per_unit)} hrs/{t.unit || "unit"}</span>}
                    {t.spring_multiplier != null && t.spring_multiplier > 1 && <span className="text-green-500">🌱{t.spring_multiplier}×</span>}
                    {t.summer_multiplier != null && t.summer_multiplier > 1 && <span className="text-yellow-500">☀️{t.summer_multiplier}×</span>}
                    {t.fall_multiplier != null && t.fall_multiplier > 1 && <span className="text-orange-500">🍂{t.fall_multiplier}×</span>}
                    {t.winter_multiplier != null && t.winter_multiplier > 1 && <span className="text-blue-400">❄️{t.winter_multiplier}×</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Edit / Add panel */}
          {panel !== "none" && (
            <div className="bg-white rounded-xl border border-[#d7e6db] shadow-sm p-5 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-[#123b1f]">{panel === "add" ? "New Task" : "Edit Task"}</h2>
                <button onClick={closePanel} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
              </div>

              {/* Task fields */}
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Task Name</label>
                  <input className={inputCls} value={fName} onChange={(e) => setFName(e.target.value)} placeholder='e.g. "Install Brown Mulch"' />
                </div>
                {/* Unit type */}
                <div>
                  <label className={labelCls}>Unit Type</label>
                  <select className={inputCls} value={fUnit} onChange={(e) => setFUnit(e.target.value)}>
                    <option value="">—</option>
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>

                {/* Task rate: "X units in Y hrs" + Default Qty */}
                <div>
                  <label className={labelCls}>Task Rate</label>
                  <p className="text-xs text-gray-500 mb-2">How many {fUnit || "units"} can the crew complete in how many hours?</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1"># of {fUnit || "Units"}</label>
                      <input
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-center font-semibold text-lg"
                        type="number" step="1" min="0.01"
                        value={fRateUnits}
                        onChange={(e) => setFRateUnits(e.target.value)}
                        placeholder="e.g. 10"
                      />
                    </div>
                    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1"># of Hrs</label>
                      <input
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-center font-semibold text-lg"
                        type="number" step="0.25" min="0"
                        value={fRateHours}
                        onChange={(e) => setFRateHours(e.target.value)}
                        placeholder="e.g. 2.5"
                      />
                    </div>
                    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Default Qty</label>
                      <input
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-center font-semibold text-lg"
                        type="number" step="1" min="0"
                        value={fDefaultQty}
                        onChange={(e) => setFDefaultQty(e.target.value)}
                        placeholder="e.g. 15"
                      />
                    </div>
                  </div>
                  {fRateUnits && fRateHours && Number(fRateUnits) > 0 && (
                    <div className="mt-2 text-xs text-gray-500 bg-gray-50 rounded px-3 py-1.5">
                      Rate: {(Number(fRateHours) / Number(fRateUnits)).toFixed(4)} hrs/{fUnit || "unit"} &nbsp;·&nbsp; {((Number(fRateHours) / Number(fRateUnits)) * 60).toFixed(1)} min/{fUnit || "unit"}
                    </div>
                  )}
                </div>

                {/* Computed default estimate */}
                {hrsPerUnit && fDefaultQty && (
                  <div className="bg-[#eef6f0] rounded-lg px-4 py-2.5 flex items-center justify-between">
                    <span className="text-sm text-[#123b1f]">Default estimate:</span>
                    <span className="font-bold text-[#123b1f]">⏱ {(hrsPerUnit * Number(fDefaultQty)).toFixed(2)} hrs for {fDefaultQty} {fUnit || "units"}</span>
                  </div>
                )}

                {/* Seasonal difficulty ranking */}
                <div>
                  <label className={labelCls}>
                    Seasonal Difficulty Rating
                    <span className="ml-2 text-gray-500 font-normal normal-case tracking-normal text-xs">rank each season 1 (easiest) → 4 (hardest) · each rank used once</span>
                  </label>
                  {(() => {
                    const TIER_MULTS: Record<string, number> = { "1": 1.0, "2": 1.15, "3": 1.30, "4": 1.50 };
                    const TIER_LABELS = ["Standard", "Moderate", "Difficult", "Extreme"];
                    const allVals = [fSpringMultiplier, fSummerMultiplier, fFallMultiplier, fWinterMultiplier];
                    const seasons: { label: string; state: string; set: (v: string) => void }[] = [
                      { label: "🌱 Spring", state: fSpringMultiplier, set: setFSpringMultiplier },
                      { label: "☀️ Summer", state: fSummerMultiplier, set: setFSummerMultiplier },
                      { label: "🍂 Fall",   state: fFallMultiplier,   set: setFFallMultiplier   },
                      { label: "❄️ Winter", state: fWinterMultiplier, set: setFWinterMultiplier },
                    ];
                    return (
                      <>
                        <div className="grid grid-cols-4 gap-2">
                          {seasons.map(({ label, state, set }) => {
                            const usedTiers = allVals
                              .filter((v) => v !== "" && v !== state)
                              .map((v) => Object.entries(TIER_MULTS).find(([, m]) => String(m) === v)?.[0])
                              .filter(Boolean) as string[];
                            const currentTier = Object.entries(TIER_MULTS).find(([, m]) => String(m) === state)?.[0] || "";
                            return (
                              <div key={label}>
                                <div className="text-xs text-gray-500 mb-1">{label}</div>
                                <select
                                  className={inputCls}
                                  value={currentTier}
                                  onChange={(e) => {
                                    const tier = e.target.value;
                                    set(tier ? String(TIER_MULTS[tier]) : "");
                                  }}
                                >
                                  <option value="">—</option>
                                  {["1","2","3","4"].map((t) => (
                                    <option key={t} value={t} disabled={usedTiers.includes(t)}>
                                      {t} — {TIER_LABELS[Number(t)-1]} ({TIER_MULTS[t]}×)
                                    </option>
                                  ))}
                                </select>
                                {currentTier && (
                                  <div className="text-xs text-gray-400 mt-0.5 text-center">{TIER_MULTS[currentTier]}× applied</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-1.5 text-xs text-gray-400 flex gap-4 flex-wrap">
                          <span>1 = Standard (1.0×)</span><span>2 = Moderate (1.15×)</span><span>3 = Difficult (1.30×)</span><span>4 = Extreme (1.50×)</span>
                        </div>
                      </>
                    );
                  })()}
                </div>

                <div>
                  <label className={labelCls}>
                    Default Estimate Description
                    <span className="ml-2 text-gray-500 font-normal normal-case tracking-normal text-xs">
                      use {"{qty}"}, {"{unit}"}, {"{material}"}
                    </span>
                  </label>
                  <textarea
                    className={inputCls}
                    rows={2}
                    value={fTemplate}
                    onChange={(e) => setFTemplate(e.target.value)}
                    placeholder={`e.g. "Installation of {qty} {unit} of {material} to designated planting beds"`}
                  />
                  {/* Live preview of rendered description */}
                  {fTemplate && fDefaultQty && (
                    <div className="mt-1.5 text-xs text-gray-500 bg-gray-50 rounded px-3 py-2">
                      <span className="font-semibold text-gray-400 mr-1">Preview:</span>
                      {fTemplate
                        .replace(/\{qty\}/gi, fDefaultQty)
                        .replace(/\{unit\}/gi, fUnit || "unit")
                        .replace(/\{material\}/gi, taskMaterials[0] ? matDisplayName(taskMaterials[0]) : "{material}")
                        .replace(/\{materials\}/gi, taskMaterials.map(matDisplayName).join(", ") || "{materials}")}
                    </div>
                  )}
                </div>

                <div>
                  <label className={labelCls}>Internal Notes</label>
                  <textarea className={inputCls} rows={2} value={fNotes} onChange={(e) => setFNotes(e.target.value)} placeholder="Bidding guidance, crew notes…" />
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={handleSave} disabled={saving} className="bg-[#123b1f] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#1a5c2e] disabled:opacity-50">
                  {saving ? "Saving…" : panel === "add" ? "Create Task" : "Save"}
                </button>
                {panel === "edit" && (
                  <button onClick={handleDeleteTask} className="text-red-500 text-sm px-3 py-2 hover:text-red-700">Delete</button>
                )}
              </div>

              {/* Material formulas — only show after task exists */}
              {panel === "edit" && editingTask && (
                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">Material Formulas</div>

                  {loadingMaterials ? (
                    <div className="text-sm text-gray-400">Loading…</div>
                  ) : (
                    <div className="space-y-1">
                      {taskMaterials.map((m) => (
                        <div key={m.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-sm">
                          <span className="flex-1 font-medium text-gray-800">{matDisplayName(m)}</span>
                          <span className="text-gray-500">{m.qty_per_unit} {m.unit || ""} per {fUnit || "unit"}</span>
                          <button onClick={() => handleDeleteMaterial(m.id)} className="text-gray-300 hover:text-red-500 ml-1">✕</button>
                        </div>
                      ))}
                      {taskMaterials.length === 0 && (
                        <div className="text-sm text-gray-400">No materials linked yet.</div>
                      )}
                    </div>
                  )}

                  {/* Add material row */}
                  <div className="bg-[#f6f8f6] rounded-lg p-3 space-y-2">
                    <div className="text-xs font-semibold text-gray-500">Add Material</div>
                    <div className="relative">
                      <input
                        className={inputCls}
                        placeholder="Search materials catalog…"
                        value={selectedMat ? selectedMat.name : matSearch}
                        onChange={(e) => { setMatSearch(e.target.value); setSelectedMat(null); }}
                        onFocus={() => matResults.length > 0 && setMatSearchOpen(true)}
                        onBlur={() => setTimeout(() => setMatSearchOpen(false), 150)}
                      />
                      {matSearchOpen && matResults.length > 0 && (
                        <div className="absolute left-0 top-full mt-1 z-30 bg-white border rounded-lg shadow-lg w-full max-h-40 overflow-y-auto">
                          {matResults.map((m) => (
                            <button
                              key={m.id}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 flex justify-between"
                              onMouseDown={() => { setSelectedMat(m); setMatSearch(""); setMatUnit(m.unit || ""); setMatSearchOpen(false); }}
                            >
                              <span>{m.name}</span>
                              <span className="text-gray-400 text-xs">{m.unit}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelCls}>Qty per {fUnit || "unit"}</label>
                        <input className={inputCls} type="number" step="0.01" min="0" value={matQty} onChange={(e) => setMatQty(e.target.value)} placeholder="1.0" />
                      </div>
                      <div>
                        <label className={labelCls}>Material Unit</label>
                        <select className={inputCls} value={matUnit} onChange={(e) => setMatUnit(e.target.value)}>
                          <option value="">—</option>
                          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                    </div>
                    <button
                      onClick={handleAddMaterial}
                      disabled={addingMat}
                      className="bg-emerald-600 text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {addingMat ? "Adding…" : "+ Add Material"}
                    </button>
                  </div>
                </div>
              )}

              {/* Live preview */}
              {(hrsPerUnit || taskMaterials.length > 0) && panel === "edit" && (
                <div className="border-t border-gray-100 pt-4">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Live Preview</div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm text-gray-600">Enter</span>
                    <input
                      className="border border-gray-200 rounded px-2 py-1 text-sm w-20 text-center"
                      type="number"
                      value={previewQty}
                      onChange={(e) => setPreviewQty(e.target.value)}
                    />
                    <span className="text-sm text-gray-600">{fUnit || "units"}</span>
                  </div>
                  <div className="bg-[#eef6f0] rounded-lg px-4 py-3 text-sm space-y-1">
                    {previewHrs && <div className="font-semibold text-[#123b1f]">⏱ {previewHrs}</div>}
                    {previewMats.map((m, i) => (
                      <div key={i} className="text-gray-700">📦 {m.qty} {m.unit} {m.name}</div>
                    ))}
                    {!previewHrs && previewMats.length === 0 && (
                      <div className="text-gray-400">Add hrs/unit or materials to see preview</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
