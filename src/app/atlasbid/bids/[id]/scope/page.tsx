// src/app/atlasbid/bids/[id]/scope/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import DebugPanel from "./DebugPanel";

type Bid = {
  id: string;
  company_id?: string | null;
  client_name?: string | null;
  client_last_name?: string | null;
  division_id?: string | null;
  status_id?: string | null;
  trucking_hours?: number | null;
};

type Division = {
  id: string;
  name: string;
  is_active?: boolean;
};

type LaborRow = {
  id: string;
  bid_id: string;
  task: string;
  item: string;
  proposal_text?: string | null;
  quantity: number;
  unit: string;
  man_hours: number;
  hourly_rate: number;
  show_as_line_item?: boolean | null;
  bundle_run_id?: string | null;
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
  notes?: string | null;
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
  display_name?: string | null;
  unit?: string | null;
  unit_cost?: number | null;
  vendor?: string | null;
  sku?: string | null;
  is_active?: boolean | null;
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
  { label: "ea", value: "ea" },
  { label: "tons", value: "ton" },
  { label: "loads", value: "load" },
  { label: "hours", value: "hr" },
];

function hoursFromMinutesPerUnit(minutesPerUnit: number, qty: number) {
  const m = Number(minutesPerUnit) || 0;
  const q = Number(qty) || 0;

  if (m <= 0 || q <= 0) return 0;

  return (m * q) / 60;
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
const [bundleRunsMeta, setBundleRunsMeta] = useState<BundleRunMeta[]>([]);

// Materials (bid rows)
const [materials, setMaterials] = useState<MaterialRow[]>([]);
const addingMaterialRef = useRef(false);
const [selectedMaterialId, setSelectedMaterialId] = useState<string>("");
const [selectedTaskCatalogId, setSelectedTaskCatalogId] = useState<string>("");
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

  // Inputs (labor)
  const [task, setTask] = useState("");
  const [details, setDetails] = useState("");
  const [quantity, setQuantity] = useState<number>(0);
  const [unit, setUnit] = useState<string>("yd");
  const [hours, setHours] = useState<number>(0);

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
function normalizeMaterialText(v: unknown) {
  return String(v ?? "").trim().toLowerCase();
}

function findMatchingMaterialRow(
  rows: MaterialRow[],
  args: {
    material_id?: string | null;
    name: string;
    unit: string;
  }
) {
  const targetMaterialId = normalizeMaterialText(args.material_id);
  const targetName = normalizeMaterialText(args.name);
  const targetUnit = normalizeMaterialText(args.unit);

  return rows.find((row) => {
    const rowMaterialId = normalizeMaterialText(row.material_id);

    // Match by material_id alone — the DB unique constraint is on (bid_id, material_id)
    // so unit differences are irrelevant when we have a catalog ID on both sides.
    if (targetMaterialId && rowMaterialId) {
      return rowMaterialId === targetMaterialId;
    }

    // Name-based fallback: require unit to match to avoid merging different-unit lines.
    const rowUnit = normalizeMaterialText(row.unit);
    if (rowUnit !== targetUnit) return false;
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
      // 1) Bid
let b: any = null;

const bidCandidates = [
  `/api/atlasbid/bids/${bidId}`,
  `/api/bids/${bidId}`,
];

for (const url of bidCandidates) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) continue;

    const json = await res.json();
    const row = json?.row ?? json?.data ?? json?.bid ?? json ?? null;

    if (row && row.id) {
      b = row;
      break;
    }
  } catch {
    // try next route
  }
}

if (!b) {
  setBid(null);
  setLoading(false);
  return;
}

setBid(b);

setBidPricingDate(
  b?.pricing_date
    ? String(b.pricing_date).slice(0, 10)
    : new Date().toISOString().slice(0, 10)
);

      // 2) Divisions
      const dRes = await fetch(`/api/divisions`, { cache: "no-store" });
      const dJson = await dRes.json();

      const divs: Division[] = dJson?.divisions ?? dJson?.data ?? dJson ?? [];
      setDivisions(Array.isArray(divs) ? divs : []);

      if (b.division_id) setDivisionPick(b.division_id);

     // ✅ Materials Search (product-level search)
const mcRes = await fetch('/api/materials-search', { cache: "no-store" });
const mcJson = await mcRes.json();

const mcRows: MaterialsCatalogRow[] =
  mcJson?.rows ?? mcJson?.data ?? mcJson ?? [];

setMaterialsCatalog(
  Array.isArray(mcRows)
    ? mcRows.filter((x) => x?.is_active !== false)
    : []
);

      if (!b.division_id) {
        setLoading(false);
        return;
      }

      const divisionId = b.division_id;
// Load scope bundles for this division
setLoadingBundles(true);

try {
  const sbRes = await fetch(
    `/api/atlasbid/scope-bundles?division_id=${divisionId}`,
    { cache: "no-store" }
  );

  const sbJson = await sbRes.json();
  const sbRows = sbJson?.rows || sbJson?.data || [];

  setScopeBundles(Array.isArray(sbRows) ? sbRows : []);
} catch {
  setScopeBundles([]);
} finally {
  setLoadingBundles(false);
}
      // 3) Rate
      const rateRes = await fetch(`/api/labor-rates`, { cache: "no-store" });
      const rateJson = await rateRes.json();

      const rateRow =
        Array.isArray(rateJson?.rates) && rateJson.rates.length > 0
          ? (rateJson.rates as any[]).find((r) => r.division_id === divisionId)
          : null;

      setDivisionRate(Number(rateRow?.hourly_rate ?? 0));

      // 4) Settings
      const sRes = await fetch(`/api/atlasbid/bid-settings?division_id=${divisionId}`, {
        cache: "no-store",
      });

      const sJson = await sRes.json();
      const settings: BidSettings | null = sJson?.settings ?? sJson?.data ?? null;

      if (settings) {
        setTargetGpPct(normalizePercent(settings.margin_default) || 50);
        setContingencyPct(normalizePercent(settings.contingency_pct) || 0);
        setPrepayDiscountPct(normalizePercent(settings.prepay_discount_pct) || 0);
        setRoundUpIncrement(Number(settings.round_up_increment || 0) || 0);
      } else {
        setTargetGpPct(50);
        setContingencyPct(3);
        setPrepayDiscountPct(3);
        setRoundUpIncrement(100);
      }

      // 5) Labor rows
      const lRes = await fetch(`/api/atlasbid/bid-labor?bid_id=${bidId}`, {
        cache: "no-store",
      });

      const lJson = await lRes.json();
      setLabor(lJson?.rows || lJson?.data || []);
      const brRes = await fetch(`/api/atlasbid/bundle-runs?bid_id=${bidId}`, {
  cache: "no-store",
});
const brJson = await brRes.json();
setBundleRunsMeta(Array.isArray(brJson?.rows) ? brJson.rows : []);

      // ✅ 6) Materials rows (supports both ?bidId and ?bid_id)
      let mJson: any = null;

      const mRes1 = await fetch(`/api/atlasbid/bid-materials?bidId=${bidId}`, {
        cache: "no-store",
      });
      mJson = await mRes1.json();

      if (!mRes1.ok) {
        const mRes2 = await fetch(`/api/atlasbid/bid-materials?bid_id=${bidId}`, {
          cache: "no-store",
        });
        mJson = await mRes2.json();
      }

      const mRows = mJson?.rows || mJson?.data || mJson || [];
      setMaterials(Array.isArray(mRows) ? mRows : []);

      // 7) Task catalog
      const tRes = await fetch(`/api/task-catalog?division_id=${divisionId}`, {
        cache: "no-store",
      });

      const tJson = await tRes.json();
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
  setTemplateMaterials([]);

  if (t.unit) setUnit(t.unit);

  const nextQty =
    typeof t.default_qty === "number"
      ? Number(t.default_qty) || 0
      : Number(quantity) || 0;

  if (typeof t.default_qty === "number") setQuantity(nextQty);

  if (t.minutes_per_unit && nextQty > 0) {
    const computed = hoursFromMinutesPerUnit(t.minutes_per_unit, nextQty);
    setHours(Number.isFinite(computed) ? Number(computed.toFixed(2)) : 0);
  }

  if (!details.trim() && t.notes) {
    setDetails(String(t.notes));
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
      setTemplateMaterials(Array.isArray(json?.rows) ? json.rows : []);
    } catch {
      setTemplateMaterials([]);
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
          cost: Number(s.avg_unit_cost) || 0,
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
  function applyMaterialSelection(m: MaterialsCatalogRow) {
  const nm = (m.name || "").trim();

  setSelectedMaterialId(m.id || "");
  setMaterialName(nm);
  setMaterialSearch(nm);
  setShowMaterialResults(false);
  
  if (m.id) loadMaterialSources(m.id);

  if (m.unit) setMaterialUnit(m.unit);
  if (typeof m.unit_cost === "number") {
    setMaterialCost(Number(m.unit_cost) || 0);
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
      (sum, r) => sum + (Number(r.man_hours) || 0) * (Number(r.hourly_rate) || 0),
      0
    );
  }, [labor]);

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

const syncRes = await fetch(`/api/bids/${bidId}/sync-bundle-materials`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ bundleId: selectedBundleId }),
});

