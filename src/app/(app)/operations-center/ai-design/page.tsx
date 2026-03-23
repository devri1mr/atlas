"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type UsageData = {
  this_month: number;
  all_time: number;
  monthly_limit: number;
  next_reset: string;
  recent: { id: string; bid_id: string; refined_prompt: string | null; created_at: string }[];
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default function AiDesignSettingsPage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/atlasbid/ai-design/usage")
      .then(r => r.json())
      .then(j => {
        if (j.error) throw new Error(j.error);
        setData(j);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const pct = data ? Math.min(100, Math.round((data.this_month / data.monthly_limit) * 100)) : 0;
  const barColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-[#16a34a]";

  return (
    <div className="min-h-screen bg-[#f0f4f0]">
      {/* Header */}
      <div
        className="px-4 md:px-8 py-6 md:py-8"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}
      >
        <div className="max-w-3xl mx-auto">
          <Link href="/operations-center" className="text-white/50 text-sm hover:text-white/80 transition-colors">
            ← Operations Center
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight mt-2">AI Design</h1>
          <p className="text-white/50 text-sm mt-1">Usage limits and generation history.</p>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-white animate-pulse border border-gray-100" />
            ))}
          </div>
        ) : data && (
          <>
            {/* Usage card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-gray-900">This Month</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Resets {data.next_reset}</p>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-bold text-gray-900 tabular-nums">{data.this_month}</span>
                  <span className="text-lg text-gray-400 font-medium"> / {data.monthly_limit}</span>
                  <p className="text-xs text-gray-400 mt-0.5">generations</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${barColor}`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              {pct >= 90 && (
                <p className="text-xs text-red-600 font-medium">
                  Approaching the monthly limit. {data.monthly_limit - data.this_month} generations remaining.
                </p>
              )}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">All-Time</p>
                <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{data.all_time}</p>
                <p className="text-xs text-gray-500 mt-0.5">total generations</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Monthly Limit</p>
                <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{data.monthly_limit}</p>
                <p className="text-xs text-gray-500 mt-0.5">~${(data.monthly_limit * 0.04).toFixed(2)} max/mo</p>
              </div>
            </div>

            {/* Recent generations */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50">
                <h2 className="font-semibold text-gray-900 text-sm">Recent Generations</h2>
              </div>
              {data.recent.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-gray-400">No generations yet.</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {data.recent.map(r => (
                    <div key={r.id} className="px-5 py-3 flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-700 truncate">
                          {r.refined_prompt ?? <span className="text-gray-400 italic">No prompt recorded</span>}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{fmtDate(r.created_at)}</p>
                      </div>
                      <Link
                        href={`/atlasbid/bids/${r.bid_id}/design`}
                        className="shrink-0 text-xs text-[#16a34a] font-semibold hover:underline"
                      >
                        View bid →
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-xs text-gray-400 text-center">
              To change the monthly limit, update <code className="bg-gray-100 px-1 py-0.5 rounded">MONTHLY_LIMIT</code> in{" "}
              <code className="bg-gray-100 px-1 py-0.5 rounded">api/atlasbid/ai-design/generate/route.ts</code>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
