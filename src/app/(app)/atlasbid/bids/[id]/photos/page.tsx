"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import PhotoEditor from "@/components/PhotoEditor";

type Photo = {
  id: string;
  file_name: string;
  file_size: number;
  content_type: string;
  created_at: string;
  url: string | null;
};

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function BidPhotosPage() {
  const { id: bidId } = useParams<{ id: string }>();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [lightbox, setLightbox] = useState<Photo | null>(null);
  const [editing, setEditing] = useState<Photo | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/atlasbid/bid-photos?bid_id=${bidId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load photos");
      setPhotos(json.data ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load photos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [bidId]);

  async function uploadFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (!arr.length) return;
    setUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      // Upload in batches of 3 to avoid overwhelming the server
      const batchSize = 3;
      let done = 0;
      for (let i = 0; i < arr.length; i += batchSize) {
        const batch = arr.slice(i, i + batchSize);
        const formData = new FormData();
        formData.append("bid_id", bidId);
        batch.forEach(f => formData.append("files", f));
        const res = await fetch("/api/atlasbid/bid-photos", { method: "POST", body: formData });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Upload failed");
        done += batch.length;
        setUploadProgress(Math.round((done / arr.length) * 100));
      }
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function deletePhoto(photo: Photo) {
    if (!confirm(`Delete "${photo.file_name}"?`)) return;
    try {
      const res = await fetch(`/api/atlasbid/bid-photos?id=${photo.id}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json(); throw new Error(j?.error); }
      setPhotos(prev => prev.filter(p => p.id !== photo.id));
      if (lightbox?.id === photo.id) setLightbox(null);
    } catch (e: any) {
      setError(e?.message ?? "Delete failed");
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    uploadFiles(e.dataTransfer.files);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Site Photos</h2>
          <p className="text-sm text-gray-500 mt-0.5">{photos.length} photo{photos.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Camera button for mobile */}
          <label className="flex items-center gap-2 cursor-pointer bg-[#123b1f] text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-[#1a5c2e] transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            Take / Upload
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              className="hidden"
              onChange={e => e.target.files && uploadFiles(e.target.files)}
            />
          </label>
          {/* File picker (desktop) */}
          <label className="flex items-center gap-2 cursor-pointer bg-white border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Browse Files
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => e.target.files && uploadFiles(e.target.files)}
            />
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-green-800">Uploading…</span>
            <span className="text-sm text-green-700">{uploadProgress}%</span>
          </div>
          <div className="h-1.5 bg-green-100 rounded-full overflow-hidden">
            <div className="h-full bg-green-600 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-2xl border-2 border-dashed transition-all text-center py-8 px-4 ${
          dragging ? "border-green-400 bg-green-50" : "border-gray-200 bg-gray-50/50 hover:border-gray-300"
        }`}
      >
        <svg className="mx-auto mb-3 text-gray-400" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        <p className="text-sm font-medium text-gray-600">Drag photos here to upload</p>
        <p className="text-xs text-gray-400 mt-1">or use the buttons above · JPG, PNG, HEIC, WebP</p>
      </div>

      {/* Photo grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="aspect-square rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">No photos yet — add some using the buttons above.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {photos.map(photo => (
            <div key={photo.id} className="group relative aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200 shadow-sm cursor-pointer"
              onClick={() => setLightbox(photo)}>
              {photo.url ? (
                <img src={photo.url} alt={photo.file_name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                  </svg>
                </div>
              )}
              <button
                onClick={e => { e.stopPropagation(); deletePhoto(photo); }}
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600"
                title="Delete"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-white text-[10px] truncate">{photo.file_name}</p>
                <p className="text-white/60 text-[10px]">{fmtSize(photo.file_size)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Photo Editor */}
      {editing && editing.url && (
        <PhotoEditor
          photoUrl={editing.url}
          fileName={editing.file_name}
          bidId={bidId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          {lightbox.url && (
            <img
              src={lightbox.url}
              alt={lightbox.file_name}
              className="max-w-full max-h-[90vh] rounded-lg shadow-2xl object-contain"
              onClick={e => e.stopPropagation()}
            />
          )}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center">
            <p className="text-white/80 text-sm">{lightbox.file_name}</p>
            <div className="flex items-center gap-3 justify-center mt-2">
              <button
                onClick={e => { e.stopPropagation(); setEditing(lightbox); setLightbox(null); }}
                className="text-emerald-400 hover:text-emerald-300 text-xs flex items-center gap-1 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Edit
              </button>
              <a
                href={lightbox.url ?? "#"}
                download={lightbox.file_name}
                onClick={e => e.stopPropagation()}
                className="text-white/60 hover:text-white text-xs flex items-center gap-1 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                Download
              </a>
              <button
                onClick={e => { e.stopPropagation(); deletePhoto(lightbox); }}
                className="text-red-400 hover:text-red-300 text-xs flex items-center gap-1 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                </svg>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