const syncJson = await syncRes.json().catch(() => null);

if (!syncRes.ok) {
  throw new Error(syncJson?.error || "Failed syncing bundle materials");
}

await loadAll();

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
    const bundleRunId = row.bundle_run_id || null;
    const showIndividually = row.show_as_line_item === true;

    if (bundleRunId && !showIndividually) {
      if (groupedBundleRunIds.has(bundleRunId)) continue;

      groupedBundleRunIds.add(bundleRunId);

      const bundleRows = labor.filter(
        (r) =>
          r.bundle_run_id === bundleRunId &&
          r.show_as_line_item !== true
      );

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
  const scopeLines = proposalGroups.map((g) => {
    if (g.type === "bundle") {
      return `• ${g.name}`;
    }

    return `• ${g.row.proposal_text || g.row.task}`;
  });

  let text = `Scope of Work
${scopeLines.join("\n")}

Project Price: ${money(sellRounded)}`;

  if (prepayEnabled) {
    text += `\nPrepay Price: ${money(sellWithPrepay)}`;
  }

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
      item: safeDetails || task.trim(),
      proposal_text: safeDetails || task.trim(),
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
  setQuantity(0);
  setUnit("yd");
  setHours(0);
  setShowTaskResults(false);
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
      await loadAll(); // refresh materials after qty subtraction
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

    const existing = findMatchingMaterialRow(materials, {
      material_id: selectedMaterialId || null,
      name: trimmedName,
      unit: materialUnit,
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

    const selectedSource =
  selectedSourceIndex !== null ? materialSources[selectedSourceIndex] : null;
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

  if (loading) return <div className="p-6">Loading…</div>;
  if (!bid) return <div className="p-6 text-red-600">Bid not found.</div>;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <div className="text-sm text-gray-500">
          Client:{" "}
          <span className="font-semibold">
            {[bid.client_name, bid.client_last_name].filter(Boolean).join(" ") || "-"}
          </span>
        </div>
        <h1 className="text-2xl font-bold mt-1">Scope of Work</h1>
        <div className="text-sm text-gray-500 mt-0.5">
          Division: <span className="font-semibold text-gray-700">{divisionName}</span>
        </div>
        {isDebug ? <DebugPanel bidId={bid.id} /> : null}
      </div>

      {/* Sticky pricing bar */}
      <div className="sticky top-0 z-20 bg-white border rounded-lg shadow-sm px-5 py-3 flex items-center gap-6 flex-wrap">
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
          {/* SCOPE BUNDLES */}
<div className="border rounded-lg overflow-hidden">
  <div className="bg-gray-50 border-b px-5 py-3">
    <h2 className="text-base font-semibold text-gray-800">Scope Bundles</h2>
    <div className="text-xs text-gray-500 mt-0.5">Load a prebuilt bundle of tasks into this bid.</div>
  </div>
  <div className="p-5 space-y-4">

  <div className="grid grid-cols-12 gap-4 items-end">
    <div className="col-span-8">
      <label className="block text-xs font-semibold text-gray-600 mb-1">
        Bundle
      </label>

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
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </div>

    <div className="col-span-4">
      <button
        onClick={loadSelectedBundleIntoBid}
        disabled={
          !selectedBundleId ||
          loadingBundleIntoBid ||
          loadingBundleQuestions
        }
        className="bg-emerald-700 text-white rounded px-4 py-2 h-10 w-full disabled:opacity-50"
      >
        {loadingBundleIntoBid ? "Loading…" : "Load Bundle"}
      </button>
    </div>
  </div>

  {loadingBundles ? (
    <div className="text-sm text-gray-500">Loading bundles…</div>
  ) : null}

  {selectedBundleId && bundleQuestions.length > 0 ? (
  <div className="border rounded p-3 bg-gray-50 text-sm space-y-3">
    <div className="font-semibold mb-1">Bundle Questions</div>

    {bundleQuestions.map((q) => (
      <div key={q.id} className="space-y-1">
        <label className="block text-xs font-semibold text-gray-600">
          {q.label}
          {q.unit ? ` (${q.unit})` : ""}
        </label>

        {q.input_type === "number" ? (
          <input
            type="number"
            className="border p-2 rounded w-full"
            value={bundleAnswers[q.question_key] ?? ""}
            onChange={(e) =>
              setBundleAnswers((prev) => ({
                ...prev,
                [q.question_key]: Number(e.target.value),
              }))
            }
          />
        ) : q.input_type === "checkbox" ? (
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={bundleAnswers[q.question_key] === true}
              onChange={(e) =>
                setBundleAnswers((prev) => ({
                  ...prev,
                  [q.question_key]: e.target.checked,
                }))
              }
            />
            <span>{q.label}</span>
          </label>
        ) : (
          <input
            type="text"
            className="border p-2 rounded w-full"
            value={bundleAnswers[q.question_key] ?? ""}
            onChange={(e) =>
              setBundleAnswers((prev) => ({
                ...prev,
                [q.question_key]: e.target.value,
              }))
            }
          />
        )}

        {q.help_text ? (
          <div className="text-xs text-gray-500">{q.help_text}</div>
        ) : null}
      </div>
    ))}
  </div>
) : null}
  </div>
</div>
{/* LABOR BUILDER */}
<div className="border rounded-lg overflow-hidden">
  <div className="bg-gray-50 border-b px-5 py-3 flex items-center justify-between">
    <h2 className="text-base font-semibold text-gray-800">Labor Builder</h2>
    <span className="text-sm font-bold text-gray-800">{money(laborSubtotal)}</span>
  </div>
  <div className="p-5 space-y-4">

  {/* Single header row */}
  <div className="grid grid-cols-[28px_2fr_2fr_70px_80px_70px_88px_58px] gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide px-2">
    <div></div>
    <div>Task</div>
    <div>Details</div>
    <div className="text-center">Qty</div>
    <div className="text-center">Unit</div>
    <div className="text-center">Hrs</div>
    <div className="text-center">Total</div>
    <div className="text-center">Action</div>
  </div>

  {/* Add row */}
  <div className="grid grid-cols-[28px_2fr_2fr_70px_80px_70px_88px_58px] gap-2 items-center px-2">
    <div className="flex justify-center">
      <label className="flex items-center justify-center">
        <input
          type="checkbox"
          checked={saveToCatalog}
          onChange={(e) => setSaveToCatalog(e.target.checked)}
        />
      </label>
    </div>

    <div ref={taskDropdownRef}>
      <div className="relative">
        <input
          className="border rounded w-full h-9 px-3"
          placeholder="Task name…"
          value={taskSearch}
          onChange={(e) => {
            const v = e.target.value;
            setTaskSearch(v);
            setTask(v);
            setShowTaskResults(true);
          }}
          onFocus={() => setShowTaskResults(true)}
        />

        {showTaskResults && filteredTasks.length > 0 ? (
          <div className="absolute z-20 bg-white border rounded shadow w-full max-h-60 overflow-auto mt-1">
            {filteredTasks.map((t) => (
              <div
                key={t.id}
                className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                onClick={() => applyTaskSelection(t)}
              >
                {t.name}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>

    <div>
      <input
        className="border rounded w-full h-9 px-3"
        placeholder="Details"
        autoComplete="off"
        value={details}
        onFocus={() => setShowTaskResults(false)}
        onChange={(e) => setDetails(e.target.value)}
      />
    </div>

    <div>
      <input
        className="border rounded w-full h-9 px-3 text-center"
        type="number"
        placeholder=""
        value={quantity === 0 ? "" : quantity}
        onChange={(e) => setQuantity(Number(e.target.value))}
      />
    </div>

    <div>
      <select
        className="border rounded w-full h-9 px-2"
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
      >
        {UNIT_OPTIONS.map((u) => (
          <option key={u.value} value={u.value}>
            {u.label}
          </option>
        ))}
      </select>
    </div>

    <div>
      <input
        className="border rounded w-full h-9 px-3 text-center"
        type="number"
        placeholder=""
        value={hours === 0 ? "" : hours}
        onChange={(e) => setHours(Number(e.target.value))}
      />
    </div>

    <div className="text-right text-sm text-gray-400 tabular-nums">—</div>

    <div className="text-right">
      <button
        onClick={addLabor}
        className="bg-emerald-700 text-white rounded h-9 px-4"
      >
        Add
      </button>
    </div>
  </div>

  {/* Save to Catalog helper row */}
  <div className="grid grid-cols-[28px_2fr_2fr_70px_80px_70px_88px_58px] gap-2 items-center -mt-1 px-2">
    <div></div>
    <div className="text-xs text-gray-600">
      Save to Catalog
    </div>
    <div></div>
    <div></div>
    <div></div>
    <div></div>
    <div className="text-right text-[11px] text-gray-500">
      {savingToCatalog ? "Saving…" : saveToCatalogMsg || ""}
    </div>
    <div></div>
  </div>

  {labor.length === 0 ? (
  <div className="text-gray-400 text-sm py-4 border rounded px-3">
    No labor added yet.
  </div>
) : (
  <div className="space-y-3 pt-1">
    {laborGroups.map((g) => {
      if (g.type === "row") {
        const row = g.row;
        const rowTotal = (Number(row.man_hours) || 0) * (Number(row.hourly_rate) || 0);
        return (
          <div
            key={row.id}
            className="grid grid-cols-[28px_2fr_2fr_70px_80px_70px_88px_58px] gap-2 border rounded px-2 py-2 text-sm items-center"
          >
            <div className="flex justify-center">
              <input
                className="w-4 h-4"
                type="checkbox"
                checked={row.show_as_line_item === true}
                onChange={async (e) => {
                  const checked = e.target.checked;
                  await fetch(`/api/atlasbid/bid-labor/${row.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ show_as_line_item: checked }),
                  });
                  setLabor((prev) =>
                    prev.map((r) => r.id === row.id ? { ...r, show_as_line_item: checked } : r)
                  );
                }}
              />
            </div>
            <div className="font-medium leading-tight truncate">{row.task}</div>
            <div>
              <input
                className="border rounded w-full h-9 px-3 text-sm"
                autoComplete="off"
                value={row.proposal_text ?? row.task}
                onChange={(e) => {
                  const value = e.target.value;
                  setLabor((prev) =>
                    prev.map((r) => r.id === row.id ? { ...r, proposal_text: value } : r)
                  );
                }}
                onBlur={async (e) => {
                  await fetch(`/api/atlasbid/bid-labor/${row.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ proposal_text: e.target.value }),
                  });
                }}
              />
            </div>
            <div>
              <input
                className="border rounded w-full h-9 px-3 text-center"
                type="number"
                value={row.quantity === 0 ? "" : row.quantity}
                onChange={(e) => {
                  const raw = e.target.value;
                  const value = raw === "" ? 0 : Math.max(0, parseFloat(raw) || 0);
                  setLabor((prev) =>
                    prev.map((r) => r.id === row.id ? { ...r, quantity: value } : r)
                  );
                }}
                onBlur={async (e) => {
                  const raw = e.target.value;
                  const value = raw === "" ? 0 : Math.max(0, parseFloat(raw) || 0);
                  try {
                    const res = await fetch(`/api/atlasbid/bid-labor/${row.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ quantity: value, unit: row.unit, man_hours: row.man_hours, is_overridden: true }),
                    });
                    if (!res.ok) console.error("Failed to save labor row", await res.json());
                  } catch (err) {
                    console.error("Labor autosave failed", err);
                  }
                }}
              />
            </div>
            <div className="text-center text-sm">{row.unit}</div>
            <div>
              <input
                className="border rounded w-full h-9 px-3 text-center"
                type="number"
                step="0.01"
                value={row.man_hours === 0 ? "" : row.man_hours}
                onChange={(e) => {
                  const raw = e.target.value;
                  const value = raw === "" ? 0 : Math.max(0, parseFloat(raw) || 0);
                  setLabor((prev) =>
                    prev.map((r) => r.id === row.id ? { ...r, man_hours: value } : r)
                  );
                }}
                onBlur={async (e) => {
                  const raw = e.target.value;
                  const value = raw === "" ? 0 : Math.max(0, parseFloat(raw) || 0);
                  await fetch(`/api/atlasbid/bid-labor/${row.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ man_hours: value, is_overridden: true }),
                  });
                }}
              />
            </div>
            <div className="text-center font-medium tabular-nums">
              {rowTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-center">
              <button onClick={() => deleteLaborRow(row.id)} className="text-red-600 hover:underline text-sm">
                Delete
              </button>
            </div>
          </div>
        );
      }

      const bundleTotal = g.rows.reduce(
        (sum, r) => sum + (Number(r.man_hours) || 0) * (Number(r.hourly_rate) || 0),
        0
      );

      return (
        <div key={g.runId} className="border rounded overflow-hidden">
          <div className="flex items-center justify-between bg-gray-50 px-3 py-2 border-b">
            <span className="text-sm font-semibold text-gray-700">{g.name}</span>
            <div className="flex items-center gap-4">
              <span className="text-sm tabular-nums text-gray-600">
                {bundleTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <button
                onClick={() => deleteBundleRun(g.runId)}
                className="text-red-600 hover:underline text-sm"
              >
                Remove Bundle
              </button>
            </div>
          </div>
          <div className="space-y-0 divide-y">
            {g.rows.map((row) => {
              const rowTotal = (Number(row.man_hours) || 0) * (Number(row.hourly_rate) || 0);
              return (
                <div
                  key={row.id}
                  className="grid grid-cols-[28px_2fr_2fr_70px_80px_70px_88px_58px] gap-2 px-2 py-2 text-sm items-center"
                >
                  <div className="flex justify-center">
                    <input
                      className="w-4 h-4"
                      type="checkbox"
                      checked={row.show_as_line_item === true}
                      onChange={async (e) => {
                        const checked = e.target.checked;
                        await fetch(`/api/atlasbid/bid-labor/${row.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ show_as_line_item: checked }),
                        });
                        setLabor((prev) =>
                          prev.map((r) => r.id === row.id ? { ...r, show_as_line_item: checked } : r)
                        );
                      }}
                    />
                  </div>
                  <div className="font-medium leading-tight truncate">{row.task}</div>
                  <div>
                    <input
                      className="border rounded w-full h-9 px-3 text-sm"
                      autoComplete="off"
                      value={row.proposal_text ?? row.task}
                      onChange={(e) => {
                        const value = e.target.value;
                        setLabor((prev) =>
                          prev.map((r) => r.id === row.id ? { ...r, proposal_text: value } : r)
                        );
                      }}
                      onBlur={async (e) => {
                        await fetch(`/api/atlasbid/bid-labor/${row.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ proposal_text: e.target.value }),
                        });
                      }}
                    />
                  </div>
                  <div>
                    <input
                      className="border rounded w-full h-9 px-3 text-center"
                      type="number"
                      value={row.quantity === 0 ? "" : row.quantity}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const value = raw === "" ? 0 : Math.max(0, parseFloat(raw) || 0);
                        setLabor((prev) =>
                          prev.map((r) => r.id === row.id ? { ...r, quantity: value } : r)
                        );
                      }}
                      onBlur={async (e) => {
                        const raw = e.target.value;
                        const value = raw === "" ? 0 : Math.max(0, parseFloat(raw) || 0);
                        try {
                          const res = await fetch(`/api/atlasbid/bid-labor/${row.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ quantity: value, unit: row.unit, man_hours: row.man_hours, is_overridden: true }),
                          });
                          if (!res.ok) console.error("Failed to save labor row", await res.json());
                        } catch (err) {
                          console.error("Labor autosave failed", err);
                        }
                      }}
                    />
                  </div>
                  <div className="text-center text-sm">{row.unit}</div>
                  <div>
                    <input
                      className="border rounded w-full h-9 px-3 text-center"
                      type="number"
                      step="0.01"
                      value={row.man_hours === 0 ? "" : row.man_hours}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const value = raw === "" ? 0 : Math.max(0, parseFloat(raw) || 0);
                        setLabor((prev) =>
                          prev.map((r) => r.id === row.id ? { ...r, man_hours: value } : r)
                        );
                      }}
                      onBlur={async (e) => {
                        const raw = e.target.value;
                        const value = raw === "" ? 0 : Math.max(0, parseFloat(raw) || 0);
                        await fetch(`/api/atlasbid/bid-labor/${row.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ man_hours: value, is_overridden: true }),
                        });
                      }}
                    />
                  </div>
                  <div className="text-center font-medium tabular-nums">
                    {rowTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-center">
                    <button onClick={() => deleteLaborRow(row.id)} className="text-red-600 hover:underline text-sm">
                      Delete
                    </button>
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
          {/* ✅ MATERIALS BUILDER (predictive search + inline edit) */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-gray-50 border-b px-5 py-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-800">Materials Builder</h2>
                <div className="text-xs text-gray-500 mt-0.5">Search your catalog, auto-fill unit + cost, then edit inline.</div>
              </div>
              <span className="text-sm font-bold text-gray-800">{money(materialsSubtotal)}</span>
            </div>
            <div className="p-5 space-y-3">

            <div className="grid grid-cols-12 gap-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <div className="col-span-3">Material</div>
              <div className="col-span-2">Source</div>
              <div className="col-span-2">Details</div>
              <div className="col-span-1 text-center">Qty</div>
              <div className="col-span-1 text-center">Unit</div>
              <div className="col-span-1 text-center">Unit Cost</div>
              <div className="col-span-2 text-center">Action</div>
            </div>

            <div className="grid grid-cols-12 gap-3 items-center">
              {/* Catalog search */}
              <div className="col-span-3" ref={materialDropdownRef}>
                <div className="relative">
                  <input
                    className="border p-2 rounded w-full h-10"
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
                    <div className="absolute z-20 bg-white border rounded shadow w-full max-h-60 overflow-auto mt-1">
                      {filteredMaterialsCatalog.map((m) => (
                        <div
                          key={m.id}
                          className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                          onClick={() => applyMaterialSelection(m)}
                        >
                          <div className="font-medium">{m.name}</div>
                          <div className="text-xs text-gray-500">
                            {m.vendor ? `Vendor: ${m.vendor} • ` : ""}
                            Unit: {m.unit || "ea"} • Cost:{" "}
                            {money(Number(m.unit_cost) || 0)}
                            {m.sku ? ` • SKU: ${m.sku}` : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
  <div className="col-span-2">
  <select
    className="border p-2 rounded w-full h-10"
    value={selectedSourceIndex ?? ""}
    onChange={(e) => {
      const idx = Number(e.target.value);
      setSelectedSourceIndex(idx);

      const src = materialSources[idx];
      if (!src) return;

      if (src.unit) setMaterialUnit(src.unit);
      if (src.cost !== undefined) setMaterialCost(Number(src.cost) || 0);
    }}
  >
    <option value="">Select source</option>

    {materialSources.map((s, i) => {
  const qty =
    s.available_qty === null || s.available_qty === undefined
      ? null
      : Number(s.available_qty);

  const qtyText =
    qty === null
      ? ""
      : qty < 0
      ? ` (Qty: ${qty.toFixed(2).replace(/\.00$/, "")} LOW)`
      : ` (Qty: ${qty.toFixed(2).replace(/\.00$/, "")})`;

  return (
    <option key={i} value={i}>
      {s.source_name} — {s.unit} @ ${Number(s.cost).toFixed(2)}
      {qtyText}
    </option>
  );
})}
  </select>
</div>
              {/* Details */}
              <div className="col-span-2">
                <input
                  className="border p-2 rounded w-full h-10"
                  placeholder="Details"
                  value={materialDetails}
                  onChange={(e) => setMaterialDetails(e.target.value)}
                />
              </div>

              {/* Qty */}
              <div className="col-span-1">
                <input
                  className="border rounded w-full h-10 px-2 text-center"
                  type="number"
                  placeholder=""
                  value={materialQty === 0 ? "" : materialQty}
                  onChange={(e) => setMaterialQty(Number(e.target.value))}
                />
              </div>

              {/* Unit */}
              <div className="col-span-1">
                <select
                  className="border p-2 rounded w-full h-10"
                  value={materialUnit}
                  onChange={(e) => setMaterialUnit(e.target.value)}
                >
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Unit Cost */}
              <div className="col-span-1">
                <input
                  className="border rounded w-full h-10 px-2 text-right"
                  type="number"
                  placeholder=""
                  value={materialCost === 0 ? "" : materialCost}
                  onChange={(e) => setMaterialCost(Number(e.target.value))}
                />
              </div>

              <div className="col-span-2">
                <button
                  type="button"
                  onClick={addMaterial}
                  className="bg-emerald-700 text-white rounded px-4 py-2 h-10 w-full"
                >
                  Add
                </button>
              </div>
            </div>

            {/* List headers */}
            <div className="grid grid-cols-12 gap-3 text-xs font-semibold text-gray-500 uppercase tracking-wide border-t pt-3 mt-1">
              <div className="col-span-3">Material</div>
              <div className="col-span-2">Source</div>
              <div className="col-span-2">Details</div>
              <div className="col-span-1 text-center">Qty</div>
              <div className="col-span-1 text-center">Unit</div>
              <div className="col-span-1 text-center">Unit Cost</div>
              <div className="col-span-1 text-center">Total</div>
              <div className="col-span-1 text-center">Actions</div>
            </div>

            {materials.length === 0 ? (
              <div className="text-gray-400 text-sm py-3">No materials added yet.</div>
            ) : (
              materials.map((row) => {
                const isEditing = editingMaterialId === row.id;

                const qty = isEditing ? Number(mEditQty) || 0 : Number(row.qty) || 0;
                const cost = isEditing ? Number(mEditUnitCost) || 0 : Number(row.unit_cost) || 0;
                const total = qty * cost;

                return (
                  <div
                    key={row.id}
                    className="grid grid-cols-12 gap-3 border rounded px-2 py-2 text-sm items-center"
                  >
                    <div className="col-span-3 font-medium truncate">
                      {isEditing ? (
                        <input
                          className="border p-2 rounded w-full"
                          value={mEditName}
                          onChange={(e) => setMEditName(e.target.value)}
                        />
                      ) : (
                        row.name
                      )}
                    </div>

                    <div className="col-span-2 text-gray-500 text-xs truncate">
                      {row.source_type || "—"}
                    </div>

                    <div className="col-span-2 text-gray-600">
                      {isEditing ? (
                        <input
                          className="border p-2 rounded w-full"
                          value={mEditDetails}
                          onChange={(e) => setMEditDetails(e.target.value)}
                          placeholder="—"
                        />
                      ) : (
                        row.details || "—"
                      )}
                    </div>

                    <div className="col-span-1 text-center tabular-nums">
                      {isEditing ? (
                        <input
                          className="border p-1 rounded w-full text-center"
                          type="number"
                          value={mEditQty === 0 ? "" : mEditQty}
                          onChange={(e) => setMEditQty(Number(e.target.value))}
                        />
                      ) : (
                        row.qty
                      )}
                    </div>

                    <div className="col-span-1 text-center">
                      {isEditing ? (
                        <select
                          className="border p-1 rounded w-full"
                          value={mEditUnit}
                          onChange={(e) => setMEditUnit(e.target.value)}
                        >
                          {UNIT_OPTIONS.map((u) => (
                            <option key={u.value} value={u.value}>
                              {u.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        row.unit
                      )}
                    </div>

                    <div className="col-span-1 text-center tabular-nums">
                      {isEditing ? (
                        <input
                          className="border p-1 rounded w-full text-right"
                          type="number"
                          value={mEditUnitCost === 0 ? "" : mEditUnitCost}
                          onChange={(e) => setMEditUnitCost(Number(e.target.value))}
                        />
                      ) : (
                        money(row.unit_cost)
                      )}
                    </div>

                    <div className="col-span-1 text-center tabular-nums">{money(total)}</div>

                    <div className="col-span-1 text-center flex justify-center gap-2">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => saveEditMaterial(row.id)}
                            className="text-emerald-700 hover:underline"
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelEditMaterial}
                            className="text-gray-600 hover:underline"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEditMaterial(row)}
                            className="text-blue-700 hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteMaterialRow(row.id)}
                            className="text-red-600 hover:underline"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
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
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Hours</div>
                <input
                  className="border rounded h-9 px-3 w-full text-right"
                  type="number"
                  value={Number.isFinite(truckingHours) ? truckingHours : 0}
                  onChange={(e) => setTruckingHours(Number(e.target.value))}
                />
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Rate ($/hr)</div>
                <div className="border rounded h-9 px-3 flex items-center bg-gray-50 text-sm tabular-nums">{money(divisionRate)}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cost</div>
                <div className="border rounded h-9 px-3 flex items-center bg-gray-50 text-sm font-semibold tabular-nums">{money(truckingCost)}</div>
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
                <input
                  className="border p-2 rounded w-full"
                  type="number"
                  value={Number.isFinite(targetGpPct) ? targetGpPct : 0}
                  onChange={(e) => setTargetGpPct(Number(e.target.value))}
                />

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
            <div className="p-5 space-y-4">

            {/* Scope Lines */}
            <div className="space-y-1 text-sm">
              {labor.length === 0 ? (
                <div className="text-gray-500">No scope items yet.</div>
              ) : (
                labor.map((row) => (
                  <div key={row.id}>• {row.proposal_text || row.task}</div>
                ))
              )}
            </div>

            {/* Pricing */}
            <div className="pt-4 border-t text-lg font-semibold space-y-1">
              <div>Project Price: {money(sellRounded)}</div>

              {prepayEnabled && (
                <div className="text-green-700">
                  Prepay Price: {money(sellWithPrepay)}
                </div>
              )}
            </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
