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

function roundUpTo100(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.ceil(n / 100) * 100;
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

  // Pricing inputs (Phase 1 defaults)
  const [targetGpPct, setTargetGpPct] = useState<number>(50); // editable
  const [contingencyPct, setContingencyPct] = useState<number>(3); // editable (later from OC)
  const [roundUpEnabled, setRoundUpEnabled] = useState<boolean>(true);
  const [prepayEnabled, setPrepayEnabled] = useState<boolean>(false);
  const [prepayDiscountPct, setPrepayDiscountPct] = useState<number>(3); // editable (later from OC)

  useEffect(() => {
    if (!projectId) return;

    async function load() {
      try {
        const pRes = await fetch(`/api/atlasbid/projects/${projectId}`, { cache: "no-store" });
        const pJson = await pRes.json();
        setProject(pJson.project);

        const divisionId = pJson.project?.division_id;
        if (divisionId) {
          const rateRes = await fetch(`/api/atlasbid/blended-rate?division_id=${divisionId}`, {
            cache: "no-store",
          });
          const rateJson = await rateRes.json();
          setBlendedRate(Number(rateJson.blended_rate || 0));
        }

        const lRes = await fetch(`/api/atlasbid/labor?project_id=${projectId}`, { cache: "no-store" });
        const lJson = await lRes.json();
        setLabor(lJson.rows || []);
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

  const targetGp = useMemo(() => {
    const gp = (Number(targetGpPct) || 0) / 100;
    // Sell = Cost / (1 - GP)
    if (gp >= 1) return 0;
    return totalCost / (1 - gp);
  }, [totalCost, targetGpPct]);

  const sellBeforePrepay = useMemo(() => {
    const raw = targetGp;
    const rounded = roundUpEnabled ? roundUpTo100(raw) : raw;
    return rounded;
  }, [targetGp, roundUpEnabled]);

  const sellWithPrepay = useMemo(() => {
    if (!prepayEnabled) return sellBeforePrepay;
    const disc = (Number(prepayDiscountPct) || 0) / 100;
    return sellBeforePrepay * (1 - disc);
  }, [sellBeforePrepay, prepayEnabled, prepayDiscountPct]);

  const effectiveGpPct = useMemo(() => {
    const sell = prepayEnabled ? sellWithPrepay : sellBeforePrepay;
    if (sell <= 0) return 0;
    return ((sell - totalCost) / sell) * 100;
  }, [sellBeforePrepay, sellWithPrepay, prepayEnabled, totalCost]);

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
          <div className="space-y-3">
            <label className="block text-sm text-gray-600">Target Gross Profit %</label>
            <input
              className="border p-2 rounded w-full"
              type="number"
              value={targetGpPct}
              onChange={(e) => setTargetGpPct(Number(e.target.value))}
            />

            <label className="block text-sm text-gray-600">Contingency %</label>
            <input
              className="border p-2 rounded w-full"
              type="number"
              value={contingencyPct}
              onChange={(e) => setContingencyPct(Number(e.target.value))}
            />

            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={roundUpEnabled} onChange={(e) => setRoundUpEnabled(e.target.checked)} />
              Round up to nearest $100
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={prepayEnabled} onChange={(e) => setPrepayEnabled(e.target.checked)} />
              Apply prepay discount
            </label>

            {prepayEnabled && (
              <>
                <label className="block text-sm text-gray-600">Prepay discount %</label>
                <input
                  className="border p-2 rounded w-full"
                  type="number"
                  value={prepayDiscountPct}
                  onChange={(e) => setPrepayDiscountPct(Number(e.target.value))}
                />
              </>
            )}
          </div>

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
              <span className="text-gray-800">Sell price (before prepay)</span>
              <span className="font-bold text-emerald-700">${sellBeforePrepay.toFixed(2)}</span>
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