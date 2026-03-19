"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Division = {
  id: string; // ✅ uuid
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

  useEffect(() => {
    async function loadDivisions() {
      try {
        const res = await fetch("/api/divisions");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load divisions");
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          division_id: divisionId, // ✅ UUID STRING (critical fix)
          client_name: clientFirstName,
          client_last_name: clientLastName,
          internal_notes: internalNotes || null,
        }),
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

  const selectedDivision = useMemo(
    () => divisions.find((d) => d.id === divisionId),
    [divisions, divisionId]
  );

  const styles: Record<string, React.CSSProperties> = {
    page: { minHeight: "calc(100vh - 40px)", padding: 24, background: "#f6f7f9" },
    shell: { maxWidth: 860, margin: "24px auto" },
    card: {
      background: "#fff",
      border: "1px solid #e6e8ee",
      borderRadius: 12,
      padding: 24,
      boxShadow: "0 6px 18px rgba(16, 24, 40, 0.06)",
    },
    header: { marginBottom: 18 },
    title: { margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "#111827" },
    subtitle: { marginTop: 8, marginBottom: 0, color: "#4b5563", fontSize: 14, lineHeight: 1.4 },
    error: {
      background: "#fff1f2",
      color: "#9f1239",
      border: "1px solid #fecdd3",
      padding: 12,
      marginTop: 16,
      borderRadius: 10,
      fontSize: 14,
    },
    form: { display: "flex", flexDirection: "column", gap: 16, marginTop: 18 },
    row2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
    field: { display: "flex", flexDirection: "column", gap: 8 },
    label: { fontSize: 13, fontWeight: 600, color: "#111827" },
    input: {
      width: "100%",
      padding: "10px 12px",
      border: "1px solid #d1d5db",
      borderRadius: 10,
      outline: "none",
      fontSize: 14,
      background: "#fff",
    },
    select: {
      width: "100%",
      padding: "10px 12px",
      border: "1px solid #d1d5db",
      borderRadius: 10,
      outline: "none",
      fontSize: 14,
      background: "#fff",
      cursor: "pointer",
    },
    textarea: {
      width: "100%",
      padding: "10px 12px",
      border: "1px solid #d1d5db",
      borderRadius: 10,
      outline: "none",
      fontSize: 14,
      background: "#fff",
      resize: "vertical",
    },
    helper: { fontSize: 13, color: "#6b7280", marginTop: 6 },
    helperStrong: { color: "#111827", fontWeight: 700 },
    actions: { display: "flex", justifyContent: "flex-end", marginTop: 8 },
    button: {
      background: "#2e7d32",
      color: "white",
      padding: "12px 16px",
      border: "none",
      borderRadius: 10,
      cursor: "pointer",
      fontSize: 14,
      fontWeight: 700,
      minWidth: 160,
    },
    buttonDisabled: { opacity: 0.65, cursor: "not-allowed" },
  };

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.card}>
          <div style={styles.header}>
            <h1 style={styles.title}>Create Bid</h1>
            <p style={styles.subtitle}>
              Choose a division, enter the client, add internal notes (optional), then create.
            </p>

            {error && <div style={styles.error}>{error}</div>}
          </div>

          <div style={styles.form}>
            <div style={styles.field}>
              <label style={styles.label}>Division</label>
              <select value={divisionId} onChange={(e) => setDivisionId(e.target.value)} style={styles.select}>
                <option value="">Select Division</option>
                {divisions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.name}
                  </option>
                ))}
              </select>

              {selectedDivision && (
                <div style={styles.helper}>
                  Default GP% for this division:{" "}
                  <span style={styles.helperStrong}>{selectedDivision.default_gp_percent}%</span>
                </div>
              )}
            </div>

            <div style={styles.row2}>
              <div style={styles.field}>
                <label style={styles.label}>Client First Name</label>
                <input
                  value={clientFirstName}
                  onChange={(e) => setClientFirstName(e.target.value)}
                  style={styles.input}
                  placeholder="First name"
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Client Last Name</label>
                <input
                  value={clientLastName}
                  onChange={(e) => setClientLastName(e.target.value)}
                  style={styles.input}
                  placeholder="Last name"
                />
              </div>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Internal Notes (optional)</label>
              <textarea
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                rows={5}
                style={styles.textarea}
                placeholder="Anything the crew / ops team should know…"
              />
            </div>

            <div style={styles.actions}>
              <button
                onClick={handleCreateBid}
                disabled={loading}
                style={{ ...styles.button, ...(loading ? styles.buttonDisabled : null) }}
              >
                {loading ? "Creating..." : "Create Bid"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
