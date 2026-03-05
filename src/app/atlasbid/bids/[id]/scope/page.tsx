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
  item: string; // DB column; we show as "Details"
  quantity: number;
  unit: string;
  man_hours: number;
  hourly_rate: number;
  created_at?: string;
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

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function paramToString(v: unknown) {
  if (Array.isArray(v)) return String(v[0] ?? "");
  return String(v ?? "");
}

const UNIT_OPTIONS: Array<{ label: string; value: string }> = [
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

  // Inputs
  const [task, setTask] = useState("");
  const [details, setDetails] = useState(""); // UI label "Details" (NOT required)
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

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const el = taskDropdownRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setShowTaskResults(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function loadAll() {
    if (!bidId) return;
    setLoading(true);
    setError("");

    try {
      // 1) Bid
      const bRes = await fetch(`/api/bids/${bidId}`, { cache: "no-store" });
      const bJson = await bRes.json();
      const b: Bid | null = bJson?.data ?? null;

      if (!b) {
        setBid(null);
        setLoading(false);
        return;
      }
      setBid(b);
      setTruckingHours(Number(b.trucking_hours ?? 0));

      // 2) Divisions
      const dRes = await fetch(`/api/divisions`, { cache: "no-store" });
      const dJson = await dRes.json();
      const divs: Division[] = dJson?.divisions ?? dJson?.data ?? dJson ?? [];
      setDivisions(Array.isArray(divs) ? divs : []);
      if (b.division_id) setDivisionPick(b.division_id);

      if (!b.division_id) {
        setLoading(false);
        return;
      }
      const divisionId = b.division_id;

      // 3) Rate
      const rateRes = await fetch(`/api/labor-rates`, { cache: "no-store" });
      const rateJson = await rateRes.json();
      const rateRow =
        Array.isArray(rateJson?.rates) && rateJson.rates.length > 0
          ? (rateJson.rates as any[]).find((r) => r.division_id === divisionId)
          : null;
      setDivisionRate(Number(rateRow?.hourly_rate ?? 0));

      // 4) Settings
      const sRes = await fetch(`/api/atlasbid/bid-settings?division_id=${divisionId}`, { cache: "no-store" });
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
      const lRes = await fetch(`/api/atlasbid/bid-labor?bid_id=${bidId}`, { cache: "no-store" });
      const lJson = await lRes.json();
      setLabor(lJson?.rows || lJson?.data || []);

      // 6) Task catalog
      const tRes = await fetch(`/api/task-catalog?division_id=${divisionId}`, { cache: "no-store" });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          body: JSON.stringify({ trucking_hours: Number(truckingHours) || 0 }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error?.message || json?.error || "Failed to save trucking hours");
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

  const filteredTasks = useMemo(() => {
    const q = taskSearch.trim().toLowerCase();
    if (!q) return taskCatalog.slice(0, 20);
    return taskCatalog.filter((t) => (t.name || "").toLowerCase().includes(q)).slice(0, 20);
  }, [taskSearch, taskCatalog]);

  function applyTaskSelection(t: TaskCatalogRow) {
    const name = (t.name || "").trim();
    setTask(name);
    setTaskSearch(name);
    setShowTaskResults(false);

    if (t.unit) setUnit(t.unit);
    const nextQty = typeof t.default_qty === "number" ? Number(t.default_qty) || 0 : Number(quantity) || 0;
    if (typeof t.default_qty === "number") setQuantity(nextQty);

    if (t.minutes_per_unit && nextQty > 0) {
      const computed = hoursFromMinutesPerUnit(t.minutes_per_unit, nextQty);
      setHours(Number.isFinite(computed) ? Number(computed.toFixed(2)) : 0);
    }

    // Optional convenience: if details empty, use notes
    if (!details.trim() && t.notes) setDetails(String(t.notes));
  }

  // ---- Labor calcs ----
  const laborSubtotal = useMemo(() => {
    return labor.reduce((sum, r) => sum + (Number(r.man_hours) || 0) * (Number(r.hourly_rate) || 0), 0);
  }, [labor]);

  const truckingCost = useMemo(() => (Number(truckingHours) || 0) * (Number(divisionRate) || 0), [truckingHours, divisionRate]);
  const laborPlusTrucking = useMemo(() => laborSubtotal + truckingCost, [laborSubtotal, truckingCost]);

  const contingencyCost = useMemo(() => {
    const pct = (Number(contingencyPct) || 0) / 100;
    return laborPlusTrucking * pct;
  }, [laborPlusTrucking, contingencyPct]);

  const totalCost = useMemo(() => laborPlusTrucking + contingencyCost, [laborPlusTrucking, contingencyCost]);

  const targetSell = useMemo(() => {
    const gp = (Number(targetGpPct) || 0) / 100;
    if (gp >= 1) return 0;
    return totalCost / (1 - gp);
  }, [totalCost, targetGpPct]);

  const sellRounded = useMemo(() => roundUpToIncrement(targetSell, roundUpIncrement), [targetSell, roundUpIncrement]);

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
      await loadAll();
    } catch (e: any) {
      setError(e?.message || "Failed to save division.");
    } finally {
      setSavingDivision(false);
    }
  }

  async function addLabor() {
    setError("");
    setSaveToCatalogMsg("");

    if (!task.trim()) return setError("Task is required.");
    // ✅ Details is OPTIONAL (no validation here)
    if ((Number(hours) || 0) <= 0) return setError("Hours must be > 0.");
    if ((Number(divisionRate) || 0) <= 0) return setError("Division rate is 0. Set the division + rate first.");
    if (!unit) return setError("Unit is required.");

    // ✅ Always send a safe "item" value so API/DB can't reject null
    const safeDetails = details.trim(); // may be ""
    const res = await fetch(`/api/atlasbid/bid-labor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bid_id: bidId,
        task: task.trim(),
        item: safeDetails, // may be empty string ✅
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

    // Optional: save to task catalog
    if (saveToCatalog && bid?.division_id && isUuid(bid.division_id)) {
      setSavingToCatalog(true);
      try {
        const qtyNum = Number(quantity) || 0;
        const hoursNum = Number(hours) || 0;
        const minutesPerUnit = qtyNum > 0 ? (hoursNum * 60) / qtyNum : null;

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
              const exists = prev.some((p) => p.id === newRow.id);
              if (exists) return prev;
              return [...prev, newRow].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
            });
          }
        }
      } catch {
        setSaveToCatalogMsg("Could not save task to catalog.");
      } finally {
        setSavingToCatalog(false);
      }
    }

    // Reset
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
          <span className="font-semibold">{[bid.client_name, bid.client_last_name].filter(Boolean).join(" ") || "—"}</span>
        </div>
        <h1 className="text-3xl font-bold mt-1">Scope</h1>
        <div className="text-sm text-gray-600 mt-1">
          Division: <span className="font-semibold">{divisionName}</span>
        </div>
        {isDebug ? <DebugPanel bidId={bid.id} /> : null}
      </div>

      {error ? <div className="border border-red-200 bg-red-50 text-red-700 rounded p-3 text-sm">{error}</div> : null}

      {/* Division Gate */}
      {!bid.division_id ? (
        <div className="border rounded-lg p-6 space-y-4">
          <h2 className="text-xl font-semibold">Select Division to Continue</h2>
          <p className="text-sm text-gray-600">This bid has no division yet. We must set a division before labor/rates/pricing can calculate.</p>

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

            <button className="bg-emerald-700 text-white rounded px-4 py-2 disabled:opacity-50" disabled={!divisionPick || savingDivision} onClick={saveDivision}>
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
                  Division rate (used for labor + trucking): <span className="font-semibold">{money(divisionRate)} / hr</span>
                </div>
              </div>

              <div className="text-right">
                <div className="text-sm text-gray-500">Labor Subtotal</div>
                <div className="text-2xl font-bold">{money(laborSubtotal)}</div>
              </div>
            </div>

            {/* Column labels */}
            <div className="grid grid-cols-12 gap-4 text-xs font-semibold text-gray-600">
              <div className="col-span-4">Task</div>
              <div className="col-span-3">Details (optional)</div>
              <div className="col-span-1">Qty</div>
              <div className="col-span-1">Unit</div>
              <div className="col-span-2">Hours</div>
              <div className="col-span-1 text-right">Action</div>
            </div>

           {/* Inputs row — aligned */}
<div className="grid grid-cols-12 gap-4 items-end">
  {/* Task */}
  <div className="col-span-4" ref={taskDropdownRef}>
    <div className="relative">
      <input
        className="border p-2 rounded w-full h-10"
        placeholder="Search saved tasks…"
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

    <div className="flex items-center gap-3 mt-2">
      <label className="flex items-center gap-2 text-xs text-gray-700">
        <input
          type="checkbox"
          checked={saveToCatalog}
          onChange={(e) => setSaveToCatalog(e.target.checked)}
        />
        Save to Task Catalog
      </label>
      {savingToCatalog ? <span className="text-xs text-gray-500">Saving…</span> : null}
      {saveToCatalogMsg ? <span className="text-xs text-gray-500">{saveToCatalogMsg}</span> : null}
    </div>
  </div>

  {/* Details */}
  <div className="col-span-3">
    <input
      className="border p-2 rounded w-full h-10"
      placeholder="Optional details (color, location, etc.)"
      value={details}
      onChange={(e) => setDetails(e.target.value)}
    />
  </div>

  {/* Qty */}
  <div className="col-span-1">
    <input
      className="border p-2 rounded w-full h-10"
      type="number"
      placeholder="0"
      value={Number.isFinite(quantity) ? quantity : 0}
      onChange={(e) => setQuantity(Number(e.target.value))}
    />
  </div>

  {/* Unit */}
  <div className="col-span-1">
    <select
      className="border p-2 rounded w-full h-10"
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

 

  {/* Action */}
  <div className="col-span-1 text-right">
    <button
      onClick={addLabor}
      className="bg-emerald-700 text-white rounded px-4 py-2 h-10 w-full"
    >
      Add
    </button>
  </div>
</div>
          

            {/* Table headers */}
            <div className="grid grid-cols-8 gap-4 font-semibold text-sm border-b pb-2 mt-4">
              <div>Task</div>
              <div>Details</div>
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
                    <div className="text-gray-600">{row.item || "—"}</div>
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

          {/* TRUCKING */}
          <div className="border rounded-lg p-6 space-y-3">
            <div className="flex items-start justify-between gap-6">
              <div>
                <h2 className="text-xl font-semibold">Trucking</h2>
                <div className="text-sm text-gray-500">Single trucking entry (Landscaping only). Uses the same division rate.</div>
              </div>
              <div className="text-right text-sm">{savingTrucking ? <span className="text-gray-500">Saving…</span> : null}</div>
            </div>

            {truckingSaveError ? <div className="text-sm text-red-600">{truckingSaveError}</div> : null}

            <div className="grid grid-cols-3 gap-4 max-w-lg items-end">
              <div>
                <div className="text-xs font-semibold text-gray-600 mb-1">Trucking Hours</div>
                <input className="border p-2 rounded w-full" type="number" value={Number.isFinite(truckingHours) ? truckingHours : 0} onChange={(e) => setTruckingHours(Number(e.target.value))} />
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
                <input className="border p-2 rounded w-full" type="number" value={Number.isFinite(targetGpPct) ? targetGpPct : 0} onChange={(e) => setTargetGpPct(Number(e.target.value))} />

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
      )}
    </div>
  );
