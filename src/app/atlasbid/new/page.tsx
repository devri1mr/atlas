"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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

export default function CreateBidPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [divisions, setDivisions] = useState<Division[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  // Form state
  const [divisionId, setDivisionId] = useState<string>("");
  const [clientId, setClientId] = useState<string>("");
  const [newClientName, setNewClientName] = useState<string>("");

  const [marginPercent, setMarginPercent] = useState<number>(0);

  // optional: local user email storage (until Google login is wired)
  const [creatorEmail, setCreatorEmail] = useState<string>("");

  const activeDivisions = useMemo(
    () => divisions.filter((d) => d.active),
    [divisions]
  );

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [dRes, cRes] = await Promise.all([
        fetch("/api/divisions", { cache: "no-store" }),
        fetch("/api/clients", { cache: "no-store" }).catch(() => null as any),
      ]);

      const dJson = await dRes.json();
      if (!dRes.ok) throw new Error(dJson?.error ?? "Failed to load divisions");
      setDivisions(dJson.data ?? []);

      // clients route might not exist yet
      if (cRes && (cRes as Response).ok) {
        const cJson = await (cRes as Response).json();
        setClients(cJson.data ?? []);
      } else {
        setClients([]);
      }

      // try to pull email from localStorage (temporary until Google auth)
      try {
        const saved = window.localStorage.getItem("atlas_user_email") || "";
        setCreatorEmail(saved);
      } catch {
        // ignore
      }
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  // Step 5: default GP% to selected division target
  useEffect(() => {
    if (!divisionId) return;
    const selected = divisions.find((d) => d.id === divisionId);
    if (selected) setMarginPercent(Number(selected.target_gross_profit_percent));
  }, [divisionId, divisions]);

  useEffect(() => {
    loadData();
  }, []);

  async function addClient() {
    setError(null);

    const name = newClientName.trim();
    if (!name) {
      setError("Client name is required to add a client.");
      return;
    }

    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Failed to create client");

      const created: Client = json.data;
      setClients((prev) => [created, ...prev]);
      setClientId(created.id);
      setNewClientName("");
    } catch (e: any) {
      setError(e?.message ?? "Failed to add client");
    }
  }

  async function createBid() {
    setError(null);

    if (!divisionId) {
      setError("Division is required.");
      return;
    }

    // store email (temporary approach)
    try {
      if (creatorEmail.trim()) {
        window.localStorage.setItem("atlas_user_email", creatorEmail.trim());
      }
    } catch {
      // ignore
    }

    setSaving(true);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // temporary until we wire Google auth:
          ...(creatorEmail.trim() ? { "x-user-email": creatorEmail.trim() } : {}),
        },
        body: JSON.stringify({
          division_id: divisionId,
          client_id: clientId || null,
          margin_percent: marginPercent,
          // notes should be on bid list only; do NOT ask here
          internal_notes: null,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Failed to create bid");

      const newBid = json.data;
      router.push(`/atlasbid/bids/${newBid.id}`);
    } catch (e: any) {
      setError(e?.message ?? "Create bid failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f6f8f6] px-6 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#123b1f]">Create Bid</h1>
            <p className="mt-1 text-sm text-[#3d5a45]">
              Select division + (optional) client, then create the bid.
            </p>
          </div>

          <button
            onClick={() => router.push("/atlasbid")}
            className="rounded-md border border-[#9cc4a6] bg-white px-3 py-2 text-sm font-medium text-[#123b1f] hover:bg-[#eef6f0]"
          >
            Back to bids
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="mt-6 rounded-xl border border-[#d7e6db] bg-white p-5 shadow-sm">
          {loading ? (
            <div className="py-10 text-sm text-[#3d5a45]">Loading…</div>
          ) : (
            <div className="space-y-5">
              {/* Creator email (temporary until Google auth) */}
              <div>
                <label className="block text-sm font-medium text-[#123b1f]">
                  Created by (email) — temporary
                </label>
                <input
                  value={creatorEmail}
                  onChange={(e) => setCreatorEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="mt-1 w-full rounded-md border border-[#cfe2d3] px-3 py-2 text-sm outline-none focus:border-[#1e7a3a]"
                />
                <p className="mt-1 text-xs text-[#6b7f71]">
                  We’ll replace this with Google login capture. For now it feeds the bid list “Created By”.
                </p>
              </div>

              {/* Division */}
              <div>
                <label className="block text-sm font-medium text-[#123b1f]">
                  Division (required)
                </label>
                <select
                  value={divisionId}
                  onChange={(e) => setDivisionId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[#cfe2d3] bg-white px-3 py-2 text-sm outline-none focus:border-[#1e7a3a]"
                >
                  <option value="">— Select division —</option>
                  {activeDivisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* GP% */}
              <div>
                <label className="block text-sm font-medium text-[#123b1f]">
                  Gross Profit % (defaults from division, editable)
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="number"
                    value={Number.isFinite(marginPercent) ? marginPercent : 0}
                    onChange={(e) => setMarginPercent(Number(e.target.value))}
                    className="w-32 rounded-md border border-[#cfe2d3] px-3 py-2 text-sm outline-none focus:border-[#1e7a3a]"
                    min={0}
                    max={100}
                    step={0.1}
                  />
                  <span className="text-sm text-[#3d5a45]">%</span>
                </div>
                <p className="mt-1 text-xs text-[#6b7f71]">
                  This will warn later if below division target (on bid pricing screen).
                </p>
              </div>

              {/* Client select + add */}
              <div>
                <label className="block text-sm font-medium text-[#123b1f]">
                  Client (optional)
                </label>

                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[#cfe2d3] bg-white px-3 py-2 text-sm outline-none focus:border-[#1e7a3a]"
                >
                  <option value="">— No client selected —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <div className="mt-3 flex gap-2">
                  <input
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="Add new client name…"
                    className="flex-1 rounded-md border border-[#cfe2d3] px-3 py-2 text-sm outline-none focus:border-[#1e7a3a]"
                  />
                  <button
                    type="button"
                    onClick={addClient}
                    className="rounded-md border border-[#9cc4a6] bg-white px-3 py-2 text-sm font-medium text-[#123b1f] hover:bg-[#eef6f0]"
                  >
                    Add Client
                  </button>
                </div>

                <p className="mt-1 text-xs text-[#6b7f71]">
                  If Add Client fails, you likely don’t have <code>/api/clients</code> yet.
                </p>
              </div>

              {/* Actions */}
              <div className="pt-2">
                <button
                  disabled={saving}
                  onClick={createBid}
                  className="rounded-md bg-[#1e7a3a] px-4 py-2 text-sm font-medium text-white hover:bg-[#16602d] disabled:opacity-60"
                >
                  {saving ? "Creating…" : "Create bid"}
                </button>

                <p className="mt-3 text-xs text-[#6b7f71]">
                  Prepay is intentionally NOT here anymore — it will be selected at the end of the bid.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
