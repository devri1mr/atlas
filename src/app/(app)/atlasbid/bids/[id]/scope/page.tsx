// src/app/atlasbid/bids/[id]/scope/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import DebugPanel from "./DebugPanel";
import UnitInput from "@/components/UnitInput";

type Bid = {
  id: string;
  company_id?: string | null;
  customer_name?: string | null;
  client_name?: string | null;
  client_last_name?: string | null;
  address?: string | null;
  address1?: string | null;
  city?: string | null;
  state?: string | null;
  division_id?: string | null;
  status_id?: string | null;
  trucking_hours?: number | null;
  season?: string | null;
};

type Division = {
  id: string;
  name: string;
  is_active?: boolean;
};

type LaborRow = {
  id: string;
  bid_id: string;
  task_catalog_id?: string | null;
  task: string;
  item: string;
  proposal_text?: string | null;
  quantity: number;
  unit: string;
  man_hours: number;
  hourly_rate: number;
  show_as_line_item?: boolean | null;
  hidden_from_proposal?: boolean | null;
  bundle_run_id?: string | null;
  difficulty_level?: number | null;
  task_catalog?: {
    minutes_per_unit?: number | null;
    spring_multiplier?: number | null;
    summer_multiplier?: number | null;
    fall_multiplier?: number | null;
    winter_multiplier?: number | null;
  } | null;
  created_at?: string;
};
type BundleRunMeta = {
  id: string;
  bundle_id: string;
  bundle_name: string;
};
type BidSettings = {
  division_id: string;
  margin_default: number;
  contingency_pct: number;
  round_up_increment: number;
  prepay_discount_pct: number;
};

type TaskCatalogRow = {
  id: string;
  division_id: string;
  name: string;
  unit?: string | null;
  minutes_per_unit?: number | null;
  default_qty?: number | null;
  client_facing_template?: string | null;
  notes?: string | null;
  spring_multiplier?: number | null;
  summer_multiplier?: number | null;
  fall_multiplier?: number | null;
  winter_multiplier?: number | null;
};

type MaterialRow = {
  id: string;
  bid_id: string;
  material_id?: string | null;
  name: string;
  details?: string | null;
  qty: number;
  unit: string;
  unit_cost: number;
  source_type?: string | null;
  created_at?: string;
};
type TemplateMaterialRow = {
  id: string;
  material_id: string;
  qty_per_task_unit: number;
  unit?: string | null;
  unit_cost?: number | null;
  details?: string | null;
  materials_catalog?: {
    id: string;
    name: string;
    default_unit?: string | null;
    default_unit_cost?: number | null;
    vendor?: string | null;
    sku?: string | null;
    is_active?: boolean | null;
  } | null;
};
type MaterialsCatalogRow = {
  id: string;
  name: string;
  default_unit?: string | null;
  default_unit_cost?: number | null;
  vendor?: string | null;
  sku?: string | null;
  is_active?: boolean | null;
  inventory_material_id?: string | null;
};

function normalizePercent(n: number) {
  const x = Number(n) || 0;
  if (x > 0 && x <= 1) return x * 100;
  return x;
}

function roundUpToIncrement(n: number, inc: number) {
  const value = Number(n);
  const increment = Number(inc);

  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(increment) || increment <= 0) return value;

  return Math.ceil(value / increment) * increment;
}

