"use client";

import { useRef, useState } from "react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let i = 0;
    while (i < line.length) {
      if (line[i] === '"') {
        let j = i + 1, cell = "";
        while (j < line.length) {
          if (line[j] === '"' && line[j + 1] === '"') { cell += '"'; j += 2; }
          else if (line[j] === '"') { j++; break; }
          else cell += line[j++];
        }
        cells.push(cell);
        if (line[j] === ",") j++;
        i = j;
      } else {
        const end = line.indexOf(",", i);
        if (end === -1) { cells.push(line.slice(i)); break; }
        cells.push(line.slice(i, end));
        i = end + 1;
      }
    }
    rows.push(cells);
  }
  return rows;
}

function parseTime12(t: string): string | null {
  const m = t?.trim().match(/^(\d+):(\d+)\s*(am|pm)$/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = m[2].padStart(2, "0");
  const ap = m[3].toLowerCase();
  if (ap === "pm" && h !== 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${min}`;
}

function parseMMDDYYYY(d: string): string {
  const [mo, day, y] = d.split("/");
  return `${y}-${mo.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function localIso(dateStr: string, timeStr: string): string {
  // Always treat times as America/New_York (EST = -05:00, EDT = -04:00).
  // Determine which offset applies on this specific date using Intl,
  // so this works correctly regardless of the browser's own timezone.
  const utcNoon  = new Date(`${dateStr}T12:00:00Z`);
  const nyHour   = parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(utcNoon),
    10,
  );
  // noon UTC - NY hour = offset in hours (7 → EST -05:00, 8 → EDT -04:00)
  const offsetH  = 12 - nyHour;
  const offset   = `-${String(offsetH).padStart(2, "0")}:00`;
  return `${dateStr}T${timeStr}:00${offset}`;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function extractHHMM(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch { return ""; }
}

function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true }); }
  catch { return iso; }
}

function fmtDate(d: string): string {
  const [y, mo, day] = d.split("-");
  return `${parseInt(mo)}/${parseInt(day)}/${y}`;
}

function calcRawHours(inIso: string, outIso: string): number | null {
  try {
    const diff = (new Date(outIso).getTime() - new Date(inIso).getTime()) / 3_600_000;
    return isNaN(diff) || diff <= 0 ? null : Math.round(diff * 100) / 100;
  } catch { return null; }
}

// ─── Types ───────────────────────────────────────────────────────────────────

type ParsedRow = { csv_name: string; date: string; clock_in_at: string; clock_out_at: string; punch_item: string };

type PreviewRow = ParsedRow & {
  status: "ready" | "no_employee" | "no_punch_item" | "duplicate";
  employee_id: string | null;
  employee_name: string | null;
  division_id: string | null;
  at_division_id: string | null;
  matched_item_name: string | null;
  raw_hours: number | null;
};

type AvailableItem = { label: string; division_id: string | null; at_division_id: string | null };
type AvailableEmp  = { id: string; name: string };

// ─── Component ───────────────────────────────────────────────────────────────

