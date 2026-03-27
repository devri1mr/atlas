"use client";

import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";

// ── Types ──────────────────────────────────────────────────────────────────────
type PricingBook = {
  id: string;
  name: string;
  vendor: string | null;
  file_path: string;
  file_type: "pdf" | "xlsx" | "xls" | "csv";
  file_size: number | null;
  logo_path: string | null;
  logo_url?: string | null;
  created_at: string;
  url: string | null;
};

type ColumnMap = {
  name: number | null;
  unit: number | null;
  cost: number | null;
  vendor: number | null;
};

type ImportRow = {
  name: string;
  unit: string;
  cost: number;
  vendor: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatBytes(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const FILE_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  pdf: { label: "PDF", bg: "bg-red-100", text: "text-red-700" },
  xlsx: { label: "XLSX", bg: "bg-green-100", text: "text-green-700" },
  xls: { label: "XLS", bg: "bg-green-100", text: "text-green-700" },
  csv: { label: "CSV", bg: "bg-blue-100", text: "text-blue-700" },
};

const btnPrimary = "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-40";
const btnGhost = "text-gray-600 hover:text-gray-900 hover:bg-gray-100 text-sm px-3 py-1.5 rounded-lg transition-colors";
const btnDanger = "text-red-600 hover:text-red-700 hover:bg-red-50 text-sm px-3 py-1.5 rounded-lg transition-colors";

// ── Main Component ─────────────────────────────────────────────────────────────
export default function PricingBooksPage() {
  const [books, setBooks] = useState<PricingBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload modal
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadVendor, setUploadVendor] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // PDF viewer modal
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);
  const [viewingName, setViewingName] = useState("");

  // Import modal
  const [importBook, setImportBook] = useState<PricingBook | null>(null);
  const [importStep, setImportStep] = useState<"loading" | "mapping" | "preview" | "importing" | "done">("loading");
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [columnMap, setColumnMap] = useState<ColumnMap>({ name: null, unit: null, cost: null, vendor: null });
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // ── Load books ───────────────────────────────────────────────────────────────
  useEffect(() => {
    loadBooks();
  }, []);

  async function loadBooks() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/materials-catalog/pricing-books");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setBooks(json.data ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Upload ───────────────────────────────────────────────────────────────────
  function handleFileSelect(file: File) {
    setUploadFile(file);
    setUploadName(file.name.replace(/\.[^.]+$/, ""));
    setUploadError(null);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }

  async function handleUpload() {
    if (!uploadFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      // Step 1: get a signed upload URL (file never touches Vercel)
      const presignRes = await fetch("/api/materials-catalog/pricing-books/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: uploadFile.name }),
      });
      const presignJson = await presignRes.json();
      if (!presignRes.ok) throw new Error(presignJson.error || "Could not get upload URL");

      const { signedUrl, path: filePath, file_type } = presignJson;

      // Step 2: upload directly to Supabase storage (no Vercel size limit)
      const uploadRes = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": uploadFile.type || "application/octet-stream" },
        body: uploadFile,
      });
      if (!uploadRes.ok) {
        const text = await uploadRes.text().catch(() => "");
        throw new Error(text || `Upload failed (${uploadRes.status})`);
      }

      // Step 3: save metadata to DB
      const confirmRes = await fetch("/api/materials-catalog/pricing-books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: filePath,
          name: uploadName.trim() || uploadFile.name.replace(/\.[^.]+$/, ""),
          vendor: uploadVendor.trim() || null,
          file_type,
          file_size: uploadFile.size,
        }),
      });
      const confirmJson = await confirmRes.json();
      if (!confirmRes.ok) throw new Error(confirmJson.error || "Failed to save record");

      setBooks(prev => [confirmJson.data, ...prev]);
      closeUploadModal();
    } catch (e: any) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
    }
  }

  function closeUploadModal() {
    setShowUpload(false);
    setUploadFile(null);
    setUploadName("");
    setUploadVendor("");
    setUploadError(null);
    setDragOver(false);
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  async function handleDelete(book: PricingBook) {
    if (!confirm(`Delete "${book.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/materials-catalog/pricing-books/${book.id}`, { method: "DELETE" });
    if (res.ok) setBooks(prev => prev.filter(b => b.id !== book.id));
  }

  // ── PDF View ─────────────────────────────────────────────────────────────────
  function handleView(book: PricingBook) {
    // Proxy URL keeps Atlas domain in the address bar (no Supabase URLs exposed)
    const proxyUrl = `/api/materials-catalog/pricing-books/${book.id}/view`;
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

    if (isMobile) {
      // iOS Safari iframes only show page 1 — open in native PDF viewer
      window.open(proxyUrl, "_blank", "noopener,noreferrer");
    } else {
      setViewingUrl(proxyUrl);
      setViewingName(book.name);
    }
  }

  // ── Import ───────────────────────────────────────────────────────────────────
  async function startImport(book: PricingBook) {
    setImportBook(book);
    setImportStep("loading");
    setImportError(null);
    setRawHeaders([]);
    setRawRows([]);
    setColumnMap({ name: null, unit: null, cost: null, vendor: null });
    setImportRows([]);
    setImportResult(null);

    try {
      const res = await fetch(`/api/materials-catalog/pricing-books/${book.id}`);
      const json = await res.json();
      if (!json.url) throw new Error("Could not get file URL");

      const fileRes = await fetch(json.url);
      const buffer = await fileRes.arrayBuffer();

      let headers: string[] = [];
      let rows: string[][] = [];

      if (book.file_type === "csv" || (book.file_type as string) === "txt") {
        const text = new TextDecoder().decode(buffer);
        const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
        const all = result.data as string[][];
        headers = all[0] ?? [];
        rows = all.slice(1);
      } else {
        const wb = XLSX.read(buffer, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const all = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" }) as string[][];
        headers = (all[0] ?? []).map(String);
        rows = all.slice(1).map(r => r.map(String));
      }

      // Auto-detect column mapping by header name
      const autoMap: ColumnMap = { name: null, unit: null, cost: null, vendor: null };
      headers.forEach((h, i) => {
        const lower = h.toLowerCase().trim();
        if (/name|description|item|material/.test(lower) && autoMap.name === null) autoMap.name = i;
        else if (/unit/.test(lower) && autoMap.unit === null) autoMap.unit = i;
        else if (/cost|price|rate|each|per unit/.test(lower) && autoMap.cost === null) autoMap.cost = i;
        else if (/vendor|supplier|brand/.test(lower) && autoMap.vendor === null) autoMap.vendor = i;
      });

      setRawHeaders(headers);
      setRawRows(rows);
      setColumnMap(autoMap);
      setImportStep("mapping");
    } catch (e: any) {
      setImportError(e.message);
      setImportStep("mapping");
    }
  }

  function buildPreview(): ImportRow[] {
    return rawRows
      .slice(0, 200)
      .map(row => ({
        name: columnMap.name !== null ? String(row[columnMap.name] ?? "").trim() : "",
        unit: columnMap.unit !== null ? String(row[columnMap.unit] ?? "").trim() : "ea",
        cost: columnMap.cost !== null ? parseFloat(String(row[columnMap.cost] ?? "0").replace(/[^0-9.]/g, "")) || 0 : 0,
        vendor: columnMap.vendor !== null ? String(row[columnMap.vendor] ?? "").trim() : (importBook?.vendor ?? ""),
      }))
      .filter(r => r.name.length > 0);
  }

  function goToPreview() {
    if (columnMap.name === null) {
      setImportError("Please select the Name column.");
      return;
    }
    setImportError(null);
    setImportRows(buildPreview());
    setImportStep("preview");
  }

  async function handleImport() {
    setImportStep("importing");
    setImportError(null);
    let imported = 0;
    let skipped = 0;

    for (const row of importRows) {
      if (!row.name) { skipped++; continue; }
      const res = await fetch("/api/materials-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: row.name,
          default_unit: row.unit || "ea",
          default_unit_cost: row.cost,
          vendor: row.vendor || null,
          is_active: true,
        }),
      });
      if (res.ok) imported++;
      else skipped++;
    }

    setImportResult({ imported, skipped });
    setImportStep("done");
  }

  function closeImportModal() {
    setImportBook(null);
    setImportStep("loading");
    setImportError(null);
  }

  // ── Edit ─────────────────────────────────────────────────────────────────────
  const [editBook, setEditBook] = useState<PricingBook | null>(null);
  const [editName, setEditName] = useState("");
  const [editVendor, setEditVendor] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function openEdit(book: PricingBook) {
    setEditBook(book);
    setEditName(book.name);
    setEditVendor(book.vendor ?? "");
    setEditError(null);
  }

  async function handleEditSave() {
    if (!editBook) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/materials-catalog/pricing-books/${editBook.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), vendor: editVendor.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save");
      setBooks(prev => prev.map(b => b.id === editBook.id ? { ...b, name: json.data.name, vendor: json.data.vendor } : b));
      setEditBook(null);
    } catch (e: any) {
      setEditError(e.message);
    } finally {
      setEditSaving(false);
    }
  }

  // ── Logo upload ───────────────────────────────────────────────────────────────
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoTargetId, setLogoTargetId] = useState<string | null>(null);

  function triggerLogoUpload(bookId: string) {
    setLogoTargetId(bookId);
    logoInputRef.current?.click();
  }

  async function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !logoTargetId) return;
    e.target.value = "";

    try {
      const presignRes = await fetch("/api/materials-catalog/pricing-books/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name }),
      });
      const presignJson = await presignRes.json();
      if (!presignRes.ok) throw new Error(presignJson.error || "Could not get upload URL");

      const uploadRes = await fetch(presignJson.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploadRes.ok) throw new Error(`Logo upload failed (${uploadRes.status})`);

      const patchRes = await fetch(`/api/materials-catalog/pricing-books/${logoTargetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logo_path: presignJson.path }),
      });
      if (!patchRes.ok) throw new Error("Failed to save logo");

      // Generate a local object URL for immediate display, then reload
      const logoUrl = URL.createObjectURL(file);
      setBooks(prev => prev.map(b => b.id === logoTargetId ? { ...b, logo_url: logoUrl, logo_path: presignJson.path } : b));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLogoTargetId(null);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hidden logo file input */}
      <input
        ref={logoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleLogoFile}
      />
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pricing Books</h1>
          <p className="text-sm text-gray-500 mt-0.5">Upload vendor pricing books (PDF, Excel, CSV) and import materials directly to your catalog</p>
        </div>
        <button className={btnPrimary} onClick={() => setShowUpload(true)}>
          + Upload Book
        </button>
      </div>

      {/* Body */}
      <div className="p-6">
        {loading ? (
          <div className="text-gray-400 text-sm py-16 text-center">Loading…</div>
        ) : error ? (
          <div className="text-red-600 text-sm py-8 text-center">{error}</div>
        ) : books.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📚</div>
            <p className="text-gray-500 font-medium">No pricing books yet</p>
            <p className="text-gray-400 text-sm mt-1">Upload a vendor PDF, Excel sheet, or CSV to get started</p>
            <button className={`${btnPrimary} mt-5`} onClick={() => setShowUpload(true)}>Upload your first book</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {books.map(book => {
              const badge = FILE_BADGE[book.file_type] ?? { label: book.file_type.toUpperCase(), bg: "bg-gray-100", text: "text-gray-600" };
              const canView = book.file_type === "pdf";
              const canImport = ["xlsx", "xls", "csv"].includes(book.file_type);
              return (
                <div key={book.id} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
                  {/* Logo area */}
                  <div
                    className="relative h-20 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center cursor-pointer group overflow-hidden"
                    onClick={() => triggerLogoUpload(book.id)}
                    title="Click to upload logo"
                  >
                    {book.logo_url ? (
                      <>
                        <img src={book.logo_url} alt="logo" className="max-h-16 max-w-full object-contain px-2" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                          <span className="opacity-0 group-hover:opacity-100 text-xs text-white bg-black/50 px-2 py-0.5 rounded transition-opacity">Change</span>
                        </div>
                      </>
                    ) : (
                      <div className="text-center">
                        <div className="text-2xl text-gray-300">🖼</div>
                        <span className="text-xs text-gray-400 group-hover:text-gray-600 transition-colors">Add logo</span>
                      </div>
                    )}
                  </div>
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${badge.bg} ${badge.text}`}>{badge.label}</span>
                    <span className="text-xs text-gray-400">{formatDate(book.created_at)}</span>
                  </div>
                  {/* Name */}
                  <div>
                    <div className="font-semibold text-gray-900 text-sm leading-snug">{book.name}</div>
                    {book.vendor && <div className="text-xs text-gray-500 mt-0.5">{book.vendor}</div>}
                    {book.file_size && <div className="text-xs text-gray-400 mt-0.5">{formatBytes(book.file_size)}</div>}
                  </div>
                  {/* Actions */}
                  <div className="flex gap-1 flex-wrap mt-auto pt-1 border-t border-gray-100">
                    {canView && (
                      <button className={btnGhost} onClick={() => handleView(book)}>View</button>
                    )}
                    {canImport && (
                      <button className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-sm px-3 py-1.5 rounded-lg transition-colors" onClick={() => startImport(book)}>
                        Import
                      </button>
                    )}
                    <button className={btnGhost} onClick={() => openEdit(book)}>Edit</button>
                    <button className={`${btnDanger} ml-auto`} onClick={() => handleDelete(book)}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Upload Modal ─────────────────────────────────────────────────────── */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Upload Pricing Book</h2>
              <button onClick={closeUploadModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4">
              {/* Drop zone */}
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragOver ? "border-emerald-400 bg-emerald-50" : "border-gray-300 hover:border-emerald-400 hover:bg-gray-50"}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadFile ? (
                  <div>
                    <div className="text-2xl mb-1">📄</div>
                    <div className="font-medium text-gray-800 text-sm">{uploadFile.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{formatBytes(uploadFile.size)}</div>
                    <button
                      className="text-xs text-emerald-600 hover:underline mt-2"
                      onClick={e => { e.stopPropagation(); setUploadFile(null); setUploadName(""); }}
                    >
                      Change file
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="text-3xl mb-2">📂</div>
                    <div className="text-sm font-medium text-gray-700">Drop file here or click to browse</div>
                    <div className="text-xs text-gray-400 mt-1">PDF, Excel (.xlsx, .xls), or CSV</div>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.xlsx,.xls,.csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                />
              </div>

              {uploadFile && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Book Name</label>
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      value={uploadName}
                      onChange={e => setUploadName(e.target.value)}
                      placeholder="e.g. Kluck Spring 2026 Pricing"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Vendor (optional)</label>
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      value={uploadVendor}
                      onChange={e => setUploadVendor(e.target.value)}
                      placeholder="e.g. Kluck Nursery"
                    />
                  </div>
                </>
              )}

              {uploadError && <p className="text-red-600 text-sm">{uploadError}</p>}

              <div className="flex gap-3 justify-end pt-1">
                <button className={btnGhost} onClick={closeUploadModal}>Cancel</button>
                <button
                  className={btnPrimary}
                  disabled={!uploadFile || uploading}
                  onClick={handleUpload}
                >
                  {uploading ? "Uploading…" : "Upload"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PDF Viewer Modal ──────────────────────────────────────────────────── */}
      {viewingUrl && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/80">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white">
            <span className="font-semibold text-sm">{viewingName}</span>
            <button
              onClick={() => { setViewingUrl(null); setViewingName(""); }}
              className="text-white/60 hover:text-white text-xl leading-none px-2"
            >
              ×
            </button>
          </div>
          <iframe
            src={`${viewingUrl}#toolbar=1&navpanes=1`}
            className="flex-1 w-full"
            title={viewingName}
          />
        </div>
      )}

      {/* ── Edit Modal ────────────────────────────────────────────────────────── */}
      {editBook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Edit Pricing Book</h2>
              <button onClick={() => setEditBook(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Book Name</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="e.g. Kluck Spring 2026 Pricing"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Vendor (optional)</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  value={editVendor}
                  onChange={e => setEditVendor(e.target.value)}
                  placeholder="e.g. Kluck Nursery"
                />
              </div>
              {editError && <p className="text-red-600 text-sm">{editError}</p>}
              <div className="flex gap-3 justify-end pt-1">
                <button className={btnGhost} onClick={() => setEditBook(null)}>Cancel</button>
                <button
                  className={btnPrimary}
                  disabled={!editName.trim() || editSaving}
                  onClick={handleEditSave}
                >
                  {editSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Import Modal ──────────────────────────────────────────────────────── */}
      {importBook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
              <div>
                <h2 className="font-bold text-gray-900">Import from "{importBook.name}"</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {importStep === "loading" && "Reading file…"}
                  {importStep === "mapping" && "Step 1 of 2 — Map columns"}
                  {importStep === "preview" && `Step 2 of 2 — Preview ${importRows.length} items`}
                  {importStep === "importing" && "Importing…"}
                  {importStep === "done" && "Import complete"}
                </p>
              </div>
              <button onClick={closeImportModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-auto p-6">
              {importStep === "loading" && (
                <div className="text-center py-12 text-gray-400">Reading file…</div>
              )}

              {importStep === "mapping" && (
                <div className="space-y-5">
                  {importError && <p className="text-red-600 text-sm">{importError}</p>}
                  {rawHeaders.length === 0 && !importError && (
                    <p className="text-gray-500 text-sm">No headers found in file.</p>
                  )}
                  {rawHeaders.length > 0 && (
                    <>
                      <p className="text-sm text-gray-600">Match each field to the correct column from your file. Name is required.</p>
                      <div className="grid grid-cols-2 gap-4">
                        {(["name", "unit", "cost", "vendor"] as const).map(field => (
                          <div key={field}>
                            <label className="block text-xs font-semibold text-gray-700 mb-1 capitalize">
                              {field === "name" ? "Material Name *" : field === "unit" ? "Unit" : field === "cost" ? "Unit Cost" : "Vendor"}
                            </label>
                            <select
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                              value={columnMap[field] ?? ""}
                              onChange={e => setColumnMap(prev => ({ ...prev, [field]: e.target.value === "" ? null : Number(e.target.value) }))}
                            >
                              <option value="">— skip —</option>
                              {rawHeaders.map((h, i) => (
                                <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>

                      {/* Preview of first 3 raw rows */}
                      {rawRows.length > 0 && (
                        <div className="mt-4">
                          <p className="text-xs font-medium text-gray-500 mb-2">File preview (first 3 rows)</p>
                          <div className="overflow-x-auto rounded-lg border border-gray-200">
                            <table className="text-xs w-full">
                              <thead className="bg-gray-50">
                                <tr>
                                  {rawHeaders.map((h, i) => (
                                    <th key={i} className="px-2 py-1.5 text-left font-semibold text-gray-600 border-b border-gray-200">{h || `Col ${i + 1}`}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {rawRows.slice(0, 3).map((row, ri) => (
                                  <tr key={ri} className="border-b border-gray-100">
                                    {row.map((cell, ci) => (
                                      <td key={ci} className="px-2 py-1.5 text-gray-700 whitespace-nowrap">{cell}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {importStep === "preview" && (
                <div>
                  <p className="text-sm text-gray-600 mb-3">Review the items below before adding to your Materials Catalog.</p>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="text-xs w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">Name</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">Unit</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">Cost</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">Vendor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.map((row, i) => (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="px-3 py-1.5 text-gray-800">{row.name}</td>
                            <td className="px-3 py-1.5 text-gray-600">{row.unit || "ea"}</td>
                            <td className="px-3 py-1.5 text-gray-600">${row.cost.toFixed(2)}</td>
                            <td className="px-3 py-1.5 text-gray-500">{row.vendor || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {rawRows.length > 200 && (
                    <p className="text-xs text-amber-600 mt-2">⚠ Showing first 200 of {rawRows.length} rows. All rows will be imported.</p>
                  )}
                </div>
              )}

              {importStep === "importing" && (
                <div className="text-center py-12 text-gray-500">
                  <div className="text-2xl mb-3 animate-spin inline-block">⏳</div>
                  <p>Importing {importRows.length} items…</p>
                </div>
              )}

              {importStep === "done" && importResult && (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">✅</div>
                  <p className="text-lg font-bold text-gray-900">{importResult.imported} items imported</p>
                  {importResult.skipped > 0 && (
                    <p className="text-sm text-gray-500 mt-1">{importResult.skipped} rows skipped (empty name or error)</p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 shrink-0">
              {importStep === "mapping" && (
                <>
                  <button className={btnGhost} onClick={closeImportModal}>Cancel</button>
                  <button className={btnPrimary} onClick={goToPreview} disabled={rawHeaders.length === 0}>
                    Preview →
                  </button>
                </>
              )}
              {importStep === "preview" && (
                <>
                  <button className={btnGhost} onClick={() => setImportStep("mapping")}>← Back</button>
                  <button className={btnPrimary} onClick={handleImport} disabled={importRows.length === 0}>
                    Import {importRows.length} items
                  </button>
                </>
              )}
              {importStep === "done" && (
                <button className={btnPrimary} onClick={closeImportModal}>Done</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
