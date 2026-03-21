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
type TaskCatalogRow = { id: string; name: string; unit?: string | null; minutes_per_unit?: number | null; default_qty?: number | null };

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
const btnPrimary = "bg-green-500 hover:bg-green-600 active:bg-green-700 text-white font-bold text-sm px-4 py-2 rounded-lg shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const btnDark = "bg-[#123b1f] hover:bg-emerald-900 active:bg-emerald-950 text-white font-bold text-sm px-4 py-2 rounded-lg shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

function slugify(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 40);
}

function RuleConfigFields({
  ruleType, config, onChange, questions,
}: {
  ruleType: string;
  config: Record<string, any>;
  onChange: (patch: Record<string, any>) => void;
  questions: Question[];
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

  const questionDropdown = (key: string, label: string) => {
    const checkboxQs = questions.filter(q => q.input_type === "checkbox");
    return (
      <div key={key}>
        <label className={labelCls}>{label}</label>
        <select
          className={inputCls}
          value={config[key] ?? ""}
          onChange={(e) => onChange({ ...config, [key]: e.target.value || undefined })}
        >
          <option value="">— select a checkbox question —</option>
          {checkboxQs.map(q => (
            <option key={q.question_key} value={q.question_key}>{q.label}</option>
          ))}
        </select>
        {checkboxQs.length === 0 && (
          <p className="text-xs text-amber-600 mt-1">Add a checkbox-type question to this bundle first.</p>
        )}
      </div>
    );
  };

  const requiresKey = (keys: string[], note?: string) => {
    const missing = keys.filter(k => !questions.some(q => q.question_key === k));
    if (missing.length === 0) return null;
    return (
      <div className="col-span-full rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
        <span className="font-semibold">Requires question key{missing.length > 1 ? "s" : ""}:</span>{" "}
        {missing.map(k => <code key={k} className="bg-amber-100 px-1 rounded font-mono mx-0.5">{k}</code>)}
        {note && <span className="text-amber-600 ml-1">— {note}</span>}
        <div className="mt-1 text-amber-600">Add a question whose label produces this key (shown as "Key: …" when typing).</div>
      </div>
    );
  };

  switch (ruleType) {
    case "mulch_yards_from_sqft_depth":
      return (
        <div className="grid grid-cols-3 gap-3">
          {requiresKey(["mulch_sqft"], 'label your question "Mulch sqft"')}
          {field("depth_inches", "Default Depth (in)", "3")}
          {field("round_to", "Round Qty To", "1")}
          {field("minutes_per_unit", "Min per yd (hrs calc)", "e.g. 12")}
        </div>
      );
    case "hours_per_sqft":
      return (
        <div className="grid grid-cols-1 gap-3">
          {requiresKey(["mulch_sqft"], 'label your question "Mulch sqft"')}
          {field("rate_sqft_per_hour", "sq ft per Hour", "e.g. 500")}
        </div>
      );
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
          {requiresKey(["mulch_sqft"], 'label your question "Mulch sqft"')}
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
          {questionDropdown("question", "Show only when (checkbox question)")}
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

function previewTask(task: BundleTask, answers: Record<string, any>, questions: Question[]) {
  const qMap = new Map(questions.map(q => [q.question_key, q]));
  function getAns(key: string) {
    if (answers[key] !== undefined && answers[key] !== null && answers[key] !== "") return answers[key];
    return qMap.get(key)?.default_value ?? null;
  }
  function n(v: unknown, fb = 0) { const x = Number(v); return Number.isFinite(x) ? x : fb; }
  function roundInc(val: number, inc: number) { const v = n(val); const i = n(inc); return i <= 0 ? v : Math.ceil(v / i) * i; }
  function bool(v: unknown) { const s = String(v ?? "").toLowerCase(); return s === "true" || s === "1" || s === "yes" || s === "on"; }

  const cfg = task.rule_config ?? {};
  const rule = task.rule_type;
  const unit = task.unit || "ea";
  const checkKey = cfg.question || cfg.question_key || cfg.depends_on || "";
  if (checkKey && !bool(getAns(checkKey))) return { skip: true, reason: `checkbox "${checkKey}" unchecked`, qty: 0, hrs: 0 };

  const sqft = n(getAns("mulch_sqft"));
  const depthAns = n(getAns("mulch_depth"));
  let qty = 0, hrs = 0;

  if (rule === "mulch_yards_from_sqft_depth") {
    const depth = n(cfg.depth_inches, depthAns || 3);
    qty = sqft > 0 ? roundInc((sqft * depth) / 324, n(cfg.round_to, 1)) : 0;
    const mpu = n(cfg.minutes_per_unit); if (mpu > 0 && qty > 0) hrs = qty * mpu / 60;
  } else if (rule === "hours_per_sqft") {
    const rate = n(cfg.rate_sqft_per_hour); hrs = rate > 0 ? sqft / rate : 0;
  } else if (rule === "hours_per_qty") {
    qty = n(cfg.quantity); const mpu = n(cfg.minutes_per_unit); if (mpu > 0 && qty > 0) hrs = qty * mpu / 60;
  } else if (rule === "linear_feet_from_sqft") {
    qty = roundInc(sqft * n(cfg.factor), n(cfg.round_to, 1)); const mpu = n(cfg.minutes_per_unit); if (mpu > 0 && qty > 0) hrs = qty * mpu / 60;
  } else if (rule === "fixed_quantity") {
    qty = n(cfg.quantity); const mpu = n(cfg.minutes_per_unit); if (mpu > 0 && qty > 0) hrs = qty * mpu / 60;
  } else if (rule === "fixed_hours") {
    hrs = n(cfg.hours);
  } else if (rule === "conditional_if_checked") {
    const ck = String(cfg.question || "");
    if (!bool(getAns(ck))) return { skip: true, reason: `checkbox "${ck}" unchecked`, qty: 0, hrs: 0 };
    if (unit === "sqft") qty = sqft;
    else if (unit === "yd") qty = sqft > 0 ? roundInc((sqft * n(cfg.depth_inches, depthAns || 3)) / 324, n(cfg.round_to, 1)) : 0;
    else if (unit === "lf") qty = roundInc(sqft * n(cfg.factor), n(cfg.round_to, 1));
    const rate = n(cfg.rate_sqft_per_hour); if (rate > 0 && sqft > 0) hrs = sqft / rate;
  }
  qty = Number(qty.toFixed(2)); hrs = Number(hrs.toFixed(2));
  if (qty <= 0 && hrs <= 0) return { skip: true, reason: "qty and hrs both 0", qty, hrs };
  return { skip: false, reason: "", qty, hrs };
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
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, any>>({});

  // New bundle form
  const [newBundleName, setNewBundleName] = useState("");
  const [creatingBundle, setCreatingBundle] = useState(false);

  // Question draft rows — multiple can be filled in before saving
  type QDraft = { label: string; type: string; unit: string; required: boolean; defaultVal: string; help: string };
  const emptyDraft = (): QDraft => ({ label: "", type: "number", unit: "", required: false, defaultVal: "", help: "" });
  const [qDrafts, setQDrafts] = useState<QDraft[]>([emptyDraft()]);
  const [addingQ, setAddingQ] = useState(false);

  // Task add form
  const [tName, setTName] = useState(""); const [tUnit, setTUnit] = useState("yd");
  const [tRule, setTRule] = useState("fixed_quantity");
  const [tConfig, setTConfig] = useState<Record<string, any>>({});
  const [tLineItem, setTLineItem] = useState(true); const [addingT, setAddingT] = useState(false);

  // Task catalog search for pre-populate
  const [catalogTasks, setCatalogTasks] = useState<TaskCatalogRow[]>([]);
  const [tCatalogSearch, setTCatalogSearch] = useState("");
  const [tCatalogSelected, setTCatalogSelected] = useState<TaskCatalogRow | null>(null);
  const [tCatalogOpen, setTCatalogOpen] = useState(false);

  // Material add form (per task)
  const [matTaskId, setMatTaskId] = useState<string | null>(null);
  const [matSearch, setMatSearch] = useState(""); const [matResults, setMatResults] = useState<MatCatalogRow[]>([]);
  const [matSelected, setMatSelected] = useState<MatCatalogRow | null>(null);
  const [matQty, setMatQty] = useState(""); const [matUnit, setMatUnit] = useState("ea");
  const [matCost, setMatCost] = useState(""); const [addingMat, setAddingMat] = useState(false);
  const [matSearched, setMatSearched] = useState(false);

  // Per-task save state
  const [savingTask, setSavingTask] = useState<string | null>(null);
  const [savedTask, setSavedTask] = useState<string | null>(null);

  function flash(msg: string) { setSuccess(msg); setTimeout(() => setSuccess(null), 4000); }
  function err(msg: string) { setError(msg); setTimeout(() => setError(null), 6000); }

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
    fetch(`/api/task-catalog?division_id=${divisionId}`, { cache: "no-store" })
      .then(r => r.json()).then(j => setCatalogTasks(j?.data ?? []));
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
    if (matSearch.length < 2) { setMatResults([]); setMatSearched(false); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/materials-catalog?q=${encodeURIComponent(matSearch)}`, { cache: "no-store" });
      const j = await r.json();
      setMatResults(j?.data ?? []);
      setMatSearched(true);
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
    if (!r.ok) { err(j?.error || "Failed to create bundle"); setCreatingBundle(false); return; }
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
    if (!r.ok) { err("Failed to delete bundle"); return; }
    setBundles(prev => prev.filter(b => b.id !== selectedBundle.id));
    setSelectedBundle(null); setQuestions([]); setTasks([]); setTaskMaterials({});
    flash("Bundle deleted.");
  }

  async function addQuestions() {
    if (!selectedBundle) return;
    const valid = qDrafts.filter(d => d.label.trim());
    if (valid.length === 0) return;
    setAddingQ(true);
    const added: Question[] = [];
    for (const d of valid) {
      const r = await fetch("/api/operations-center/scope-bundle-questions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bundle_id: selectedBundle.id, question_key: slugify(d.label),
          label: d.label.trim(), input_type: d.type,
          unit: d.unit.trim() || null, required: d.required,
          default_value: d.defaultVal.trim() || null, help_text: d.help.trim() || null,
          sort_order: questions.length + added.length,
        }),
      });
      const j = await r.json();
      if (!r.ok) { err(j?.error || `Failed to add "${d.label}"`); continue; }
      added.push(j.row);
    }
    setQuestions(prev => [...prev, ...added]);
    setQDrafts([emptyDraft()]);
    setAddingQ(false);
    flash(`${added.length} question${added.length !== 1 ? "s" : ""} added.`);
  }

  async function deleteQuestion(id: string) {
    const r = await fetch(`/api/operations-center/scope-bundle-questions/${id}`, { method: "DELETE" });
    if (!r.ok) { err("Failed to delete question"); return; }
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
    if (!r.ok) { err(j?.error || "Failed to add task"); setAddingT(false); return; }
    setTasks(prev => [...prev, j.row]);
    setTaskMaterials(prev => ({ ...prev, [j.row.id]: [] }));
    setTName(""); setTUnit("yd"); setTRule("fixed_quantity"); setTConfig({});
    setTCatalogSelected(null); setTCatalogSearch(""); setTCatalogOpen(false);
    setAddingT(false); flash("Task added.");
  }

  async function saveTask(task: BundleTask) {
    setSavingTask(task.id);
    try {
      const r = await fetch(`/api/operations-center/scope-bundle-tasks/${task.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_name: task.task_name, unit: task.unit,
          rule_type: task.rule_type, rule_config: task.rule_config,
          show_as_line_item_default: task.show_as_line_item_default,
        }),
      });
      const j = await r.json();
      if (!r.ok) { err(j?.error || "Failed to save task"); }
      else { setSavedTask(task.id); setTimeout(() => setSavedTask(null), 2000); }
    } catch (e: any) {
      err(e?.message || "Failed to save task");
    } finally {
      setSavingTask(null);
    }
  }

  async function deleteTask(id: string) {
    const r = await fetch(`/api/operations-center/scope-bundle-tasks/${id}`, { method: "DELETE" });
    if (!r.ok) { err("Failed to delete task"); return; }
    setTasks(prev => prev.filter(t => t.id !== id));
    setTaskMaterials(prev => { const n = { ...prev }; delete n[id]; return n; });
  }

  function openMatForm(taskId: string) {
    setMatTaskId(taskId);
    setMatSelected(null);
    setMatSearch("");
    setMatResults([]);
    setMatSearched(false);
    setMatQty("");
    setMatUnit("ea");
    setMatCost("");
  }

  async function addMaterial(taskId: string) {
    const mat = matSelected;
    if (!mat) { err("Select a material from the search results first."); return; }
    if (!matQty || Number(matQty) <= 0) { err("Enter a qty greater than 0."); return; }
    setAddingMat(true);
    try {
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
      if (!r.ok) { err(j?.error || "Failed to add material"); return; }
      setTaskMaterials(prev => ({ ...prev, [taskId]: [...(prev[taskId] || []), { ...j.row, material_name: mat.name }] }));
      setMatSelected(null); setMatSearch(""); setMatQty(""); setMatUnit("ea"); setMatCost("");
      setMatTaskId(null); flash("Material linked.");
    } catch (e: any) {
      err(e?.message || "Failed to add material");
    } finally {
      setAddingMat(false);
    }
  }

  async function deleteMaterial(taskId: string, matId: string) {
    const r = await fetch(`/api/operations-center/scope-bundle-task-materials/${matId}`, { method: "DELETE" });
    if (!r.ok) { err("Failed to remove material"); return; }
    setTaskMaterials(prev => ({ ...prev, [taskId]: (prev[taskId] || []).filter(m => m.id !== matId) }));
  }

  return (
    <div className="min-h-screen bg-[#f6f8f6]">
      <div className="bg-[#123b1f] px-8 py-4 text-center">
        <div className="text-2xl font-extrabold text-white uppercase tracking-[0.2em]">Bundle Builder</div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-6 space-y-4">
        <Link href="/operations-center" className="text-sm text-emerald-700 hover:underline">← Back to Operations Center</Link>

        {error && (
          <div className="bg-red-100 border border-red-300 text-red-800 rounded-lg px-4 py-3 text-sm font-medium flex items-center justify-between">
            <span>⚠ {error}</span>
            <button className="ml-4 underline text-red-600 hover:text-red-800" onClick={() => setError(null)}>dismiss</button>
          </div>
        )}
        {success && (
          <div className="bg-green-100 border border-green-300 text-green-800 rounded-lg px-4 py-3 text-sm font-medium">
            ✓ {success}
          </div>
        )}

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
                  className={`${btnPrimary} whitespace-nowrap`}>
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
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-[#123b1f]">{selectedBundle.name}</h2>
                  <button onClick={deleteBundle} className="text-red-500 text-sm hover:text-red-700 font-medium">Delete Bundle</button>
                </div>
              </div>

              {/* Questions */}
              <div className="bg-white rounded-xl border border-[#d7e6db] shadow-sm p-4 space-y-3">
                <div className={sectionHeader}>Questions (Salesperson Inputs)</div>
                <p className="text-xs text-gray-500 -mt-1">Define what the salesperson fills in when loading this bundle (e.g. sq ft, depth, optional add-ons).</p>

                {questions.length === 0 && <div className="text-sm text-gray-400">No questions yet.</div>}
                {questions.map(q => (
                  <div key={q.id} className="flex items-start gap-2 bg-gray-50 rounded-lg px-3 py-2 text-sm">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-800">{q.label}</span>
                        <code className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-mono">{q.question_key}</code>
                        <span className="text-xs text-gray-400">{q.input_type}{q.unit ? ` · ${q.unit}` : ""}{q.required ? " · required" : ""}</span>
                      </div>
                      {q.help_text && <div className="text-xs text-gray-400 mt-0.5 italic">{q.help_text}</div>}
                    </div>
                    <button onClick={() => deleteQuestion(q.id)} className="text-gray-300 hover:text-red-500 text-lg leading-none">✕</button>
                  </div>
                ))}

                {/* Add question form — multiple rows */}
                <div className="bg-[#f6f8f6] rounded-lg p-3 space-y-2 border border-dashed border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-gray-500">Add Questions</div>
                    <button onClick={() => setQDrafts(prev => [...prev, emptyDraft()])}
                      className="text-xs text-green-600 font-semibold hover:text-green-800">+ Add Row</button>
                  </div>

                  {/* Column headers */}
                  <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide px-0.5">
                    <div>Label</div><div>Type</div><div>Unit</div><div />
                  </div>

                  {qDrafts.map((d, i) => (
                    <div key={i} className="space-y-1">
                      <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 items-center">
                        <input className={inputCls} placeholder='e.g. "Area (sq ft)"'
                          value={d.label}
                          onChange={e => setQDrafts(prev => prev.map((r, j) => j === i ? { ...r, label: e.target.value } : r))} />
                        <select className={inputCls} value={d.type}
                          onChange={e => setQDrafts(prev => prev.map((r, j) => j === i ? { ...r, type: e.target.value } : r))}>
                          <option value="number">Number</option>
                          <option value="checkbox">Checkbox</option>
                          <option value="text">Text</option>
                        </select>
                        <input className={inputCls} placeholder="sq ft, in…"
                          value={d.unit}
                          onChange={e => setQDrafts(prev => prev.map((r, j) => j === i ? { ...r, unit: e.target.value } : r))} />
                        <button onClick={() => setQDrafts(prev => prev.length === 1 ? [emptyDraft()] : prev.filter((_, j) => j !== i))}
                          className="text-gray-300 hover:text-red-400 text-lg leading-none">✕</button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pl-0">
                        <input className={inputCls} placeholder="Default value (optional)"
                          value={d.defaultVal}
                          onChange={e => setQDrafts(prev => prev.map((r, j) => j === i ? { ...r, defaultVal: e.target.value } : r))} />
                        <input className={inputCls} placeholder="Helper text (optional)"
                          value={d.help}
                          onChange={e => setQDrafts(prev => prev.map((r, j) => j === i ? { ...r, help: e.target.value } : r))} />
                      </div>
                      {d.label.trim() && (
                        <p className="text-xs text-gray-400 pl-0.5">Key: <code className="bg-gray-100 px-1 rounded">{slugify(d.label)}</code></p>
                      )}
                    </div>
                  ))}

                  <div className="flex items-center justify-end pt-1">
                    <button onClick={addQuestions} disabled={addingQ || qDrafts.every(d => !d.label.trim())}
                      className={btnPrimary}>
                      {addingQ ? "Saving…" : `Save ${qDrafts.filter(d => d.label.trim()).length || ""} Question${qDrafts.filter(d => d.label.trim()).length !== 1 ? "s" : ""}`}
                    </button>
                  </div>
                </div>
              </div>

              {/* Tasks */}
              <div className="bg-white rounded-xl border border-[#d7e6db] shadow-sm p-4 space-y-4">
                <div className={sectionHeader}>Tasks (Auto-Generated Labor Rows)</div>
                <p className="text-xs text-gray-500 -mt-3">Each task becomes a labor row when the bundle is loaded into a bid.</p>

                {tasks.map((task, ti) => {
                  const mats = taskMaterials[task.id] || [];
                  const isSaving = savingTask === task.id;
                  const justSaved = savedTask === task.id;
                  return (
                    <div key={task.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-3 py-2 flex items-center justify-between border-b">
                        <span className="font-semibold text-sm text-gray-800">Task {ti + 1}: {task.task_name}</span>
                        <button onClick={() => deleteTask(task.id)} className="text-red-400 hover:text-red-600 text-xs font-medium">Remove</button>
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
                            questions={questions}
                          />
                        </div>

                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-1.5 text-sm text-gray-600">
                            <input type="checkbox" checked={task.show_as_line_item_default ?? true}
                              onChange={e => setTasks(prev => prev.map(t => t.id === task.id ? { ...t, show_as_line_item_default: e.target.checked } : t))} />
                            Show as line item in proposal by default
                          </label>
                          <button onClick={() => saveTask(task)} disabled={isSaving}
                            className={`${btnDark} min-w-[100px]`}>
                            {isSaving ? "Saving…" : justSaved ? "✓ Saved!" : "Save Task"}
                          </button>
                        </div>

                        {/* Materials for this task */}
                        <div className="border-t border-gray-100 pt-3 space-y-2">
                          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Linked Materials</div>
                          <p className="text-xs text-gray-400">Materials here appear in the Materials Ledger when this bundle is loaded into a bid.</p>
                          {mats.length === 0 && <div className="text-xs text-gray-400">No materials linked yet.</div>}
                          {mats.map(m => (
                            <div key={m.id} className="flex items-center gap-2 bg-gray-50 rounded px-3 py-1.5 text-sm">
                              <span className="flex-1 font-medium text-gray-700">{m.material_name || m.material_id}</span>
                              <span className="text-gray-500 text-xs">{m.qty_per_task_unit} {m.unit} per {task.unit}{m.unit_cost != null ? ` · $${Number(m.unit_cost).toFixed(2)}` : ""}</span>
                              <button onClick={() => deleteMaterial(task.id, m.id)} className="text-gray-300 hover:text-red-500 text-lg leading-none">✕</button>
                            </div>
                          ))}
                          {matTaskId === task.id ? (
                            <div className="bg-[#f6f8f6] rounded-lg p-3 space-y-2 border border-green-200">
                              <div className="relative">
                                <label className={labelCls}>Search Materials Catalog</label>
                                <input className={inputCls} placeholder="Type to search (min 2 chars)…"
                                  value={matSelected ? matSelected.name : matSearch}
                                  onChange={e => { setMatSearch(e.target.value); setMatSelected(null); setMatSearched(false); }} />
                                {matSelected && (
                                  <button className="absolute right-2 top-7 text-gray-400 hover:text-gray-600 text-sm"
                                    onClick={() => { setMatSelected(null); setMatSearch(""); setMatSearched(false); }}>✕</button>
                                )}
                                {matResults.length > 0 && !matSelected && (
                                  <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg w-full max-h-48 overflow-y-auto">
                                    {matResults.map(m => (
                                      <button key={m.id} className="w-full text-left px-3 py-2 text-sm hover:bg-green-50 flex justify-between"
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          setMatSelected(m);
                                          setMatSearch("");
                                          // For yd-based tasks, default 1:1 (1 yd material per 1 yd task)
                                          if (task.unit === "yd" || task.rule_type === "mulch_yards_from_sqft_depth") {
                                            setMatQty("1");
                                            setMatUnit("yd");
                                          } else {
                                            setMatUnit(m.default_unit || "ea");
                                          }
                                          setMatCost(m.default_unit_cost != null ? String(m.default_unit_cost) : "");
                                        }}>
                                        <span className="font-medium">{m.name}</span>
                                        <span className="text-gray-400 text-xs">{m.default_unit}{m.default_unit_cost != null ? ` · $${m.default_unit_cost}` : ""}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {matSearched && matResults.length === 0 && !matSelected && (
                                  <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow p-3 w-full text-sm text-gray-400 text-center">
                                    No materials found for &ldquo;{matSearch}&rdquo;
                                  </div>
                                )}
                              </div>
                              {matSelected && (
                                <>
                                {(task.unit === "yd" || task.rule_type === "mulch_yards_from_sqft_depth") && (
                                  <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
                                    Qty is computed from sq ft entered on the bid (sq ft × depth ÷ 324 = yds). Set ratio to 1 for 1 yd material per 1 yd of task.
                                  </p>
                                )}
                                <div className="grid grid-cols-3 gap-2">
                                  <div>
                                    <label className={labelCls}>Ratio per {task.unit}</label>
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
                                </>
                              )}
                              <div className="flex gap-2">
                                <button
                                  onClick={() => addMaterial(task.id)}
                                  disabled={addingMat || !matSelected || !matQty}
                                  className={`${btnPrimary}`}
                                >
                                  {addingMat ? "Adding…" : "+ Link Material"}
                                </button>
                                <button onClick={() => { setMatTaskId(null); setMatSelected(null); setMatSearch(""); setMatQty(""); }}
                                  className="text-gray-500 text-sm px-3 py-2 hover:text-gray-700 font-medium">Cancel</button>
                              </div>
                              {!matSelected && (
                                <p className="text-xs text-gray-400">Search and select a material above, then set the qty.</p>
                              )}
                            </div>
                          ) : (
                            <button onClick={() => openMatForm(task.id)}
                              className="bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm transition-colors">
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

                  {/* Catalog task picker */}
                  {catalogTasks.length > 0 && (
                    <div className="relative">
                      <label className={labelCls}>Pre-fill from Labor Task Catalog <span className="text-gray-400 font-normal normal-case tracking-normal">(optional)</span></label>
                      <input
                        className={inputCls}
                        placeholder="Search existing labor tasks…"
                        value={tCatalogSelected ? tCatalogSelected.name : tCatalogSearch}
                        onFocus={() => setTCatalogOpen(true)}
                        onBlur={() => setTimeout(() => setTCatalogOpen(false), 150)}
                        onChange={e => {
                          setTCatalogSearch(e.target.value);
                          setTCatalogSelected(null);
                          setTCatalogOpen(true);
                        }}
                      />
                      {tCatalogSelected && (
                        <button
                          className="absolute right-2 top-7 text-gray-400 hover:text-gray-600 text-sm"
                          onClick={() => { setTCatalogSelected(null); setTCatalogSearch(""); }}
                        >✕</button>
                      )}
                      {tCatalogOpen && !tCatalogSelected && (
                        <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg w-full max-h-48 overflow-y-auto">
                          {catalogTasks
                            .filter(t => !tCatalogSearch || t.name.toLowerCase().includes(tCatalogSearch.toLowerCase()))
                            .map(ct => (
                              <button key={ct.id} className="w-full text-left px-3 py-2 text-sm hover:bg-green-50 flex justify-between items-center"
                                onMouseDown={e => {
                                  e.preventDefault();
                                  setTCatalogSelected(ct);
                                  setTCatalogOpen(false);
                                  setTCatalogSearch("");
                                  // Auto-fill form fields from catalog
                                  setTName(ct.name);
                                  if (ct.unit) setTUnit(ct.unit);
                                  setTRule("fixed_quantity");
                                  setTConfig({
                                    ...(ct.default_qty != null ? { quantity: ct.default_qty } : {}),
                                    ...(ct.minutes_per_unit != null ? { minutes_per_unit: ct.minutes_per_unit } : {}),
                                  });
                                }}>
                                <span className="font-medium text-gray-800">{ct.name}</span>
                                <span className="text-gray-400 text-xs">{ct.unit || "—"}{ct.minutes_per_unit != null ? ` · ${ct.minutes_per_unit} min/unit` : ""}</span>
                              </button>
                            ))}
                          {catalogTasks.filter(t => !tCatalogSearch || t.name.toLowerCase().includes(tCatalogSearch.toLowerCase())).length === 0 && (
                            <div className="px-3 py-3 text-sm text-gray-400 text-center">No matching tasks.</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

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
                    <RuleConfigFields ruleType={tRule} config={tConfig} onChange={setTConfig} questions={questions} />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-sm text-gray-600">
                      <input type="checkbox" checked={tLineItem} onChange={e => setTLineItem(e.target.checked)} />
                      Show as line item by default
                    </label>
                    <button onClick={addTask} disabled={addingT || !tName.trim()}
                      className={btnDark}>
                      {addingT ? "Adding…" : "+ Add Task"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Live Preview */}
              {tasks.length > 0 && questions.length > 0 && (
                <div className="bg-white rounded-xl border border-[#d7e6db] shadow-sm p-4 space-y-3">
                  <div className={sectionHeader}>Live Preview — test your bundle</div>
                  <p className="text-xs text-gray-500 -mt-2">Enter values as if you were a salesperson to see exactly what gets generated.</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {questions.map(q => (
                      <div key={q.id}>
                        <label className={labelCls}>{q.label}{q.unit ? ` (${q.unit})` : ""} <code className="normal-case font-mono text-gray-400 bg-gray-100 px-1 rounded tracking-normal">{q.question_key}</code></label>
                        {q.input_type === "checkbox" ? (
                          <label className="flex items-center gap-2 text-sm text-gray-700 mt-1">
                            <input type="checkbox"
                              checked={previewAnswers[q.question_key] === true}
                              onChange={e => setPreviewAnswers(p => ({ ...p, [q.question_key]: e.target.checked }))} />
                            Check to include
                          </label>
                        ) : (
                          <input className={inputCls} type="number" step="any"
                            placeholder={q.default_value ? `default: ${q.default_value}` : "0"}
                            value={previewAnswers[q.question_key] ?? ""}
                            onChange={e => setPreviewAnswers(p => ({ ...p, [q.question_key]: e.target.value === "" ? undefined : Number(e.target.value) }))} />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2 pt-1">
                    {tasks.map((task, i) => {
                      const result = previewTask(task, previewAnswers, questions);
                      const mats = taskMaterials[task.id] || [];
                      return (
                        <div key={task.id} className={`rounded-lg px-3 py-2.5 text-sm flex items-start gap-3 ${result.skip ? "bg-red-50 border border-red-100" : "bg-green-50 border border-green-200"}`}>
                          <div className={`shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${result.skip ? "bg-red-200 text-red-700" : "bg-green-600 text-white"}`}>
                            {result.skip ? "✕" : "✓"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-gray-800">{task.task_name}</div>
                            {result.skip
                              ? <div className="text-xs text-red-600 mt-0.5">Skipped — {result.reason}</div>
                              : <div className="text-xs text-green-700 mt-0.5">
                                  {result.qty > 0 ? `${result.qty} ${task.unit}` : ""}
                                  {result.qty > 0 && result.hrs > 0 ? " · " : ""}
                                  {result.hrs > 0 ? `${result.hrs} hrs` : ""}
                                  {mats.length > 0 && !result.skip && (
                                    <span className="ml-2 text-gray-500">
                                      · Materials: {mats.map(m => `${Number((m.qty_per_task_unit * result.qty).toFixed(2))} ${m.unit} ${m.material_name || ""}`).join(", ")}
                                    </span>
                                  )}
                                </div>
                            }
                          </div>
                        </div>
                      );
                    })}
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