export default function ImportPunchesModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [stage, setStage]               = useState<"upload" | "preview" | "done">("upload");
  const [dragging, setDragging]         = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");
  const [previewRows, setPreviewRows]   = useState<PreviewRow[]>([]);
  const [availItems, setAvailItems]     = useState<AvailableItem[]>([]);
  const [availEmps, setAvailEmps]       = useState<AvailableEmp[]>([]);
  const [doneCount, setDoneCount]       = useState(0);

  // Inline edit state
  const [editIdx, setEditIdx]           = useState<number | null>(null);
  const [editEmpId, setEditEmpId]       = useState("");
  const [editItemKey, setEditItemKey]   = useState(""); // "d:UUID" or "a:UUID"
  const [editInTime, setEditInTime]     = useState("");
  const [editOutTime, setEditOutTime]   = useState("");

  // Navigation state
  const [navQueue, setNavQueue] = useState<number[]>([]);
  const [navPos, setNavPos]     = useState(0);

  const fileRef   = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollToRow(idx: number) {
    const el = document.getElementById(`import-row-${idx}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function startNav(predicate: (r: PreviewRow) => boolean) {
    const queue = previewRows.map((r, i) => predicate(r) ? i : -1).filter(i => i >= 0);
    if (!queue.length) return;
    setNavQueue(queue);
    setNavPos(0);
    scrollToRow(queue[0]);
  }

  function scrollToFirstWhere(predicate: (r: PreviewRow) => boolean) {
    startNav(predicate);
  }

  function navStep(dir: 1 | -1) {
    if (!navQueue.length) return;
    const next = (navPos + dir + navQueue.length) % navQueue.length;
    setNavPos(next);
    scrollToRow(navQueue[next]);
  }

  // ── Item key encoding ──────────────────────────────────────────────────────

  function itemKey(item: AvailableItem): string {
    return item.at_division_id ? `a:${item.at_division_id}` : `d:${item.division_id}`;
  }

  function itemFromKey(key: string): AvailableItem | undefined {
    if (key.startsWith("a:")) return availItems.find(i => i.at_division_id === key.slice(2));
    if (key.startsWith("d:")) return availItems.find(i => !i.at_division_id && i.division_id === key.slice(2));
    return undefined;
  }

  function rowItemKey(row: PreviewRow): string {
    if (row.at_division_id) return `a:${row.at_division_id}`;
    if (row.division_id)    return `d:${row.division_id}`;
    return "";
  }

  // ── File handling ──────────────────────────────────────────────────────────

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setLoading(true);
    try {
      const text    = await file.text();
      const allRows = parseCSV(text);
      const valid: ParsedRow[] = [];

      for (const cells of allRows.slice(1)) {
        const type   = (cells[8] ?? "").trim();
        if (type.toLowerCase() === "lunch") continue;
        const inRaw  = (cells[4] ?? "").trim();
        const outRaw = (cells[5] ?? "").trim();
        if (inRaw === "-" || outRaw === "-") continue;
        // Column H (index 7) = reported hours; skip if 0 or negative (same-time punches)
        const csvHours = parseFloat(String(cells[7] ?? ""));
        if (!isNaN(csvHours) && csvHours <= 0) continue;
        const inTime  = parseTime12(inRaw);
        const outTime = parseTime12(outRaw);
        if (!inTime || !outTime) continue;
        const date    = parseMMDDYYYY((cells[3] ?? "").trim());
        const inIso   = localIso(date, inTime);
        // If clock-out is strictly before clock-in it crossed midnight — advance out by 1 day
        const outDate = new Date(localIso(date, outTime)) < new Date(inIso) ? addDays(date, 1) : date;
        const outIso  = localIso(outDate, outTime);
        valid.push({ csv_name: (cells[0] ?? "").trim(), date, clock_in_at: inIso, clock_out_at: outIso, punch_item: type });
      }

      const res  = await fetch("/api/atlas-time/import/punches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dry_run: true, rows: valid }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Preview failed");

      setPreviewRows(json.rows ?? []);
      setAvailItems(json.available_items ?? []);
      setAvailEmps(json.available_employees ?? []);
      setStage("preview");
    } catch (e: any) {
      setError(e?.message ?? "Failed to process file");
    } finally {
      setLoading(false);
    }
  }

  // ── Inline editing ─────────────────────────────────────────────────────────

  function startEdit(idx: number) {
    const row = previewRows[idx];
    setEditIdx(idx);
    setEditEmpId(row.employee_id ?? "");
    setEditItemKey(rowItemKey(row));
    setEditInTime(extractHHMM(row.clock_in_at));
    setEditOutTime(extractHHMM(row.clock_out_at));
  }

  function cancelEdit() {
    setEditIdx(null);
  }

  function applyEdit() {
    if (editIdx === null) return;
    const row     = previewRows[editIdx];
    const emp     = availEmps.find(e => e.id === editEmpId);
    const item    = itemFromKey(editItemKey);
    const newIn   = editInTime  ? localIso(row.date, editInTime)  : row.clock_in_at;
    const newOut  = editOutTime ? localIso(row.date, editOutTime) : row.clock_out_at;
    const newStatus: PreviewRow["status"] = !emp ? "no_employee" : !item ? "no_punch_item" : "ready";

    const updated = [...previewRows];
    updated[editIdx] = {
      ...row,
      clock_in_at:       newIn,
      clock_out_at:      newOut,
      employee_id:       emp?.id ?? null,
      employee_name:     emp?.name ?? null,
      division_id:       item?.division_id ?? null,
      at_division_id:    item?.at_division_id ?? null,
      matched_item_name: item?.label ?? null,
      raw_hours:         calcRawHours(newIn, newOut),
      status:            newStatus,
    };
    setPreviewRows(updated);
    setEditIdx(null);
  }

  // ── Import ─────────────────────────────────────────────────────────────────

  async function handleImport() {
    setError("");
    setLoading(true);
    try {
      const resolved = previewRows
        .filter(r => r.status === "ready")
        .map(r => ({
          employee_id:   r.employee_id!,
          date:          r.date,
          clock_in_at:   r.clock_in_at,
          clock_out_at:  r.clock_out_at,
          division_id:   r.division_id,
          at_division_id: r.at_division_id,
        }));

      const res  = await fetch("/api/atlas-time/import/punches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dry_run: false, resolved_rows: resolved }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Import failed");

      setDoneCount(json.imported ?? resolved.length);
      setStage("done");
      onImported();
    } catch (e: any) {
      setError(e?.message ?? "Import failed");
    } finally {
      setLoading(false);
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const readyCount       = previewRows.filter(r => r.status === "ready").length;
  const noEmpRows        = previewRows.filter(r => r.status === "no_employee");
  const noPunchRows      = previewRows.filter(r => r.status === "no_punch_item");
  const dupRows          = previewRows.filter(r => r.status === "duplicate");
  const uniqueNoEmpNames = [...new Set(noEmpRows.map(r => r.csv_name))];
  const uniqueNoItem     = [...new Set(noPunchRows.map(r => r.punch_item))];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl border border-gray-100 shadow-lg flex flex-col" style={{ width: "100%", maxWidth: 960, maxHeight: "88vh" }}>

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">Import Time Punches</h2>
            <p className="text-xs text-gray-400 mt-0.5">Upload a time clock CSV export</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">

          {/* Upload */}
          {stage === "upload" && (
            <div className="p-6">
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors ${dragging ? "border-green-500 bg-green-50" : "border-gray-200 hover:border-gray-300"}`}
              >
                {loading ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-[#123b1f] border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-gray-500">Processing…</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Drop your CSV file here</p>
                      <p className="text-xs text-gray-400 mt-1">or click to browse</p>
                    </div>
                  </div>
                )}
              </div>
              {error && <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{error}</p>}
            </div>
          )}

          {/* Preview */}
          {stage === "preview" && (
            <div className="flex flex-col">

              {/* Summary */}
              <div className="px-6 py-3 border-b border-gray-50 flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-100 text-green-800">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />{readyCount} ready
                  </span>
                  {noEmpRows.length > 0 && (
                    <button onClick={() => scrollToFirstWhere(r => r.status === "no_employee")}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200 transition-colors cursor-pointer">
                      <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{noEmpRows.length} unmatched {noEmpRows.length === 1 ? "team member" : "team members"}
                    </button>
                  )}
                  {noPunchRows.length > 0 && (
                    <button onClick={() => scrollToFirstWhere(r => r.status === "no_punch_item")}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors cursor-pointer">
                      <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />{noPunchRows.length} unmatched punch {noPunchRows.length === 1 ? "item" : "items"}
                    </button>
                  )}
                  {dupRows.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600">
                      {dupRows.length} {dupRows.length === 1 ? "duplicate" : "duplicates"}
                    </span>
                  )}
                </div>
                {uniqueNoEmpNames.length > 0 && (
                  <p className="text-xs text-red-600">
                    <span className="font-semibold">Unmatched team members:</span>{" "}
                    {uniqueNoEmpNames.map((name, i) => (
                      <span key={name}>
                        {i > 0 && ", "}
                        <button onClick={() => scrollToFirstWhere(r => r.csv_name === name && r.status === "no_employee")}
                          className="underline underline-offset-2 hover:text-red-800 transition-colors">{name}</button>
                      </span>
                    ))}
                  </p>
                )}
                {uniqueNoItem.length > 0 && (
                  <p className="text-xs text-amber-700">
                    <span className="font-semibold">Unmatched punch items:</span>{" "}
                    {uniqueNoItem.map((item, i) => (
                      <span key={item}>
                        {i > 0 && ", "}
                        <button onClick={() => scrollToFirstWhere(r => r.punch_item === item && r.status === "no_punch_item")}
                          className="underline underline-offset-2 hover:text-amber-900 transition-colors">{item}</button>
                      </span>
                    ))}
                  </p>
                )}
              </div>

              {error && <div className="px-6 py-2"><p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{error}</p></div>}

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 z-10">
                    <tr className="border-b border-gray-100">
                      <th className="px-3 py-2.5 w-6"></th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Team Member</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Date</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-500">In</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Out</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Punch Item</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-500">Hrs</th>
                      <th className="px-3 py-2.5 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => {
                      const isEditing  = editIdx === i;
                      const isNavFocus = navQueue.length > 0 && navQueue[navPos] === i;
                      const dot = row.status === "ready" ? "bg-green-500" : row.status === "no_punch_item" ? "bg-amber-400" : "bg-red-500";

                      if (isEditing) {
                        return (
                          <tr id={`import-row-${i}`} key={i} className="border-b border-gray-100 bg-blue-50/40">
                            <td className="px-3 py-2"><span className={`inline-block w-2 h-2 rounded-full ${dot}`} /></td>
                            <td className="px-3 py-2">
                              <select value={editEmpId} onChange={e => setEditEmpId(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                                <option value="">— Select —</option>
                                {availEmps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-2 text-gray-500">{fmtDate(row.date)}</td>
                            <td className="px-3 py-2">
                              <input type="time" value={editInTime} onChange={e => setEditInTime(e.target.value)}
                                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 w-28" />
                            </td>
                            <td className="px-3 py-2">
                              <input type="time" value={editOutTime} onChange={e => setEditOutTime(e.target.value)}
                                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 w-28" />
                            </td>
                            <td className="px-3 py-2">
                              <select value={editItemKey} onChange={e => setEditItemKey(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                                <option value="">— Select —</option>
                                {availItems.map((item, j) => <option key={j} value={itemKey(item)}>{item.label}</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-2 text-right text-gray-500 tabular-nums">
                              {editInTime && editOutTime ? calcRawHours(localIso(row.date, editInTime), localIso(row.date, editOutTime))?.toFixed(2) ?? "—" : "—"}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex gap-1">
                                <button onClick={applyEdit} className="text-[10px] font-semibold text-white bg-[#123b1f] hover:bg-[#1a5c2e] px-2 py-1 rounded-md transition-colors">OK</button>
                                <button onClick={cancelEdit} className="text-[10px] font-semibold text-gray-500 hover:text-gray-700 px-2 py-1 rounded-md hover:bg-gray-100 transition-colors">✕</button>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr id={`import-row-${i}`} key={i} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${isNavFocus ? "bg-yellow-50 outline outline-2 outline-yellow-300 outline-offset-[-2px]" : i % 2 === 0 ? "bg-white" : "bg-gray-50/30"}`}>
                          <td className="px-3 py-2.5"><span className={`inline-block w-2 h-2 rounded-full ${dot}`} /></td>
                          <td className="px-3 py-2.5 font-medium">
                            {row.employee_name
                              ? <span className="text-gray-800">{row.employee_name}</span>
                              : <span className="text-red-500">? {row.csv_name}</span>}
                          </td>
                          <td className="px-3 py-2.5 text-gray-600">{fmtDate(row.date)}</td>
                          <td className="px-3 py-2.5 text-gray-600">{fmtTime(row.clock_in_at)}</td>
                          <td className="px-3 py-2.5 text-gray-600">{fmtTime(row.clock_out_at)}</td>
                          <td className="px-3 py-2.5">
                            {row.matched_item_name
                              ? <span className="text-gray-700">{row.matched_item_name}</span>
                              : <span className="text-amber-600">? {row.punch_item}</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-600 tabular-nums">{row.raw_hours != null ? row.raw_hours.toFixed(2) : "—"}</td>
                          <td className="px-3 py-2.5">
                            <button onClick={() => startEdit(i)} className="text-gray-300 hover:text-gray-500 transition-colors p-0.5 rounded">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Floating nav pill */}
              {navQueue.length > 0 && (
                <div className="sticky bottom-4 flex justify-center pointer-events-none z-20">
                  <div className="pointer-events-auto flex items-center gap-1 bg-gray-900/90 backdrop-blur-sm text-white rounded-full px-1 py-1 shadow-xl text-xs font-semibold">
                    <button onClick={() => navStep(-1)}
                      className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
                      title="Previous">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7"/></svg>
                    </button>
                    <span className="px-2 tabular-nums">{navPos + 1} / {navQueue.length}</span>
                    <button onClick={() => navStep(1)}
                      className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
                      title="Next">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7"/></svg>
                    </button>
                    <button onClick={() => setNavQueue([])}
                      className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors ml-0.5 text-white/60 hover:text-white"
                      title="Close">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Done */}
          {stage === "done" && (
            <div className="p-8 flex flex-col items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-7 h-7 text-[#1a5c2a]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <div className="text-center">
                <p className="text-base font-bold text-gray-900">Import Complete</p>
                <p className="text-sm text-gray-500 mt-1">{doneCount} {doneCount === 1 ? "punch" : "punches"} imported successfully</p>
              </div>
              <button onClick={onClose} className="mt-2 bg-[#123b1f] hover:bg-[#0d2616] text-white rounded-xl px-6 py-2.5 text-sm font-semibold transition-colors">Close</button>
            </div>
          )}
        </div>

        {/* Footer */}
        {stage === "preview" && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
            <button
              onClick={() => { setStage("upload"); setPreviewRows([]); setError(""); if (fileRef.current) fileRef.current.value = ""; }}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              ← Choose different file
            </button>
            <button
              onClick={handleImport}
              disabled={readyCount === 0 || loading}
              className="bg-[#123b1f] hover:bg-[#0d2616] text-white rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              Import {readyCount} {readyCount === 1 ? "Punch" : "Punches"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
