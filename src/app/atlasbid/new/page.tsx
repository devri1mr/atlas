"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Division = {
  id: number;
  name: string;
  default_gp_percent: number;
};

export default function NewBidPage() {
  const router = useRouter();

  const [divisions, setDivisions] = useState<Division[]>([]);
  const [divisionId, setDivisionId] = useState<string>("");
  const [clientFirstName, setClientFirstName] = useState("");
  const [clientLastName, setClientLastName] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Load divisions
  useEffect(() => {
    async function loadDivisions() {
      try {
        const res = await fetch("/api/divisions");
        const json = await res.json();

        if (!res.ok) {
          throw new Error(json.error || "Failed to load divisions");
        }

        setDivisions(json.data || []);
      } catch (err: any) {
        setError(err.message);
      }
    }

    loadDivisions();
  }, []);

  async function handleCreateBid() {
    setError(null);

    if (!divisionId) {
      setError("Please select a division.");
      return;
    }

    if (!clientFirstName || !clientLastName) {
      setError("Client first and last name are required.");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch("/api/bids", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          division_id: Number(divisionId), // 🔥 Critical fix
          client_name: clientFirstName,
          client_last_name: clientLastName,
          internal_notes: internalNotes || null,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to create bid");
      }

      // Redirect to new bid page
      router.push(`/atlasbid/bids/${json.data.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const selectedDivision = divisions.find(
    (d) => d.id === Number(divisionId)
  );

  return (
    <div style={{ maxWidth: 700, margin: "40px auto" }}>
      <h1>Create Bid</h1>
      <p>
        Choose a division, enter the client, add internal notes (optional),
        then create.
      </p>

      {error && (
        <div
          style={{
            background: "#ffe6e6",
            color: "#a80000",
            padding: 12,
            marginBottom: 16,
            borderRadius: 4,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Division */}
        <div>
          <label>Division</label>
          <select
            value={divisionId}
            onChange={(e) => setDivisionId(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          >
            <option value="">Select Division</option>
            {divisions.map((division) => (
              <option key={division.id} value={division.id}>
                {division.name}
              </option>
            ))}
          </select>

          {selectedDivision && (
            <div style={{ marginTop: 8, fontSize: 14, color: "#666" }}>
              Default GP% for this division:{" "}
              <strong>{selectedDivision.default_gp_percent}%</strong>
            </div>
          )}
        </div>

        {/* Client Name */}
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <label>Client First Name</label>
            <input
              value={clientFirstName}
              onChange={(e) => setClientFirstName(e.target.value)}
              style={{ width: "100%", padding: 8 }}
            />
          </div>

          <div style={{ flex: 1 }}>
            <label>Client Last Name</label>
            <input
              value={clientLastName}
              onChange={(e) => setClientLastName(e.target.value)}
              style={{ width: "100%", padding: 8 }}
            />
          </div>
        </div>

        {/* Internal Notes */}
        <div>
          <label>Internal Notes (optional)</label>
          <textarea
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            rows={4}
            style={{ width: "100%", padding: 8 }}
          />
        </div>

        <button
          onClick={handleCreateBid}
          disabled={loading}
          style={{
            background: "#2e7d32",
            color: "white",
            padding: "10px 16px",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          {loading ? "Creating..." : "Create Bid"}
        </button>
      </div>
    </div>
  );
}
