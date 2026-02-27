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
  deleted_at?: string | null;
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

export default function BidDetailClient({ id }: { id: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [project, setProject] = useState<ProjectRow | null>(null);
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

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const [pRes, dRes, cRes] = await Promise.all([
        fetch(`/api/projects?id=${encodeURIComponent(id)}`, { cache: "no-store" }),
        fetch("/api/divisions", { cache: "no-store" }),
        fetch("/api/clients", { cache: "no-store" }).catch(() => null as any),
      ]);

      const pJson = await pRes.json().catch(() => ({}));
      if (!pRes.ok) throw new Error(pJson?.error ?? "Failed to load bid");

      const dJson = await dRes.json().catch(() => ({}));
      if (!dRes.ok) throw new Error(dJson?.error ?? "Failed to load divisions");

      let cJson: any = { data: [] };
      if (cRes && (cRes as Response).ok) cJson = await (cRes as Response).json();

      // /api/projects?id=... can return {data: row} or {data:[row]} depending on your route
      const pData = pJson?.data;
      const row: ProjectRow | null = Array.isArray(pData) ? (pData[0] ?? null) : (pData ?? null);

      setProject(row);
      setDivisions(dJson?.data ?? []);
      setClients(cJson?.data ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const divisionName =
    project?.division_id ? divisionMap.get(project.division_id)?.name ?? "—" : "—";
  const clientName =
    project?.client_id ? clientMap.get(project.client_id)?.name ?? "—" : "—";

  return (
    <div className="min-h-screen bg-[#f6f8f6] px-6 py-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#123b1f]">Bid Detail</h1>
            <p className="mt-1 text-sm text-[#3d5a45]">Bid ID: {id}</p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/atlasbid"
              className="rounded-md border border-[#9cc4a6] bg-white px-3 py-2 text-sm font-medium text-[#123b1f] hover:bg-[#eef6f0]"
            >
              Back to bids
            </Link>

            <button
              onClick={load}
              className="rounded-md bg-[#1e7a3a] px-3 py-2 text-sm font-medium text-white hover:bg-[#16602d]"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="mt-6 rounded-xl border border-[#d7e6db] bg-white p-5 shadow-sm">
          {loading ? (
            <div className="text-sm text-[#3d5a45]">Loading…</div>
          ) : !project ? (
            <div className="text-sm text-[#3d5a45]">Bid not found.</div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs font-semibold text-[#3d5a45]">Bid Code</div>
                <div className="mt-1 text-sm text-[#123b1f]">{project.bid_code ?? "—"}</div>
              </div>

              <div>
                <div className="text-xs font-semibold text-[#3d5a45]">Created</div>
                <div className="mt-1 text-sm text-[#123b1f]">{fmtDate(project.created_at)}</div>
              </div>

              <div>
                <div className="text-xs font-semibold text-[#3d5a45]">Division</div>
                <div className="mt-1 text-sm text-[#123b1f]">{divisionName}</div>
              </div>

              <div>
                <div className="text-xs font-semibold text-[#3d5a45]">Client</div>
                <div className="mt-1 text-sm text-[#123b1f]">{clientName}</div>
              </div>

              <div>
                <div className="text-xs font-semibold text-[#3d5a45]">GP%</div>
                <div className="mt-1 text-sm text-[#123b1f]">
                  {project.margin_percent ?? "—"}%
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-[#3d5a45]">Created By</div>
                <div className="mt-1 text-sm text-[#123b1f]">
                  {project.created_by_email ?? "—"}
                </div>
              </div>

              <div className="sm:col-span-2">
                <div className="text-xs font-semibold text-[#3d5a45]">Internal Notes</div>
                <div className="mt-1 whitespace-pre-wrap text-sm text-[#123b1f]">
                  {project.internal_notes ?? "—"}
                </div>
              </div>
            </div>
          )}
        </div>

        <p className="mt-4 text-xs text-[#6b7f71]">
          This page exists so the “Open” button doesn’t 404. We’ll add pricing lines next.
        </p>
      </div>
    </div>
  );
}
