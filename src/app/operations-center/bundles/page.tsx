"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Division = { id: string; name: string };
type Bundle = { id: string; name: string; description?: string | null; division_id?: string | null };
type Question = {
  id: string; bundle_id: string; question_key: string; label: string;
  input_type: string; unit?: string | null; required?: boolean; default_value?: string | null;
  help_text?: string | null; sort_order?: number;
};
type BundleTask = {
  id: string; bundle_id: string; task_name: string; item_name?: string | null;
  unit: string; rule_type: string; rule_config: Record<string, any>;
  show_as_line_item_default?: boolean; sort_order?: number;
};
type TaskMaterial = {
  id: string; bundle_task_id: string; material_id: string; material_name?: string | null;
  qty_per_task_unit: number; unit: string; unit_cost?: number | null;
};
type MatCatalogRow = { id: string; name: string; default_unit?: string | null; default_unit_cost?: number | null };

const RULE_TYPES = [
  { value: "mulch_yards_from_sqft_depth", label: "Mulch Volume (sq ft + depth → yd)" },
  { value: "hours_per_sqft", label: "Hours from Area (sq ft)" },
  { value: "hours_per_qty", label: "Hours from Quantity" },
  { value: "linear_feet_from_sqft", label: "Linear Feet from Area" },
  { value: "fixed_quantity", label: "Fixed Quantity" },
  { value: "fixed_hours", label: "Fixed Hours" },
  { value: "conditional_if_checked", label: "Conditional (only if checkbox checked)" },
];

const INPUT_TYPES = ["number", "checkbox", "text"];
const UNITS = ["yd", "sqft", "lft", "ea", "hr", "bag", "lb", "gal", "ton", "load", "visit"];

const labelCls = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1";
const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500";
const sectionHeader = "text-xs font-bold text-gray-500 uppercase tracking-wide mb-2";

function RuleConfigFields({
  ruleType, config, onChange,
}: {
  ruleType: string;
  config: Record<string, any>;
  onChange: (patch: Record<string, any>) => void;
}) {
  const field = (key: string, label: string, placeholder?: string) => (
    <div key={key}>
      <label className={labelCls}>{label}</label>
      <input
        className={inputCls} type="number" step="any"
        placeholder={placeholder}
        value={config[key] ?? ""}
        onChange={(e) => onChange({ ...config, [key]: e.target.value === "" ? undefined : Number(e.target.value) })}
      />
    </div>
  );
  const textField = (key: string, label: string, placeholder?: string) => (
    <div key={key}>
      <label className={labelCls}>{label}</label>
      <input
        className={inputCls} type="text"
        placeholder={placeholder}
        value={config[key] ?? ""}
        onChange={(e) => onChange({ ...config, [key]: e.target.value || undefined })}
      />
    </div>
  );

  switch (ruleType) {
    case "mulch_yards_from_sqft_depth":
      return (
        <div className="grid grid-cols-3 gap-3">
          {field("depth_inches", "Default Depth (in)", "3")}
          {field("round_to", "Round Qty To", "1")}
          {field("minutes_per_unit", "Min per yd (hrs calc)", "e.g. 12")}
        </div>
      );
    case "hours_per_sqft":
      return <div>{field("rate_sqft_per_hour", "sq ft per Hour", "e.g. 500")}</div>;
    case "hours_per_qty":
      return (
        <div className="grid grid-cols-2 gap-3">
          {field("quantity", "Quantity")}
          {field("minutes_per_unit", "Min per Unit (hrs calc)", "e.g. 60")}
        </div>
      );
    case "linear_feet_from_sqft":
      return (
        <div className="grid grid-cols-3 gap-3">
          {field("factor", "Factor (lft per sqft)", "e.g. 0.25")}
          {field("round_to", "Round Qty To", "1")}
          {field("minutes_per_unit", "Min per lft (hrs calc)")}
        </div>
      );
    case "fixed_quantity":
      return (
        <div className="grid grid-cols-2 gap-3">
          {field("quantity", "Quantity")}
          {field("minutes_per_unit", "Min per Unit (hrs calc)")}
        </div>
      );
    case "fixed_hours":
      return <div>{field("hours", "Hours")}</div>;
    case "conditional_if_checked":
      return (
        <div className="grid grid-cols-2 gap-3">
          {textField("question", "Question Key (checkbox)", "e.g. add_edging")}
          {field("minutes_per_unit", "Min per Unit (hrs calc)")}
          {field("depth_inches", "Depth (in, if yd unit)", "3")}
          {field("round_to", "Round Qty To", "1")}
          {field("rate_sqft_per_hour", "sqft per hr (if area)")}
          {field("factor", "Factor (if lft unit)")}
        </div>
      );
    default:
      return null;
  }
}

