"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ProjectRow = {
  id: string;
  bid_code: string | null;
  division_id: string | null;
  client_id: string | null;
  margin_percent: number | null;
  internal_notes: string | null;
  created_by_email: string | null;
  created_at: string;
};

type Division = {
  id: string;
  name: string;
  labor_rate: number;
  target_gross_profit_percent: number;
  allow_overtime: boolean;
  active: boolean;
  created_at: string;
};

type Client = {
  id: string;
  name: string;
  created_at: string;
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function AtlasBidListPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  const divisionMap = useMemo(() => {
    const m = new Map<string, Division>();
    divisions.forEach((d) => m.set(d.id, d));
    return m;
  }, [divisions]);

  const clientMap = useMemo(() => {
    const m = new Map<string, Client>();
    clients.forEach((c) => m.set(c.id, c));
    return m;
  }, [clients]);

  async function loadAll() {
    setLoading(true);
    setError(null);

    try {
      const [pRes, dRes, cRes] = await Promise.all([
        fetch("/api/projects", { cache: "no-store" }),
        fetch("/api/divisions", { cache: "no-store" }),
        fetch("/api/clients", { cache: "no-store" }).catch(() => null as any),
      ]);

      const pJson = await pRes.json();
      if (!pRes.ok) throw new Error(pJson?.error ?? "Failed to load projects");

      const dJson = await dRes.json();
      if (!dRes.ok) throw new Error(dJson?.error ?? "Failed to load divisions");

      // clients route might not exist yet
      let cJson: any = { data: [] };
      if (cRes && (cRes as Response).ok) {
        cJson = await (cRes as Response).json();
      }

      setProjects(pJson.data ?? []);
      setDivisions(dJson.data ?? []);
      setClients(cJson.data ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function softDelete(id: string) {
    if (!confirm("Soft delete this bid? (It will be hidden from the list)")) return;

    setError(null);
    try {
      const res = await fetch(`/api/projects?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Delete failed");
      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "Delete failed");
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  return (
    <div className="min-h-screen bg-[#f6f8f6] px-6 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#123b1f]">Bids</h1>
            <p className="mt-1 text-sm text-[#3d5a45]">
              Draft bids list. (Creator email + soft delete enabled)
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={loadAll}
              className="rounded-md border border-[#9cc4a6] bg-white px-3 py-2 text-sm font-medium text-[#123b1f] hover:bg-[#eef6f0]"
            >
              Refresh
            </button>

            <Link
              href="/atlasbid/new"
              className="rounded-md bg-[#1e7a3a] px-3 py-2 text-sm font-medium text-white hover:bg-[#16602d]"
            >
              Create Bid
            </Link>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="mt-6 rounded-xl border border-[#d7e6db] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#eef6f0] text-left text-[#123b1f]">
                  <th className="px-4 py-3 font-semibold">Bid Code</th>
                  <th className="px-4 py-3 font-semibold">Division</th>
                  <th className="px-4 py-3 font-semibold">Client</th>
                  <th className="px-4 py-3 font-semibold">GP%</th>
                  <th className="px-4 py-3 font-semibold">Notes</th>
                  <th className="px-4 py-3 font-semibold">Created By</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-4 py-6 text-[#3d5a45]" colSpan={8}>
                      Loading…
                    </td>
                  </tr>
                ) : projects.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-[#3d5a45]" colSpan={8}>
                      No bids yet. Click <span className="font-medium">Create Bid</span>.
                    </td>
                  </tr>
                ) : (
                  projects.map((p) => {
                    const divisionName =
                      (p.division_id && divisionMap.get(p.division_id)?.name) ?? "—";
                    const clientName =
                      (p.client_id && clientMap.get(p.client_id)?.name) ?? "—";

                    return (
                      <tr key={p.id} className="border-t border-[#edf3ee]">
                        <td className="px-4 py-3 font-medium text-[#123b1f]">
                          {p.bid_code ?? "—"}
                        </td>
                        <td className="px-4 py-3">{divisionName}</td>
                        <td className="px-4 py-3">{clientName}</td>
                        <td className="px-4 py-3">{p.margin_percent ?? "—"}%</td>
                        <td className="px-4 py-3">{p.internal_notes ?? "—"}</td>
                        <td className="px-4 py-3">{p.created_by_email ?? "—"}</td>
                        <td className="px-4 py-3">{fmtDate(p.created_at)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex gap-2">
                            <Link
                              href={`/atlasbid/bids/${p.id}`}
                              className="rounded-md border border-[#9cc4a6] bg-white px-2.5 py-1.5 text-xs font-medium text-[#123b1f] hover:bg-[#eef6f0]"
                            >
                              Open
                            </Link>
                            <button
                              onClick={() => softDelete(p.id)}
                              className="rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-4 text-xs text-[#6b7f71]">
          Note: “Delete” is currently a soft delete (hides from list).
        </p>
      </div>
    </div>
  );
}
