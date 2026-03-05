// src/app/atlasbid/bids/[id]/scope/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import DebugPanel from "./DebugPanel";

type Bid = {
  id: string;
  client_name?: string | null;
  client_last_name?: string | null;
  division_id?: string | null; // uuid
  status_id?: string | null;
  trucking_hours?: number | null; // persisted
};

type Division = {
  id: string; // uuid
  name: string;
  is_active?: boolean;
};

type LaborRow = {
  id: string;
  bid_id: string;
  task: string;
  item: string;
  quantity: number;
  unit: string;
  man_hours: number;
  hourly_rate: number;
  created_at?: string;
};

type BidSettings = {
  division_id: string;
  margin_default: number; // could be 50 or 0.5 depending on what's stored
  contingency_pct: number; // could be 3 or 0.03
  round_up_increment: number; // typically 100
  prepay_discount_pct: number; // could be 3 or 0.03
};

type TaskCatalogRow = {
  id: string;
  division_id: string;
  name: string;
  unit?: string | null;
  minutes_per_unit?: number | null;
  default_qty?: number | null;
  notes?: string | null;
  min_qty?: number | null;
  round_qty_to?: number | null;
  seasonal_multiplier?: number | null;
  difficulty_multiplier?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
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
  return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

/**
 * ✅ Controlled units:
 * - We STORE standardized values (like "yd") regardless of label.
 * - "yd(s)" displays but saves as "yd".
 */
const UNIT_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "yd(s)", value: "yd" },
  { label: "sq ft", value: "sqft" },
  { label: "lin ft", value: "lf" },
  { label: "ea", value: "ea" },
  { label: "tons", value: "ton" },
  { label: "loads", value: "load" },
  { label: "hours", value: "hr" },
];

function normalizeUnitToControlledValue(u?: string | null): string | null {
  const raw = String(u ?? "").trim().toLowerCase();
  if (!raw) return null;

  // Common synonyms → our controlled values
  const map: Record<string, string> = {
    "yd": "yd",
    "yds": "yd",
    "yard": "yd",
    "yards": "yd",
    "yd(s)": "yd",

    "sqft": "sqft",
    "sq ft": "sqft",
    "square feet": "sqft",
    "square foot": "sqft",

    "lf": "lf",
    "lin ft": "lf",
    "linear feet": "lf",
    "linear foot": "lf",

    "ea": "ea",
    "each": "ea",

    "ton": "ton",
    "tons": "ton",

    "load": "load",
    "loads": "load",

    "hr": "hr",
    "hrs": "hr",
    "hour": "hr",
    "hours": "hr",
  };

  const mapped = map[raw] ?? null;
  if (!mapped) return null;

  const allowed = new Set(UNIT_OPTIONS.map((x) => x.value));
  return allowed.has(mapped) ? mapped : null;
}

