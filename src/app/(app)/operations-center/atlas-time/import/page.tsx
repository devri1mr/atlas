"use client";

import Link from "next/link";
import { useRef, useState } from "react";

type PreviewResult = {
  total: number;
  to_import: number;
  skipped: number;
  unmatched_depts: string[];
  unmatched_divs: string[];
  preview: { row: number; name: string; status: string; reason?: string }[];
};

type ImportResult = {
  imported: number;
  skipped: number;
  unmatched_depts: string[];
  unmatched_divs: string[];
};

function excelDateToISO(v: any): string | null {
  if (!v || typeof v !== "number") return null;
  try { return new Date((v - 25569) * 86400 * 1000).toISOString().split("T")[0]; } catch { return null; }
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

async function parseXLSX(file: File): Promise<any[][]> {
  const { read, utils } = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = read(buf);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return utils.sheet_to_json(ws, { header: 1, raw: true }) as any[][];
}

const DISPLAY_COLS = [
  "First Name", "Last Name", "Class",
  "Hire Date", "Main Phone", "Main Email", "Current Position",
];

export default function ImportPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<any[][] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(f: File) {
    setFile(f);
    setPreview(null);
    setResult(null);
    setError("");
    setParsing(true);
    try {
      const data = await parseXLSX(f);
      setRows(data);
    } catch (e: any) {
      setError("Failed to parse file: " + (e?.message ?? "unknown error"));
    } finally {
      setParsing(false);
    }
  }

  async function runPreview() {
    if (!rows) return;
    setPreviewing(true);
    setError("");
    try {
      const res = await fetch("/api/atlas-time/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, dry_run: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Preview failed");
      setPreview(json);
    } catch (e: any) {
      setError(e?.message ?? "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  async function runImport() {
    if (!rows) return;
    setImporting(true);
    setError("");
    try {
      const res = await fetch("/api/atlas-time/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, dry_run: false }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Import failed");
      setResult(json);
      setPreview(null);
    } catch (e: any) {
      setError(e?.message ?? "Import failed");
    } finally {
      setImporting(false);
    }
  }

  const headers: string[] = rows ? rows[0].map((h: any) => String(h ?? "").trim()) : [];
  const dataRows = rows ? rows.slice(1).filter((r: any[]) => r.some((c: any) => c != null && c !== "")) : [];
  const displayColIdxs = DISPLAY_COLS.map(c => headers.indexOf(c)).filter(i => i >= 0);

  function cellVal(row: any[], colName: string) {
    const i = headers.indexOf(colName);
    if (i < 0) return "";
    const v = row[i];
    if (colName.includes("Date") || colName === "Birthday") return fmtDate(excelDateToISO(v)) || (v ?? "");
    return v ?? "";
  }

  return (
    <div className="min-h-screen bg-[#f0f4f0]">
      {/* Header */}
      <div className="px-4 md:px-8 py-6 md:py-8"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}>
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 text-white/50 text-xs mb-2">
            <Link href="/operations-center" className="hover:text-white/80">Operations Center</Link>
            <span>/</span>
            <Link href="/operations-center/atlas-time" className="hover:text-white/80">Atlas HR</Link>
            <span>/</span>
            <span className="text-white/80">Import Team Members</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Import Team Members</h1>
          <p className="text-white/50 text-sm mt-1">Upload a QuickBooks HR export to add new hires. Existing team members are always skipped.</p>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-4">

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
            {error}
            <button onClick={() => setError("")} className="ml-2 text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {/* Success */}
        {result && (
          <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <div>
                <div className="font-semibold text-gray-900">Import complete</div>
                <div className="text-sm text-gray-500">{result.imported} team members imported, {result.skipped} skipped (already existed)</div>
              </div>
            </div>
            {result.unmatched_depts.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-100 px-4 py-3 text-sm">
                <div className="font-semibold text-amber-800 mb-1">Unmatched departments — team members imported without department assignment:</div>
                <div className="text-amber-700">{result.unmatched_depts.join(", ")}</div>
                <div className="text-amber-600 mt-1 text-xs">Go to <Link href="/operations-center/atlas-time/departments" className="underline">Departments & Divisions</Link> to add these, then update affected team members.</div>
              </div>
            )}
            {result.unmatched_divs.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-100 px-4 py-3 text-sm">
                <div className="font-semibold text-amber-800 mb-1">Unmatched divisions — team members imported without division assignment:</div>
                <div className="text-amber-700">{result.unmatched_divs.join(", ")}</div>
              </div>
            )}
            <Link href="/operations-center/atlas-time/employees"
              className="inline-flex items-center gap-2 bg-[#123b1f] text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-[#1a5c2e]">
              View Team Members →
            </Link>
          </div>
        )}

        {/* Upload area */}
        {!result && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <h2 className="text-sm font-semibold text-gray-800">Step 1 — Upload QB HR Export</h2>
              <p className="text-xs text-gray-400 mt-0.5">Export the Employee Contact List from QB as .xlsx. Run this anytime — only new names are imported.</p>
            </div>

            <div
              className="px-5 py-8 flex flex-col items-center gap-3 cursor-pointer hover:bg-gray-50/50 transition-colors"
              onClick={() => inputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            >
              <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              {file
                ? <div className="text-sm font-medium text-gray-700">{file.name} <span className="text-gray-400 font-normal">({dataRows.length} rows)</span></div>
                : <div className="text-sm text-gray-500">Drop .xlsx here or <span className="text-violet-600 font-semibold">click to browse</span></div>
              }
              {parsing && <div className="text-xs text-gray-400">Parsing…</div>}
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
          </div>
        )}

        {/* Preview table */}
        {!result && rows && rows.length > 1 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Step 2 — Preview</h2>
                <p className="text-xs text-gray-400 mt-0.5">Showing first 5 rows. Click "Check Import" to see full match stats.</p>
              </div>
              <button
                onClick={runPreview}
                disabled={previewing}
                className="text-xs font-semibold bg-[#123b1f] text-white px-3 py-1.5 rounded-lg hover:bg-[#1a5c2e] disabled:opacity-60"
              >
                {previewing ? "Checking…" : "Check Import"}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-500">
                    {DISPLAY_COLS.map(c => (
                      <th key={c} className="px-3 py-2 font-semibold whitespace-nowrap border-b border-gray-100">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataRows.slice(0, 5).map((row, ri) => (
                    <tr key={ri} className="border-b border-gray-50 hover:bg-gray-50/40">
                      {DISPLAY_COLS.map(c => (
                        <td key={c} className="px-3 py-2 text-gray-700 whitespace-nowrap">{String(cellVal(row, c))}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Preview stats + confirm */}
        {!result && preview && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-800">Step 3 — Confirm Import</h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total rows", value: preview.total, color: "bg-gray-50 text-gray-900" },
                { label: "Will import", value: preview.to_import, color: "bg-emerald-50 text-emerald-900" },
                { label: "Skipped (exists)", value: preview.skipped, color: "bg-amber-50 text-amber-900" },
                { label: "Dept mismatches", value: preview.unmatched_depts.length, color: preview.unmatched_depts.length > 0 ? "bg-red-50 text-red-900" : "bg-gray-50 text-gray-900" },
              ].map(s => (
                <div key={s.label} className={`rounded-xl px-4 py-3 ${s.color}`}>
                  <div className="text-2xl font-bold">{s.value}</div>
                  <div className="text-xs font-medium mt-0.5 opacity-70">{s.label}</div>
                </div>
              ))}
            </div>

            {preview.unmatched_depts.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-100 px-4 py-3 text-sm">
                <div className="font-semibold text-amber-800 mb-1">These departments weren't found in Atlas HR — affected team members will be imported without a department:</div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {preview.unmatched_depts.map(d => (
                    <span key={d} className="text-xs font-semibold px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full">{d}</span>
                  ))}
                </div>
                <p className="text-xs text-amber-600 mt-2">
                  Tip: Add them in <Link href="/operations-center/atlas-time/departments" className="underline">Departments & Divisions</Link> first, then upload the export again — already-imported names are skipped so there's no duplication.
                </p>
              </div>
            )}

            {preview.unmatched_divs.length > 0 && (
              <div className="rounded-lg bg-sky-50 border border-sky-100 px-4 py-3 text-sm">
                <div className="font-semibold text-sky-800 mb-1">These QB classes (divisions) weren't matched — team members will be imported without a division:</div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {preview.unmatched_divs.map(d => (
                    <span key={d} className="text-xs font-semibold px-2 py-0.5 bg-sky-100 text-sky-800 rounded-full">{d}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={runImport}
                disabled={importing || preview.to_import === 0}
                className="bg-[#123b1f] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-[#1a5c2e] disabled:opacity-60 flex items-center gap-2"
              >
                {importing
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Importing…</>
                  : `Import ${preview.to_import} Team Members`
                }
              </button>
              {preview.to_import === 0 && (
                <span className="text-sm text-gray-400">Nothing new to import.</span>
              )}
            </div>
          </div>
        )}

        {/* Instructions */}
        {!file && !result && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">How to export from QuickBooks Desktop</h3>
              <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
                <li>Go to <strong>Reports → Employees & Payroll → Employee Contact List</strong></li>
                <li>Click <strong>Customize Report</strong> and enable all columns you want imported</li>
                <li>Click <strong>Excel → Create New Worksheet</strong></li>
                <li>Save as <strong>.xlsx</strong> and upload above</li>
              </ol>
            </div>
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm">
              <div className="font-semibold text-emerald-800 mb-1">Run this anytime you have new hires</div>
              <p className="text-emerald-700 text-xs">Import matches by first + last name. Anyone already in Atlas HR is skipped — no duplicates, no cleanup needed. Just pull a fresh export from QB and upload it.</p>
            </div>
            <div className="rounded-lg bg-gray-50 px-4 py-3 text-xs text-gray-500">
              <strong className="text-gray-700">Columns imported:</strong> First Name, Last Name, M.I., Phone, Email, Address, Department, Class (Division), Hire Date, 1st Working Day, Position, Shirt Size, Birthday, I9 On File, CPR/First Aid/License/DOT/Fert expirations, Health Care Plan, Electronic Devices, Driver, License Type, PTO Plan, Leave Date, Reason for Leaving, Eligible for Rehire.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
