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
  margin_default: number;        // GP% default
  contingency_pct: number;       // 3 = 3%
  round_up_increment: number;    // 100 = nearest $100
  prepay_discount_pct: number;   // 3 = 3%
};

function roundUpToIncrement(n: number, inc: number) {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const increment = Number(inc) > 0 ? Number(inc) : 100;
  return Math.ceil(n / increment) * increment;
}

function sanitizePercentInput(v: string) {
  // keep digits + one decimal point
  let s = v.replace(/[^\d.]/g, "");
  const parts = s.split(".");
  if (parts.length > 2) s = parts[0] + "." + parts.slice(1).join("");
  // remove leading zeros like "050" -> "50" (but keep "0.x")
  if (s.startsWith("0") && s.length > 1 && s[1] !== ".") {
    s = String(Number(s)); // "050" => 50, "000" => 0
  }
  return s;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = Number(params?.id);

  const [project, setProject] = useState<Project | null>(null);
  const [labor, setLabor] = useState<LaborRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [blendedRate, setBlendedRate] = useState<number>(0);

  // Ops-controlled settings (fetched)
  const [settings, setSettings] = useState<BidSettings>({
    division_id: 0,
    margin_default: 50,
    contingency_pct: 3,
    round_up_increment: 100,
    prepay_discount_pct: 3,
  });

  // Labor input
  const [task, setTask] = useState("");
  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState<number>(0);
  const [unit, setUnit] = useState("");
  const [hours, setHours] = useState<number>(0);

  // Sales-controlled inputs
  const [targetGpPctStr, setTargetGpPctStr] = useState<string>("50"); // avoid "050"
  const targetGpPct = Number(targetGpPctStr || 0);

  const [prepayEnabled, setPrepayEnabled] = useState<boolean>(false);

  useEffect(() => {
    if (!projectId) return;

    async function load() {
      try {
        // Project
        const pRes = await fetch(`/api/atlasbid/projects/${projectId}`, { cache: "no-store" });
        const pJson = await pRes.json();
        setProject(pJson.project);

        const divisionId = pJson.project?.division_id;

        // Blended rate
        if (divisionId) {
          const rateRes = await fetch(`/api/atlasbid/blended-rate?division_id=${divisionId}`, { cache: "no-store" });
          const rateJson = await rateRes.json();
          setBlendedRate(Number(rateJson.blended_rate || 0));
        }

        // Bid settings (Ops defaults)
        if (divisionId) {
          const sRes = await fetch(`/api/atlasbid/bid-settings?division_id=${divisionId}`, { cache: "no-store" });
          const sJson = await sRes.json();
          const s: BidSettings = sJson.settings ?? sJson; // support either shape
          setSettings({
            division_id: Number(s.division_id || divisionId),
            margin_default: Number(s.margin_default ?? 50),
            contingency_pct: Number(s.contingency_pct ?? 3),
            round_up_increment: Number(s.round_up_increment ?? 100),
            prepay_discount_pct: Number(s.prepay_discount_pct ?? 3),
          });

          // set GP default from ops (but still editable by sales)
          const gpDefault = Number(s.margin_default ?? 50);
          setTargetGpPctStr(String(gpDefault));
        }

        // Labor rows
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
      const txt = await res.text().catch(() => "");
      alert(`Failed to delete labor row${txt ? `: ${txt}` : ""}`);
    }
  }

  // ---- PRICING CALCS (Ops controls contingency + round up + prepay %) ----
  const contingencyCost = useMemo(() => {
    const pct = (Number(settings.contingency_pct) || 0) / 100; // 3 => 0.03
    return laborSubtotal * pct;
  }, [laborSubtotal, settings.contingency_pct]);

  const totalCost = useMemo(() => laborSubtotal + contingencyCost, [laborSubtotal, contingencyCost]);

  const targetSell = useMemo(() => {
    const gp = (Number(targetGpPct) || 0) / 100;
    if (gp >= 1) return 0;
    return totalCost / (1 - gp);
  }, [totalCost, targetGpPct]);

  const sellBeforePrepay = useMemo(() => {
    // always round using Ops increment
    return roundUpToIncrement(targetSell, settings.round_up_increment);
  }, [targetSell, settings.round_up_increment]);

  const sellWithPrepay = useMemo(() => {
    if (!prepayEnabled) return sellBeforePrepay;
    const disc = (Number(settings.prepay_discount_pct) || 0) / 100;
    return sellBeforePrepay * (1 - disc);
  }, [sellBeforePrepay, prepayEnabled, settings.prepay_discount_pct]);

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

      {/* PRICING (Sales view: GP + Prepay toggle only) */}
      <div className="border rounded-lg p-6 space-y-5">
        <h2 className="text-xl font-semibold">Pricing</h2>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <label className="block text-sm text-gray-600">Target Gross Profit %</label>
            <input
              className="border p-2 rounded w-full"
              inputMode="decimal"
              value={targetGpPctStr}
              onChange={(e) => setTargetGpPctStr(sanitizePercentInput(e.target.value))}
            />

            <label className="inline-flex items-center gap-2 text-sm text-gray-700 pt-2">
              <input type="checkbox" checked={prepayEnabled} onChange={(e) => setPrepayEnabled(e.target.checked)} />
              Apply prepay discount
            </label>

            <div className="text-xs text-gray-400 pt-2">
              Pricing uses Ops defaults for contingency + round-up + prepay %.
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Labor cost</span>
              <span className="font-semibold">${laborSubtotal.toFixed(2)}</span>
            </div>

            <div className="flex justify-between border-t pt-2">
              <span className="text-gray-800">Sell price (rounded)</span>
              <span className="font-bold text-emerald-700">${sellBeforePrepay.toFixed(2)}</span>
            </div>

            {prepayEnabled && (
              <div className="flex justify-between">
                <span className="text-gray-800">Sell price (with prepay)</span>
                <span className="font-bold text-emerald-700">${sellWithPrepay.toFixed(2)}</span>
              </div>
            )}

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