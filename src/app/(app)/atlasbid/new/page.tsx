"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Division = { id: string; name: string; default_gp_percent: number };

export default function NewBidPage() {
  const router = useRouter();
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [divisionId, setDivisionId] = useState("");
  const [clientFirstName, setClientFirstName] = useState("");
  const [clientLastName, setClientLastName] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creatorName, setCreatorName] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/divisions")
      .then(r => r.json())
      .then(j => { setDivisions(j.data ?? []); })
      .catch(() => {});

    // Capture current user's name for attribution
    getSupabaseClient().auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (!user) return;
      const fullName = user.user_metadata?.full_name as string | undefined;
      if (fullName?.trim()) {
        setCreatorName(fullName.trim());
      } else {
        const email = user.email ?? "";
        const derived = email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
        setCreatorName(derived || null);
      }
    }).catch(() => {});
  }, []);

  const selectedDivision = useMemo(() => divisions.find(d => d.id === divisionId), [divisions, divisionId]);

  async function handleCreate() {
    setError(null);
    if (!divisionId) { setError("Please select a division."); return; }
    if (!clientFirstName || !clientLastName) { setError("First and last name are required."); return; }
    try {
      setLoading(true);
      const res = await fetch("/api/bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ division_id: divisionId, client_name: clientFirstName, client_last_name: clientLastName, internal_notes: internalNotes || null, created_by_name: creatorName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create bid");
      router.push(`/atlasbid/bids/${json.data.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all placeholder:text-gray-400";
  const labelCls = "block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide";

  return (
    <div className="min-h-screen bg-[#f0f4f0]">
      {/* Header */}
      <div
        className="px-4 md:px-8 py-6 md:py-8"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}
      >
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">New Bid</h1>
          <p className="text-white/50 text-sm mt-1">Enter client details to create a new bid.</p>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-2xl mx-auto space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">

          {/* Division */}
          <div>
            <label className={labelCls}>Division</label>
            <select value={divisionId} onChange={e => setDivisionId(e.target.value)} className={inputCls}>
              <option value="">Select a division…</option>
              {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            {selectedDivision && (
              <p className="mt-1.5 text-xs text-gray-500">
                Default GP%: <span className="font-semibold text-gray-700">{selectedDivision.default_gp_percent}%</span>
              </p>
            )}
          </div>

          {/* Client name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>First Name</label>
              <input value={clientFirstName} onChange={e => setClientFirstName(e.target.value)} className={inputCls} placeholder="John" />
            </div>
            <div>
              <label className={labelCls}>Last Name</label>
              <input value={clientLastName} onChange={e => setClientLastName(e.target.value)} className={inputCls} placeholder="Smith" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>
              Internal Notes <span className="text-gray-400 font-normal normal-case tracking-normal">(optional)</span>
            </label>
            <textarea
              value={internalNotes}
              onChange={e => setInternalNotes(e.target.value)}
              rows={4}
              className={inputCls + " resize-none"}
              placeholder="Notes visible only to your team…"
            />
          </div>

          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full bg-[#123b1f] text-white font-semibold py-3 rounded-xl hover:bg-[#1a5c2e] disabled:opacity-60 transition-colors text-sm"
          >
            {loading ? "Creating…" : "Create Bid →"}
          </button>
        </div>
      </div>
    </div>
  );
}