export default function BundleBuilderPage() {
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [divisionId, setDivisionId] = useState("");
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [selectedBundle, setSelectedBundle] = useState<Bundle | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [tasks, setTasks] = useState<BundleTask[]>([]);
  const [taskMaterials, setTaskMaterials] = useState<Record<string, TaskMaterial[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New bundle form
  const [newBundleName, setNewBundleName] = useState("");
  const [creatingBundle, setCreatingBundle] = useState(false);

  // Question add form
  const [qKey, setQKey] = useState(""); const [qLabel, setQLabel] = useState("");
  const [qType, setQType] = useState("number"); const [qUnit, setQUnit] = useState("");
  const [qRequired, setQRequired] = useState(false); const [qDefault, setQDefault] = useState("");
  const [qHelp, setQHelp] = useState(""); const [addingQ, setAddingQ] = useState(false);

  // Task add form
  const [tName, setTName] = useState(""); const [tUnit, setTUnit] = useState("yd");
  const [tRule, setTRule] = useState("mulch_yards_from_sqft_depth");
  const [tConfig, setTConfig] = useState<Record<string, any>>({});
  const [tLineItem, setTLineItem] = useState(true); const [addingT, setAddingT] = useState(false);

  // Material add form (per task)
  const [matTaskId, setMatTaskId] = useState<string | null>(null);
  const [matSearch, setMatSearch] = useState(""); const [matResults, setMatResults] = useState<MatCatalogRow[]>([]);
  const [matSelected, setMatSelected] = useState<MatCatalogRow | null>(null);
  const [matQty, setMatQty] = useState(""); const [matUnit, setMatUnit] = useState("ea");
  const [matCost, setMatCost] = useState(""); const [addingMat, setAddingMat] = useState(false);

  function flash(msg: string) { setSuccess(msg); setTimeout(() => setSuccess(null), 3000); }

  useEffect(() => {
    fetch("/api/divisions", { cache: "no-store" }).then(r => r.json()).then(j => {
      const list: Division[] = j?.data ?? [];
      setDivisions(list);
      if (list.length > 0) setDivisionId(list[0].id);
    });
  }, []);

  useEffect(() => {
    if (!divisionId) return;
    fetch(`/api/atlasbid/scope-bundles?division_id=${divisionId}`, { cache: "no-store" })
      .then(r => r.json()).then(j => setBundles(j?.rows ?? []));
  }, [divisionId]);

  const loadBundle = useCallback(async (b: Bundle) => {
    setSelectedBundle(b);
    setError(null);
    const [qRes, tRes] = await Promise.all([
      fetch(`/api/atlasbid/scope-bundle-questions?bundle_id=${b.id}`, { cache: "no-store" }),
      fetch(`/api/operations-center/scope-bundle-tasks?bundle_id=${b.id}`, { cache: "no-store" }),
    ]);
    const qJson = await qRes.json(); setQuestions(qJson?.rows ?? []);
    const tJson = await tRes.json(); const loadedTasks: BundleTask[] = tJson?.rows ?? [];
    setTasks(loadedTasks);
    // Load materials for all tasks
    const matMap: Record<string, TaskMaterial[]> = {};
    await Promise.all(loadedTasks.map(async (t) => {
      const mRes = await fetch(`/api/operations-center/scope-bundle-task-materials?bundle_task_id=${t.id}`, { cache: "no-store" });
      const mJson = await mRes.json();
      matMap[t.id] = mJson?.rows ?? [];
    }));
    setTaskMaterials(matMap);
  }, []);

  // Material search
  useEffect(() => {
    if (matSearch.length < 2) { setMatResults([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/materials-catalog?q=${encodeURIComponent(matSearch)}`, { cache: "no-store" });
      const j = await r.json(); setMatResults(j?.data ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [matSearch]);

  async function createBundle() {
    if (!newBundleName.trim()) return;
    setCreatingBundle(true);
    const r = await fetch("/api/atlasbid/scope-bundles", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newBundleName.trim(), division_id: divisionId || null }),
    });
    const j = await r.json();
    if (!r.ok) { setError(j?.error || "Failed to create bundle"); setCreatingBundle(false); return; }
    const nb = j.row;
    setBundles(prev => [...prev, nb].sort((a,b) => a.name.localeCompare(b.name)));
    setNewBundleName("");
    setCreatingBundle(false);
    loadBundle(nb);
  }

  async function deleteBundle() {
    if (!selectedBundle) return;
    if (!confirm(`Delete bundle "${selectedBundle.name}"? All questions and tasks will be removed.`)) return;
    const r = await fetch(`/api/operations-center/scope-bundles/${selectedBundle.id}`, { method: "DELETE" });
    if (!r.ok) { setError("Failed to delete bundle"); return; }
    setBundles(prev => prev.filter(b => b.id !== selectedBundle.id));
    setSelectedBundle(null); setQuestions([]); setTasks([]); setTaskMaterials({});
    flash("Bundle deleted.");
  }

  async function addQuestion() {
    if (!selectedBundle || !qKey.trim() || !qLabel.trim()) return;
    setAddingQ(true);
    const r = await fetch("/api/operations-center/scope-bundle-questions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bundle_id: selectedBundle.id, question_key: qKey.trim(), label: qLabel.trim(),
        input_type: qType, unit: qUnit.trim() || null, required: qRequired,
        default_value: qDefault.trim() || null, help_text: qHelp.trim() || null,
        sort_order: questions.length,
      }),
    });
    const j = await r.json();
    if (!r.ok) { setError(j?.error || "Failed to add question"); setAddingQ(false); return; }
    setQuestions(prev => [...prev, j.row]);
    setQKey(""); setQLabel(""); setQType("number"); setQUnit(""); setQRequired(false); setQDefault(""); setQHelp("");
    setAddingQ(false); flash("Question added.");
  }

  async function deleteQuestion(id: string) {
    const r = await fetch(`/api/operations-center/scope-bundle-questions/${id}`, { method: "DELETE" });
    if (!r.ok) { setError("Failed to delete question"); return; }
    setQuestions(prev => prev.filter(q => q.id !== id));
  }

  async function addTask() {
    if (!selectedBundle || !tName.trim()) return;
    setAddingT(true);
    const r = await fetch("/api/operations-center/scope-bundle-tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bundle_id: selectedBundle.id, task_name: tName.trim(), unit: tUnit,
        rule_type: tRule, rule_config: tConfig, show_as_line_item_default: tLineItem,
        sort_order: tasks.length,
      }),
    });
    const j = await r.json();
    if (!r.ok) { setError(j?.error || "Failed to add task"); setAddingT(false); return; }
    setTasks(prev => [...prev, j.row]);
    setTaskMaterials(prev => ({ ...prev, [j.row.id]: [] }));
    setTName(""); setTUnit("yd"); setTRule("mulch_yards_from_sqft_depth"); setTConfig({});
    setAddingT(false); flash("Task added.");
  }

  async function saveTask(task: BundleTask) {
    const r = await fetch(`/api/operations-center/scope-bundle-tasks/${task.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_name: task.task_name, unit: task.unit,
        rule_type: task.rule_type, rule_config: task.rule_config,
        show_as_line_item_default: task.show_as_line_item_default,
      }),
    });
    if (!r.ok) { setError("Failed to save task"); return; }
    flash("Task saved.");
  }

  async function deleteTask(id: string) {
    const r = await fetch(`/api/operations-center/scope-bundle-tasks/${id}`, { method: "DELETE" });
    if (!r.ok) { setError("Failed to delete task"); return; }
    setTasks(prev => prev.filter(t => t.id !== id));
    setTaskMaterials(prev => { const n = { ...prev }; delete n[id]; return n; });
  }

  async function addMaterial(taskId: string) {
    const mat = matSelected;
    if (!mat || !matQty) return;
    setAddingMat(true);
    const r = await fetch("/api/operations-center/scope-bundle-task-materials", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bundle_task_id: taskId, material_id: mat.id,
        qty_per_task_unit: Number(matQty),
        unit: matUnit || mat.default_unit || "ea",
        unit_cost: matCost ? Number(matCost) : (mat.default_unit_cost ?? null),
      }),
    });
    const j = await r.json();
    if (!r.ok) { setError(j?.error || "Failed to add material"); setAddingMat(false); return; }
    setTaskMaterials(prev => ({ ...prev, [taskId]: [...(prev[taskId] || []), { ...j.row, material_name: mat.name }] }));
    setMatSelected(null); setMatSearch(""); setMatQty(""); setMatUnit("ea"); setMatCost("");
    setMatTaskId(null); setAddingMat(false); flash("Material linked.");
  }

  async function deleteMaterial(taskId: string, matId: string) {
    const r = await fetch(`/api/operations-center/scope-bundle-task-materials/${matId}`, { method: "DELETE" });
    if (!r.ok) { setError("Failed to remove material"); return; }
    setTaskMaterials(prev => ({ ...prev, [taskId]: (prev[taskId] || []).filter(m => m.id !== matId) }));
  }

  return (
    <div className="min-h-screen bg-[#f6f8f6]">
      <div className="bg-[#123b1f] px-8 py-4 text-center">
        <div className="text-2xl font-extrabold text-white uppercase tracking-[0.2em]">Bundle Builder</div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-6 space-y-4">
        <Link href="/operations-center" className="text-sm text-emerald-700 hover:underline">← Back to Operations Center</Link>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}<button className="ml-3 underline" onClick={() => setError(null)}>dismiss</button></div>}
        {success && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-4 py-3 text-sm">{success}</div>}

        {/* Division tabs */}
        <div className="flex gap-2 flex-wrap">
          {divisions.map(d => (
            <button key={d.id} onClick={() => { setDivisionId(d.id); setSelectedBundle(null); }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${divisionId === d.id ? "bg-[#123b1f] text-white border-[#123b1f]" : "bg-white text-[#123b1f] border-[#d7e6db] hover:bg-[#eef6f0]"}`}>
              {d.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Bundle list */}
          <div className="bg-white rounded-xl border border-[#d7e6db] shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <span className="font-semibold text-[#123b1f] text-sm">{bundles.length} bundle{bundles.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="p-3 border-b">
              <div className="flex gap-2">
                <input className={inputCls} placeholder="New bundle name…" value={newBundleName}
                  onChange={e => setNewBundleName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") createBundle(); }}
                />
                <button onClick={createBundle} disabled={creatingBundle || !newBundleName.trim()}
                  className="bg-green-500 text-white text-sm px-3 py-2 rounded-lg hover:bg-green-600 disabled:opacity-50 whitespace-nowrap">
                  + Add
                </button>
              </div>
            </div>
            <div className="divide-y divide-gray-50">
              {bundles.length === 0 && <div className="px-4 py-6 text-sm text-gray-400 text-center">No bundles yet.</div>}
              {bundles.map(b => (
                <button key={b.id} onClick={() => loadBundle(b)}
                  className={`w-full text-left px-4 py-3 hover:bg-[#f6f8f6] transition-colors text-sm ${selectedBundle?.id === b.id ? "bg-[#eef6f0] border-l-4 border-green-500" : ""}`}>
                  <div className="font-medium text-gray-900">{b.name}</div>
                  {b.description && <div className="text-xs text-gray-400 mt-0.5">{b.description}</div>}
                </button>
              ))}
            </div>
          </div>

          {/* Editing panel */}
          {selectedBundle && (
            <div className="lg:col-span-2 space-y-5">
              {/* Bundle header */}
              <div className="bg-white rounded-xl border border-[#d7e6db] shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-bold text-[#123b1f]">{selectedBundle.name}</h2>
                  <button onClick={deleteBundle} className="text-red-500 text-sm hover:text-red-700">Delete Bundle</button>
                </div>
              </div>

              {/* Questions */}
              <div className="bg-white rounded-xl border border-[#d7e6db] shadow-sm p-4 space-y-3">
                <div className={sectionHeader}>Questions (Salesperson Inputs)</div>
                <p className="text-xs text-gray-500 -mt-1">Define what the salesperson fills in when loading this bundle (e.g. sq ft, depth, optional services).</p>

                {questions.length === 0 && <div className="text-sm text-gray-400">No questions yet.</div>}
                {questions.map(q => (
                  <div key={q.id} className="flex items-start gap-2 bg-gray-50 rounded-lg px-3 py-2 text-sm">
                    <div className="flex-1">
                      <span className="font-medium text-gray-800">{q.label}</span>
                      <span className="ml-2 text-xs text-gray-400">key: {q.question_key} · type: {q.input_type}{q.unit ? ` · unit: ${q.unit}` : ""}{q.required ? " · required" : ""}</span>
                      {q.help_text && <div className="text-xs text-gray-400 mt-0.5 italic">{q.help_text}</div>}
                    </div>
                    <button onClick={() => deleteQuestion(q.id)} className="text-gray-300 hover:text-red-500">✕</button>
                  </div>
                ))}

                {/* Add question form */}
                <div className="bg-[#f6f8f6] rounded-lg p-3 space-y-2">
                  <div className="text-xs font-semibold text-gray-500">Add Question</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>Question Key</label>
                      <input className={inputCls} placeholder="e.g. mulch_sqft" value={qKey} onChange={e => setQKey(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Label (shown to user)</label>
                      <input className={inputCls} placeholder="e.g. Area (sq ft)" value={qLabel} onChange={e => setQLabel(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Input Type</label>
                      <select className={inputCls} value={qType} onChange={e => setQType(e.target.value)}>
                        {INPUT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Unit (display, optional)</label>
                      <input className={inputCls} placeholder="e.g. sqft, in" value={qUnit} onChange={e => setQUnit(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Default Value</label>
                      <input className={inputCls} placeholder="optional" value={qDefault} onChange={e => setQDefault(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Help Text</label>
                      <input className={inputCls} placeholder="optional" value={qHelp} onChange={e => setQHelp(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-sm text-gray-600">
                      <input type="checkbox" checked={qRequired} onChange={e => setQRequired(e.target.checked)} />
                      Required
                    </label>
                    <button onClick={addQuestion} disabled={addingQ || !qKey.trim() || !qLabel.trim()}
                      className="ml-auto bg-green-500 text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-green-600 disabled:opacity-50">
                      {addingQ ? "Adding…" : "+ Add Question"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Tasks */}
              <div className="bg-white rounded-xl border border-[#d7e6db] shadow-sm p-4 space-y-4">
                <div className={sectionHeader}>Tasks (Auto-Generated Labor Rows)</div>
                <p className="text-xs text-gray-500 -mt-3">Each task becomes a bid_labor row when the bundle is loaded. Set rule type to control how qty and hrs are computed from the questions above.</p>

                {tasks.map((task, ti) => {
                  const mats = taskMaterials[task.id] || [];
                  return (
                    <div key={task.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-3 py-2 flex items-center justify-between border-b">
                        <span className="font-semibold text-sm text-gray-800">Task {ti + 1}: {task.task_name}</span>
                        <button onClick={() => deleteTask(task.id)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                      </div>
                      <div className="p-3 space-y-3">
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className={labelCls}>Task Name</label>
                            <input className={inputCls} value={task.task_name}
                              onChange={e => setTasks(prev => prev.map(t => t.id === task.id ? { ...t, task_name: e.target.value } : t))} />
                          </div>
                          <div>
                            <label className={labelCls}>Unit</label>
                            <select className={inputCls} value={task.unit}
                              onChange={e => setTasks(prev => prev.map(t => t.id === task.id ? { ...t, unit: e.target.value } : t))}>
                              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className={labelCls}>Rule Type</label>
                            <select className={inputCls} value={task.rule_type}
                              onChange={e => setTasks(prev => prev.map(t => t.id === task.id ? { ...t, rule_type: e.target.value, rule_config: {} } : t))}>
                              {RULE_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className={labelCls}>Rule Config</label>
                          <RuleConfigFields
                            ruleType={task.rule_type}
                            config={task.rule_config}
                            onChange={cfg => setTasks(prev => prev.map(t => t.id === task.id ? { ...t, rule_config: cfg } : t))}
                          />
                        </div>

                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-1.5 text-sm text-gray-600">
                            <input type="checkbox" checked={task.show_as_line_item_default ?? true}
                              onChange={e => setTasks(prev => prev.map(t => t.id === task.id ? { ...t, show_as_line_item_default: e.target.checked } : t))} />
                            Show as line item in proposal by default
                          </label>
                          <button onClick={() => saveTask(task)}
                            className="bg-[#123b1f] text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-emerald-800">
                            Save Task
                          </button>
                        </div>

                        {/* Materials for this task */}
                        <div className="border-t border-gray-100 pt-3 space-y-2">
                          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Linked Materials</div>
                          <p className="text-xs text-gray-400">Materials added here appear in the Materials Ledger when this bundle is loaded into a bid.</p>
                          {mats.length === 0 && <div className="text-xs text-gray-400">No materials linked.</div>}
                          {mats.map(m => (
                            <div key={m.id} className="flex items-center gap-2 bg-gray-50 rounded px-3 py-1.5 text-sm">
                              <span className="flex-1 font-medium text-gray-700">{m.material_name || m.material_id}</span>
                              <span className="text-gray-500 text-xs">{m.qty_per_task_unit} {m.unit} per {task.unit}{m.unit_cost != null ? ` · $${Number(m.unit_cost).toFixed(2)}` : ""}</span>
                              <button onClick={() => deleteMaterial(task.id, m.id)} className="text-gray-300 hover:text-red-500">✕</button>
                            </div>
                          ))}
                          {matTaskId === task.id ? (
                            <div className="bg-[#f6f8f6] rounded-lg p-3 space-y-2">
                              <div className="relative">
                                <input className={inputCls} placeholder="Search materials catalog…"
                                  value={matSelected ? matSelected.name : matSearch}
                                  onChange={e => { setMatSearch(e.target.value); setMatSelected(null); }} />
                                {matResults.length > 0 && !matSelected && (
                                  <div className="absolute top-full left-0 mt-1 z-20 bg-white border rounded-lg shadow-lg w-full max-h-40 overflow-y-auto">
                                    {matResults.map(m => (
                                      <button key={m.id} className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 flex justify-between"
                                        onMouseDown={() => { setMatSelected(m); setMatSearch(""); setMatUnit(m.default_unit || "ea"); setMatCost(m.default_unit_cost != null ? String(m.default_unit_cost) : ""); }}>
                                        <span>{m.name}</span>
                                        <span className="text-gray-400 text-xs">{m.default_unit}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <label className={labelCls}>Qty per {task.unit}</label>
                                  <input className={inputCls} type="number" step="0.01" min="0" value={matQty} onChange={e => setMatQty(e.target.value)} placeholder="1.0" />
                                </div>
                                <div>
                                  <label className={labelCls}>Unit</label>
                                  <select className={inputCls} value={matUnit} onChange={e => setMatUnit(e.target.value)}>
                                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className={labelCls}>Unit Cost</label>
                                  <input className={inputCls} type="number" step="0.01" min="0" value={matCost} onChange={e => setMatCost(e.target.value)} placeholder="$0.00" />
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => addMaterial(task.id)} disabled={addingMat || !matSelected || !matQty}
                                  className="bg-green-500 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-green-600 disabled:opacity-50">
                                  {addingMat ? "Adding…" : "+ Link Material"}
                                </button>
                                <button onClick={() => { setMatTaskId(null); setMatSelected(null); setMatSearch(""); setMatQty(""); }}
                                  className="text-gray-400 text-sm px-3 py-1.5 hover:text-gray-600">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => setMatTaskId(task.id)}
                              className="text-emerald-600 text-xs font-semibold hover:underline">
                              + Link Material
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Add task form */}
                <div className="bg-[#f6f8f6] rounded-lg p-4 space-y-3 border border-dashed border-gray-300">
                  <div className="text-xs font-semibold text-gray-500">Add Task</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1">
                      <label className={labelCls}>Task Name</label>
                      <input className={inputCls} placeholder='e.g. "Install Mulch"' value={tName} onChange={e => setTName(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Unit</label>
                      <select className={inputCls} value={tUnit} onChange={e => setTUnit(e.target.value)}>
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Rule Type</label>
                      <select className={inputCls} value={tRule} onChange={e => { setTRule(e.target.value); setTConfig({}); }}>
                        {RULE_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Rule Config</label>
                    <RuleConfigFields ruleType={tRule} config={tConfig} onChange={setTConfig} />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-sm text-gray-600">
                      <input type="checkbox" checked={tLineItem} onChange={e => setTLineItem(e.target.checked)} />
                      Show as line item by default
                    </label>
                    <button onClick={addTask} disabled={addingT || !tName.trim()}
                      className="bg-[#123b1f] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-emerald-800 disabled:opacity-50">
                      {addingT ? "Adding…" : "+ Add Task"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
