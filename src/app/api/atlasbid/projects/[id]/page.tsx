"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Project = {
  id: string;
  name: string;
  client_name: string;
  created_at: string;
};

export default function ProjectDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProject() {
      const res = await fetch(`/api/atlasbid/projects/${id}`);
      const json = await res.json();
      setProject(json.project);
      setLoading(false);
    }

    if (id) loadProject();
  }, [id]);

  if (loading) {
    return <div className="p-6">Loading project...</div>;
  }

  if (!project) {
    return <div className="p-6 text-red-500">Project not found.</div>;
  }

  return (
    <div className="p-8 space-y-8">
      {/* HEADER */}
      <div>
        <h1 className="text-3xl font-bold">
          {project.name || "Untitled Project"}
        </h1>
        <p className="text-gray-500">
          Client: {project.client_name || "—"}
        </p>
      </div>

      {/* LABOR SECTION */}
      <div className="border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Labor</h2>
        <p className="text-gray-400">
          Labor builder coming in next step.
        </p>
      </div>

      {/* MATERIALS SECTION */}
      <div className="border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Materials</h2>
        <p className="text-gray-400">
          Materials builder coming in next step.
        </p>
      </div>

      {/* PROPOSAL SECTION */}
      <div className="border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Proposal</h2>
        <p className="text-gray-400">
          Proposal engine coming in Phase 2.
        </p>
      </div>
    </div>
  );
}