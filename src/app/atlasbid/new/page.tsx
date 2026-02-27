"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type DivisionRow = {
  id: string; // UUID
  name: string;
  labor_rate: number;
  target_gross_profit_percent: number;
  allow_overtime: boolean;
  active: boolean;
};

type ClientRow = {
  id: string; // UUID
  display_name: string;
};

type CreateProjectPayload = {
  client_id?: string | null;
  division_id?: string | null;
  // sales can override margin on bid (default comes from ops/division but can change later)
  margin_percent?: number | null;
  prepay_selected?: boolean | null;
  // optional fields if your API supports them
  notes?: string | null;
};

function asNumberOrNull(v: string): number | null {
  const trimmed = v.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (Number.isNaN(n)) return null;
  return n;
}

function extractIdFromResponse(json: any): string | null {
  // supports: { id: "uuid" } or { data: { id: "uuid" } } or { data: [{ id: "uuid" }] }
  if (!json) return null;
  if (typeof json.id === "string") return json.id;
  if (json.data && typeof json.data.id === "string") return json.data.id;
  if (Array.isArray(json.data) && json.data.length && typeof json.data[0]?.id === "string") return json.data[0].id;
  return null;
}

export default function NewBidPage() {
  const router = useRouter();

  const [divisions, setDivisions] = useState<DivisionRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingLists, setLoadingLists] = useState<boolean>(false);

  // Form fields (minimal “create” — we can add more later)
  const [clientId, setClientId] = useState<string>("");
  const [divisionId, setDivisionId] = useState<string>("");
  const [marginPercent, setMarginPercent] = useState<string>(""); // store as string for input
  const [prepaySelected, setPrepaySelected] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>("");

  const selectedDivision = useMemo(
    () => divisions.find((d) => d.id === divisionId) ?? null,
    [divisions, divisionId]
  );

  async function loadLists() {
    setLoadingLists(true);
    try {
      // Divisions
      const divRes = await fetch("/api/operations-center/divisions", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      const divJson = await divRes.json().catch(() => ({}));
      if (!divRes.ok) {
        throw new Error(divJson?.error || divJson?.message || "Failed to load divisions.");
      }
      const divData: DivisionRow[] = Array.isArray(divJson?.data) ? divJson.data : Array.isArray(divJson) ? divJson : [];
      setDivisions(divData.filter((d) => d.active));

      // Clients (optional — if you don’t have clients endpoint yet, comment this block out)
      const clientRes = await fetch("/api/clients", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      const clientJson = await clientRes.json().catch(() => ({}));
      if (clientRes.ok) {
        const clientData: ClientRow[] = Array.isArray(clientJson?.data)
          ? clientJson.data
          : Array.isArray(clientJson)
            ? clientJson
            : [];
        setClients(clientData);
      } else {
        // Don’t hard-fail creation if clients aren’t ready yet
        setClients([]);
      }
    } catch (e: any) {
      alert(e?.message || "Failed to load lists.");
    } finally {
      setLoadingLists(false);
    }
  }

  React.useEffect(() => {
    // Auto-load lists when page opens
    loadLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate() {
    if (!divisionId) {
      alert("Please select a division.");
      return;
    }

    setLoading(true);
    try {
      const payload: CreateProjectPayload = {
        client_id: clientId ? clientId : null,
        division_id: divisionId,
        margin_percent: asNumberOrNull(marginPercent),
        prepay_selected: prepaySelected,
        notes: notes?.trim() ? notes.trim() : null,
      };

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        // surface most likely fields
        const msg =
          json?.error ||
          json?.message ||
          (typeof json === "string" ? json : null) ||
          "Create failed.";
        throw new Error(msg);
      }

      const newId = extractIdFromResponse(json);
      if (!newId) {
        throw new Error("Create succeeded but no project id was returned from /api/projects.");
      }

      // ✅ IMPORTANT: UUID is a string
      router.push(`/atlasbid/bid/${newId}`);
    } catch (e: any) {
      alert(e?.message || "Create failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Create Bid</h1>
          <div style={{ marginTop: 6, opacity: 0.75 }}>
            Create a bid shell first — then you’ll build labor/material lines inside the bid.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={loadLists}
            disabled={loadingLists || loading}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "white",
              cursor: loadingLists || loading ? "not-allowed" : "pointer",
            }}
          >
            {loadingLists ? "Refreshing…" : "Refresh lists"}
          </button>

          <button
            type="button"
            onClick={() => router.push("/atlasbid")}
            disabled={loading}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "white",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            Back to bids
          </button>
        </div>
      </div>

      <div style={{ marginTop: 18, border: "1px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Bid setup</h2>

        {/* Client (optional) */}
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 10, alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 600 }}>Client (optional)</div>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
          >
            <option value="">— Select client —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name}
              </option>
            ))}
          </select>
        </div>

        {/* Division */}
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 10, alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 600 }}>Division (required)</div>
          <select
            value={divisionId}
            onChange={(e) => {
              setDivisionId(e.target.value);
              // default margin to division target GP% as a starting point (sales can change later too)
              const next = divisions.find((d) => d.id === e.target.value);
              if (next) setMarginPercent(String(next.target_gross_profit_percent));
            }}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
          >
            <option value="">— Select division —</option>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        {/* Margin % */}
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 10, alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 600 }}>Gross profit % (override)</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              value={marginPercent}
              onChange={(e) => setMarginPercent(e.target.value)}
              placeholder={selectedDivision ? String(selectedDivision.target_gross_profit_percent) : "e.g. 50"}
              inputMode="decimal"
              style={{ width: 140, padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
            />
            <div style={{ opacity: 0.75 }}>%</div>
            {selectedDivision ? (
              <div style={{ marginLeft: 10, opacity: 0.75 }}>
                Division target: {selectedDivision.target_gross_profit_percent}%
              </div>
            ) : null}
          </div>
        </div>

        {/* Prepay */}
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 10, alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 600 }}>Prepay</div>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <input type="checkbox" checked={prepaySelected} onChange={(e) => setPrepaySelected(e.target.checked)} />
            <span>Offer prepay discount (toggle)</span>
          </label>
        </div>

        {/* Notes */}
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 10, alignItems: "start", marginBottom: 14 }}>
          <div style={{ fontWeight: 600 }}>Notes (optional)</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd", width: "100%" }}
            placeholder="Internal notes (optional)"
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button
            type="button"
            onClick={handleCreate}
            disabled={loading}
            style={{
              padding: "12px 16px",
              borderRadius: 10,
              border: "1px solid #1b5e20",
              background: loading ? "#c8e6c9" : "#2e7d32",
              color: "white",
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              minWidth: 140,
            }}
          >
            {loading ? "Creating…" : "Create bid"}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 14, opacity: 0.7, fontSize: 13 }}>
        Next step after this: the bid detail page (labor/material lines, pricing calc, and export text).
      </div>
    </div>
  );
}
