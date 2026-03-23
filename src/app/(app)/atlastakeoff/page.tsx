"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

type Takeoff = {
  id: string;
  name: string;
  client_name: string | null;
  address: string | null;
  status: string;
  created_at: string;
  plan_file_name: string | null;
  takeoff_items: { id: string }[];
};

export default function AtlasTakeoffPage() {
  const router = useRouter();
  const [takeoffs, setTakeoffs] = useState<Takeoff[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showNew, setShowNew]   = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", client_name: "", address: "" });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/takeoff", { cache: "no-store" });
      const json = await res.json();
      setTakeoffs(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function createTakeoff(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const res  = await fetch("/api/takeoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.data?.id) router.push(`/atlastakeoff/${json.data.id}`);
    } finally {
      setCreating(false);
    }
  }

  const fmt = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div style={{ minHeight: "100vh", background: "#f0f4f8" }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #0d1f3c 0%, #1a3a6b 60%, #1e4d8c 100%)",
        padding: "16px 24px",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Image src="/atlas-takeoff-logo.png" alt="Atlas Takeoff" height={52} width={78} style={{ objectFit: "contain", display: "block" }} />
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>
              AI-powered landscape plan takeoffs
            </div>
          </div>
          <button
            onClick={() => setShowNew(true)}
            style={{
              background: "linear-gradient(135deg, #4ade80 0%, #16a34a 100%)",
              color: "#fff", border: "none", borderRadius: 10,
              padding: "10px 22px", fontSize: 14, fontWeight: 700,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
              boxShadow: "0 4px 14px rgba(74,222,128,0.35)",
            }}
          >
            <span style={{ fontSize: 18 }}>+</span> New Takeoff
          </button>
        </div>
      </div>

      <div style={{ padding: "24px 24px" }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 60 }}>
            <div style={{ width: 32, height: 32, border: "3px solid #dbeafe", borderTopColor: "#2563eb", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : takeoffs.length === 0 ? (
          <div style={{ textAlign: "center", paddingTop: 80 }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>📐</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1e3a5f", marginBottom: 8 }}>No takeoffs yet</div>
            <div style={{ fontSize: 14, color: "#64748b", marginBottom: 24 }}>
              Create your first takeoff to start counting plants and measuring areas from landscape plans.
            </div>
            <button
              onClick={() => setShowNew(true)}
              style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 10, padding: "12px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              Create First Takeoff
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
            {takeoffs.map(t => (
              <div
                key={t.id}
                onClick={() => router.push(`/atlastakeoff/${t.id}`)}
                style={{
                  background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0",
                  padding: "20px", cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                  transition: "transform 0.15s, box-shadow 0.15s",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.transform = "";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 10,
                    background: "linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
                  }}>
                    📋
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99,
                      background: t.plan_file_name ? "#dcfce7" : "#f1f5f9",
                      color: t.plan_file_name ? "#15803d" : "#64748b",
                    }}>
                      {t.plan_file_name ? "Plan uploaded" : "No plan yet"}
                    </span>
                    <button
                      onClick={async e => {
                        e.stopPropagation();
                        if (!confirm(`Delete "${t.name}"? This cannot be undone.`)) return;
                        await fetch(`/api/takeoff/${t.id}`, { method: "DELETE" });
                        setTakeoffs(prev => prev.filter(x => x.id !== t.id));
                      }}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "#cbd5e1", fontSize: 14, padding: "2px 4px", borderRadius: 4,
                        lineHeight: 1,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
                      onMouseLeave={e => (e.currentTarget.style.color = "#cbd5e1")}
                      title="Delete takeoff"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>{t.name}</div>
                {t.client_name && <div style={{ fontSize: 13, color: "#475569", marginBottom: 2 }}>{t.client_name}</div>}
                {t.address && <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>{t.address}</div>}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#2563eb" }}>
                    {t.takeoff_items?.length ?? 0} item{t.takeoff_items?.length !== 1 ? "s" : ""}
                  </span>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>{fmt(t.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New takeoff modal */}
      {showNew && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }} onClick={() => setShowNew(false)}>
          <div
            style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>New Takeoff</h2>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>You can upload the plan after creating the takeoff.</p>
            <form onSubmit={createTakeoff} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>PROJECT NAME *</label>
                <input
                  required autoFocus
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. CHC Mackinaw Center — Landscape"
                  style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>CLIENT</label>
                <input
                  value={form.client_name}
                  onChange={e => setForm(p => ({ ...p, client_name: e.target.value }))}
                  placeholder="e.g. Covenant Healthcare"
                  style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>ADDRESS</label>
                <input
                  value={form.address}
                  onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                  placeholder="e.g. 5400 Mackinaw Road, Saginaw Township, MI"
                  style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                />
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  style={{ flex: 1, border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "11px", fontSize: 14, fontWeight: 600, background: "#fff", cursor: "pointer", color: "#475569" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  style={{ flex: 2, background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)", color: "#fff", border: "none", borderRadius: 10, padding: "11px", fontSize: 14, fontWeight: 700, cursor: creating ? "not-allowed" : "pointer", opacity: creating ? 0.7 : 1 }}
                >
                  {creating ? "Creating…" : "Create & Open →"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
