// src/app/atlasbid/bids/[id]/scope/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Bid = {
  id: string;
  client_name?: string | null;
  client_last_name?: string | null;
  division_id?: string | null; // uuid
  status_id?: string | null;
  trucking_hours?: number | null; // ✅ persisted
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

// normalize decimals like 0.5 -> 50, 0.03 -> 3
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
  const [unit, setUnit] = useState("");
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

  // ✅ Trucking autosave UX
  const [savingTrucking, setSavingTrucking] = useState(false);
  const [truckingSaveError, setTruckingSaveError] = useState<string | null>(
    null
  );

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

      // ✅ hydrate trucking hours from DB
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

      // 3) ✅ Pull 1 division rate from NEW endpoint
      const rateRes = await fetch(`/api/labor-rates`, { cache: "no-store" });
      const rateJson = await rateRes.json();

      const rateRow =
        Array.isArray(rateJson?.rates) && rateJson.rates.length > 0
          ? (rateJson.rates as any[]).find((r) => r.division_id === divisionId)
          : null;

      setDivisionRate(Number(rateRow?.hourly_rate ?? 0));

      // 4) Bid settings (ops)
      const sRes = await fetch(
        `/api/atlasbid/bid-settings?division_id=${divisionId}`,
        { cache: "no-store" }
      );
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
      const lRes = await fetch(`/api/atlasbid/bid-labor?bid_id=${bidId}`, {
        cache: "no-store",
      });
      const lJson = await lRes.json();
      setLabor(lJson?.rows || lJson?.data || []);
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

  // ✅ Debounced autosave for trucking hours (persists to bids.trucking_hours)
  useEffect(() => {
    if (!bid?.id) return;

    // If you want to avoid autosave during initial load, this helps:
    // only autosave when bid exists AND loading is false
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
        // keep bid in sync
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
    return labor.reduce(
      (sum, r) =>
        sum + (Number(r.man_hours) || 0) * (Number(r.hourly_rate) || 0),
      0
    );
  }, [labor]);

  const truckingCost = useMemo(() => {
    return (Number(truckingHours) || 0) * (Number(divisionRate) || 0);
  }, [truckingHours, divisionRate]);

  const laborPlusTrucking = useMemo(() => {
    return laborSubtotal + truckingCost;
  }, [laborSubtotal, truckingCost]);

  // ✅ contingency still calculated but hidden in UI
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

  // ✅ rounding still applied but wording removed
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
      if (!res.ok) {
        throw new Error(json?.error?.message || json?.error || "Failed to save division.");
      }

      await loadAll();
    } catch (e: any) {
      setError(e?.message || "Failed to save division.");
    } finally {
      setSavingDivision(false);
    }
  }

  async function addLabor() {
    setError("");

    if (!task.trim()) return setError("Task is required.");
    if (!item.trim()) return setError("Item is required.");
    if ((Number(hours) || 0) <= 0) return setError("Hours must be > 0.");
    if ((Number(divisionRate) || 0) <= 0)
      return setError("Division rate is 0. Set the division + rate first.");

    const res = await fetch(`/api/atlasbid/bid-labor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bid_id: bidId,
        task: task.trim(),
        item: item.trim(),
        quantity: Number(quantity) || 0,
        unit: unit.trim(),
        man_hours: Number(hours) || 0,
        hourly_rate: Number(divisionRate) || 0,
      }),
    });

    const json = await res.json();
    if (res.ok) {
      const row = json?.row ?? json?.data;
      if (row) setLabor((prev) => [...prev, row]);
      setTask("");
      setItem("");
      setQuantity(0);
      setUnit("");
      setHours(0);
    } else {
      setError(json?.error?.message || json?.error || "Error adding labor");
    }
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

  const divisionName = useMemo(() => {
    if (!bid?.division_id) return "—";
    const d = divisions.find((x) => x.id === bid.division_id);
    return d?.name || "—";
  }, [bid?.division_id, divisions]);

  if (loading) return <div className="p-6">Loading…</div>;
  if (!bid) return <div className="p-6 text-red-600">Bid not found.</div>;

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <div className="text-sm text-gray-500">
          Bid: <span className="font-mono">{bid.id}</span> • Client:{" "}
          <span className="font-semibold">{bid.client_name || "—"}</span>
        </div>
        <h1 className="text-3xl font-bold mt-1">Scope</h1>
        <div className="text-sm text-gray-600 mt-1">
          Division: <span className="font-semibold">{divisionName}</span>
        </div>
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

            <div className="grid grid-cols-6 gap-4 items-center">
              <input
                className="border p-2 rounded"
                placeholder="e.g. Install"
                value={task}
                onChange={(e) => setTask(e.target.value)}
              />
              <input
                className="border p-2 rounded"
                placeholder="e.g. Mulch"
                value={item}
                onChange={(e) => setItem(e.target.value)}
              />
              <input
                className="border p-2 rounded"
                type="number"
                placeholder="0"
                value={Number.isFinite(quantity) ? quantity : 0}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
              <input
                className="border p-2 rounded"
                placeholder="e.g. yd"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
              <input
                className="border p-2 rounded"
                type="number"
                placeholder="0"
                value={Number.isFinite(hours) ? hours : 0}
                onChange={(e) => setHours(Number(e.target.value))}
              />
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
                    <button
                      onClick={() => deleteLaborRow(row.id)}
                      className="text-red-600 hover:underline text-right"
                    >
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
              <div className="text-right text-sm">
                {savingTrucking ? <span className="text-gray-500">Saving…</span> : null}
              </div>
            </div>

            {truckingSaveError ? (
              <div className="text-sm text-red-600">{truckingSaveError}</div>
            ) : null}

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

          {/* PRICING PREVIEW (contingency hidden, rounded label removed) */}
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
                  Apply prepay discount (100% upfront check)
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
                  <span className="text-gray-600">Trucking cost</span>
                  <span className="font-semibold">{money(truckingCost)}</span>
                </div>

                <div className="flex justify-between border-t pt-2">
                  <span className="text-gray-800">Total cost</span>
                  <span className="font-bold">{money(totalCost)}</span>
                </div>

                <div className="flex justify-between pt-4">
                  <span className="text-gray-800">Sell price</span>
                  <span className="font-bold text-emerald-700">{money(sellRounded)}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-800">Sell price (with prepay)</span>
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
              Those live in the <b>Task Catalog</b> + selection UI (Ops Center → Tasks). We haven’t wired Task Catalog
              selection into Scope yet, so Scope currently uses manual rows.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
