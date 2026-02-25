"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function NewProjectPage() {
  const router = useRouter();
  const [clientName, setClientName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    setErr(null);
    setSaving(true);

    const { data } = await supabase.auth.getSession();
    const email = data.session?.user?.email ?? "";

    const res = await fetch("/api/atlasbid/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: clientName,
        project_name: projectName,
        project_address: address,
        created_by_email: email,
      }),
    });

    const json = await res.json();
    setSaving(false);

    if (!res.ok) {
      setErr(json.error ?? "Failed to create project");
      return;
    }

    router.push(`/atlasbid/project/${json.project.id}/labor`);
  }

  return (
    <div className="max-w-[780px] mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-slate-900">New Project</h1>
      <p className="text-slate-600 mt-1">Landscaping (Phase 1)</p>

      <div className="mt-6 space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-700">Client Name</label>
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
            value={clientName} onChange={(e) => setClientName(e.target.value)} />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Project Name</label>
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
            value={projectName} onChange={(e) => setProjectName(e.target.value)} />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Project Address</label>
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
            value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>

        {err && <div className="text-sm text-red-700">{err}</div>}

        <div className="flex gap-2">
          <button
            onClick={() => router.push("/atlasbid")}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm"
          >
            Back
          </button>
          <button
            disabled={saving}
            onClick={create}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:bg-emerald-300"
          >
            {saving ? "Creating..." : "Create & Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}