function money(n: number) {
  const v = Number(n) || 0;
  return v.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function paramToString(v: unknown) {
  if (Array.isArray(v)) return String(v[0] ?? "");
  return String(v ?? "");
}

const UNIT_OPTIONS = [
  { label: "yd(s)", value: "yd" },
  { label: "sq ft", value: "sqft" },
  { label: "lin ft", value: "lf" },
  { label: "ft", value: "ft" },
  { label: "sticks", value: "stick" },
  { label: "ea", value: "ea" },
  { label: "tons", value: "ton" },
  { label: "loads", value: "load" },
  { label: "hours", value: "hr" },
];

function pluralUnit(unit: string, qty: number): string {
  if (qty === 1) return unit;
  const map: Record<string, string> = {
    yd: "yds", hr: "hrs", bag: "bags", lb: "lbs",
    gal: "gals", ton: "tons", load: "loads", visit: "visits",
  };
  return map[unit] ?? unit;
}

function renderDescriptionTemplate(template: string, qty: number, unit: string, matNames: string[]): string {
  return template
    .replace(/\{qty\}/gi, String(qty))
    .replace(/\{unit\}/gi, unit)
    .replace(/\{material\}/gi, matNames[0] || "")
    .replace(/\{materials\}/gi, matNames.join(", "));
}

function hoursFromMinutesPerUnit(minutesPerUnit: number, qty: number) {
  const m = Number(minutesPerUnit) || 0;
  const q = Number(qty) || 0;

  if (m <= 0 || q <= 0) return 0;

  return (m * q) / 60;
}

const DIFFICULTY_LABELS = ["Standard", "Low", "Moderate", "High", "Very High", "Extreme"];

// Fixed scale: L1=1.10×, L2=1.20×, L3=1.30×, L4=1.40×, L5=1.50×
function getDifficultyMultiplier(row: LaborRow): number {
  const level = Number(row.difficulty_level) || 0;
  if (level === 0) return 1;
  return 1 + level * 0.1;
}

function getSeasonMultiplier(row: LaborRow, season: string): number {
  if (!season || !row.task_catalog) return 1;
  const key = `${season}_multiplier` as keyof typeof row.task_catalog;
  const v = Number(row.task_catalog[key]) || 0;
  return v > 1 ? v : 1;
}

function effectiveHours(row: LaborRow, season: string): number {
  const base = Number(row.man_hours) || 0;
  return base * getDifficultyMultiplier(row) * getSeasonMultiplier(row, season);
}

export default function BidScopePage() {
  const params = useParams();
  const bidId = paramToString((params as any)?.id).trim();

  const [loading, setLoading] = useState(true);
  const [bid, setBid] = useState<Bid | null>(null);
  const [error, setError] = useState<string>("");

  // Division gate
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [divisionPick, setDivisionPick] = useState<string>("");
  const [savingDivision, setSavingDivision] = useState(false);

  // Labor
  const [labor, setLabor] = useState<LaborRow[]>([]);
  const [season, setSeason] = useState<string>("");
const [bundleRunsMeta, setBundleRunsMeta] = useState<BundleRunMeta[]>([]);

// Materials (bid rows)
const [materials, setMaterials] = useState<MaterialRow[]>([]);
const addingMaterialRef = useRef(false);
const [selectedMaterialId, setSelectedMaterialId] = useState<string>("");
const [selectedTaskCatalogId, setSelectedTaskCatalogId] = useState<string>("");
const [selectedTaskMinutesPerUnit, setSelectedTaskMinutesPerUnit] = useState<number | null>(null);
const [selectedTaskTemplate, setSelectedTaskTemplate] = useState<string>("");
const [detailsFromTemplate, setDetailsFromTemplate] = useState(false);
const [templateMaterials, setTemplateMaterials] = useState<TemplateMaterialRow[]>([]);
const [loadingTemplateMaterials, setLoadingTemplateMaterials] = useState(false);
const [applyTemplateMaterials, setApplyTemplateMaterials] = useState(true);
const [materialName, setMaterialName] = useState("");
const [materialDetails, setMaterialDetails] = useState("");
const [materialQty, setMaterialQty] = useState<number>(0);
const [materialUnit, setMaterialUnit] = useState<string>("ea");
const [materialCost, setMaterialCost] = useState<number>(0);
const [materialSources, setMaterialSources] = useState<any[]>([]);
const [selectedSourceIndex, setSelectedSourceIndex] = useState<number | null>(null);
const [bidPricingDate, setBidPricingDate] = useState<string>("");
  // Materials catalog predictive search
  const [materialsCatalog, setMaterialsCatalog] = useState<MaterialsCatalogRow[]>([]);
  const [materialSearch, setMaterialSearch] = useState("");
  const [showMaterialResults, setShowMaterialResults] = useState(false);
  const materialDropdownRef = useRef<HTMLDivElement | null>(null);

  // Inline edit state for materials
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [mEditName, setMEditName] = useState("");
  const [mEditDetails, setMEditDetails] = useState("");
  const [mEditQty, setMEditQty] = useState<number>(0);
  const [mEditUnit, setMEditUnit] = useState<string>("ea");
  const [mEditUnitCost, setMEditUnitCost] = useState<number>(0);
  // Cache of vendor/inventory sources keyed by material_id, loaded lazily on source cell focus
  const [matSourcesCache, setMatSourcesCache] = useState<Record<string, any[]>>({});
  const [suggestingFor, setSuggestingFor] = useState<string | null>(null); // labor row id or "add"
  const [suggestion, setSuggestion] = useState<string>("");
  const [suggestionFor, setSuggestionFor] = useState<string | null>(null); // which row the suggestion belongs to
  const [editingBundleNameId, setEditingBundleNameId] = useState<string | null>(null);
  const [bundleNameDraft, setBundleNameDraft] = useState<string>("");

  // Inputs (labor)
  const [task, setTask] = useState("");
  const [details, setDetails] = useState("");
  const [quantity, setQuantity] = useState<number>(1);
  const [unit, setUnit] = useState<string>("yd");
  const [hours, setHours] = useState<number>(0);

  // Yd calculator (sqft + depth → yds)
  const [calcSqft, setCalcSqft] = useState("");
  const [calcDepth, setCalcDepth] = useState("3");

  // Predictive task search
  const [taskCatalog, setTaskCatalog] = useState<TaskCatalogRow[]>([]);
  const [taskSearch, setTaskSearch] = useState("");
  const [showTaskResults, setShowTaskResults] = useState(false);
  const taskDropdownRef = useRef<HTMLDivElement | null>(null);

  // Save-to-catalog
  const [saveToCatalog, setSaveToCatalog] = useState(false);
  const [savingToCatalog, setSavingToCatalog] = useState(false);
  const [saveToCatalogMsg, setSaveToCatalogMsg] = useState<string>("");

  // Rates/settings
  const [divisionRate, setDivisionRate] = useState<number>(0);
  const [targetGpPct, setTargetGpPct] = useState<number>(50);
  const [contingencyPct, setContingencyPct] = useState<number>(3);
  const [roundUpIncrement, setRoundUpIncrement] = useState<number>(100);
  const [prepayDiscountPct, setPrepayDiscountPct] = useState<number>(3);
  const [prepayEnabled, setPrepayEnabled] = useState<boolean>(false);

  // Trucking
  const [truckingHours, setTruckingHours] = useState<number>(0);
  const [savingTrucking, setSavingTrucking] = useState(false);
  const [truckingSaveError, setTruckingSaveError] = useState<string | null>(null);
// Scope bundles
const [scopeBundles, setScopeBundles] = useState<any[]>([]);
const [selectedBundleId, setSelectedBundleId] = useState<string>("");

const [bundleQuestions, setBundleQuestions] = useState<any[]>([]);
const [bundleAnswers, setBundleAnswers] = useState<Record<string, any>>({});

const [loadingBundles, setLoadingBundles] = useState(false);
const [loadingBundleQuestions, setLoadingBundleQuestions] = useState(false);
const [loadingBundleIntoBid, setLoadingBundleIntoBid] = useState(false);
const [showBundlePanel, setShowBundlePanel] = useState(false);
const [calcOpenForRow, setCalcOpenForRow] = useState<string | null>(null);
const [rowCalcValues, setRowCalcValues] = useState<Record<string, { sqft: string; depth: string }>>({});

// Measurements (from the Measurements tab)
type MeasurementRow = { id: string; label: string; shape_type: "polygon" | "polyline"; computed_value: number; unit: string; };
const [bidMeasurements, setBidMeasurements] = useState<MeasurementRow[]>([]);
  // Close dropdowns on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const taskEl = taskDropdownRef.current;
      if (taskEl && e.target instanceof Node && !taskEl.contains(e.target)) {
        setShowTaskResults(false);
      }

      const matEl = materialDropdownRef.current;
      if (matEl && e.target instanceof Node && !matEl.contains(e.target)) {
        setShowMaterialResults(false);
      }
    }

    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Lazy-load measurements when the bundle panel opens
  useEffect(() => {
    if (!showBundlePanel || !bidId || bidMeasurements.length > 0) return;
    fetch(`/api/atlasbid/bid-measurements?bid_id=${bidId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setBidMeasurements(Array.isArray(j?.rows) ? j.rows : []))
      .catch(() => {});
  }, [showBundlePanel, bidId]);
function normalizeMaterialText(v: unknown) {
  return String(v ?? "").trim().toLowerCase();
}

function findMatchingMaterialRow(
  rows: MaterialRow[],
  args: {
    material_id?: string | null;
    name: string;
    unit: string;
    source_type?: string | null;
  }
) {
  const targetMaterialId = normalizeMaterialText(args.material_id);
  const targetName = normalizeMaterialText(args.name);
  const targetUnit = normalizeMaterialText(args.unit);
  const targetSource = normalizeMaterialText(args.source_type);

  return rows.find((row) => {
    const rowMaterialId = normalizeMaterialText(row.material_id);
    const rowSource = normalizeMaterialText(row.source_type);

    // Match by (material_id, source_type) so different sources stay as separate rows.
    if (targetMaterialId && rowMaterialId) {
      return rowMaterialId === targetMaterialId && rowSource === targetSource;
    }

    // Name-based fallback: require unit and source to match.
    const rowUnit = normalizeMaterialText(row.unit);
    if (rowUnit !== targetUnit) return false;
    if (rowSource !== targetSource) return false;
    return normalizeMaterialText(row.name) === targetName;
  });
}

async function mergeMaterialRow(
  existing: MaterialRow,
  incoming: {
    name: string;
    details?: string | null;
    qty: number;
    unit: string;
    unit_cost: number;
  }
) {
  const nextQty = Number(
    (Number(existing.qty || 0) + Number(incoming.qty || 0)).toFixed(2)
  );

  const payload: any = {
    name: existing.name || incoming.name,
    details: existing.details ?? incoming.details ?? null,
    qty: nextQty,
    unit: existing.unit || incoming.unit,
    unitCost: Number(existing.unit_cost ?? incoming.unit_cost ?? 0),
    unit_cost: Number(existing.unit_cost ?? incoming.unit_cost ?? 0),
  };

  const res = await fetch(`/api/atlasbid/bid-materials/${existing.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(
      json?.error?.message || json?.error || "Failed to merge material row"
    );
  }

  return json?.row ?? json?.data ?? json;
}
  async function loadAll() {
    if (!bidId) return;

    setLoading(true);
    setError("");

    try {
      // 1) Fetch bid first — everything else depends on division_id
      const bidRes = await fetch(`/api/bids/${bidId}`, { cache: "no-store" });
      if (!bidRes.ok) { setBid(null); setLoading(false); return; }
      const bidJson = await bidRes.json();
      const b = bidJson?.row ?? bidJson?.data ?? bidJson?.bid ?? bidJson ?? null;
      if (!b?.id) { setBid(null); setLoading(false); return; }

      setBid(b);
      setBidPricingDate(
        b?.pricing_date ? String(b.pricing_date).slice(0, 10) : new Date().toISOString().slice(0, 10)
      );
      if (b?.season) setSeason(b.season);
      if (b.division_id) setDivisionPick(b.division_id);

      if (!b.division_id) { setLoading(false); return; }

      const divisionId = b.division_id;

      // 2) Fire all remaining requests in parallel
      const [dJson, mcJson, sbJson, rateJson, sJson, lJson, brJson, mJson, tJson] =
        await Promise.all([
          fetch(`/api/divisions`, { cache: "no-store" }).then(r => r.json()),
          fetch(`/api/materials-catalog`, { cache: "no-store" }).then(r => r.json()),
          fetch(`/api/atlasbid/scope-bundles?division_id=${divisionId}`, { cache: "no-store" }).then(r => r.json()).catch(() => ({})),
          fetch(`/api/labor-rates`, { cache: "no-store" }).then(r => r.json()),
          fetch(`/api/atlasbid/bid-settings?division_id=${divisionId}`, { cache: "no-store" }).then(r => r.json()),
          fetch(`/api/atlasbid/bid-labor?bid_id=${bidId}`, { cache: "no-store" }).then(r => r.json()),
          fetch(`/api/atlasbid/bundle-runs?bid_id=${bidId}`, { cache: "no-store" }).then(r => r.json()).catch(() => ({})),
          fetch(`/api/atlasbid/bid-materials?bidId=${bidId}`, { cache: "no-store" }).then(r => r.json()),
          fetch(`/api/task-catalog?division_id=${divisionId}`, { cache: "no-store" }).then(r => r.json()),
        ]);

      // Divisions
      const divs: Division[] = dJson?.divisions ?? dJson?.data ?? dJson ?? [];
      setDivisions(Array.isArray(divs) ? divs : []);

      // Materials catalog
      const mcRows: MaterialsCatalogRow[] = mcJson?.rows ?? mcJson?.data ?? mcJson ?? [];
      setMaterialsCatalog(Array.isArray(mcRows) ? mcRows.filter((x) => x?.is_active !== false) : []);

      // Scope bundles
      const sbRows = sbJson?.rows || sbJson?.data || [];
      setScopeBundles(Array.isArray(sbRows) ? sbRows : []);

      // Labor rate
      const rateRow = Array.isArray(rateJson?.rates)
        ? (rateJson.rates as any[]).find((r) => r.division_id === divisionId)
        : null;
      setDivisionRate(Number(rateRow?.hourly_rate ?? 0));

      // Bid settings
      const settings: BidSettings | null = sJson?.settings ?? sJson?.data ?? null;
      if (settings) {
        setTargetGpPct(normalizePercent(settings.margin_default) || 50);
        setContingencyPct(normalizePercent(settings.contingency_pct) || 0);
        setPrepayDiscountPct(normalizePercent(settings.prepay_discount_pct) || 0);
        setRoundUpIncrement(Number(settings.round_up_increment || 0) || 0);
      } else {
        setTargetGpPct(50); setContingencyPct(3); setPrepayDiscountPct(3); setRoundUpIncrement(100);
      }

      // Labor rows
      const lRows: LaborRow[] = lJson?.rows || lJson?.data || [];
      setLabor(lRows);

      // Bundle runs
      setBundleRunsMeta(Array.isArray(brJson?.rows) ? brJson.rows : []);

      // Materials rows
      const mRows = mJson?.rows || mJson?.data || mJson || [];
      setMaterials(Array.isArray(mRows) ? mRows : []);

      // Task catalog
      setTaskCatalog(Array.isArray(tJson?.data) ? tJson.data : []);

    } catch (e: any) {
      setError(e?.message || "Failed to load scope.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [bidId]);

  // Trucking autosave
  useEffect(() => {
    if (!bid?.id) return;
    if (loading) return;

    const t = setTimeout(async () => {
      setSavingTrucking(true);
      setTruckingSaveError(null);

      try {
        const res = await fetch(`/api/bids/${bid.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trucking_hours: Number(truckingHours) || 0,
          }),
        });

        const json = await res.json();

        if (!res.ok)
          throw new Error(
            json?.error?.message || json?.error || "Failed to save trucking hours"
          );

        setBid(json?.data ?? bid);
      } catch (e: any) {
        setTruckingSaveError(e?.message || "Failed to save trucking hours");
      } finally {
        setSavingTrucking(false);
      }
    }, 600);

    return () => clearTimeout(t);
  }, [truckingHours, bid?.id, loading]);

  // Task catalog filtering
  const filteredTasks = useMemo(() => {
    const q = taskSearch.trim().toLowerCase();
    if (!q) return taskCatalog.slice(0, 20);

    return taskCatalog
      .filter((t) => (t.name || "").toLowerCase().includes(q))
      .slice(0, 20);
  }, [taskSearch, taskCatalog]);

 async function applyTaskSelection(t: TaskCatalogRow) {
  const name = (t.name || "").trim();

  setTask(name);
  setTaskSearch(name);
  setShowTaskResults(false);

  setSelectedTaskCatalogId(t.id || "");
  setSelectedTaskMinutesPerUnit(t.minutes_per_unit ?? null);
  setSelectedTaskTemplate(t.client_facing_template || "");
  setTemplateMaterials([]);

  if (t.unit) setUnit(t.unit);

  // Never apply default_qty — always require user to enter quantity
  const nextQty = Number(quantity) || 0;

  if (t.minutes_per_unit && nextQty > 0) {
    const computed = hoursFromMinutesPerUnit(t.minutes_per_unit, nextQty);
    setHours(Number.isFinite(computed) ? Number(computed.toFixed(2)) : 0);
  }

  // Load template materials for this task
  if (bid?.division_id && t.id) {
    setLoadingTemplateMaterials(true);
    try {
      const res = await fetch(
        `/api/task-template-materials?division_id=${bid.division_id}&task_catalog_id=${t.id}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      const rows = Array.isArray(json?.rows) ? json.rows : [];
      setTemplateMaterials(rows);

      // Render description template now that we have materials
      const template = t.client_facing_template || t.notes || "";
      if (template && !details.trim()) {
        const matNames = rows.map((r: any) => r.materials_catalog?.name || "").filter(Boolean);
        const rendered = renderDescriptionTemplate(template, nextQty, t.unit || unit, matNames);
        setDetails(rendered);
        setDetailsFromTemplate(true);
      }
    } catch {
      setTemplateMaterials([]);
      // Fallback: render template without materials
      const template = t.client_facing_template || t.notes || "";
      if (template && !details.trim()) {
        setDetails(renderDescriptionTemplate(template, nextQty, t.unit || unit, []));
        setDetailsFromTemplate(true);
      }
    } finally {
      setLoadingTemplateMaterials(false);
    }
  }
}

  // ✅ Materials catalog predictive filtering
  const filteredMaterialsCatalog = useMemo(() => {
    const q = materialSearch.trim().toLowerCase();
    if (!q) return materialsCatalog.slice(0, 20);

    return materialsCatalog
      .filter((m) => {
        const hay = `${m.name || ""} ${m.vendor || ""} ${m.sku || ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 20);
  }, [materialSearch, materialsCatalog]);
async function loadMaterialSources(materialId: string) {
  try {
    if (!materialId) {
      setMaterialSources([]);
      setSelectedSourceIndex(null);
      return;
    }

    const pricingDate =
      bidPricingDate || new Date().toISOString().slice(0, 10);

    const [inventoryRes, vendorRes] = await Promise.all([
      fetch(
        `/api/inventory/source?material_id=${materialId}&pricing_date=${pricingDate}`,
        { cache: "no-store" }
      ),
      fetch(`/api/material-sources?material_id=${materialId}`, {
        cache: "no-store",
      }),
    ]);

    const inventoryJson = await inventoryRes.json();
    const vendorJson = await vendorRes.json();

    const inventorySources = Array.isArray(inventoryJson?.data)
      ? inventoryJson.data.map((s: any) => ({
          source_type: "inventory",
          source_name: s.source_label || "Inventory",
          source_label: s.source_label || "Inventory",
          source_reference_id: s.source_reference_id || null,
          unit: s.unit || materialUnit || "ea",
          cost: Number(s.avg_unit_cost ?? s.unit_cost) || 0,
          available_qty:
            s.qty_on_hand === null || s.qty_on_hand === undefined
              ? null
              : Number(s.qty_on_hand),
          preferred: true,
          negative_flag: Boolean(s.negative_flag),
        }))
      : [];

    const vendorSources = Array.isArray(vendorJson?.data)
      ? vendorJson.data.map((s: any) => ({
          source_type: s.source_type || "vendor",
          source_name: s.source_name || s.source_label || "Vendor",
          source_label: s.source_label || s.source_name || "Vendor",
          source_reference_id: s.source_reference_id || null,
          unit: s.unit || materialUnit || "ea",
          cost: Number(s.cost) || 0,
          available_qty:
            s.available_qty === null || s.available_qty === undefined
              ? null
              : Number(s.available_qty),
          preferred: Boolean(s.preferred),
          negative_flag: false,
        }))
      : [];

    const sources = [...inventorySources, ...vendorSources];

    setMaterialSources(sources);

    if (sources.length === 0) {
      setSelectedSourceIndex(null);
      return;
    }

    let chosenIndex = sources.findIndex((s: any) => s.source_type === "inventory");

    if (chosenIndex === -1) {
      chosenIndex = sources.findIndex((s: any) => s.preferred === true);
    }

    if (chosenIndex === -1) {
      chosenIndex = sources.reduce((bestIndex: number, s: any, i: number) => {
        return Number(s.cost) < Number(sources[bestIndex].cost) ? i : bestIndex;
      }, 0);
    }

    const src = sources[chosenIndex];

    setSelectedSourceIndex(chosenIndex);

    if (src.unit) setMaterialUnit(src.unit);
    if (src.cost !== undefined) setMaterialCost(Number(src.cost) || 0);
  } catch {
    setMaterialSources([]);
    setSelectedSourceIndex(null);
  }
}
  async function suggestDescription(rowId: string, taskName: string, qty: number, unit: string) {
    setSuggestingFor(rowId);
    setSuggestion("");
    setSuggestionFor(null);
    try {
      // Gather material names from the materials list for context
      const matNames = materials.slice(0, 5).map((m) => m.name).filter(Boolean);
      const res = await fetch("/api/suggest-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: taskName, qty, unit, materials: matNames }),
      });
      const json = await res.json();
      if (json?.suggestion) {
        setSuggestion(json.suggestion);
        setSuggestionFor(rowId);
      }
    } catch {}
    setSuggestingFor(null);
  }

  async function saveBundleName(runId: string, name: string) {
    await fetch(`/api/atlasbid/bundle-runs/${runId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: name }),
    });
    setBundleRunsMeta((prev) =>
      prev.map((r) => r.id === runId ? { ...r, bundle_name: name || r.bundle_name } : r)
    );
    setEditingBundleNameId(null);
    setBundleNameDraft("");
  }

  async function ensureMatSources(materialId: string) {
    if (!materialId || matSourcesCache[materialId]) return;
    const pricingDate = bidPricingDate || new Date().toISOString().slice(0, 10);
    try {
      const [invRes, vendorRes] = await Promise.all([
        fetch(`/api/inventory/source?material_id=${materialId}&pricing_date=${pricingDate}`, { cache: "no-store" }),
        fetch(`/api/material-sources?material_id=${materialId}`, { cache: "no-store" }),
      ]);
      const invJson = await invRes.json();
      const vendorJson = await vendorRes.json();
      const inv = Array.isArray(invJson?.data) ? invJson.data.map((s: any) => ({
        source_name: s.source_label || "Inventory",
        unit: s.unit || "ea",
        cost: s.unit_cost ?? 0,
      })) : [];
      const vendors = Array.isArray(vendorJson?.data) ? vendorJson.data.map((s: any) => ({
        source_name: s.vendor_name || s.source_name || "Vendor",
        unit: s.unit || "ea",
        cost: s.unit_cost ?? 0,
      })) : [];
      setMatSourcesCache((prev) => ({ ...prev, [materialId]: [...inv, ...vendors] }));
    } catch {}
  }

  function applyMaterialSelection(m: MaterialsCatalogRow) {
  const nm = (m.name || "").trim();

  // For bid_materials, store the inventory materials.id if available, else the catalog id
  const matId = m.inventory_material_id || m.id || "";
  setSelectedMaterialId(matId);
  setMaterialName(nm);
  setMaterialSearch(nm);
  setShowMaterialResults(false);

  // Load pricing sources using inventory material id (needed for inventory/vendor prices)
  if (matId) loadMaterialSources(matId);

  setMaterialUnit(m.default_unit || "ea");
  const cost = m.default_unit_cost;
  if (typeof cost === "number" && cost > 0) {
    setMaterialCost(Number(cost.toFixed(2)));
  }

  if (!materialDetails.trim()) {
    const bits = [
      m.vendor ? `Vendor: ${m.vendor}` : null,
      m.sku ? `SKU: ${m.sku}` : null,
    ].filter(Boolean);
    if (bits.length) setMaterialDetails(bits.join(" • "));
  }
}

  // Labor math
  const laborSubtotal = useMemo(() => {
    return labor.reduce(
      (sum, r) => sum + effectiveHours(r, season) * (Number(r.hourly_rate) || 0),
      0
    );
  }, [labor, season]);

  // Materials math
  const materialsSubtotal = useMemo(() => {
    return materials.reduce(
      (sum, r) => sum + (Number(r.qty) || 0) * (Number(r.unit_cost) || 0),
      0
    );
  }, [materials]);

  const truckingCost = useMemo(() => {
    return (Number(truckingHours) || 0) * (Number(divisionRate) || 0);
  }, [truckingHours, divisionRate]);

  // ✅ include materials in cost chain (no other pricing logic changed)
  const laborPlusTrucking = useMemo(
    () => laborSubtotal + truckingCost + materialsSubtotal,
    [laborSubtotal, truckingCost, materialsSubtotal]
  );

  const contingencyCost = useMemo(() => {
    const pct = (Number(contingencyPct) || 0) / 100;
    return laborPlusTrucking * pct;
  }, [laborPlusTrucking, contingencyPct]);

  const totalCost = useMemo(() => {
    return laborPlusTrucking + contingencyCost;
  }, [laborPlusTrucking, contingencyCost]);

  const targetSell = useMemo(() => {
    const gp = (Number(targetGpPct) || 0) / 100;
    if (gp >= 1) return 0;
    return totalCost / (1 - gp);
  }, [totalCost, targetGpPct]);

  const sellRounded = useMemo(() => {
    return roundUpToIncrement(targetSell, roundUpIncrement);
  }, [targetSell, roundUpIncrement]);

  const sellWithPrepay = useMemo(() => {
    if (!prepayEnabled) return sellRounded;
    const disc = (Number(prepayDiscountPct) || 0) / 100;
    return sellRounded * (1 - disc);
  }, [sellRounded, prepayEnabled, prepayDiscountPct]);

  const effectiveGpPct = useMemo(() => {
    const sell = prepayEnabled ? sellWithPrepay : sellRounded;
    if (sell <= 0) return 0;
    return ((sell - totalCost) / sell) * 100;
  }, [sellRounded, sellWithPrepay, prepayEnabled, totalCost]);
// Pricing autosave
useEffect(() => {
  if (!bid?.id) return;
  if (loading) return;

  const t = setTimeout(async () => {
    try {
      const res = await fetch(`/api/bids/${bid.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sell_rounded: Number(sellRounded) || 0,
          prepay_enabled: prepayEnabled,
          prepay_price: prepayEnabled ? Number(sellWithPrepay) || 0 : null,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(
          json?.error?.message || json?.error || "Failed to save pricing"
        );
      }

      setBid((prev) => ({
        ...(prev || {}),
        ...(json?.data ?? {}),
      }));
    } catch (e: any) {
      console.error("Failed to save pricing", e?.message || e);
    }
  }, 600);

  return () => clearTimeout(t);
}, [bid?.id, loading, sellRounded, sellWithPrepay, prepayEnabled]);
  async function saveDivision() {
    if (!divisionPick) return;

    setSavingDivision(true);
    setError("");

    try {
      const res = await fetch(`/api/bids/${bidId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ division_id: divisionPick }),
      });

      const json = await res.json();

      if (!res.ok)
        throw new Error(json?.error?.message || json?.error || "Failed to save division.");

      await loadAll();
    } catch (e: any) {
      setError(e?.message || "Failed to save division.");
    } finally {
      setSavingDivision(false);
    }
  }
async function loadBundleQuestions(bundleId: string) {
  if (!bundleId) {
    setBundleQuestions([]);
    setBundleAnswers({});
    return;
  }

  setLoadingBundleQuestions(true);

  try {
    const res = await fetch(
      `/api/atlasbid/scope-bundle-questions?bundle_id=${bundleId}`,
      { cache: "no-store" }
    );

    const json = await res.json();
    const rows = json?.rows || [];

    setBundleQuestions(rows);

    const defaults: Record<string, any> = {};

    for (const q of rows) {
      if (q.default_value !== null && q.default_value !== undefined) {
        defaults[q.question_key] = q.default_value;
      }
    }

    const normalized = Object.fromEntries(
  Object.entries(defaults).map(([k, v]) => {
    if (v === "true") return [k, true];
    if (v === "false") return [k, false];
    return [k, v];
  })
);

setBundleAnswers(normalized);
  } catch {
    setBundleQuestions([]);
  } finally {
    setLoadingBundleQuestions(false);
  }
}
 async function loadSelectedBundleIntoBid() {
  if (!selectedBundleId) return;
  if (!bidId) return;

  setLoadingBundleIntoBid(true);

  try {
    const res = await fetch(`/api/atlasbid/apply-scope-bundle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        bid_id: bidId,
        bundle_id: selectedBundleId,
        answers: bundleAnswers,
        hourly_rate: Number(divisionRate) || 0
      })
    });

    const json = await res.json();

if (!res.ok) {
  throw new Error(json?.error || "Failed applying bundle");
}

// Optimistically update labor + bundle run meta from the API response
if (Array.isArray(json?.rows)) {
  setLabor((prev) => [...prev, ...json.rows]);
}
if (json?.bundle_run?.id) {
  const bundleName = scopeBundles.find((b) => b.id === selectedBundleId)?.name || "Bundle";
  setBundleRunsMeta((prev) => [
    ...prev,
    { id: json.bundle_run.id, bundle_id: selectedBundleId, bundle_name: bundleName },
  ]);
}

// Targeted refresh: only reload materials (bundle apply adds/updates material qtys)
const matRes = await fetch(`/api/atlasbid/bid-materials?bid_id=${bidId}`, { cache: "no-store" });
const matJson = await matRes.json();
if (Array.isArray(matJson?.rows)) setMaterials(matJson.rows);
else if (Array.isArray(matJson?.data)) setMaterials(matJson.data);

  } catch (e: any) {
    setError(e?.message || "Failed loading bundle.");
  } finally {
    setLoadingBundleIntoBid(false);
  }
}
  const bundleRunNameMap = useMemo(() => {
    return new Map(bundleRunsMeta.map((x) => [x.id, x.bundle_name]));
  }, [bundleRunsMeta]);

  const laborGroups = useMemo(() => {
    const result: Array<
      | { type: "bundle"; runId: string; name: string; rows: LaborRow[] }
      | { type: "row"; row: LaborRow }
    > = [];
    const seen = new Set<string>();
    for (const row of labor) {
      if (row.bundle_run_id) {
        if (seen.has(row.bundle_run_id)) continue;
        seen.add(row.bundle_run_id);
        result.push({
          type: "bundle",
          runId: row.bundle_run_id,
          name: bundleRunNameMap.get(row.bundle_run_id) || "Bundle",
          rows: labor.filter((r) => r.bundle_run_id === row.bundle_run_id),
        });
      } else {
        result.push({ type: "row", row });
      }
    }
    return result;
  }, [labor, bundleRunNameMap]);
  const proposalGroups = useMemo(() => {
  const groups: Array<
    | {
        type: "bundle";
        key: string;
        name: string;
        rows: LaborRow[];
      }
    | {
        type: "line";
        key: string;
        row: LaborRow;
      }
  > = [];

  const groupedBundleRunIds = new Set<string>();

  for (const row of labor) {
    if (row.hidden_from_proposal) continue;

    const bundleRunId = row.bundle_run_id || null;
    const showIndividually = row.show_as_line_item === true;

    if (bundleRunId && !showIndividually) {
      if (groupedBundleRunIds.has(bundleRunId)) continue;

      groupedBundleRunIds.add(bundleRunId);

      const bundleRows = labor.filter(
        (r) =>
          r.bundle_run_id === bundleRunId &&
          r.show_as_line_item !== true &&
          !r.hidden_from_proposal
      );

      if (bundleRows.length === 0) continue;

      groups.push({
        type: "bundle",
        key: bundleRunId,
        name: bundleRunNameMap.get(bundleRunId) || "Bundled Scope",
        rows: bundleRows,
      });

      continue;
    }

    groups.push({
      type: "line",
      key: row.id,
      row,
    });
  }

  return groups;
}, [labor, bundleRunNameMap]);
function copyProposal() {
  const lines: string[] = [];

  // Bundle scopes
  for (const g of laborGroups) {
    if (g.type !== "bundle") continue;
    const bundleTotal = g.rows.reduce(
      (sum, r) => sum + (Number(r.man_hours) || 0) * (Number(r.hourly_rate) || 0), 0
    );
    lines.push(`${g.name}  ${money(bundleTotal)}`);
    for (const row of g.rows.filter((r) => r.show_as_line_item)) {
      lines.push(`  • ${row.task}${row.proposal_text ? "\n    " + row.proposal_text : ""}`);
    }
  }

  // Checked standalone tasks
  for (const g of laborGroups) {
    if (g.type !== "row" || !g.row.show_as_line_item) continue;
    const rowTotal = (Number(g.row.man_hours) || 0) * (Number(g.row.hourly_rate) || 0);
    lines.push(`${g.row.task}  ${money(rowTotal)}${g.row.proposal_text ? "\n  " + g.row.proposal_text : ""}`);
  }

  // Unchecked standalone tasks grouped
  const ungrouped = laborGroups.filter((g) => g.type === "row" && !g.row.show_as_line_item);
  if (ungrouped.length > 0) {
    const groupTotal = ungrouped.reduce((sum, g) => {
      if (g.type !== "row") return sum;
      return sum + (Number(g.row.man_hours) || 0) * (Number(g.row.hourly_rate) || 0);
    }, 0);
    lines.push(`General Labor  ${money(groupTotal)}`);
    for (const g of ungrouped) {
      if (g.type !== "row") continue;
      lines.push(`  • ${g.row.task}`);
    }
  }

  let text = `Scope of Work\n\n${lines.join("\n")}\n\nProject Price: ${money(sellRounded)}`;
  if (prepayEnabled) text += `\nPrepay Price: ${money(sellWithPrepay)}`;

  navigator.clipboard.writeText(text);
}
async function addLabor() {
  setError("");
  setSaveToCatalogMsg("");

  if (!task.trim()) return setError("Task is required.");
  if ((Number(hours) || 0) <= 0) return setError("Hours must be > 0.");
  if ((Number(divisionRate) || 0) <= 0)
    return setError("Division rate is 0. Set the division + rate first.");
  if (!unit) return setError("Unit is required.");

  const safeDetails = details.trim();

  const res = await fetch(`/api/atlasbid/bid-labor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bid_id: bidId,
      task_catalog_id: selectedTaskCatalogId || null,
      task: task.trim(),
      item: task.trim(),
      proposal_text: safeDetails || null,
      quantity: Number(quantity) || 0,
      unit,
      man_hours: Number(hours) || 0,
      hourly_rate: Number(divisionRate) || 0,
    }),
  });

  const json = await res.json();

  if (!res.ok) {
    setError(json?.error?.message || json?.error || "Error adding labor");
    return;
  }

  const row = json?.row ?? json?.data;
  if (row) setLabor((prev) => [...prev, row]);

  if (
    applyTemplateMaterials &&
    selectedTaskCatalogId &&
    (Number(quantity) || 0) > 0
  ) {
    try {
      const tmRes = await fetch(
        `/api/task-template-materials?task_catalog_id=${selectedTaskCatalogId}`,
        { cache: "no-store" }
      );

      const tmJson = await tmRes.json();
      const liveTemplateMaterials = Array.isArray(tmJson?.rows) ? tmJson.rows : [];

      const taskQty = Number(quantity) || 0;
      let workingMaterials = [...materials];

      for (const tm of liveTemplateMaterials) {
        const catalog = tm.materials_catalog;
        if (!catalog?.id || !catalog?.name) continue;

        const qtyPer = Number(tm.qty_per_task_unit) || 0;
        const mQty = qtyPer * taskQty;
        if (mQty <= 0) continue;

        const mUnit = (tm.unit || catalog.default_unit || "ea").toString();

        const mUnitCost =
          tm.unit_cost !== null && tm.unit_cost !== undefined
            ? Number(tm.unit_cost) || 0
            : Number(catalog.default_unit_cost) || 0;

        const existing = findMatchingMaterialRow(workingMaterials, {
          material_id: catalog.id,
          name: catalog.name,
          unit: mUnit,
        });

        if (existing) {
          const updated = await mergeMaterialRow(existing, {
            name: catalog.name,
            details: tm.details ?? null,
            qty: Number(mQty.toFixed(2)),
            unit: mUnit,
            unit_cost: Number(mUnitCost.toFixed(2)),
          });

          workingMaterials = workingMaterials.map((r) =>
            r.id === existing.id ? { ...r, ...updated } : r
          );
          setMaterials(workingMaterials);
          continue;
        }

        const payload = {
          bid_id: bidId,
          material_id: catalog.id,
          company_id: bid?.company_id ?? null,
          name: catalog.name,
          details: tm.details ?? null,
          qty: Number(mQty.toFixed(2)),
          unit: mUnit,
          unitCost: Number(mUnitCost.toFixed(2)),
          unit_cost: Number(mUnitCost.toFixed(2)),
          source_type: "template",
        };

        const matRes = await fetch(`/api/atlasbid/bid-materials`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const matJson = await matRes.json();

        if (!matRes.ok) {
          console.error("Auto-add material failed", matJson);
          setError(
            matJson?.error?.message || matJson?.error || "Failed auto-adding material"
          );
          continue;
        }

        const newRow = matJson?.row ?? matJson?.data ?? matJson ?? null;

        if (newRow) {
          workingMaterials = [...workingMaterials, newRow];
          setMaterials(workingMaterials);
        }
      }
    } catch (e) {
      console.error("Failed auto-adding template materials", e);
    }
  }

  if (saveToCatalog && bid?.division_id) {
    setSavingToCatalog(true);

    try {
      const qtyNum = Number(quantity) || 0;
      const hoursNum = Number(hours) || 0;
      const minutesPerUnit = qtyNum > 0 ? (hoursNum * 60) / qtyNum : null;

      const existing = taskCatalog.some(
        (t) =>
          t.division_id === bid.division_id &&
          (t.name || "").trim().toLowerCase() === task.trim().toLowerCase()
      );

      if (!existing) {
        const tcRes = await fetch(`/api/task-catalog`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            division_id: bid.division_id,
            name: task.trim(),
            unit: unit || null,
            minutes_per_unit: minutesPerUnit,
            default_qty: qtyNum > 0 ? qtyNum : null,
            notes: safeDetails ? safeDetails : null,
          }),
        });

        const tcJson = await tcRes.json();

        if (!tcRes.ok) {
          setSaveToCatalogMsg(tcJson?.error || "Could not save task to catalog.");
        } else {
          setSaveToCatalogMsg("Saved to Task Catalog.");
          const newRow: TaskCatalogRow | null = tcJson?.data ?? null;

          if (newRow?.id) {
            setTaskCatalog((prev) => {
              const existsById = prev.some((p) => p.id === newRow.id);
              if (existsById) return prev;

              const existsByName = prev.some(
                (p) =>
                  p.division_id === newRow.division_id &&
                  (p.name || "").trim().toLowerCase() ===
                    (newRow.name || "").trim().toLowerCase()
              );
              if (existsByName) return prev;

              return [...prev, newRow].sort((a, b) =>
                (a.name || "").localeCompare(b.name || "")
              );
            });
          }
        }
      } else {
        setSaveToCatalogMsg("Already in Task Catalog.");
      }
    } catch {
      setSaveToCatalogMsg("Could not save task to catalog.");
    } finally {
      setSavingToCatalog(false);
    }
  }

  setTask("");
  setTaskSearch("");
  setDetails("");
  setQuantity(1);
  setUnit("yd");
  setHours(0);
  setShowTaskResults(false);
  setSelectedTaskCatalogId("");
  setSelectedTaskMinutesPerUnit(null);
  setSelectedTaskTemplate("");
  setDetailsFromTemplate(false);
}

  async function deleteLaborRow(rowId: string) {
    setError("");

    const res = await fetch(`/api/atlasbid/bid-labor/${rowId}`, { method: "DELETE" });

    if (res.ok) {
      setLabor((prev) => prev.filter((r) => r.id !== rowId));
    } else {
      setError("Failed to delete labor row");
    }
  }

  async function deleteBundleRun(runId: string) {
    setError("");

    const res = await fetch(`/api/atlasbid/bundle-runs/${runId}`, { method: "DELETE" });

    if (res.ok) {
      setLabor((prev) => prev.filter((r) => r.bundle_run_id !== runId));
      setBundleRunsMeta((prev) => prev.filter((r) => r.id !== runId));
      // Refresh only materials since bundle deletion subtracts qtys
      const matRes = await fetch(`/api/atlasbid/bid-materials?bid_id=${bidId}`, { cache: "no-store" });
      const matJson = await matRes.json();
      if (Array.isArray(matJson?.rows)) setMaterials(matJson.rows);
      else if (Array.isArray(matJson?.data)) setMaterials(matJson.data);
    } else {
      const json = await res.json().catch(() => ({}));
      setError(json?.error || "Failed to remove bundle");
    }
  }

  // ✅ Add material
 async function addMaterial() {
  if (addingMaterialRef.current) return;
  addingMaterialRef.current = true;

  try {
    setError("");

    const trimmedName = materialName.trim();

    if (!trimmedName) {
      setError("Material name is required.");
      return;
    }

    if ((Number(materialQty) || 0) <= 0) {
      setError("Material qty must be > 0.");
      return;
    }

    if ((Number(materialCost) || 0) < 0) {
      setError("Material unit cost must be >= 0.");
      return;
    }

    if (!materialUnit) {
      setError("Material unit is required.");
      return;
    }

    const selectedSource =
      selectedSourceIndex !== null ? materialSources[selectedSourceIndex] : null;
    const sourceType = selectedSource?.source_name || null;

    const existing = findMatchingMaterialRow(materials, {
      material_id: selectedMaterialId || null,
      name: trimmedName,
      unit: materialUnit,
      source_type: sourceType,
    });

    if (existing) {
      const updated = await mergeMaterialRow(existing, {
        name: trimmedName,
        details: materialDetails.trim() || null,
        qty: Number(materialQty) || 0,
        unit: materialUnit,
        unit_cost: Number(materialCost) || 0,
      });

      setMaterials((prev) =>
        prev.map((r) => (r.id === existing.id ? { ...r, ...updated } : r))
      );

      setMaterialName("");
      setSelectedMaterialId("");
      setMaterialSearch("");
      setMaterialDetails("");
      setMaterialQty(0);
      setMaterialUnit("ea");
      setMaterialCost(0);
      setShowMaterialResults(false);
      return;
    }

    const payload: any = {
      bid_id: bidId,
      company_id: bid?.company_id ?? null,
      material_id: selectedMaterialId || null,
      name: trimmedName,
      details: materialDetails.trim() || null,
      qty: Number(materialQty) || 0,
      unit: materialUnit,
      unitCost: Number(materialCost) || 0,
      unit_cost: Number(materialCost) || 0,
      source_type: sourceType,
    };

    const res = await fetch(`/api/atlasbid/bid-materials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();

    if (!res.ok) {
      setError(json?.error?.message || json?.error || "Error adding material");
      return;
    }

    const row = json?.row ?? json?.data ?? json;

    if (row) {
      setMaterials((prev) => [...prev, row]);
    }

    setMaterialName("");
    setSelectedMaterialId("");
    setMaterialSearch("");
    setMaterialDetails("");
    setMaterialQty(0);
    setMaterialUnit("ea");
    setMaterialCost(0);
    setShowMaterialResults(false);
    setMaterialSources([]);
    setSelectedSourceIndex(null);
  } finally {
    addingMaterialRef.current = false;
  }
}

  async function deleteMaterialRow(rowId: string) {
    setError("");

    const res = await fetch(`/api/atlasbid/bid-materials/${rowId}`, { method: "DELETE" });

    if (res.ok) {
      setMaterials((prev) => prev.filter((r) => r.id !== rowId));
      if (editingMaterialId === rowId) setEditingMaterialId(null);
    } else {
      setError("Failed to delete material row");
    }
  }

  // ✅ Inline edit
  function startEditMaterial(row: MaterialRow) {
    setEditingMaterialId(row.id);
    setMEditName(row.name || "");
    setMEditDetails(row.details || "");
    setMEditQty(Number(row.qty) || 0);
    setMEditUnit(row.unit || "ea");
    setMEditUnitCost(Number(row.unit_cost) || 0);
  }

  function cancelEditMaterial() {
    setEditingMaterialId(null);
    setMEditName("");
    setMEditDetails("");
    setMEditQty(0);
    setMEditUnit("ea");
    setMEditUnitCost(0);
  }

  async function saveEditMaterial(rowId: string) {
    setError("");

    const payload: any = {
      name: (mEditName || "").trim(),
      details: (mEditDetails || "").trim() || null,
      qty: Number(mEditQty) || 0,
      unit: mEditUnit,
      unitCost: Number(mEditUnitCost) || 0,
      unit_cost: Number(mEditUnitCost) || 0,
    };

    const res = await fetch(`/api/atlasbid/bid-materials/${rowId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();

    if (!res.ok) {
      setError(json?.error?.message || json?.error || "Failed to save material row");
      return;
    }

    const updated = json?.row ?? json?.data ?? json;

    setMaterials((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...updated } : r)));

    cancelEditMaterial();
  }

  const divisionName = useMemo(() => {
    if (!bid?.division_id) return "—";
    const d = divisions.find((x) => x.id === bid.division_id);
    return d?.name || "—";
  }, [bid?.division_id, divisions]);

  const isDebug = useMemo(() => {
    if (typeof window === "undefined") return false;
    const sp = new URLSearchParams(window.location.search);
    return sp.get("debug") === "1";
  }, []);

  if (loading) return (
    <div className="min-h-screen bg-[#f0f4f0]">
      <div className="px-4 md:px-8 py-6 md:py-8" style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}>
        <div className="max-w-5xl mx-auto space-y-2">
          <div className="h-3 bg-white/10 rounded w-40 animate-pulse" />
          <div className="h-7 bg-white/20 rounded w-48 animate-pulse" />
        </div>
      </div>
      <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto">
        <div className="h-12 bg-white rounded-xl animate-pulse" />
      </div>
    </div>
  );
  if (!bid) return <div className="p-6 text-red-600">Bid not found.</div>;

  function cleanBidStr(v?: string | null) {
    const s = String(v ?? "").trim();
    return s && s.toLowerCase() !== "null" ? s : "";
  }

  const clientDisplayName =
    cleanBidStr(bid.customer_name) ||
    [cleanBidStr(bid.client_name), cleanBidStr(bid.client_last_name)].filter(Boolean).join(" ") ||
    "—";

  const jobAddress = [bid.address1 || bid.address, bid.city, bid.state].filter(Boolean).join(", ");

  return (
    <div className="min-h-screen bg-[#f0f4f0]">
      {/* Header */}
      <div
        className="px-4 md:px-8 py-6 md:py-8"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}
      >
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 text-white/50 text-xs mb-2">
            <a href={`/atlasbid/bids/${bidId}`} className="hover:text-white/80 transition-colors">Overview</a>
            <span>/</span>
            <span className="text-white/80">Scope</span>
          </div>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">{clientDisplayName}</h1>
              {jobAddress && <p className="text-white/50 text-sm mt-1">{jobAddress}</p>}
            </div>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-white/10 text-white border border-white/20">
              {divisionName}
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-4 max-w-5xl mx-auto space-y-4">
      {isDebug ? <DebugPanel bidId={bid.id} /> : null}

      {/* Sticky pricing bar */}
      <div className="sticky top-0 z-20 bg-white border border-gray-100 rounded-2xl shadow-sm px-5 py-3 flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Labor</span>
          <span className="text-sm font-bold text-gray-800">{money(laborSubtotal)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Materials</span>
          <span className="text-sm font-bold text-gray-800">{money(materialsSubtotal)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Trucking</span>
          <span className="text-sm font-bold text-gray-800">{money(truckingCost)}</span>
        </div>
        <div className="w-px h-5 bg-gray-200 hidden sm:block" />
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Project Price</span>
          <span className="text-xl font-extrabold text-emerald-700">{money(sellRounded)}</span>
        </div>
        {prepayEnabled ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Prepay</span>
            <span className="text-sm font-bold text-emerald-600">{money(sellWithPrepay)}</span>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="border border-red-200 bg-red-50 text-red-700 rounded-lg p-3 text-sm">
          {error}
        </div>
      ) : null}

      {/* Division Gate */}
      {!bid.division_id ? (
        <div className="border rounded-lg p-6 space-y-4">
          <h2 className="text-xl font-semibold">Select Division to Continue</h2>
          <p className="text-sm text-gray-600">
            This bid has no division yet. We must set a division before labor/rates/pricing can calculate.
          </p>

          <div className="max-w-md space-y-2">
            <label className="block text-sm text-gray-700">Division</label>
            <select
              className="border rounded p-2 w-full"
              value={divisionPick}
              onChange={(e) => setDivisionPick(e.target.value)}
            >
              <option value="">— Select —</option>
              {divisions
                .filter((d) => d.is_active !== false)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>

            <button
              className="bg-emerald-700 text-white rounded px-4 py-2 disabled:opacity-50"
              disabled={!divisionPick || savingDivision}
              onClick={saveDivision}
            >
              {savingDivision ? "Saving…" : "Save Division"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="border rounded-lg">
  <div className="bg-gray-50 border-b px-5 py-3 rounded-t-lg">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-800">Labor Builder</h2>
        <button
          type="button"
          onClick={() => setShowBundlePanel((v) => !v)}
          className={`text-xs px-2.5 py-1 rounded-lg border font-semibold transition-colors ${showBundlePanel ? "bg-emerald-50 border-emerald-500 text-emerald-700" : "border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-600"}`}
        >
          {showBundlePanel ? "Hide Bundles" : "+ Bundle"}
        </button>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Season</span>
          <select
            className="border border-gray-200 rounded-lg px-2 py-1 text-sm h-8 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={season}
            onChange={async (e) => {
              const s = e.target.value;
              setSeason(s);
              await fetch(`/api/bids/${bidId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ season: s || null }),
              });
            }}
          >
            <option value="">— None —</option>
            <option value="spring">🌱 Spring</option>
            <option value="summer">☀️ Summer</option>
            <option value="fall">🍂 Fall</option>
            <option value="winter">❄️ Winter</option>
          </select>
        </div>
        <span className="text-sm font-bold text-gray-800">{money(laborSubtotal)}</span>
      </div>
    </div>
  </div>
  {showBundlePanel && (
  <div className="border-b bg-amber-50/30 p-4 space-y-3">
    <div className="grid grid-cols-12 gap-4 items-end">
      <div className="col-span-8">
        <label className="block text-xs font-semibold text-gray-600 mb-1">Bundle</label>
        <select
          className="border p-2 rounded w-full h-10"
          value={selectedBundleId}
          onChange={async (e) => {
            const nextId = e.target.value;
            setSelectedBundleId(nextId);
            await loadBundleQuestions(nextId);
          }}
        >
          <option value="">— Select Bundle —</option>
          {scopeBundles.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>
      <div className="col-span-4">
        <button
          onClick={loadSelectedBundleIntoBid}
          disabled={!selectedBundleId || loadingBundleIntoBid || loadingBundleQuestions}
          className="bg-emerald-700 text-white rounded px-4 py-2 h-10 w-full disabled:opacity-50"
        >
          {loadingBundleIntoBid ? "Loading…" : "Load Bundle"}
        </button>
      </div>
    </div>
    {loadingBundles ? <div className="text-sm text-gray-500">Loading bundles…</div> : null}
    {selectedBundleId && bundleQuestions.length > 0 ? (
    <div className="border rounded p-3 bg-white text-sm space-y-3">
      <div className="font-semibold mb-1">Bundle Questions</div>
      {bundleQuestions.map((q) => (
        <div key={q.id} className="space-y-1">
          <label className="block text-xs font-semibold text-gray-600">
            {q.label}{q.unit ? ` (${q.unit})` : ""}
          </label>
          {q.input_type === "number" ? (
            <div className="space-y-1">
              <input type="number" className="border p-2 rounded w-full" value={bundleAnswers[q.question_key] ?? ""} onChange={(e) => setBundleAnswers((prev) => ({ ...prev, [q.question_key]: Number(e.target.value) }))} />
              {bidMeasurements.filter((m) => m.unit === q.unit).length > 0 && (
                <select
                  className="border border-green-200 bg-green-50 rounded px-2 py-1.5 text-xs w-full text-green-800 focus:outline-none focus:ring-1 focus:ring-green-400"
                  defaultValue=""
                  onChange={(e) => {
                    const m = bidMeasurements.find((x) => x.id === e.target.value);
                    if (m) setBundleAnswers((prev) => ({ ...prev, [q.question_key]: m.computed_value }));
                  }}
                >
                  <option value="">📐 Use a measurement…</option>
                  {bidMeasurements.filter((m) => m.unit === q.unit).map((m) => (
                    <option key={m.id} value={m.id}>{m.label} — {m.computed_value.toLocaleString()} {m.unit}</option>
                  ))}
                </select>
              )}
            </div>
          ) : q.input_type === "checkbox" ? (
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={bundleAnswers[q.question_key] === true} onChange={(e) => setBundleAnswers((prev) => ({ ...prev, [q.question_key]: e.target.checked }))} />
              <span>{q.label}</span>
            </label>
          ) : (
            <input type="text" className="border p-2 rounded w-full" value={bundleAnswers[q.question_key] ?? ""} onChange={(e) => setBundleAnswers((prev) => ({ ...prev, [q.question_key]: e.target.value }))} />
          )}
          {q.help_text ? <div className="text-xs text-gray-500">{q.help_text}</div> : null}
        </div>
      ))}
    </div>
    ) : null}
  </div>
  )}
  <div className="p-5 space-y-4">

  {/* Add row */}
  <div className="space-y-2">
  <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
    {/* Row 1: task search + numeric controls + add button */}
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0" ref={taskDropdownRef}>
        <div className="relative">
          <input
            className="border border-gray-200 rounded-lg w-full h-9 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            placeholder="Search or enter task name…"
            value={taskSearch}
            onChange={(e) => {
              const v = e.target.value;
              setTaskSearch(v);
              setTask(v);
              setShowTaskResults(true);
              setSelectedTaskCatalogId("");
              setSelectedTaskMinutesPerUnit(null);
              setSelectedTaskTemplate("");
              setDetailsFromTemplate(false);
            }}
            onFocus={() => setShowTaskResults(true)}
          />
          {showTaskResults && filteredTasks.length > 0 ? (
            <div className="absolute z-20 bg-white border rounded-lg shadow-lg w-full max-h-60 overflow-auto mt-1">
              {filteredTasks.map((t) => (
                <div
                  key={t.id}
                  className="px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm"
                  onClick={() => applyTaskSelection(t)}
                >
                  {t.name}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="w-20 shrink-0">
        <input
          className="border border-gray-200 rounded-lg w-full h-9 px-2 text-center text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          type="number"
          placeholder="Qty"
          value={quantity === 0 ? "" : quantity}
          onChange={(e) => {
            const newQty = Number(e.target.value) || 0;
            setQuantity(newQty);
            if (selectedTaskMinutesPerUnit && newQty > 0) {
              const computed = hoursFromMinutesPerUnit(selectedTaskMinutesPerUnit, newQty);
              setHours(Number.isFinite(computed) ? Number(computed.toFixed(2)) : 0);
            }
            if (detailsFromTemplate && selectedTaskTemplate && newQty > 0) {
              const matNames = templateMaterials.map((r: any) => r.materials_catalog?.name || "").filter(Boolean);
              setDetails(renderDescriptionTemplate(selectedTaskTemplate, newQty, unit, matNames));
            }
          }}
        />
      </div>
      <div className="w-24 shrink-0">
        <UnitInput
          className="border border-gray-200 rounded-lg w-full h-9 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          value={unit}
          onChange={(v) => {
            setUnit(v);
            if (v !== "yd") { setCalcSqft(""); setCalcDepth("3"); }
          }}
        />
      </div>
      <div className="w-20 shrink-0">
        <input
          className="border border-gray-200 rounded-lg w-full h-9 px-2 text-center text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          type="number"
          placeholder="Hrs"
          value={hours === 0 ? "" : hours}
          onChange={(e) => setHours(Number(e.target.value))}
        />
      </div>
      <button
        onClick={addLabor}
        className="shrink-0 bg-[#123b1f] text-white rounded-lg h-9 px-5 text-sm font-semibold hover:bg-[#1a5c2e]"
      >
        Add
      </button>
    </div>
    {/* Row 2: description + AI + save to catalog */}
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0 relative">
        <input
          className="border border-gray-200 rounded-lg w-full h-9 px-3 pr-9 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder="Description / proposal text…"
          autoComplete="off"
          value={details}
          onFocus={() => setShowTaskResults(false)}
          onChange={(e) => { setDetails(e.target.value); setSuggestion(""); setSuggestionFor(null); setDetailsFromTemplate(false); }}
        />
        {task.trim() && (
          <button
            type="button"
            title="AI suggest description"
            disabled={suggestingFor === "add"}
            onClick={async () => { await suggestDescription("add", task.trim(), quantity, unit); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-base leading-none disabled:opacity-40"
          >
            {suggestingFor === "add" ? "…" : "✨"}
          </button>
        )}
        {suggestion && suggestionFor === "add" && suggestingFor === null && (
          <div className="absolute left-0 top-full mt-1 z-30 bg-white border border-emerald-300 rounded-lg shadow-lg px-3 py-2.5 text-sm w-full">
            <div className="text-gray-800 mb-2">✨ {suggestion}</div>
            <div className="flex gap-2">
              <button type="button" className="bg-emerald-600 text-white text-xs font-semibold px-3 py-1 rounded hover:bg-emerald-700" onClick={() => { setDetails(suggestion); setSuggestion(""); setSuggestionFor(null); }}>Use this</button>
              <button type="button" className="text-gray-400 text-xs px-2 py-1 hover:text-gray-600" onClick={() => { setSuggestion(""); setSuggestionFor(null); }}>Dismiss</button>
            </div>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => setSaveToCatalog((v) => !v)}
        className={`shrink-0 text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors whitespace-nowrap ${
          saveToCatalog
            ? "bg-emerald-50 border-emerald-500 text-emerald-700"
            : "border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-500"
        }`}
      >
        {savingToCatalog ? "Saving…" : saveToCatalog ? "✓ Catalog" : "+ Catalog"}
      </button>
    </div>
  </div>

  {unit === "yd" && (
    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 ml-2">
      <span className="text-xs font-semibold text-amber-700">Yd calc:</span>
      <input
        className="w-20 border border-gray-200 rounded px-2 py-1 text-xs text-center"
        type="number"
        placeholder="sq ft"
        value={calcSqft}
        onChange={(e) => {
          setCalcSqft(e.target.value);
          const sqft = Number(e.target.value);
          const depth = Number(calcDepth) || 3;
          if (sqft > 0) {
            const yds = Math.ceil((sqft * depth) / 324);
            setQuantity(yds);
            if (selectedTaskMinutesPerUnit && yds > 0) {
              setHours(Number(hoursFromMinutesPerUnit(selectedTaskMinutesPerUnit, yds).toFixed(2)));
            }
          }
        }}
      />
      <span className="text-xs text-gray-500">sq ft @</span>
      <input
        className="w-14 border border-gray-200 rounded px-2 py-1 text-xs text-center"
        type="number"
        placeholder="in"
        value={calcDepth}
        onChange={(e) => {
          setCalcDepth(e.target.value);
          const sqft = Number(calcSqft);
          const depth = Number(e.target.value) || 3;
          if (sqft > 0) {
            const yds = Math.ceil((sqft * depth) / 324);
            setQuantity(yds);
            if (selectedTaskMinutesPerUnit && yds > 0) {
              setHours(Number(hoursFromMinutesPerUnit(selectedTaskMinutesPerUnit, yds).toFixed(2)));
            }
          }
        }}
      />
      <span className="text-xs text-gray-500">in deep</span>
      {calcSqft && Number(calcSqft) > 0 && (
        <span className="text-xs font-semibold text-amber-800 ml-1">= {Math.ceil((Number(calcSqft) * (Number(calcDepth) || 3)) / 324)} yds</span>
      )}
    </div>
  )}
  </div>

  {labor.length === 0 ? (
  <div className="text-gray-400 text-sm py-6 text-center">
    No labor added yet.
  </div>
) : (
  <div className="space-y-2 pt-1 border-t">
    {laborGroups.map((g) => {
      if (g.type === "row") {
        const row = g.row;
        const rowEffectiveHrs = effectiveHours(row, season);
        const rowTotal = rowEffectiveHrs * (Number(row.hourly_rate) || 0);
        return (
          <div key={row.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            {/* Row 1: show checkbox + task name + controls + total + delete */}
            <div className="flex items-center gap-2 px-3 py-2.5">
              {(() => {
                const mode = row.hidden_from_proposal ? "hidden" : row.show_as_line_item === true ? "line" : "bundle";
                const setMode = async (m: "line" | "bundle" | "hidden") => {
                  const patch = { show_as_line_item: m === "line", hidden_from_proposal: m === "hidden" };
                  await fetch(`/api/atlasbid/bid-labor/${row.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(patch),
                  });
                  setLabor((prev) => prev.map((r) => r.id === row.id ? { ...r, ...patch } : r));
                };
                return (
                  <div className="flex shrink-0 border border-gray-200 rounded overflow-hidden text-[9px] font-bold leading-none" title="Proposal visibility">
                    {(["line", "bundle", "hidden"] as const).map((m) => (
                      <button key={m} type="button" onClick={() => setMode(m)}
                        className={`px-1.5 py-1 transition-colors ${mode === m ? m === "hidden" ? "bg-gray-400 text-white" : "bg-green-700 text-white" : "text-gray-400 hover:text-gray-600 bg-white"}`}
                        title={m === "line" ? "Show as own line item" : m === "bundle" ? "Group under bundle name" : "Hide from proposal"}
                      >
                        {m === "line" ? "Line" : m === "bundle" ? "Bndl" : "Hide"}
                      </button>
                    ))}
                  </div>
                );
              })()}
              <span className="flex-1 min-w-0 text-sm font-semibold text-gray-800 truncate">{row.task}</span>
              {season && row.task_catalog && getSeasonMultiplier(row, season) > 1 && (
                <span className="shrink-0 text-xs bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 font-medium whitespace-nowrap">
                  {season === "spring" ? "🌱" : season === "summer" ? "☀️" : season === "fall" ? "🍂" : "❄️"} ×{getSeasonMultiplier(row, season).toFixed(1)}
                </span>
              )}
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  className="w-16 border border-gray-200 rounded-lg h-8 px-2 text-center text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  type="number"
                  title="Quantity"
                  value={row.quantity === 0 ? "" : row.quantity}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const value = raw === "" ? 0 : Math.max(0, parseFloat(raw) || 0);
                    const mpu = row.task_catalog?.minutes_per_unit;
                    let newHours: number;
                    if (mpu && value > 0) {
                      newHours = Number(hoursFromMinutesPerUnit(mpu, value).toFixed(2));
                    } else if (row.quantity > 0 && row.man_hours > 0 && value > 0) {
                      newHours = Number((row.man_hours / row.quantity * value).toFixed(2));
                    } else {
                      newHours = row.man_hours;
                    }
                    setLabor((prev) => prev.map((r) => r.id === row.id ? { ...r, quantity: value, man_hours: newHours } : r));
                  }}
                  onBlur={async (e) => {
                    const raw = e.target.value;
                    const value = raw === "" ? 0 : Math.max(0, parseFloat(raw) || 0);
                    const mpu = row.task_catalog?.minutes_per_unit;
                    const patchBody: any = { quantity: value, unit: row.unit };
                    if (mpu && value > 0) {
                      patchBody.man_hours = Number(hoursFromMinutesPerUnit(mpu, value).toFixed(2));
                    } else if (row.quantity > 0 && row.man_hours > 0 && value > 0) {
                      patchBody.man_hours = Number((row.man_hours / row.quantity * value).toFixed(2));
                    }
                    try {
                      const res = await fetch(`/api/atlasbid/bid-labor/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patchBody) });
                      if (!res.ok) console.error("Failed to save labor row", await res.json());
                    } catch (err) { console.error("Labor autosave failed", err); }
                  }}
                />
                <span className="text-xs text-gray-500 w-14 shrink-0">{pluralUnit(row.unit, row.quantity)}</span>
                <input
                  className="w-16 border border-gray-200 rounded-lg h-8 px-2 text-center text-sm focus:outline-none focus:ring-2 focus:ring-green-500 tabular-nums"
                  type="number"
                  step="0.01"
                  title="Man hours"
                  value={row.man_hours === 0 ? "" : row.man_hours}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const value = raw === "" ? 0 : Math.max(0, parseFloat(raw) || 0);
                    setLabor((prev) => prev.map((r) => r.id === row.id ? { ...r, man_hours: value } : r));
                  }}
                  onBlur={async (e) => {
                    const raw = e.target.value;
                    const value = raw === "" ? 0 : Math.max(0, parseFloat(raw) || 0);
                    await fetch(`/api/atlasbid/bid-labor/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ man_hours: value, is_overridden: true }) });
                  }}
                />
                <span className="text-xs text-gray-400 shrink-0">hrs</span>
                <select
                  title="Difficulty level"
                  value={row.difficulty_level ?? 0}
                  className="w-32 border border-gray-200 rounded-lg h-8 px-1 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                  onChange={async (e) => {
                    const level = Number(e.target.value);
                    await fetch(`/api/atlasbid/bid-labor/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ difficulty_level: level }) });
                    setLabor((prev) => prev.map((r) => r.id === row.id ? { ...r, difficulty_level: level } : r));
                  }}
                >
                  {DIFFICULTY_LABELS.map((label, i) => (
                    <option key={i} value={i}>{i === 0 ? "Difficulty —" : `${i} ${label}`}</option>
                  ))}
                </select>
                {row.unit === "yd" && (
                  <button
                    type="button"
                    title="Yd calculator"
                    onClick={() => setCalcOpenForRow(calcOpenForRow === row.id ? null : row.id)}
                    className={`text-sm px-1.5 h-8 rounded border transition-colors ${calcOpenForRow === row.id ? "bg-amber-100 border-amber-400 text-amber-700" : "border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600"}`}
                  >
                    📐
                  </button>
                )}
                <span className="text-sm font-semibold text-gray-800 tabular-nums w-20 text-right shrink-0">{money(rowTotal)}</span>
                <button onClick={() => deleteLaborRow(row.id)} className="text-gray-400 hover:text-red-500 transition-colors shrink-0 ml-1" title="Delete row">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                </button>
              </div>
            </div>
            {/* Row 2: yd calc (if open) */}
            {calcOpenForRow === row.id && row.unit === "yd" && (
              <div className="border-t border-amber-200 px-3 py-2 flex items-center gap-2 bg-amber-50/60">
                <span className="text-xs font-semibold text-amber-700 shrink-0">Yd calc:</span>
                <input
                  className="w-20 border border-gray-200 rounded px-2 py-1 text-xs text-center"
                  type="number"
                  placeholder="sq ft"
                  value={rowCalcValues[row.id]?.sqft ?? ""}
                  onChange={(e) => {
                    const sqft = e.target.value;
                    const depth = Number(rowCalcValues[row.id]?.depth ?? "3") || 3;
                    setRowCalcValues((prev) => ({ ...prev, [row.id]: { sqft, depth: prev[row.id]?.depth ?? "3" } }));
                    if (Number(sqft) > 0) {
                      const yds = Math.ceil((Number(sqft) * depth) / 324);
                      const mpu = row.task_catalog?.minutes_per_unit;
                      const newHours = mpu && yds > 0 ? Number(hoursFromMinutesPerUnit(mpu, yds).toFixed(2)) : row.man_hours;
                      setLabor((prev) => prev.map((r) => r.id === row.id ? { ...r, quantity: yds, man_hours: newHours } : r));
                    }
                  }}
                />
                <span className="text-xs text-gray-500">sq ft @</span>
                <input
                  className="w-14 border border-gray-200 rounded px-2 py-1 text-xs text-center"
                  type="number"
                  placeholder="in"
                  value={rowCalcValues[row.id]?.depth ?? "3"}
                  onChange={(e) => {
                    const depth = e.target.value;
                    const sqft = Number(rowCalcValues[row.id]?.sqft ?? "0");
                    setRowCalcValues((prev) => ({ ...prev, [row.id]: { sqft: prev[row.id]?.sqft ?? "", depth } }));
                    if (sqft > 0 && Number(depth) > 0) {
                      const yds = Math.ceil((sqft * Number(depth)) / 324);
                      const mpu = row.task_catalog?.minutes_per_unit;
                      const newHours = mpu && yds > 0 ? Number(hoursFromMinutesPerUnit(mpu, yds).toFixed(2)) : row.man_hours;
                      setLabor((prev) => prev.map((r) => r.id === row.id ? { ...r, quantity: yds, man_hours: newHours } : r));
                    }
                  }}
                />
                <span className="text-xs text-gray-500">in deep</span>
                {Number(rowCalcValues[row.id]?.sqft) > 0 && (
                  <span className="text-xs font-semibold text-amber-800 ml-1">
                    = {Math.ceil((Number(rowCalcValues[row.id]?.sqft) * (Number(rowCalcValues[row.id]?.depth ?? "3") || 3)) / 324)} yds
                  </span>
                )}
              </div>
            )}
            {/* Row 3: description + AI */}
            <div className="border-t border-gray-100 px-3 py-2 flex items-center gap-2 bg-gray-50/50">
              <div className="flex-1 min-w-0 relative">
                <input
                  className="border border-gray-200 rounded-lg w-full h-8 px-3 pr-9 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  autoComplete="off"
                  placeholder="Proposal description…"
                  value={row.proposal_text ?? ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    setLabor((prev) => prev.map((r) => r.id === row.id ? { ...r, proposal_text: value } : r));
                  }}
                  onBlur={async (e) => {
                    await fetch(`/api/atlasbid/bid-labor/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proposal_text: e.target.value }) });
                  }}
                />
                <button
                  type="button"
                  title="AI suggest description"
                  disabled={suggestingFor === row.id}
                  onClick={() => suggestDescription(row.id, row.task, row.quantity, row.unit)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-base leading-none disabled:opacity-40"
                >
                  {suggestingFor === row.id ? "…" : "✨"}
                </button>
                {suggestion && suggestionFor === row.id && suggestingFor === null && (
                  <div className="absolute left-0 top-full mt-1 z-30 bg-white border border-emerald-300 rounded-lg shadow-lg px-3 py-2.5 text-sm w-full">
                    <div className="text-gray-800 mb-2">✨ {suggestion}</div>
                    <div className="flex gap-2">
                      <button type="button" className="bg-emerald-600 text-white text-xs font-semibold px-3 py-1 rounded hover:bg-emerald-700" onClick={async () => {
                        setLabor((prev) => prev.map((r) => r.id === row.id ? { ...r, proposal_text: suggestion } : r));
                        await fetch(`/api/atlasbid/bid-labor/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proposal_text: suggestion }) });
                        setSuggestion(""); setSuggestionFor(null);
                      }}>Use this</button>
                      <button type="button" className="text-gray-400 text-xs px-2 py-1 hover:text-gray-600" onClick={() => { setSuggestion(""); setSuggestionFor(null); }}>Dismiss</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      }

      const bundleTotal = g.rows.reduce(
        (sum, r) => sum + effectiveHours(r, season) * (Number(r.hourly_rate) || 0),
        0
      );

      return (
        <div key={g.runId} className="border rounded overflow-hidden">
          <div className="flex items-center justify-between bg-gray-50 px-3 py-2 border-b">
            <div className="flex items-center gap-2">
              {editingBundleNameId === g.runId ? (
                <input
                  autoFocus
                  className="border rounded px-2 h-7 text-sm font-semibold text-gray-700 w-48"
                  value={bundleNameDraft}
                  onChange={(e) => setBundleNameDraft(e.target.value)}
                  onBlur={() => saveBundleName(g.runId, bundleNameDraft || g.name)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveBundleName(g.runId, bundleNameDraft || g.name);
                    if (e.key === "Escape") { setEditingBundleNameId(null); setBundleNameDraft(""); }
                  }}
                />
              ) : (
                <>
                  <span className="text-sm font-semibold text-gray-700">{g.name}</span>
                  <button
                    type="button"
                    title="Edit scope name"
                    onClick={() => { setEditingBundleNameId(g.runId); setBundleNameDraft(g.name); }}
                    className="text-gray-400 hover:text-gray-600 text-xs"
                  >
                    ✏️
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm tabular-nums text-gray-600">
                {money(bundleTotal)}
              </span>
              <button
                onClick={() => deleteBundleRun(g.runId)}
                className="text-red-600 hover:underline text-sm"
              >
                Remove Bundle
              </button>
            </div>
          </div>
          <div className="space-y-1 p-2">
            {g.rows.map((row) => {
              const bundleRowEffHrs = effectiveHours(row, season);
              const rowTotal = bundleRowEffHrs * (Number(row.hourly_rate) || 0);
              return (
                <div key={row.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  {/* Row 1: show + task + controls */}
                  <div className="flex items-center gap-2 px-3 py-2">
                    <input
                      className="w-4 h-4 shrink-0 accent-green-700"
                      type="checkbox"
                      title="Show on proposal"
                      checked={row.show_as_line_item === true}
                      onChange={async (e) => {
                        const checked = e.target.checked;
                        await fetch(`/api/atlasbid/bid-labor/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ show_as_line_item: checked }) });
                        setLabor((prev) => prev.map((r) => r.id === row.id ? { ...r, show_as_line_item: checked } : r));
                      }}
                    />
                    <span className="flex-1 min-w-0 text-sm font-medium text-gray-800 truncate">{row.task}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        className="w-16 border border-gray-200 rounded h-7 px-2 text-center text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                        type="number"
                        title="Quantity"
                        value={row.quantity === 0 ? "" : row.quantity}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const value = raw === "" ? 0 : Math.max(0, parseFloat(raw) || 0);
                          const mpu = row.task_catalog?.minutes_per_unit;
                          let newHours: number;
                          if (mpu && value > 0) {
                            newHours = Number(hoursFromMinutesPerUnit(mpu, value).toFixed(2));
                          } else if (row.quantity > 0 && row.man_hours > 0 && value > 0) {
                            newHours = Number((row.man_hours / row.quantity * value).toFixed(2));
                          } else {
                            newHours = row.man_hours;
                          }
                          setLabor((prev) => prev.map((r) => r.id === row.id ? { ...r, quantity: value, man_hours: newHours } : r));
                        }}
                        onBlur={async (e) => {
                          const raw = e.target.value;
                          const value = raw === "" ? 0 : Math.max(0, parseFloat(raw) || 0);
                          const mpu = row.task_catalog?.minutes_per_unit;
                          const patchBody: any = { quantity: value, unit: row.unit };
                          if (mpu && value > 0) {
                            patchBody.man_hours = Number(hoursFromMinutesPerUnit(mpu, value).toFixed(2));
                          } else if (row.quantity > 0 && row.man_hours > 0 && value > 0) {
                            patchBody.man_hours = Number((row.man_hours / row.quantity * value).toFixed(2));
                          }
                          try {
                            const res = await fetch(`/api/atlasbid/bid-labor/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patchBody) });
                            if (!res.ok) console.error("Failed to save labor row", await res.json());
                          } catch (err) { console.error("Labor autosave failed", err); }
                        }}
                      />
                      <span className="text-xs text-gray-500 w-14 shrink-0">{pluralUnit(row.unit, row.quantity)}</span>
                      <input
                        className="w-16 border border-gray-200 rounded h-7 px-2 text-center text-sm focus:outline-none focus:ring-1 focus:ring-green-500 tabular-nums"
                        type="number"
                        step="0.01"
                        title="Man hours"
                        value={row.man_hours === 0 ? "" : row.man_hours}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const value = raw === "" ? 0 : Math.max(0, parseFloat(raw) || 0);
                          setLabor((prev) => prev.map((r) => r.id === row.id ? { ...r, man_hours: value } : r));
                        }}
                        onBlur={async (e) => {
                          const raw = e.target.value;
                          const value = raw === "" ? 0 : Math.max(0, parseFloat(raw) || 0);
                          await fetch(`/api/atlasbid/bid-labor/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ man_hours: value, is_overridden: true }) });
                        }}
                      />
                      <span className="text-xs text-gray-400 shrink-0">hrs</span>
                      <span className="text-sm font-semibold text-gray-700 tabular-nums w-20 text-right shrink-0">{money(rowTotal)}</span>
                      <button onClick={() => deleteLaborRow(row.id)} className="text-gray-300 hover:text-red-500 transition-colors shrink-0 ml-1" title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    </div>
                  </div>
                  {/* Row 2: description */}
                  <div className="border-t border-gray-100 px-3 py-1.5 flex items-center gap-2 bg-gray-50/50">
                    <div className="flex-1 min-w-0 relative">
                      <input
                        className="border border-gray-200 rounded w-full h-7 px-3 pr-9 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                        autoComplete="off"
                        placeholder="Proposal description…"
                        value={row.proposal_text ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setLabor((prev) => prev.map((r) => r.id === row.id ? { ...r, proposal_text: value } : r));
                        }}
                        onBlur={async (e) => {
                          await fetch(`/api/atlasbid/bid-labor/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proposal_text: e.target.value }) });
                        }}
                      />
                      <button
                        type="button"
                        title="AI suggest description"
                        disabled={suggestingFor === row.id}
                        onClick={() => suggestDescription(row.id, row.task, row.quantity, row.unit)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-sm leading-none disabled:opacity-40"
                      >
                        {suggestingFor === row.id ? "…" : "✨"}
                      </button>
                      {suggestion && suggestionFor === row.id && suggestingFor === null && (
                        <div className="absolute left-0 top-full mt-1 z-30 bg-white border border-emerald-300 rounded-lg shadow-lg px-3 py-2.5 text-sm w-full">
                          <div className="text-gray-800 mb-2">✨ {suggestion}</div>
                          <div className="flex gap-2">
                            <button type="button" className="bg-emerald-600 text-white text-xs font-semibold px-3 py-1 rounded hover:bg-emerald-700" onClick={async () => {
                              setLabor((prev) => prev.map((r) => r.id === row.id ? { ...r, proposal_text: suggestion } : r));
                              await fetch(`/api/atlasbid/bid-labor/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proposal_text: suggestion }) });
                              setSuggestion(""); setSuggestionFor(null);
                            }}>Use this</button>
                            <button type="button" className="text-gray-400 text-xs px-2 py-1 hover:text-gray-600" onClick={() => { setSuggestion(""); setSuggestionFor(null); }}>Dismiss</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    })}
  </div>
)}
</div>
</div>
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-gray-50 border-b px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-gray-800">Materials</h2>
                {materials.length > 0 && (
                  <span className="text-xs bg-gray-200 text-gray-600 rounded-full px-2 py-0.5 font-semibold tabular-nums">{materials.length}</span>
                )}
                {materials.some(m => !m.source_type || m.source_type === "template") && (
                  <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-semibold">⚠ confirm sources</span>
                )}
              </div>
              <span className="text-sm font-bold text-gray-800">{money(materialsSubtotal)}</span>
            </div>
            <div className="p-5 space-y-3">

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
              {/* Row 1: search + qty + unit + unit cost + add */}
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0" ref={materialDropdownRef}>
                  <div className="relative">
                    <input
                      className="border border-gray-200 rounded-lg w-full h-9 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="Search materials catalog…"
                      value={materialSearch}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSelectedMaterialId("");
                        setMaterialSearch(v);
                        setMaterialName(v);
                        setShowMaterialResults(true);
                      }}
                      onFocus={() => setShowMaterialResults(true)}
                    />
                    {showMaterialResults && filteredMaterialsCatalog.length > 0 ? (
                      <div className="absolute z-20 bg-white border rounded-lg shadow-lg w-full max-h-60 overflow-auto mt-1">
                        {filteredMaterialsCatalog.map((m) => (
                          <div key={m.id} className="px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm flex items-center justify-between" onClick={() => applyMaterialSelection(m)}>
                            <span className="font-medium">{m.name}</span>
                            {m.default_unit && <span className="text-xs text-gray-400 ml-2">{m.default_unit}</span>}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="w-20 shrink-0">
                  <input
                    className="border border-gray-200 rounded-lg w-full h-9 px-2 text-center text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    type="number"
                    placeholder="Qty"
                    value={materialQty === 0 ? "" : materialQty}
                    onChange={(e) => setMaterialQty(Number(e.target.value))}
                  />
                </div>
                <div className="w-24 shrink-0">
                  <UnitInput
                    className="border border-gray-200 rounded-lg w-full h-9 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    value={materialUnit}
                    onChange={setMaterialUnit}
                  />
                </div>
                <div className="w-28 shrink-0 relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">$</span>
                  <input
                    className="border border-gray-200 rounded-lg w-full h-9 pl-6 pr-2 text-right text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={materialCost === 0 ? "" : materialCost}
                    onChange={(e) => setMaterialCost(Number(e.target.value))}
                  />
                </div>
                {materialQty > 0 && materialCost > 0 && (
                  <span className="shrink-0 text-sm text-gray-600 font-medium whitespace-nowrap">
                    = {money(materialQty * materialCost)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={addMaterial}
                  className="shrink-0 bg-[#123b1f] text-white rounded-lg h-9 px-5 text-sm font-semibold hover:bg-[#1a5c2e]"
                >
                  Add
                </button>
              </div>
              {/* Row 2: source + details */}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <select
                    className="border border-gray-200 rounded-lg w-full h-9 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    value={selectedSourceIndex ?? ""}
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      setSelectedSourceIndex(idx);
                      const src = materialSources[idx];
                      if (!src) return;
                      if (src.unit) setMaterialUnit(src.unit);
                      if (src.cost !== undefined) setMaterialCost(Number(Number(src.cost).toFixed(2)) || 0);
                    }}
                  >
                    <option value="">Source (optional)</option>
                    {materialSources.map((s, i) => {
                      const qty = s.available_qty == null ? null : Number(s.available_qty);
                      const qtyText = qty === null ? "" : qty < 0 ? ` (LOW: ${qty.toFixed(2).replace(/\.00$/, "")})` : ` (${qty.toFixed(2).replace(/\.00$/, "")} avail)`;
                      return <option key={i} value={i}>{s.source_name} — {s.unit} @ ${Number(s.cost).toFixed(2)}{qtyText}</option>;
                    })}
                  </select>
                </div>
                <div className="flex-1">
                  <input
                    className="border border-gray-200 rounded-lg w-full h-9 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Details (optional)"
                    value={materialDetails}
                    onChange={(e) => setMaterialDetails(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {materials.length === 0 ? (
              <div className="text-gray-400 text-sm py-6 text-center border-t mt-1">No materials added yet.</div>
            ) : (
              <div className="space-y-2 pt-1 border-t mt-1">
              {materials.map((row) => {
                const isEditing = editingMaterialId === row.id;

                const qty = isEditing ? Number(mEditQty) || 0 : Number(row.qty) || 0;
                const cost = isEditing ? Number(mEditUnitCost) || 0 : Number(row.unit_cost) || 0;
                const total = qty * cost;

                return (
                  <div
                    key={row.id}
                    className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm"
                  >
                    {/* Row 1: name + qty + unit cost + total + actions */}
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      {isEditing ? (
                        <input
                          className="flex-1 min-w-0 border border-gray-200 rounded-lg h-8 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                          value={mEditName}
                          onChange={(e) => setMEditName(e.target.value)}
                        />
                      ) : (
                        <span className="flex-1 min-w-0 text-sm font-semibold text-gray-800 truncate">{row.name}</span>
                      )}

                      {isEditing ? (
                        <>
                          <input className="w-16 border border-gray-200 rounded h-7 px-2 text-center text-sm focus:outline-none focus:ring-1 focus:ring-green-500" type="number" value={mEditQty === 0 ? "" : mEditQty} onChange={(e) => setMEditQty(Number(e.target.value))} />
                          <UnitInput className="w-20 border border-gray-200 rounded h-7 px-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-500" value={mEditUnit} onChange={setMEditUnit} />
                          <span className="text-xs text-gray-400">@</span>
                          <input className="w-20 border border-gray-200 rounded h-7 px-2 text-right text-sm focus:outline-none focus:ring-1 focus:ring-green-500" type="number" step="0.01" value={mEditUnitCost === 0 ? "" : mEditUnitCost} onChange={(e) => setMEditUnitCost(Number(e.target.value))} />
                        </>
                      ) : (
                        <>
                          <span className="text-xs text-gray-500 tabular-nums shrink-0">{qty} {pluralUnit(row.unit ?? "", qty)}</span>
                          <span className="text-xs text-gray-400 shrink-0">@</span>
                          <span className="text-xs text-gray-500 tabular-nums shrink-0">{money(row.unit_cost)}</span>
                        </>
                      )}
                      <span className="text-sm font-semibold text-gray-700 tabular-nums w-20 text-right shrink-0 ml-auto">{money(total)}</span>
                      {isEditing ? (
                        <>
                          <button onClick={() => saveEditMaterial(row.id)} className="text-emerald-600 hover:text-emerald-700 shrink-0" title="Save">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          </button>
                          <button onClick={cancelEditMaterial} className="text-gray-400 hover:text-gray-600 shrink-0" title="Cancel">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEditMaterial(row)} className="text-gray-300 hover:text-blue-500 transition-colors shrink-0" title="Edit">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button onClick={() => deleteMaterialRow(row.id)} className="text-gray-300 hover:text-red-500 transition-colors shrink-0" title="Delete">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                          </button>
                        </>
                      )}
                    </div>
                    {/* Row 2: source + details */}
                    <div className="border-t border-gray-100 px-3 py-1.5 bg-gray-50/50 flex items-center gap-2">
                      {row.material_id ? (
                        <select
                          className={`flex-1 border rounded-lg text-xs px-2 h-7 focus:outline-none focus:ring-1 focus:ring-green-500 ${!row.source_type || row.source_type === "template" ? "border-amber-400 bg-amber-50 text-amber-700 font-semibold" : "border-gray-200"}`}
                          value=""
                          onFocus={() => ensureMatSources(row.material_id!)}
                          onChange={async (e) => {
                            const idx = Number(e.target.value);
                            const src = (matSourcesCache[row.material_id!] || [])[idx];
                            if (!src) return;
                            const newCost = Number(Number(src.cost).toFixed(2));
                            const newUnit = src.unit || row.unit;
                            const newSource = src.source_name;
                            const duplicate = materials.find(r =>
                              r.id !== row.id && r.material_id && row.material_id &&
                              r.material_id === row.material_id &&
                              normalizeMaterialText(r.source_type) === normalizeMaterialText(newSource) &&
                              r.unit === newUnit
                            );
                            if (duplicate) {
                              const mergedQty = Number((Number(duplicate.qty || 0) + Number(row.qty || 0)).toFixed(2));
                              await Promise.all([
                                fetch(`/api/atlasbid/bid-materials/${duplicate.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qty: mergedQty }) }),
                                fetch(`/api/atlasbid/bid-materials/${row.id}`, { method: "DELETE" }),
                              ]);
                              setMaterials((prev) => prev.map(r => r.id === duplicate.id ? { ...r, qty: mergedQty } : r).filter(r => r.id !== row.id));
                            } else {
                              setMaterials((prev) => prev.map((r) => r.id === row.id ? { ...r, source_type: newSource, unit: newUnit, unit_cost: newCost } : r));
                              await fetch(`/api/atlasbid/bid-materials/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_type: newSource, unit: newUnit, unit_cost: newCost }) });
                            }
                          }}
                        >
                          <option value="" disabled>{!row.source_type || row.source_type === "template" ? "⚠ Select source" : row.source_type}</option>
                          {(matSourcesCache[row.material_id] || []).map((s, i) => (
                            <option key={i} value={i}>{s.source_name} @ ${Number(s.cost).toFixed(2)}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="flex-1 border border-gray-200 rounded-lg text-xs px-2 h-7 focus:outline-none focus:ring-1 focus:ring-green-500"
                          placeholder="Source"
                          value={row.source_type || ""}
                          onChange={(e) => { const value = e.target.value; setMaterials((prev) => prev.map((r) => r.id === row.id ? { ...r, source_type: value } : r)); }}
                          onBlur={async (e) => { await fetch(`/api/atlasbid/bid-materials/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_type: e.target.value.trim() || null }) }); }}
                        />
                      )}
                      <input
                        className="flex-1 border border-gray-200 rounded-lg text-xs px-2 h-7 focus:outline-none focus:ring-1 focus:ring-green-500"
                        placeholder="Details"
                        value={row.details || ""}
                        onChange={(e) => { const value = e.target.value; setMaterials((prev) => prev.map((r) => r.id === row.id ? { ...r, details: value } : r)); }}
                        onBlur={async (e) => { await fetch(`/api/atlasbid/bid-materials/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ details: e.target.value.trim() || null }) }); }}
                      />
                    </div>
                  </div>
                );
              })}
              </div>
            )}
            </div>
          </div>

          {/* TRUCKING */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-gray-50 border-b px-5 py-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-800">Trucking</h2>
                <div className="text-xs text-gray-500 mt-0.5">Single trucking entry (Landscaping only).</div>
              </div>
              <div className="flex items-center gap-3">
                {savingTrucking ? <span className="text-xs text-gray-500">Saving…</span> : null}
                <span className="text-sm font-bold text-gray-800">{money(truckingCost)}</span>
              </div>
            </div>
            <div className="p-5">
            {truckingSaveError ? <div className="text-sm text-red-600 mb-3">{truckingSaveError}</div> : null}

            <div className="grid grid-cols-3 gap-4 max-w-sm items-end">
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 text-center">Hours</div>
                <input
                  className="border rounded h-9 px-3 w-full text-center"
                  type="number"
                  value={truckingHours === 0 ? "" : truckingHours}
                  onChange={(e) => setTruckingHours(Number(e.target.value))}
                />
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 text-center">Rate ($/hr)</div>
                <div className="border rounded h-9 px-3 flex items-center justify-center bg-gray-50 text-sm tabular-nums">{money(divisionRate)}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 text-center">Cost</div>
                <div className="border rounded h-9 px-3 flex items-center justify-center bg-gray-50 text-sm font-semibold tabular-nums">{money(truckingCost)}</div>
              </div>
            </div>
            </div>
          </div>

          {/* PRICING PREVIEW */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-gray-50 border-b px-5 py-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800">Pricing Preview</h2>
              <span className="text-sm font-bold text-emerald-700">{money(sellRounded)}</span>
            </div>
            <div className="p-5">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="block text-sm text-gray-600">
                  Target Gross Profit % (editable)
                </label>
                <div className="relative max-w-[120px]">
                  <input
                    className="border p-2 rounded w-full pr-7"
                    type="number"
                    value={targetGpPct === 0 ? "" : targetGpPct}
                    onChange={(e) => setTargetGpPct(Number(e.target.value))}
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">%</span>
                </div>

                <label className="inline-flex items-center gap-2 text-sm text-gray-700 pt-2">
                  <input
                    type="checkbox"
                    checked={prepayEnabled}
                    onChange={(e) => setPrepayEnabled(e.target.checked)}
                  />
                  Apply prepay discount (100% payment via check up-front)
                </label>

                <div className="text-xs text-gray-500">
                  Rounding + contingency are “baked in” from Ops Settings (hidden from sales).
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Labor cost</span>
                  <span className="font-semibold">{money(laborSubtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Materials cost</span>
                  <span className="font-semibold">{money(materialsSubtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Trucking cost</span>
                  <span className="font-semibold">{money(truckingCost)}</span>
                </div>

                <div className="flex justify-between border-t pt-2">
                  <span className="text-gray-800">Total cost</span>
                  <span className="font-bold">{money(totalCost)}</span>
                </div>

                <div className="flex justify-between pt-4">
                  <span className="text-gray-800">Project price</span>
                  <span className="font-bold text-emerald-700">{money(sellRounded)}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-800">Project price (with prepay)</span>
                  <span className="font-bold text-emerald-700">{money(sellWithPrepay)}</span>
                </div>

                <div className="flex justify-between border-t pt-2">
                  <span className="text-gray-800">Effective GP%</span>
                  <span className="font-bold">{effectiveGpPct.toFixed(2)}%</span>
                </div>
              </div>
            </div>
            </div>
          </div>
          {/* PROPOSAL PREVIEW */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-gray-50 border-b px-5 py-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800">Proposal Preview</h2>
              <button
                onClick={copyProposal}
                className="px-3 py-1.5 rounded bg-gray-800 text-white text-xs font-medium"
              >
                Copy Proposal
              </button>
            </div>
            <div className="p-5 space-y-4 text-sm">

              {labor.length === 0 ? (
                <div className="text-gray-500">No scope items yet.</div>
              ) : (
                <div className="space-y-4">
                  {/* Bundle scopes */}
                  {laborGroups.filter((g) => g.type === "bundle").map((g) => {
                    if (g.type !== "bundle") return null;
                    const bundleTotal = g.rows.reduce(
                      (sum, r) => sum + (Number(r.man_hours) || 0) * (Number(r.hourly_rate) || 0),
                      0
                    );
                    const visibleRows = g.rows.filter((r) => r.show_as_line_item);
                    return (
                      <div key={g.runId} className="border rounded-lg overflow-hidden">
                        <div className="flex justify-between items-center bg-gray-50 px-4 py-2 border-b">
                          <span className="font-bold text-gray-900">{g.name}</span>
                          <span className="font-semibold tabular-nums">{money(bundleTotal)}</span>
                        </div>
                        {visibleRows.length > 0 && (
                          <div className="px-4 py-2 space-y-1.5">
                            {visibleRows.map((row) => (
                              <div key={row.id} className="pl-2">
                                <div className="font-medium text-gray-800">• {row.task}</div>
                                {row.proposal_text && (
                                  <div className="pl-4 text-xs text-gray-500 italic mt-0.5">{row.proposal_text}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Checked standalone tasks — each as own line */}
                  {laborGroups
                    .filter((g) => g.type === "row" && g.row.show_as_line_item)
                    .map((g) => {
                      if (g.type !== "row") return null;
                      const rowTotal = (Number(g.row.man_hours) || 0) * (Number(g.row.hourly_rate) || 0);
                      return (
                        <div key={g.row.id} className="border rounded-lg overflow-hidden">
                          <div className="flex justify-between items-center px-4 py-2">
                            <div>
                              <div className="font-bold text-gray-900">{g.row.task}</div>
                              {g.row.proposal_text && (
                                <div className="text-xs text-gray-500 italic mt-0.5">{g.row.proposal_text}</div>
                              )}
                            </div>
                            <span className="font-semibold tabular-nums ml-4">{money(rowTotal)}</span>
                          </div>
                        </div>
                      );
                    })}

                  {/* Unchecked standalone tasks — grouped under General Labor */}
                  {(() => {
                    const ungrouped = laborGroups.filter(
                      (g) => g.type === "row" && !g.row.show_as_line_item
                    );
                    if (ungrouped.length === 0) return null;
                    const groupTotal = ungrouped.reduce((sum, g) => {
                      if (g.type !== "row") return sum;
                      return sum + (Number(g.row.man_hours) || 0) * (Number(g.row.hourly_rate) || 0);
                    }, 0);
                    return (
                      <div className="border rounded-lg overflow-hidden">
                        <div className="flex justify-between items-center bg-gray-50 px-4 py-2 border-b">
                          <span className="font-bold text-gray-900">Additional Services</span>
                          <span className="font-semibold tabular-nums">{money(groupTotal)}</span>
                        </div>
                        <div className="px-4 py-2 space-y-1">
                          {ungrouped.map((g) => {
                            if (g.type !== "row") return null;
                            return (
                              <div key={g.row.id} className="pl-2">
                                <div className="text-gray-700">• {g.row.task}</div>
                                {g.row.proposal_text && (
                                  <div className="pl-4 text-xs text-gray-500 italic mt-0.5">{g.row.proposal_text}</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Project pricing */}
              <div className="border-t pt-4 space-y-1">
                <div className="flex justify-between text-base font-bold text-gray-900">
                  <span>Project Price</span>
                  <span>{money(sellRounded)}</span>
                </div>
                {prepayEnabled && (
                  <div className="flex justify-between text-sm font-semibold text-emerald-700">
                    <span>Prepay Price (check discount)</span>
                    <span>{money(sellWithPrepay)}</span>
                  </div>
                )}
              </div>

            </div>
          </div>
        </>
      )}
      </div>
    </div>
  );
}
