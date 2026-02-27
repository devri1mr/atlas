"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Status = { id: number; name: string };

type BidRow = {
  id: number;
  client_name: string | null;
  client_last_name: string | null;
  created_at: string;
  status_id: number | null;
  bid_statuses?: { name: string } | null;
};

function fmtDate(s: string) {
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

export default function NewBidPage() {
  const router = useRouter();

  const [statuses, setStatuses] = useState<Status[]>([]);
  const [bids, setBids] = useState<BidRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [statusId, setStatusId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function load() {
    setLoading(true);
    setErrorMsg("");

    const [sRes, bRes] = await Promise.all([
      fetch("/api/bid-statuses", { cache: "no-store" }),
      fetch("/api/bids", { cache: "no-store" }),
    ]);

    const sJson = await sRes.json();
    const bJson = await bRes.json();

    setStatuses(Array.isArray(sJson?.data) ? sJson.data : []);
    setBids(Array.isArray(bJson?.data) ? bJson.data : []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const canSave = useMemo(() => {
    return firstName.trim().length > 0 && lastName.trim().length > 0 && !saving;
  }, [firstName, lastName, saving]);

  async function createBid() {
    if (!canSave) return;

    setSaving(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: firstName.trim(),
          client_last_name: lastName.trim(),
          status_id: statusId === "" ? null : statusId,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setErrorMsg(json?.error || "Failed to create bid");
        setSaving(false);
        return;
      }

      const newBid: BidRow = json.data;
      // send them straight into the bid workspace
      router.push(`/atlasbid/bids/${newBid.id}`);
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to create bid");
      setSaving(false);
    }
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold">AtlasBid</h1>
          <p className="text-gray-500">New Bid (Draft)</p>
        </div>

        <Link
          href="/"
          className="text-sm text-emerald-800 hover:underline"
        >
          Back to home
        </Link>
      </div>

      {/* CREATE */}
      <div className="border rounded-xl p-6 bg-white shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Create Draft</h2>
          <button
            onClick={load}
            className="text-sm px-3 py-2 rounded-lg border hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>

        {errorMsg ? (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {errorMsg}
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Client First Name</label>
            <input
              className="w-full border rounded-lg p-2"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="John"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-600">Client Last Name</label>
            <input
              className="w-full border rounded-lg p-2"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Smith"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-600">Status</label>
            <select
              className="w-full border rounded-lg p-2 bg-white"
              value={statusId}
              onChange={(e) => {
                const v = e.target.value;
                setStatusId(v === "" ? "" : Number(v));
              }}
            >
              <option value="">(Optional)</option>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="pt-2">
          <button
            onClick={createBid}
            disabled={!canSave}
            className="bg-emerald-700 disabled:bg-emerald-300 text-white rounded-lg px-4 py-2 font-medium"
          >
            {saving ? "Saving..." : "Create Draft"}
          </button>
        </div>
      </div>

      {/* LIST */}
      <div className="border rounded-xl p-6 bg-white shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">Drafts & Recent Bids</h2>

        {loading ? (
          <div className="text-gray-500">Loading…</div>
        ) : bids.length === 0 ? (
          <div className="text-gray-500">No bids yet.</div>
        ) : (
          <div className="overflow-auto">
            <div className="min-w-[780px] grid grid-cols-12 gap-3 text-xs font-semibold text-gray-600 border-b pb-2">
              <div className="col-span-1">ID</div>
              <div className="col-span-4">Client</div>
              <div className="col-span-3">Status</div>
              <div className="col-span-3">Created</div>
              <div className="col-span-1 text-right">Open</div>
            </div>

            <div className="divide-y">
              {bids.map((b) => (
                <div key={b.id} className="min-w-[780px] grid grid-cols-12 gap-3 py-3 text-sm items-center">
                  <div className="col-span-1 text-gray-700">{b.id}</div>
                  <div className="col-span-4 font-medium">
                    {(b.client_name || "").trim()} {(b.client_last_name || "").trim()}
                  </div>
                  <div className="col-span-3 text-gray-700">
                    {b.bid_statuses?.name || "—"}
                  </div>
                  <div className="col-span-3 text-gray-500">{fmtDate(b.created_at)}</div>
                  <div className="col-span-1 text-right">
                    <Link
                      className="text-emerald-800 hover:underline"
                      href={`/atlasbid/bids/${b.id}`}
                    >
                      Open
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
