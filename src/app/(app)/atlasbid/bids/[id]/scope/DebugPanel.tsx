// src/app/atlasbid/bids/[id]/scope/DebugPanel.tsx
"use client";

import * as React from "react";

type CheckResult = {
  name: string;
  url: string;
  ok: boolean;
  status: number;
  ms: number;
  note?: string;
};

function isProbablyHtml(s: string) {
  return /^\s*</.test(s) && /<!doctype|<html/i.test(s);
}

async function fetchWithTimeout(url: string, ms = 8000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function checkEndpoint(name: string, url: string): Promise<CheckResult> {
  const start = performance.now();

  try {
    const res = await fetchWithTimeout(url, 10000);
    const ms = Math.round(performance.now() - start);

    const text = await res.text().catch(() => "");
    let note = "";

    if (!res.ok) {
      try {
        const j = JSON.parse(text || "{}");
        note = j?.error ? String(j.error) : text.slice(0, 220);
      } catch {
        note = isProbablyHtml(text)
          ? "Returned HTML (likely redirect / route mismatch)"
          : (text || "").slice(0, 220);
      }
    } else {
      if (isProbablyHtml(text)) note = "OK but returned HTML (likely redirect / route mismatch)";
      else note = "OK";
    }

    return { name, url, ok: res.ok, status: res.status, ms, note };
  } catch (e: any) {
    const ms = Math.round(performance.now() - start);
    const msg = e?.name === "AbortError" ? "Timeout" : e?.message || "Network/Fetch error";
    return { name, url, ok: false, status: 0, ms, note: msg };
  }
}

export default function DebugPanel({ bidId }: { bidId: string }) {
  const [running, setRunning] = React.useState(false);
  const [results, setResults] = React.useState<CheckResult[]>([]);
  const [lastRunAt, setLastRunAt] = React.useState<string>("");

  const effectiveBidId = React.useMemo(() => String(bidId || "").trim(), [bidId]);

  async function run() {
    if (!effectiveBidId) return;

    setRunning(true);
    setResults([]);

    try {
      const idEnc = encodeURIComponent(effectiveBidId);

      // 1) Hit bid first (so we can derive division_id for bid-settings check)
      const bidCheck = await checkEndpoint("GET /api/bids/:id", `/api/bids/${idEnc}`);

      let divisionId: string | null = null;
      if (bidCheck.ok) {
        try {
          const res = await fetch(`/api/bids/${idEnc}`, { cache: "no-store" });
          const j = await res.json().catch(() => null);
          divisionId = j?.data?.division_id ? String(j.data.division_id) : null;
        } catch {
          divisionId = null;
        }
      }

      const checks: Array<Promise<CheckResult>> = [
        Promise.resolve(bidCheck),
        checkEndpoint("GET /api/divisions", `/api/divisions`),
        checkEndpoint("GET /api/labor-rates", `/api/labor-rates`),
        checkEndpoint("GET /api/statuses", `/api/statuses`),
        checkEndpoint(
          "GET /api/atlasbid/bid-settings?division_id=…",
          divisionId
            ? `/api/atlasbid/bid-settings?division_id=${encodeURIComponent(divisionId)}`
            : `/api/atlasbid/bid-settings?division_id=(missing)`
        ),
        checkEndpoint("GET /api/atlasbid/bid-labor?bid_id=…", `/api/atlasbid/bid-labor?bid_id=${idEnc}`),
      ];

      const done = await Promise.all(checks);
      setResults(done);
      setLastRunAt(new Date().toLocaleString());
    } finally {
      setRunning(false);
    }
  }

  const box: React.CSSProperties = {
    marginTop: 16,
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 14,
    background: "#fafafa",
  };

  const pill = (ok: boolean): React.CSSProperties => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    border: `1px solid ${ok ? "#16a34a" : "#dc2626"}`,
    color: ok ? "#166534" : "#991b1b",
    background: ok ? "#dcfce7" : "#fee2e2",
    marginLeft: 8,
  });

  const btn: React.CSSProperties = {
    border: "1px solid #111827",
    background: "#111827",
    color: "white",
    padding: "8px 12px",
    borderRadius: 10,
    cursor: "pointer",
    fontSize: 14,
    opacity: running || !effectiveBidId ? 0.6 : 1,
  };

  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 800 }}>Debug Panel</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
            bidId: <span style={{ fontFamily: "monospace" }}>{effectiveBidId || "(empty)"}</span>
            {lastRunAt ? ` • last run: ${lastRunAt}` : ""}
          </div>
        </div>

        <button onClick={run} style={btn} disabled={running || !effectiveBidId}>
          {running ? "Running…" : "Run checks"}
        </button>
      </div>

      {results.length ? (
        <div style={{ marginTop: 12 }}>
          {results.map((r) => (
            <div
              key={r.name + r.url}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: 10,
                background: "white",
                marginTop: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div style={{ fontWeight: 700 }}>
                  {r.name}
                  <span style={pill(r.ok)}>{r.ok ? "OK" : "FAIL"}</span>
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  {r.status ? `HTTP ${r.status}` : "—"} • {r.ms}ms
                </div>
              </div>

              <div style={{ fontSize: 12, color: "#374151", marginTop: 6 }}>
                <div>
                  <span style={{ color: "#6b7280" }}>URL:</span>{" "}
                  <span style={{ fontFamily: "monospace" }}>{r.url}</span>
                </div>
                {r.note ? (
                  <div style={{ marginTop: 4 }}>
                    <span style={{ color: "#6b7280" }}>Note:</span> {r.note}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
          Add <span style={{ fontFamily: "monospace" }}>?debug=1</span> to the URL and click <b>Run checks</b>.
        </div>
      )}
    </div>
  );
}
