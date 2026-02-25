"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Project = {
  id: string;
  name: string;
  client_name: string;
};

type LaborRow = {
  id: number;
  project_id: string;
  task: string;
  item: string;
  quantity: number;
  unit: string;
  man_hours: number;
};

export default function ProjectDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [labor, setLabor] = useState<LaborRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [task, setTask] = useState("");
  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState<number>(0);
  const [unit, setUnit] = useState("");
  const [hours, setHours] = useState<number>(0);

  useEffect(() => {
    async function load() {
      try {
        const p = await fetch(`/api/atlasbid/projects/${id}`).then(r => r.json());
        const l = await fetch(`/api/atlasbid/labor?project_id=${id}`).then(r => r.json());

        setProject(p.project || null);
        setLabor(l.labor || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    if (id) load();
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

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!project) {
    return <div className="p-6 text-red-500">Project not found.</div>;
  }

  return (
    <div className="p-8 space-y-10">

      {/* HEADER */}
      <div>
        <h1 className="text-3xl font-bold">
          {project.name || "Untitled Project"}
        </h1>
        <p className="text-gray-500">
          Client: {project.client_name || "—"}
        </p>
      </div>

      {/* LABOR BUILDER */}
      <div className="border rounded-lg p-6 space-y-6">
        <h2 className="text-xl font-semibold">Labor Builder</h2>

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
              <div></div>
            </div>
          ))}
        </div>
      </div>

      {/* MATERIALS PLACEHOLDER */}
      <div className="border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Materials</h2>
        <p className="text-gray-400">
          Materials builder coming next.
        </p>
      </div>

      {/* PROPOSAL PLACEHOLDER */}
      <div className="border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Proposal</h2>
        <p className="text-gray-400">
          Proposal engine coming in Phase 2.
        </p>
      </div>

    </div>
  );
}