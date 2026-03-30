"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ReportCard = {
  id: string;
  name: string;
  description: string | null;
  widget_count: number;
  created_at: string;
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      {/* Decorative icon cluster */}
      <div className="relative mb-8">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-xl"
          style={{ background: "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)" }}
        >
          <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-emerald-400 flex items-center justify-center shadow">
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
          </svg>
        </div>
      </div>

      <h2 className="text-xl font-semibold text-gray-800 mb-2">No reports yet</h2>
      <p className="text-sm text-gray-500 max-w-sm mb-8 leading-relaxed">
        Build custom reports with stat cards, job summaries, and team breakdowns — then save and revisit them anytime.
      </p>
      <button
        onClick={onCreate}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white shadow-lg transition-all hover:scale-105 hover:shadow-xl"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)" }}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
        </svg>
        Create Your First Report
      </button>
    </div>
  );
}

// ── Report card ───────────────────────────────────────────────────────────────

function ReportCard({
  report,
  onOpen,
  onDelete,
}: {
  report: ReportCard;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="group relative bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 overflow-hidden">
      {/* Color bar */}
      <div
        className="h-1.5"
        style={{ background: "linear-gradient(90deg, #0d2616, #1a4a28, #166534)" }}
      />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 text-base truncate leading-tight">
              {report.name}
            </h3>
            {report.description && (
              <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                {report.description}
              </p>
            )}
          </div>
          <div
            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)" }}
          >
            <svg className="w-4 h-4 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-3 mb-4">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-xs font-medium text-emerald-700">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h8" />
            </svg>
            {report.widget_count} widget{report.widget_count !== 1 ? "s" : ""}
          </span>
          <span className="text-xs text-gray-400">
            Created {fmtDate(report.created_at)}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpen}
            className="flex-1 py-2 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)" }}
          >
            Open Report
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={onDelete}
                className="px-3 py-2 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-2 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Delete report"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ReportsListPage() {
  const router = useRouter();
  const [reports, setReports] = useState<ReportCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  async function loadReports() {
    setLoading(true);
    const res = await fetch("/api/operations-center/atlas-ops/lawn/division-reports?division=lawn", {
      cache: "no-store",
    });
    const json = await res.json();
    setReports(json.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadReports();
  }, []);

  async function handleCreate() {
    setCreating(true);
    const res = await fetch("/api/operations-center/atlas-ops/lawn/division-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Report", division: "lawn" }),
    });
    const json = await res.json();
    setCreating(false);
    if (json.data?.id) {
      router.push(`/operations-center/atlas-ops/lawn/reports/${json.data.id}`);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/operations-center/atlas-ops/lawn/division-reports/${id}`, {
      method: "DELETE",
    });
    loadReports();
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/60 to-white">
      {/* Hero header */}
      <div
        className="relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #1a4a28 100%)" }}
      >
        {/* Background texture */}
        <div className="absolute inset-0 opacity-5">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(255,255,255,0.1) 40px, rgba(255,255,255,0.1) 41px), repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(255,255,255,0.1) 40px, rgba(255,255,255,0.1) 41px)",
            }}
          />
        </div>

        <div className="relative mx-auto max-w-[1200px] px-6 py-10">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
                  <svg className="w-5 h-5 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                      d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">
                  Lawn Division
                </span>
              </div>
              <h1 className="text-3xl font-bold text-white tracking-tight">Reports</h1>
              <p className="text-sm text-white/50 mt-1.5 max-w-md">
                Build, save, and run custom data reports for any time period
              </p>
            </div>

            <button
              onClick={handleCreate}
              disabled={creating}
              className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-emerald-900 bg-emerald-400 hover:bg-emerald-300 transition-all shadow-lg hover:shadow-xl hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {creating ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Creating…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  New Report
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-[1200px] px-6 py-8">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="h-1.5 bg-gray-100" />
                <div className="p-5 space-y-3">
                  <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" />
                  <div className="h-8 bg-gray-100 rounded-lg animate-pulse mt-4" />
                </div>
              </div>
            ))}
          </div>
        ) : reports.length === 0 ? (
          <EmptyState onCreate={handleCreate} />
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm text-gray-500">
                {reports.length} report{reports.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {reports.map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  onOpen={() =>
                    router.push(`/operations-center/atlas-ops/lawn/reports/${report.id}`)
                  }
                  onDelete={() => handleDelete(report.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
