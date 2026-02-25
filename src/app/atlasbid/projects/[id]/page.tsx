"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Project = {
  id: number;
  project_name: string;
  client_name: string;
  division_id: number;
};

type LaborRow = {
  id: number;
  project_id: number;
  task: string;
  item: string;
  quantity: number;
  unit: string;
  man_hours: number;
  hourly_rate: number;
};

type BidSettings = {
  division_id: number;
  margin_default: number; // could be 50 or 0.5 depending on what's stored
  contingency_pct: number; // could be 3 or 0.03
  round_up_increment: number; // typically 100
  prepay_discount_pct: number; // could be 3 or 0.03
};

// If Supabase has 0.5 meaning 0.5% OR 0.03 meaning 3%,
// normalize to "percent units" (50, 3, etc).
function normalizePercent(n: number) {
  const x = Number(n) || 0;
  if (x > 0 && x <= 1) return x * 100;
  return x;
}

function roundUpToIncrement(n: number, inc: number) {
  const value = Number(n);
  const increment = Number(inc);
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(increment) || increment <= 0) return value; // if ops sets 0, no rounding
  return Math.ceil(value / increment) * increment;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = Number(params?.id);

  const [project, setProject] = useState<Project | null>(null);
  const [labor, setLabor] = useState<LaborRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [blendedRate, setBlendedRate] = useState<number>(0);

  // Labor input
  const [task, setTask] = useState("");
  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState<number>(0);
  const [unit, setUnit] = useState("");
  const [hours, setHours] = useState<number>(0);

  // Sales-editable
  const [targetGpPct, setTargetGpPct] = useState<number>(50);

  // Ops-controlled (hidden from sales UI)
  const [contingencyPct, setContingencyPct] = useState<number>(3);
  const [roundUpIncrement, setRoundUpIncrement] = useState<number>(100);
  const [prepayDiscountPct, setPrepayDiscountPct] = useState<number>(3);

  // Sales toggle only
  const [prepayEnabled, setPrepayEnabled] = useState<boolean>(false);

  useEffect(() => {
    if (!projectId) return;

    async function load() {
      try {
        // project
        const pRes = await fetch(`/api/atlasbid/projects/${projectId}`, { cache: "no-store" });
        const pJson = await pRes.json();
        const proj: Project | null = pJson?.project ?? null;
        setProject(proj);

        const divisionId = proj?.division_id;

        // blended rate
        if (divisionId) {
          const rateRes = await fetch(`/api/atlasbid/blended-rate?division_id=${divisionId}`, {
            cache: "no-store",
          });
          const rateJson = await rateRes.json();
          setBlendedRate(Number(rateJson?.blended_rate || 0));
        }

        // bid settings (ops)
        if (divisionId) {
          const sRes = await fetch(`/api/atlasbid/bid-settings?division_id=${divisionId}`, {
            cache: "no-store",
          });
          const sJson = await sRes.json();
          const settings: BidSettings | null = sJson?.settings ?? null;

          if (settings) {
            // Normalize % fields in case Supabase row contains decimals like 0.5 or 0.03
            const marginDefault = normalizePercent(settings.margin_default);
            const contPct = normalizePercent(settings.contingency_pct);
            const prepayPct = normalizePercent(settings.prepay_discount_pct);
            const roundInc = Number(settings.round_up_increment || 0);

            setTargetGpPct(marginDefault || 50);
            setContingencyPct(contPct || 0);
            setPrepayDiscountPct(prepayPct || 0);
            setRoundUpIncrement(roundInc || 0);
          } else {
            // fallback defaults if no row exists yet
            setTargetGpPct(50);
            setContingencyPct(3);
            setPrepayDiscountPct(3);
            setRoundUpIncrement(100);
          }
        }

        // labor rows
        const lRes = await fetch(`/api/atlasbid/labor?project_id=${projectId}`, { cache: "no-store" });
        const lJson = await lRes.json();
        setLabor(lJson?.rows || []);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [projectId]);

  const laborSubtotal = useMemo(() => {
    return labor.reduce((sum, r) => sum + (Number(r.man_hours) || 0) * (Number(r.hourly_rate) || 0), 0);
  }, [labor]);

  async function addLabor() {
    const res = await fetch("/api/atlasbid/labor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        task,
        item,
        quantity,
        unit,
        man_hours: hours,
        hourly_rate: blendedRate,
      }),
    });

    const json = await res.json();
    if (res.ok) {
      setLabor((prev) => [...prev, json.row]);
      setTask("");
      setItem("");
      setQuantity(0);
      setUnit("");
      setHours(0);
    } else {
      alert(json?.error?.message || json?.error || "Error adding labor");
    }
  }

  async function deleteLaborRow(rowId: number) {
    const res = await fetch(`/api/atlasbid/labor/${rowId}`, { method: "DELETE" });
    if (res.ok) {
      setLabor((prev) => prev.filter((r) => r.id !== rowId));
    } else {
      alert("Failed to delete labor row");
    }
  }

  // ---- PRICING CALCS ----
  const contingencyCost = useMemo(() => {
    const pct = (Number(contingencyPct) || 0) / 100;
    return laborSubtotal * pct;
  }, [laborSubtotal, contingencyPct]);

  const totalCost = useMemo(() => {
    return laborSubtotal + contingencyCost;
  }, [laborSubtotal, contingencyCost]);

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

  if (loading) return <div className="p-6">Loading...</div>;
  if (!project) return <div className="p-6 text-red-500">Project not found.</div>;

  return (
    <div className="p-8 space-y-10">
      <div>
        <h1 className="text-3xl font-bold">{project.project_name || "Untitled Project"}</h1>
        <p className="text-gray-500">Client: {project.client_name || "—"}</p>
      </div>

      {/* LABOR BUILDER */}
      <div className="border rounded-lg p-6 space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Labor Builder</h2>
          <div className="text-sm text-gray-500">
            Blended labor rate (excludes trucking):{" "}
            <span className="font-semibold">${blendedRate.toFixed(2)} / hr</span>
          </div>
        </div>

        <div className="grid grid-cols-6 gap-4">
          <input className="border p-2 rounded" placeholder="Task" value={task} onChange={(e) => setTask(e.target.value)} />
          <input className="border p-2 rounded" placeholder="Item" value={item} onChange={(e) => setItem(e.target.value)} />
          <input className="border p-2 rounded" type="number" placeholder="Qty" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
          <input className="border p-2 rounded" placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
          <input className="border p-2 rounded" type="number" placeholder="Hours" value={hours} onChange={(e) => setHours(Number(e.target.value))} />
          <button onClick={addLabor} className="bg-emerald-700 text-white rounded px-4">Add</button>
        </div>

        <div className="grid grid-cols-8 gap-4 font-semibold text-sm border-b pb-2">
          <div>Task</div><div>Item</div><div>Qty</div><div>Unit</div><div>Hours</div><div>Rate</div><div>Total</div><div></div>
        </div>

        {labor.length === 0 ? (
          <p className="text-gray-400">No labor added yet.</p>
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
                <div>${Number(row.hourly_rate).toFixed(2)}</div>
                <div>${rowTotal.toFixed(2)}</div>
                <button onClick={() => deleteLaborRow(row.id)} className="text-red-600 hover:underline text-right">
                  Delete
                </button>
              </div>
            );
          })
        )}

        <div className="text-right font-semibold pt-4 border-t">Labor Subtotal: ${laborSubtotal.toFixed(2)}</div>
      </div>

      {/* PRICING */}
      <div className="border rounded-lg p-6 space-y-5">
        <h2 className="text-xl font-semibold">Pricing</h2>

        <div className="grid grid-cols-2 gap-6">
          {/* Left controls */}
          <div className="space-y-3">
            <label className="block text-sm text-gray-600">Target Gross Profit % (Sales editable)</label>
            <input
              className="border p-2 rounded w-full"
              type="number"
              value={Number.isFinite(targetGpPct) ? targetGpPct : 0}
              onChange={(e) => setTargetGpPct(Number(e.target.value))}
            />
            <div className="text-xs text-gray-500">Default comes from Ops Center.</div>

            <label className="inline-flex items-center gap-2 text-sm text-gray-700 pt-2">
              <input type="checkbox" checked={prepayEnabled} onChange={(e) => setPrepayEnabled(e.target.checked)} />
              Apply prepay discount
            </label>

            {/* NOTE: Ops-controlled settings are intentionally hidden here */}
          </div>

          {/* Right summary */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Labor cost</span>
              <span className="font-semibold">${laborSubtotal.toFixed(2)}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Contingency</span>
              <span className="font-semibold">${contingencyCost.toFixed(2)}</span>
            </div>

            <div className="flex justify-between border-t pt-2">
              <span className="text-gray-800">Total cost</span>
              <span className="font-bold">${totalCost.toFixed(2)}</span>
            </div>

            <div className="flex justify-between pt-4">
              <span className="text-gray-800">Sell price (rounded)</span>
              <span className="font-bold text-emerald-700">${sellRounded.toFixed(2)}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-800">Sell price (with prepay)</span>
              <span className="font-bold text-emerald-700">${sellWithPrepay.toFixed(2)}</span>
            </div>

            <div className="flex justify-between border-t pt-2">
              <span className="text-gray-800">Effective GP%</span>
              <span className="font-bold">{effectiveGpPct.toFixed(2)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* MATERIALS */}
      <div className="border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Materials</h2>
        <p className="text-gray-400">Materials builder coming next.</p>
      </div>

      {/* PROPOSAL */}
      <div className="border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Proposal</h2>
        <p className="text-gray-400">Proposal engine coming in Phase 2.</p>
      </div>
    </div>
  );
}