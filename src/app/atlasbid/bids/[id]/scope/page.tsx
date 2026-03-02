"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Bid = {
  id: string; // uuid
  bid_code?: string | null;
  client_name?: string | null;
  division_id: string; // uuid
  division_name?: string | null; // if your API includes it
  trucking_hours?: number | null;
  prepay_enabled?: boolean | null;
};

type LaborRow = {
  id: number;
  bid_id: string;
  task: string;
  item: string;
  quantity: number;
  unit: string;
  man_hours: number;
  hourly_rate: number;
};

type BidSettings = {
  division_id: string;
  margin_default: number; // could be 50 or 0.5 depending on what's stored
  contingency_pct: number; // could be 3 or 0.03
  round_up_increment: number; // typically 100
  prepay_discount_pct: number; // could be 3 or 0.03
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
  const x = Number(n) || 0;
  return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BidScopePage() {
  const params = useParams();
  const bidId = String(params?.id || "");

  const [loading, setLoading] = useState(true);
  const [bid, setBid] = useState<Bid | null>(null);
  const [labor, setLabor] = useState<LaborRow[]>([]);

  const [blendedRate, setBlendedRate] = useState<number>(0);

  // Labor input (keep blanks instead of default 0s)
  const [task, setTask] = useState("");
  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState<string>("");
  const [unit, setUnit] = useState("");
  const [hours, setHours] = useState<string>("");

  // Sales-editable
  const [targetGpPct, setTargetGpPct] = useState<number>(50);

  // Ops-controlled (hidden from sales UI)
  const [contingencyPct, setContingencyPct] = useState<number>(3);
  const [roundUpIncrement, setRoundUpIncrement] = useState<number>(100);
  const [prepayDiscountPct, setPrepayDiscountPct] = useState<number>(3);

  // Sales toggle only
  const [prepayEnabled, setPrepayEnabled] = useState<boolean>(false);

  // Trucking (single entry)
  const [includeTrucking, setIncludeTrucking] = useState<boolean>(false);
  const [truckingHours, setTruckingHours] = useState<string>("");

  // ---- load ----
  useEffect(() => {
    if (!bidId) return;

    async function load() {
      setLoading(true);
      try {
        // 1) Bid header (must include division_id)
        // IMPORTANT: If your route is different, adjust this ONE fetch.
        const bRes = await fetch(`/api/bids/${bidId}`, { cache: "no-store" });
        const bJson = await bRes.json();
        const b: Bid | null = bJson?.bid ?? null;
        setBid(b);

        const divisionId = b?.division_id;

        // trucking defaults from bid (if present)
        const th = Number(b?.trucking_hours ?? 0);
        if (th > 0) {
          setIncludeTrucking(true);
          setTruckingHours(String(th));
        } else {
          setIncludeTrucking(false);
          setTruckingHours("");
        }

        // prepay default from bid if you store it there; otherwise comes from UI toggle
        if (typeof b?.prepay_enabled === "boolean") setPrepayEnabled(Boolean(b.prepay_enabled));

        // 2) blended rate (single division rate)
        if (divisionId) {
          const rateRes = await fetch(`/api/atlasbid/blended-rate?division_id=${divisionId}`, {
            cache: "no-store",
          });
          const rateJson = await rateRes.json();
          setBlendedRate(Number(rateJson?.blended_rate || 0));
        } else {
          setBlendedRate(0);
        }

        // 3) bid settings (ops)
        if (divisionId) {
          const sRes = await fetch(`/api/atlasbid/bid-settings?division_id=${divisionId}`, {
            cache: "no-store",
          });
          const sJson = await sRes.json();
          const settings: BidSettings | null = sJson?.settings ?? null;

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
        }

        // 4) labor rows for bid
        // IMPORTANT: If your route differs (bid-labor / atlasbid/labor), adjust this ONE fetch.
        const lRes = await fetch(`/api/atlasbid/bid-labor?bid_id=${bidId}`, { cache: "no-store" });
        const lJson = await lRes.json();
        setLabor(lJson?.rows || []);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [bidId]);

  // ---- derived values ----
  const laborHoursTotal = useMemo(() => {
    return labor.reduce((sum, r) => sum + (Number(r.man_hours) || 0), 0);
  }, [labor]);

  const laborSubtotal = useMemo(() => {
    return labor.reduce(
      (sum, r) => sum + (Number(r.man_hours) || 0) * (Number(r.hourly_rate) || 0),
      0
    );
  }, [labor]);

  const truckingHoursNum = useMemo(() => {
    if (!includeTrucking) return 0;
    const n = Number(truckingHours);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [includeTrucking, truckingHours]);

  const truckingCost = useMemo(() => {
    return truckingHoursNum * (Number(blendedRate) || 0);
  }, [truckingHoursNum, blendedRate]);

  const subtotalBeforeContingency = useMemo(() => {
    return laborSubtotal + truckingCost;
  }, [laborSubtotal, truckingCost]);

  const contingencyCost = useMemo(() => {
    const pct = (Number(contingencyPct) || 0) / 100;
    return subtotalBeforeContingency * pct;
  }, [subtotalBeforeContingency, contingencyPct]);

  const totalCost = useMemo(() => {
    return subtotalBeforeContingency + contingencyCost;
  }, [subtotalBeforeContingency, contingencyCost]);

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

  // ---- actions ----
  async function addLabor() {
    const qty = Number(quantity);
    const hrs = Number(hours);

    const payload = {
      bid_id: bidId,
      task: task.trim(),
      item: item.trim(),
      quantity: Number.isFinite(qty) ? qty : 0,
      unit: unit.trim(),
      man_hours: Number.isFinite(hrs) ? hrs : 0,
      hourly_rate: Number(blendedRate) || 0,
    };

    const res = await fetch(`/api/atlasbid/bid-labor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (res.ok) {
      setLabor((prev) => [...prev, json.row]);
      setTask("");
      setItem("");
      setQuantity("");
      setUnit("");
      setHours("");
    } else {
      alert(json?.error?.message || json?.error || "Error adding labor");
    }
  }

  async function deleteLaborRow(rowId: number) {
    const res = await fetch(`/api/atlasbid/bid-labor/${rowId}`, { method: "DELETE" });
    if (res.ok) {
      setLabor((prev) => prev.filter((r) => r.id !== rowId));
    } else {
      alert("Failed to delete labor row");
    }
  }

  async function saveTruckingToBid() {
    // If your bids API expects PATCH, this is right.
    // If it expects PUT, swap method.
    const res = await fetch(`/api/bids/${bidId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trucking_hours: includeTrucking ? truckingHoursNum : 0,
        prepay_enabled: prepayEnabled,
      }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j?.error || "Failed to save trucking/prepay to bid");
    }
  }

  const blendedRateOk = Number(blendedRate) > 0;

  if (loading) return <div className="p-6">Loading…</div>;
  if (!bid) return <div className="p-6 text-red-600">Bid not found.</div>;

  return (
    <div className="p-8 space-y-8">
      <div>
        <div className="text-sm text-gray-500">Scope</div>
        <h1 className="text-3xl font-bold">AtlasBid</h1>
        <div className="text-sm text-gray-600 mt-1">
          Bid: <span className="font-mono">{bid.id}</span>
          {bid.client_name ? (
            <>
              {" "}
              • Client: <span className="font-semibold">{bid.client_name}</span>
            </>
          ) : null}
        </div>
      </div>

      {!blendedRateOk && (
        <div className="border border-amber-300 bg-amber-50 text-amber-900 rounded p-3 text-sm">
          <b>Division labor rate is $0.00/hr</b>. This is why your labor totals are $0. Fix by setting the
          division’s blended rate in Ops Center (or confirm your blended-rate API is returning a value).
        </div>
      )}

      {/* LABOR BUILDER */}
      <div className="border rounded-lg p-6 space-y-4">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-xl font-semibold">Labor Builder</h2>
            <div className="text-sm text-gray-500">
              Division labor rate:{" "}
              <span className="font-semibold">${money(blendedRate)} / hr</span>{" "}
              <span className="text-gray-400">(trucking uses same rate)</span>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-gray-500">Labor Subtotal</div>
            <div className="text-lg font-bold">${money(laborSubtotal)}</div>
          </div>
        </div>

        {/* Column headers ABOVE entry row */}
        <div className="grid grid-cols-6 gap-3 text-xs font-semibold text-gray-600 px-1">
          <div>Task</div>
          <div>Item</div>
          <div>Qty</div>
          <div>Unit</div>
          <div>Hours</div>
          <div className="text-right">Action</div>
        </div>

        {/* Entry row */}
        <div className="grid grid-cols-6 gap-3 items-center">
          <input
            className="border p-2 rounded"
            placeholder="Install / Remove / Grade…"
            value={task}
            onChange={(e) => setTask(e.target.value)}
          />
          <input
            className="border p-2 rounded"
            placeholder="Mulch / Edging / Shrubs…"
            value={item}
            onChange={(e) => setItem(e.target.value)}
          />
          <input
            className="border p-2 rounded"
            inputMode="decimal"
            placeholder="—"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <input
            className="border p-2 rounded"
            placeholder="yd / sqft / ea / hr"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
          <input
            className="border p-2 rounded"
            inputMode="decimal"
            placeholder="—"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
          <button
            onClick={addLabor}
            disabled={!blendedRateOk}
            className={`rounded px-4 py-2 text-white font-semibold ${
              blendedRateOk ? "bg-emerald-700 hover:bg-emerald-800" : "bg-gray-400 cursor-not-allowed"
            }`}
          >
            Add
          </button>
        </div>

        {/* Table header */}
        <div className="grid grid-cols-8 gap-3 font-semibold text-sm border-b pt-2 pb-2">
          <div>Task</div>
          <div>Item</div>
          <div>Qty</div>
          <div>Unit</div>
          <div>Hours</div>
          <div>Rate</div>
          <div>Total</div>
          <div className="text-right">Action</div>
        </div>

        {labor.length === 0 ? (
          <div className="text-sm text-gray-400 py-3">No labor added yet.</div>
        ) : (
          labor.map((row) => {
            const rowTotal = (Number(row.man_hours) || 0) * (Number(row.hourly_rate) || 0);
            return (
              <div key={row.id} className="grid grid-cols-8 gap-3 text-sm py-2 border-b items-center">
                <div>{row.task}</div>
                <div>{row.item}</div>
                <div>{row.quantity}</div>
                <div>{row.unit}</div>
                <div>{row.man_hours}</div>
                <div>${money(row.hourly_rate)}</div>
                <div className="font-semibold">${money(rowTotal)}</div>
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

        {/* Trucking (single entry) */}
        <div className="pt-4 border-t space-y-3">
          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={includeTrucking}
                onChange={(e) => setIncludeTrucking(e.target.checked)}
              />
              Add trucking hours (single entry)
            </label>

            <button
              onClick={saveTruckingToBid}
              className="text-sm px-3 py-2 border rounded hover:bg-gray-50"
            >
              Save
            </button>
          </div>

          {includeTrucking ? (
            <div className="grid grid-cols-3 gap-3 items-end">
              <div>
                <div className="text-xs font-semibold text-gray-600">Trucking Hours</div>
                <input
                  className="border p-2 rounded w-full"
                  inputMode="decimal"
                  placeholder="—"
                  value={truckingHours}
                  onChange={(e) => setTruckingHours(e.target.value)}
                />
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-600">Rate</div>
                <div className="border p-2 rounded bg-gray-50">
                  ${money(blendedRate)} / hr
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-600">Trucking Cost</div>
                <div className="border p-2 rounded bg-gray-50 font-semibold">
                  ${money(truckingCost)}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* PRICING PREVIEW */}
      <div className="border rounded-lg p-6 space-y-4">
        <h2 className="text-xl font-semibold">Pricing Preview</h2>

        <div className="grid grid-cols-2 gap-6">
          {/* left */}
          <div className="space-y-3">
            <label className="block text-sm text-gray-600">Target Gross Profit % (editable)</label>
            <input
              className="border p-2 rounded w-full"
              type="number"
              value={Number.isFinite(targetGpPct) ? targetGpPct : 0}
              onChange={(e) => setTargetGpPct(Number(e.target.value))}
            />
            <div className="text-xs text-gray-500">Default comes from Ops Center.</div>

            <label className="inline-flex items-center gap-2 text-sm text-gray-700 pt-2">
              <input
                type="checkbox"
                checked={prepayEnabled}
                onChange={(e) => setPrepayEnabled(e.target.checked)}
              />
              Apply prepay discount (100% upfront check)
            </label>

            <div className="text-xs text-gray-500">
              Rounding + contingency are baked in from Ops Settings (hidden from sales).
            </div>
          </div>

          {/* right */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Labor cost</span>
              <span className="font-semibold">${money(laborSubtotal)}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Trucking cost</span>
              <span className="font-semibold">${money(truckingCost)}</span>
            </div>

            <div className="flex justify-between border-t pt-2">
              <span className="text-gray-800">Subtotal</span>
              <span className="font-bold">${money(subtotalBeforeContingency)}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Contingency</span>
              <span className="font-semibold">${money(contingencyCost)}</span>
            </div>

            <div className="flex justify-between border-t pt-2">
              <span className="text-gray-800">Total cost</span>
              <span className="font-bold">${money(totalCost)}</span>
            </div>

            <div className="flex justify-between pt-4">
              <span className="text-gray-800">Sell price (rounded)</span>
              <span className="font-bold text-emerald-700">${money(sellRounded)}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-800">Sell price (with prepay)</span>
              <span className="font-bold text-emerald-700">${money(sellWithPrepay)}</span>
            </div>

            <div className="flex justify-between border-t pt-2">
              <span className="text-gray-800">Effective GP%</span>
              <span className="font-bold">{effectiveGpPct.toFixed(2)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* NOTE ABOUT DIFFICULTY */}
      <div className="border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-2">Difficulty / Complexity</h2>
        <p className="text-gray-600 text-sm">
          You won’t see difficulty here yet because we built the <b>Ops Center Complexity Levels</b> page
          first. Next step is wiring the dropdown into this Scope page so sales can select a complexity
          level and it multiplies labor minutes/hours. We’ll do that next (one step at a time).
        </p>
      </div>
    </div>
  );
}
