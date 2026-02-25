"use client";

import { useEffect, useState } from "react";
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

export default function ProjectDetailPage() {
  const params = useParams();
  const id = Number(params?.id);

  const [project, setProject] = useState<Project | null>(null);
  const [labor, setLabor] = useState<LaborRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [blendedRate, setBlendedRate] = useState<number>(0);

  const [task, setTask] = useState("");
  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState<number>(0);
  const [unit, setUnit] = useState("");
  const [hours, setHours] = useState<number>(0);

  // Load project + labor
  useEffect(() => {
    if (!id) return;

    async function load() {
      try {
        const pRes = await fetch(`/api/atlasbid/projects/${id}`);
        const pJson = await pRes.json();
        setProject(pJson.project);

        // Fetch blended rate for this division
        if (pJson.project?.division_id) {
          const rateRes = await fetch(
            `/api/atlasbid/blended-rate?division_id=${pJson.project.division_id}`
          );
          const rateJson = await rateRes.json();
          setBlendedRate(Number(rateJson.blended_rate || 0));
        }

        const lRes = await fetch(`/api/atlasbid/labor?project_id=${id}`);
        const lJson = await lRes.json();
        setLabor(lJson.rows || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  async function addLabor() {
    const res = await fetch("/api/atlasbid/labor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: id,
        task,
        item,
        quantity,
        unit,
        man_hours: hours,
        hourly_rate: blendedRate, // <-- AUTO BLENDED RATE
      }),
    });

    const json = await res.json();

    if (res.ok) {
      setLabor(prev => [...prev, json.row]);
      setTask("");
      setItem("");
      setQuantity(0);
      setUnit("");
      setHours(0);
    } else {
      alert(json.error || "Error adding labor");
    }
  }

  if (loading) return <div className="p-6">Loading...</div>;
  if (!project) return <div className="p-6 text-red-500">Project not found.</div>;

  return (
    <div className="p-8 space-y-10">

      {/* HEADER */}
      <div>
        <h1 className="text-3xl font-bold">
          {project.project_name || "Untitled Project"}
        </h1>
        <p className="text-gray-500">
          Client: {project.client_name || "—"}
        </p>
      </div>

      {/* LABOR BUILDER */}
      <div className="border rounded-lg p-6 space-y-6">
        <h2 className="text-xl font-semibold">Labor Builder</h2>

        <div className="text-sm text-gray-500">
          Blended labor rate (excludes trucking):{" "}
          <span className="font-semibold">
            ${blendedRate.toFixed(2)} / hr
          </span>
        </div>

        {/* ADD ROW */}
        <div className="grid grid-cols-6 gap-4">
          <input
            placeholder="Task"
            className="border p-2 rounded"
            value={task}
            onChange={e => setTask(e.target.value)}
          />
          <input
            placeholder="Item"
            className="border p-2 rounded"
            value={item}
            onChange={e => setItem(e.target.value)}
          />
          <input
            type="number"
            placeholder="Qty"
            className="border p-2 rounded"
            value={quantity}
            onChange={e => setQuantity(Number(e.target.value))}
          />
          <input
            placeholder="Unit"
            className="border p-2 rounded"
            value={unit}
            onChange={e => setUnit(e.target.value)}
          />
          <input
            type="number"
            placeholder="Hours"
            className="border p-2 rounded"
            value={hours}
            onChange={e => setHours(Number(e.target.value))}
          />
          <button
            onClick={addLabor}
            className="bg-emerald-700 text-white rounded px-4"
          >
            Add
          </button>
        </div>

        {/* TABLE */}
        <div className="space-y-2">
          {labor.length === 0 && (
            <p className="text-gray-400">No labor added yet.</p>
          )}

          {labor.map(row => (
            <div
              key={row.id}
              className="grid grid-cols-6 gap-4 border p-2 rounded text-sm"
            >
              <div>{row.task}</div>
              <div>{row.item}</div>
              <div>{row.quantity}</div>
              <div>{row.unit}</div>
              <div>{row.man_hours}</div>
              <div>${row.hourly_rate}</div>
            </div>
          ))}
        </div>
      </div>

      {/* MATERIALS */}
      <div className="border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Materials</h2>
        <p className="text-gray-400">
          Materials builder coming next.
        </p>
      </div>

      {/* PROPOSAL */}
      <div className="border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Proposal</h2>
        <p className="text-gray-400">
          Proposal engine coming in Phase 2.
        </p>
      </div>

    </div>
  );
}