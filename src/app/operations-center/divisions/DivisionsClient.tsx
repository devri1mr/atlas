"use client";

import React, { useEffect, useMemo, useState } from "react";

type Division = {
  id: string;
  name: string;
  labor_rate: number;
  target_gross_profit_percent: number;
  allow_overtime?: boolean;
  active?: boolean;
  created_at?: string;
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number.isFinite(n) ? n : 0
  );
}

function formatPercent(n: number) {
  return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 }).format(
    (Number.isFinite(n) ? n : 0) / 100
  );
}

export default function DivisionsClient() {
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string>("");

  const [open, setOpen] = useState<boolean>(false);

  // Form
  const [name, setName] = useState("");
  const [laborRate, setLaborRate] = useState<number>(30);
  const [targetGp, setTargetGp] = useState<number>(50);
  const [active, setActive] = useState<boolean>(true);
  const [allowOvertime, setAllowOvertime] = useState<boolean>(true);

  const canSubmit = useMemo(() => {
    return name.trim().length > 0 && Number.isFinite(laborRate) && Number.isFinite(targetGp);
  }, [name, laborRate, targetGp]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/operations-center/divisions", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || `Request failed (${res.status})`);
      }

      setDivisions(Array.isArray(json?.divisions) ? json.divisions : []);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load divisions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createDivision() {
    setErr("");

    if (!canSubmit) {
      setErr("Please fill out Division Name, Labor Rate, and Target GP%.");
      return;
    }

    try {
      const payload = {
        // send snake_case to match DB + API expectations
        name: name.trim(),
        labor_rate: Number(laborRate),
        target_gross_profit_percent: Number(targetGp),
        active: Boolean(active),
        allow_overtime: Boolean(allowOvertime),
      };

      const res = await fetch("/api/operations-center/divisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || `Create failed (${res.status})`);
      }

      // optimistic update
      if (json?.division) {
        setDivisions((prev) => [json.division, ...prev].sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        // fallback: reload
        await load();
      }

      // reset & close
      setName("");
      setLaborRate(30);
      setTargetGp(50);
      setActive(true);
      setAllowOvertime(true);
      setOpen(false);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to create division");
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Divisions</h1>
          <div style={{ opacity: 0.8, marginTop: 6 }}>
            Manage division labor rate + target gross profit. (UI shows $ and %, DB stores numbers)
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => load()} disabled={loading} style={{ padding: "10px 14px" }}>
            Refresh
          </button>
          <button onClick={() => setOpen(true)} style={{ padding: "10px 14px" }}>
            Add Division
          </button>
        </div>
      </div>

      {err ? (
        <div style={{ marginTop: 14, padding: 12, border: "1px solid #f5a", borderRadius: 8 }}>
          <strong>Error:</strong> {err}
        </div>
      ) : null}

      <div style={{ marginTop: 18, border: "1px solid #ddd", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", padding: 12, fontWeight: 700, background: "#fafafa" }}>
          <div>Division</div>
          <div>Labor Rate</div>
          <div>Target GP%</div>
          <div>OT Allowed</div>
          <div>Active</div>
        </div>

        {loading ? (
          <div style={{ padding: 12 }}>Loading…</div>
        ) : divisions.length === 0 ? (
          <div style={{ padding: 12 }}>No divisions found.</div>
        ) : (
          divisions.map((d) => (
            <div
              key={d.id}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
                padding: 12,
                borderTop: "1px solid #eee",
              }}
            >
              <div>{d.name}</div>
              <div>{formatCurrency(d.labor_rate)}</div>
              <div>{formatPercent(d.target_gross_profit_percent)}</div>
              <div>{d.allow_overtime ? "Yes" : "No"}</div>
              <div>{d.active ? "Yes" : "No"}</div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{ width: "min(720px, 100%)", background: "white", borderRadius: 12, padding: 18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0 }}>Add Division</h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span>Division Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Landscaping"
                  style={{ padding: 10 }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Labor Rate ($/hr)</span>
                <input
                  value={laborRate}
                  type="number"
                  step="0.01"
                  onChange={(e) => setLaborRate(Number(e.target.value))}
                  style={{ padding: 10 }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Target Gross Profit (%)</span>
                <input
                  value={targetGp}
                  type="number"
                  step="0.01"
                  onChange={(e) => setTargetGp(Number(e.target.value))}
                  style={{ padding: 10 }}
                />
              </label>

              <div style={{ display: "grid", gap: 10, paddingTop: 26 }}>
                <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={allowOvertime}
                    onChange={(e) => setAllowOvertime(e.target.checked)}
                  />
                  <span>Allow Overtime (1.5x)</span>
                </label>

                <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                  <span>Active</span>
                </label>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
              <button onClick={() => setOpen(false)} style={{ padding: "10px 14px" }}>
                Cancel
              </button>
              <button
                onClick={() => createDivision()}
                disabled={!canSubmit}
                style={{ padding: "10px 14px" }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