function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export default function BidScopePage() {
  const params = useParams();
  const bidId = String((params as any)?.id || "");

  const [loading, setLoading] = useState(true);
  const [bid, setBid] = useState<Bid | null>(null);
  const [error, setError] = useState<string>("");

  // Division gate
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [divisionPick, setDivisionPick] = useState<string>("");
  const [savingDivision, setSavingDivision] = useState(false);

  // Labor
  const [labor, setLabor] = useState<LaborRow[]>([]);
  const [task, setTask] = useState("");
  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState<number>(0);

  // ✅ Unit now controlled
  const [unit, setUnit] = useState<string>("yd");
  const [hours, setHours] = useState<number>(0);

  // Rates/settings
  const [divisionRate, setDivisionRate] = useState<number>(0); // 1 standard rate per division
  const [targetGpPct, setTargetGpPct] = useState<number>(50);
  const [contingencyPct, setContingencyPct] = useState<number>(3);
  const [roundUpIncrement, setRoundUpIncrement] = useState<number>(100);
  const [prepayDiscountPct, setPrepayDiscountPct] = useState<number>(3);
  const [prepayEnabled, setPrepayEnabled] = useState<boolean>(false);

  // Trucking (Landscaping only, uses same division rate)
  const [truckingHours, setTruckingHours] = useState<number>(0);

  // Trucking autosave UX
  const [savingTrucking, setSavingTrucking] = useState(false);
  const [truckingSaveError, setTruckingSaveError] = useState<string | null>(null);

  // ✅ Task Catalog (type-to-search)
  const [taskCatalog, setTaskCatalog] = useState<TaskCatalogRow[]>([]);
  const [taskQuery, setTaskQuery] = useState<string>("");
  const [taskOpen, setTaskOpen] = useState<boolean>(false);
  const [selectedTask, setSelectedTask] = useState<TaskCatalogRow | null>(null);
  const [saveToCatalog, setSaveToCatalog] = useState<boolean>(false);
  const taskBoxRef = useRef<HTMLDivElement | null>(null);

  async function loadAll() {
    if (!bidId) return;
    setLoading(true);
    setError("");

    try {
      // 1) Load bid (API returns { data })
      const bRes = await fetch(`/api/bids/${bidId}`, { cache: "no-store" });
      const bJson = await bRes.json();
      const b: Bid | null = bJson?.data ?? null;

      if (!b) {
        setBid(null);
        setLoading(false);
        return;
      }

      setBid(b);

      // hydrate trucking hours from DB
      setTruckingHours(Number(b.trucking_hours ?? 0));

      // 2) Load divisions for gate
      const dRes = await fetch(`/api/divisions`, { cache: "no-store" });
      const dJson = await dRes.json();
      const divs: Division[] = dJson?.divisions ?? dJson?.data ?? dJson ?? [];
      const cleaned = Array.isArray(divs) ? divs : [];
      setDivisions(cleaned);

      // Preselect
      if (b.division_id) setDivisionPick(b.division_id);

      // Stop here if division not chosen yet
      if (!b.division_id) {
        setLoading(false);
        return;
      }

      const divisionId = b.division_id;

      // 3) Pull division rate from /api/labor-rates (1 per division)
      const rateRes = await fetch(`/api/labor-rates`, { cache: "no-store" });
      const rateJson = await rateRes.json();

      const rateRow =
        Array.isArray(rateJson?.rates) && rateJson.rates.length > 0
          ? (rateJson.rates as any[]).find((r) => r.division_id === divisionId)
          : null;

      setDivisionRate(Number(rateRow?.hourly_rate ?? 0));

      // 4) Bid settings (ops)
      const sRes = await fetch(`/api/atlasbid/bid-settings?division_id=${divisionId}`, {
        cache: "no-store",
      });
      const sJson = await sRes.json();
      const settings: BidSettings | null = sJson?.settings ?? sJson?.data ?? null;

      if (settings) {
        const marginDefault = normalizePercent(settings.margin_default);
        const contPct = normalizePercent(settings.contingency_pct);
        const prepayPct = normalizePercent(settings.prepay_discount_pct);
        const roundInc = Number(settings.round_up_increment || 0);

        setTargetGpPct(marginDefault || 50);
        setContingencyPct(contPct || 0);
        setPrepayDiscountPct(prepayPct || 0);
        setRoundUpIncrement(roundInc || 0);
      } else {
        setTargetGpPct(50);
        setContingencyPct(3);
        setPrepayDiscountPct(3);
        setRoundUpIncrement(100);
      }

      // 5) Labor rows for this bid
      const lRes = await fetch(`/api/atlasbid/bid-labor?bid_id=${bidId}`, { cache: "no-store" });
      const lJson = await lRes.json();
      setLabor(lJson?.rows || lJson?.data || []);

      // 6) ✅ Task catalog (division-scoped)
      const tRes = await fetch(`/api/task-catalog?division_id=${encodeURIComponent(divisionId)}`, {
        cache: "no-store",
      });
      const tJson = await tRes.json();
      const tasks: TaskCatalogRow[] = tJson?.data ?? [];
      setTaskCatalog(Array.isArray(tasks) ? tasks : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load scope.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bidId]);

  // Close task dropdown on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!taskBoxRef.current) return;
      const el = taskBoxRef.current;
      if (el.contains(e.target as any)) return;
      setTaskOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Debounced autosave for trucking hours (persists to bids.trucking_hours)
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
          body: JSON.stringify({ trucking_hours: Number(truckingHours) || 0 }),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error?.message || json?.error || "Failed to save trucking hours");
        }
        setBid(json?.data ?? bid);
      } catch (e: any) {
        setTruckingSaveError(e?.message || "Failed to save trucking hours");
      } finally {
        setSavingTrucking(false);
      }
    }, 600);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [truckingHours, bid?.id, loading]);

  // ---- Labor calcs ----
  const laborSubtotal = useMemo(() => {
    return labor.reduce((sum, r) => sum + (Number(r.man_hours) || 0) * (Number(r.hourly_rate) || 0), 0);
  }, [labor]);

  const truckingCost = useMemo(() => {
    return (Number(truckingHours) || 0) * (Number(divisionRate) || 0);
  }, [truckingHours, divisionRate]);

  const laborPlusTrucking = useMemo(() => {
    return laborSubtotal + truckingCost;
  }, [laborSubtotal, truckingCost]);

  // contingency calculated but hidden
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
      if (!res.ok) throw new Error(json?.error?.message || json?.error || "Failed to save division.");

      // Reset task UI when division changes
      setTask("");
      setTaskQuery("");
      setSelectedTask(null);
      setTaskCatalog([]);

      await loadAll();
    } catch (e: any) {
      setError(e?.message || "Failed to save division.");
    } finally {
      setSavingDivision(false);
    }
  }

  const filteredTasks = useMemo(() => {
    const q = taskQuery.trim().toLowerCase();
    if (!q) return taskCatalog.slice(0, 30);

    // prioritize startsWith, then includes
    const starts = taskCatalog.filter((t) => (t.name || "").toLowerCase().startsWith(q));
    const includes = taskCatalog.filter(
      (t) => !(t.name || "").toLowerCase().startsWith(q) && (t.name || "").toLowerCase().includes(q)
    );

    return [...starts, ...includes].slice(0, 30);
  }, [taskCatalog, taskQuery]);

  function chooseTask(t: TaskCatalogRow) {
    setSelectedTask(t);
    setTask(t.name || "");
    setTaskQuery(t.name || "");
    setTaskOpen(false);

    // try to apply catalog unit if it matches controlled units
    const normalized = normalizeUnitToControlledValue(t.unit);
    if (normalized) setUnit(normalized);

    // apply default qty if present
    const dq = Number(t.default_qty);
    if (Number.isFinite(dq) && dq > 0) setQuantity(dq);
  }

  async function maybeSaveTaskToCatalog() {
    if (!saveToCatalog) return;
    if (!bid?.division_id) return;

    const name = task.trim();
    if (!name) return;

    // If it's already from catalog or already exists by name, skip
    if (selectedTask && sameName(selectedTask.name || "", name)) return;
    const exists = taskCatalog.some((t) => sameName(t.name || "", name));
    if (exists) return;

    // Derive minutes_per_unit if possible
    const qty = Number(quantity) || 0;
    const hrs = Number(hours) || 0;
    const minutes_per_unit = qty > 0 && hrs > 0 ? (hrs * 60) / qty : null;

    const payload = {
      division_id: bid.division_id,
      name,
      unit: unit || null,
      minutes_per_unit: minutes_per_unit && Number.isFinite(minutes_per_unit) ? Number(minutes_per_unit.toFixed(4)) : null,
      default_qty: qty > 0 ? qty : null,
      notes: null,
      min_qty: null,
      round_qty_to: null,
      seasonal_multiplier: null,
      difficulty_multiplier: null,
    };

    const res = await fetch(`/api/task-catalog`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Don't fail the whole labor add if catalog-save fails—just show error
      throw new Error(json?.error || "Failed to save task to catalog");
    }

    // Update local catalog list
    if (json?.data?.id) {
      setTaskCatalog((prev) => {
        const next = [...prev, json.data as TaskCatalogRow];
        next.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
        return next;
      });
    }
  }

  async function addLabor() {
    setError("");

    if (!task.trim()) return setError("Task is required.");
    if (!item.trim()) return setError("Item is required.");
    if ((Number(hours) || 0) <= 0) return setError("Hours must be > 0.");
    if ((Number(divisionRate) || 0) <= 0) return setError("Division rate is 0. Set the division + rate first.");
    if (!unit) return setError("Unit is required.");

    const res = await fetch(`/api/atlasbid/bid-labor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bid_id: bidId,
        task: task.trim(),
        item: item.trim(),
        quantity: Number(quantity) || 0,
        unit: unit, // standardized
        man_hours: Number(hours) || 0,
        hourly_rate: Number(divisionRate) || 0,
      }),
    });

    const json = await res.json();
    if (res.ok) {
      const row = json?.row ?? json?.data;
      if (row) setLabor((prev) => [...prev, row]);

      // optional: save task to catalog
      try {
        await maybeSaveTaskToCatalog();
      } catch (e: any) {
        // show as non-blocking warning
        setError(`Labor added, but catalog save failed: ${e?.message || "Unknown error"}`);
      }

      // reset input fields
      setTask("");
      setTaskQuery("");
      setSelectedTask(null);
      setItem("");
      setQuantity(0);
      setUnit("yd"); // reset to yd(s)
      setHours(0);
    } else {
      setError(json?.error?.message || json?.error || "Error adding labor");
    }
  }

  async function deleteLaborRow(rowId: string) {
    setError("");
    const res = await fetch(`/api/atlasbid/bid-labor/${rowId}`, { method: "DELETE" });
    if (res.ok) setLabor((prev) => prev.filter((r) => r.id !== rowId));
    else setError("Failed to delete labor row");
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
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <div className="text-sm text-gray-500">
          Bid: <span className="font-mono">{bid.id}</span> • Client:{" "}
          <span className="font-semibold">
            {[bid.client_name, bid.client_last_name].filter(Boolean).join(" ") || "—"}
          </span>
        </div>
        <h1 className="text-3xl font-bold mt-1">Scope</h1>
        <div className="text-sm text-gray-600 mt-1">
          Division: <span className="font-semibold">{divisionName}</span>
        </div>

        {isDebug ? <DebugPanel bidId={bid.id} /> : null}
      </div>

      {/* Error */}
      {error ? (
        <div className="border border-red-200 bg-red-50 text-red-700 rounded p-3 text-sm">{error}</div>
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
            <select className="border rounded p-2 w-full" value={divisionPick} onChange={(e) => setDivisionPick(e.target.value)}>
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
          {/* LABOR BUILDER */}
          <div className="border rounded-lg p-6 space-y-4">
            <div className="flex items-start justify-between gap-6">
              <div>
                <h2 className="text-xl font-semibold">Labor Builder</h2>
                <div className="text-sm text-gray-500">
                  Division rate (used for labor + trucking):{" "}
                  <span className="font-semibold">{money(divisionRate)} / hr</span>
                </div>
              </div>

              <div className="text-right">
                <div className="text-sm text-gray-500">Labor Subtotal</div>
                <div className="text-2xl font-bold">{money(laborSubtotal)}</div>
              </div>
            </div>

            {/* Column headers ABOVE inputs */}
            <div className="grid grid-cols-6 gap-4 text-xs font-semibold text-gray-600">
              <div>Task</div>
              <div>Item</div>
              <div>Qty</div>
              <div>Unit</div>
              <div>Hours</div>
              <div className="text-right">Action</div>
            </div>

            <div className="grid grid-cols-6 gap-4 items-start">
              {/* ✅ TASK: type-to-search catalog */}
              <div className="relative" ref={taskBoxRef}>
                <input
                  className="border p-2 rounded w-full"
                  placeholder="Type to search tasks…"
                  value={taskQuery}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTaskQuery(v);
                    setTask(v);
                    setSelectedTask(null);
                    setTaskOpen(true);
                  }}
                  onFocus={() => setTaskOpen(true)}
                />

                {taskOpen ? (
                  <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-72 overflow-auto">
                    {filteredTasks.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-500">
                        No matches. Keep typing and you can still add manually.
                      </div>
                    ) : (
                      filteredTasks.map((t) => {
                        const unitLabel = t.unit ? ` • ${t.unit}` : "";
                        const dq = Number(t.default_qty);
                        const dqLabel = Number.isFinite(dq) && dq > 0 ? ` • default qty ${dq}` : "";
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => chooseTask(t)}
                            className="w-full text-left px-3 py-2 hover:bg-emerald-50"
                          >
                            <div className="text-sm font-medium text-gray-900">{t.name}</div>
                            <div className="text-xs text-gray-500">
                              {unitLabel}
                              {dqLabel}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                ) : null}

                {/* small helper row */}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={saveToCatalog}
                      onChange={(e) => setSaveToCatalog(e.target.checked)}
                    />
                    Save to Task Catalog
                  </label>

                  {selectedTask?.id ? (
                    <span className="text-xs text-emerald-700 font-semibold">Selected</span>
                  ) : (
                    <span className="text-xs text-gray-400">Optional</span>
                  )}
                </div>
              </div>

              {/* ITEM */}
              <input
                className="border p-2 rounded"
                placeholder="e.g. Mulch"
                value={item}
                onChange={(e) => setItem(e.target.value)}
              />

              {/* QTY */}
              <input
                className="border p-2 rounded"
                type="number"
                placeholder="0"
                value={Number.isFinite(quantity) ? quantity : 0}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />

              {/* ✅ controlled unit dropdown */}
              <select className="border p-2 rounded" value={unit} onChange={(e) => setUnit(e.target.value)}>
                {UNIT_OPTIONS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>

              {/* HOURS */}
              <input
                className="border p-2 rounded"
                type="number"
                placeholder="0"
                value={Number.isFinite(hours) ? hours : 0}
                onChange={(e) => setHours(Number(e.target.value))}
              />

              {/* ACTION */}
              <div className="text-right">
                <button onClick={addLabor} className="bg-emerald-700 text-white rounded px-4 py-2">
                  Add
                </button>
              </div>
            </div>

            {/* Table headers */}
            <div className="grid grid-cols-8 gap-4 font-semibold text-sm border-b pb-2 mt-4">
              <div>Task</div>
              <div>Item</div>
              <div>Qty</div>
              <div>Unit</div>
              <div>Hours</div>
              <div>Rate ($/hr)</div>
              <div>Total ($)</div>
              <div></div>
            </div>

            {labor.length === 0 ? (
              <div className="text-gray-400 text-sm py-3">No labor added yet.</div>
            ) : (
              labor.map((row) => {
                const rowTotal = (Number(row.man_hours) || 0) * (Number(row.hourly_rate) || 0);
                return (
                  <div key={row.id} className="grid grid-cols-8 gap-4 border p-2 rounded text-sm items-center">
                    <div>{row.task}</div>
                    <div>{row.item}</div>
                    <div>{row.quantity}</div>
                    <div>{row.unit}</div>
                    <div>{row.man_hours}</div>
                    <div>{Number(row.hourly_rate || 0).toFixed(2)}</div>
                    <div>{rowTotal.toFixed(2)}</div>
                    <button onClick={() => deleteLaborRow(row.id)} className="text-red-600 hover:underline text-right">
                      Delete
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* TRUCKING (persisted) */}
          <div className="border rounded-lg p-6 space-y-3">
            <div className="flex items-start justify-between gap-6">
              <div>
                <h2 className="text-xl font-semibold">Trucking</h2>
                <div className="text-sm text-gray-500">
                  Single trucking entry (Landscaping only). Uses the same division rate.
                </div>
              </div>
              <div className="text-right text-sm">{savingTrucking ? <span className="text-gray-500">Saving…</span> : null}</div>
            </div>

            {truckingSaveError ? <div className="text-sm text-red-600">{truckingSaveError}</div> : null}

            <div className="grid grid-cols-3 gap-4 max-w-lg items-end">
              <div>
                <div className="text-xs font-semibold text-gray-600 mb-1">Trucking Hours</div>
                <input
                  className="border p-2 rounded w-full"
                  type="number"
                  value={Number.isFinite(truckingHours) ? truckingHours : 0}
                  onChange={(e) => setTruckingHours(Number(e.target.value))}
                />
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-600 mb-1">Rate ($/hr)</div>
                <div className="border p-2 rounded bg-gray-50">{money(divisionRate)}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-600 mb-1">Trucking Cost</div>
                <div className="border p-2 rounded bg-gray-50 font-semibold">{money(truckingCost)}</div>
              </div>
            </div>
          </div>

          {/* PRICING PREVIEW */}
          <div className="border rounded-lg p-6 space-y-5">
            <h2 className="text-xl font-semibold">Pricing Preview</h2>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="block text-sm text-gray-600">Target Gross Profit % (editable)</label>
                <input
                  className="border p-2 rounded w-full"
                  type="number"
                  value={Number.isFinite(targetGpPct) ? targetGpPct : 0}
                  onChange={(e) => setTargetGpPct(Number(e.target.value))}
                />

                <label className="inline-flex items-center gap-2 text-sm text-gray-700 pt-2">
                  <input type="checkbox" checked={prepayEnabled} onChange={(e) => setPrepayEnabled(e.target.checked)} />
                  Apply prepay discount (100% payment via check up-front)
                </label>

                <div className="text-xs text-gray-500">Rounding + contingency are “baked in” from Ops Settings (hidden from sales).</div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Labor cost</span>
                  <span className="font-semibold">{money(laborSubtotal)}</span>
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

          {/* NOTE about difficulty/season */}
          <div className="border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-2">Difficulty / Season</h2>
            <p className="text-gray-500">
              Those live in the <b>Task Catalog</b> + selection UI (Ops Center → Tasks). Scope now supports picking tasks
              quickly via type-to-search. “Save to Task Catalog” is optional for new tasks typed by sales.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
