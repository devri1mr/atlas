"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function AtlasBidHome() {
  const [projects, setProjects] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/atlasbid/projects", { cache: "no-store" });
      const json = await res.json();
      setProjects(json.projects ?? []);
    })();
  }, []);

  const drafts = projects.filter((p) => p.status === "draft");

  return (
    <div className="max-w-[980px] mx-auto px-4 py-8">
      <h1 className="text-3xl font-semibold text-slate-900">AtlasBid</h1>
      <p className="text-slate-600 mt-1">Landscaping (Phase 1)</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Link href="/atlasbid/new" className="rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50">
          <div className="font-medium">Create New Project</div>
          <div className="text-sm text-slate-600 mt-1">Start a new bid</div>
        </Link>

        <Link href="/atlasbid#drafts" className="rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50">
          <div className="font-medium">Resume Draft</div>
          <div className="text-sm text-slate-600 mt-1">{drafts.length} draft(s)</div>
        </Link>

        <Link href="/atlasbid#saved" className="rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50">
          <div className="font-medium">View Saved Projects</div>
          <div className="text-sm text-slate-600 mt-1">All recent projects</div>
        </Link>
      </div>

      <div id="drafts" className="mt-10">
        <h2 className="text-xl font-semibold text-slate-900">Drafts</h2>
        <div className="mt-3 rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
          {drafts.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">No drafts yet.</div>
          ) : (
            drafts.map((p) => (
              <Link
                key={p.id}
                href={`/atlasbid/project/${p.id}/labor`}
                className="block p-4 hover:bg-slate-50"
              >
                <div className="font-medium">{p.project_name}</div>
                <div className="text-sm text-slate-600">{p.client_name} • {p.project_address}</div>
              </Link>
            ))
          )}
        </div>
      </div>

      <div id="saved" className="mt-10">
        <h2 className="text-xl font-semibold text-slate-900">Recent Projects</h2>
        <div className="mt-3 rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
          {projects.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">No projects yet.</div>
          ) : (
            projects.map((p) => (
              <Link
                key={p.id}
                href={`/atlasbid/project/${p.id}/labor`}
                className="block p-4 hover:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{p.project_name}</div>
                  <span className="text-xs rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                    {p.status}
                  </span>
                </div>
                <div className="text-sm text-slate-600">{p.client_name} • {p.project_code}</div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}