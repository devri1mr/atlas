"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import PhotoEditor from "@/components/PhotoEditor";
import BeforeAfterSlider from "@/components/BeforeAfterSlider";

// ── Types ──────────────────────────────────────────────────────────────────────
type Photo = {
  id: string;
  file_name: string;
  file_size: number;
  content_type: string;
  caption: string | null;
  tags: string[];
  lat: number | null;
  lng: number | null;
  created_at: string;
  url: string | null;
};

type Video = {
  id: string;
  file_name: string;
  file_size: number;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  url: string | null;
  created_at: string;
};

const ALL_TAGS = ["Before", "During", "After", "Issue", "Completed"];
const TAG_COLORS: Record<string, string> = {
  Before: "bg-blue-100 text-blue-700 border-blue-200",
  During: "bg-yellow-100 text-yellow-700 border-yellow-200",
  After:  "bg-green-100 text-green-700 border-green-200",
  Issue:  "bg-red-100 text-red-700 border-red-200",
  Completed: "bg-purple-100 text-purple-700 border-purple-200",
};

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function fmtDur(s: number | null) {
  if (!s) return "";
  const m = Math.floor(s / 60); const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// Generate thumbnail from a video file/blob
async function generateVideoThumbnail(file: File | Blob): Promise<Blob | null> {
  return new Promise(resolve => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";

    const cleanup = () => URL.revokeObjectURL(url);

    video.addEventListener("loadeddata", () => {
      video.currentTime = Math.min(2, video.duration * 0.15 || 0);
    }, { once: true });

    video.addEventListener("seeked", () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(video.videoWidth, 640);
        canvas.height = Math.round((canvas.width / video.videoWidth) * video.videoHeight);
        canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(b => { cleanup(); resolve(b); }, "image/jpeg", 0.8);
      } catch { cleanup(); resolve(null); }
    }, { once: true });

    video.addEventListener("error", () => { cleanup(); resolve(null); }, { once: true });
    video.load();
  });
}

// Upload a file directly to a Supabase signed URL
async function putToSignedUrl(
  signedUrl: string,
  file: File | Blob,
  contentType: string,
  onProgress?: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    if (onProgress) xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function BidPhotosPage() {
  const { id: bidId } = useParams<{ id: string }>();

  // Tab
  const [tab, setTab] = useState<"photos" | "videos">("photos");

  // Photos state
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<Photo | null>(null);
  const [editing, setEditing] = useState<Photo | null>(null);
  const [compareFirst, setCompareFirst] = useState<Photo | null>(null);
  const [compareSecond, setCompareSecond] = useState<Photo | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Videos state
  const [videos, setVideos] = useState<Video[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoProgressLabel, setVideoProgressLabel] = useState("");
  const [videoLightbox, setVideoLightbox] = useState<Video | null>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);

  // Recording
  const [recordModal, setRecordModal] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const liveVideoRef = useRef<HTMLVideoElement>(null);

  // Share link
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareModal, setShareModal] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // PDF / report
  const [pdfModal, setPdfModal] = useState(false);
  const [pdfSelected, setPdfSelected] = useState<Set<string>>(new Set());

  // Error
  const [error, setError] = useState<string | null>(null);

  // ── Load photos ──────────────────────────────────────────────────────────
  const loadPhotos = useCallback(async () => {
    setPhotosLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/atlasbid/bid-photos?bid_id=${bidId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load photos");
      const loaded: Photo[] = (json.data ?? []).map((p: any) => ({ ...p, tags: p.tags ?? [] }));
      setPhotos(loaded);
      setPdfSelected(new Set(loaded.map((p: Photo) => p.id)));
    } catch (e: any) { setError(e?.message ?? "Failed to load photos"); }
    finally { setPhotosLoading(false); }
  }, [bidId]);

  // ── Load videos ──────────────────────────────────────────────────────────
  const loadVideos = useCallback(async () => {
    setVideosLoading(true);
    try {
      const res = await fetch(`/api/atlasbid/bid-videos?bid_id=${bidId}`);
      const json = await res.json();
      if (res.ok) setVideos(json.data ?? []);
    } catch {}
    finally { setVideosLoading(false); }
  }, [bidId]);

  useEffect(() => { loadPhotos(); loadVideos(); }, [loadPhotos, loadVideos]);

  // Load existing share link
  useEffect(() => {
    fetch(`/api/atlasbid/bid-share?bid_id=${bidId}`)
      .then(r => r.json())
      .then(j => { if (j.data?.token) setShareLink(buildShareUrl(j.data.token)); })
      .catch(() => {});
  }, [bidId]);

  function buildShareUrl(token: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/share/${token}`;
  }

  // ── GPS capture ──────────────────────────────────────────────────────────
  async function getGps(): Promise<{ lat: number; lng: number } | null> {
    if (!navigator.geolocation) return null;
    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { timeout: 8000, maximumAge: 30000 }
      );
    });
  }

  // ── Upload photos ─────────────────────────────────────────────────────────
  async function uploadFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (!arr.length) return;
    setUploading(true); setError(null); setUploadProgress(0);
    const gps = await getGps();
    try {
      const batchSize = 3;
      let done = 0;
      for (let i = 0; i < arr.length; i += batchSize) {
        const batch = arr.slice(i, i + batchSize);
        const fd = new FormData();
        fd.append("bid_id", bidId);
        batch.forEach(f => fd.append("files", f));
        if (gps) { fd.append("lat", String(gps.lat)); fd.append("lng", String(gps.lng)); }
        const res = await fetch("/api/atlasbid/bid-photos", { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Upload failed");
        done += batch.length;
        setUploadProgress(Math.round((done / arr.length) * 100));
      }
      await loadPhotos();
    } catch (e: any) { setError(e?.message ?? "Upload failed"); }
    finally { setUploading(false); setUploadProgress(0); if (fileInputRef.current) fileInputRef.current.value = ""; }
  }

  // ── Delete photo ──────────────────────────────────────────────────────────
  async function deletePhoto(photo: Photo) {
    if (!confirm(`Delete "${photo.file_name}"?`)) return;
    try {
      const res = await fetch(`/api/atlasbid/bid-photos?id=${photo.id}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json(); throw new Error(j?.error); }
      setPhotos(prev => prev.filter(p => p.id !== photo.id));
      if (lightbox?.id === photo.id) setLightbox(null);
    } catch (e: any) { setError(e?.message ?? "Delete failed"); }
  }

  // ── Patch photo (caption / tags) ─────────────────────────────────────────
  async function patchPhoto(id: string, patch: Partial<Pick<Photo, "caption" | "tags">>) {
    try {
      const res = await fetch(`/api/atlasbid/bid-photos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error);
      setPhotos(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
      setLightbox(prev => prev?.id === id ? { ...prev, ...patch } : prev);
    } catch (e: any) { setError(e?.message ?? "Save failed"); }
  }

  // ── Compare mode ─────────────────────────────────────────────────────────
  function handlePhotoClick(photo: Photo) {
    if (compareMode) {
      if (!compareFirst) {
        setCompareFirst(photo);
      } else if (!compareSecond && compareFirst.id !== photo.id) {
        setCompareSecond(photo);
      }
      return;
    }
    setLightbox(photo);
  }

  // ── Upload video ─────────────────────────────────────────────────────────
  async function uploadVideoFile(file: File, durationSec?: number) {
    const SIZE_WARN = 500 * 1024 * 1024; // 500MB
    if (file.size > SIZE_WARN) {
      if (!confirm(`This video is ${fmtSize(file.size)} which is large. Upload may take a while. Continue?`)) return;
    }
    setVideoUploading(true); setVideoProgress(0);
    try {
      // 1. Get signed URLs
      setVideoProgressLabel("Preparing upload…");
      const presignRes = await fetch("/api/atlasbid/bid-videos/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bid_id: bidId, file_name: file.name, file_type: file.type }),
      });
      const presign = await presignRes.json();
      if (!presignRes.ok) throw new Error(presign?.error ?? "Presign failed");

      // 2. Generate thumbnail
      setVideoProgressLabel("Generating thumbnail…");
      const thumbBlob = await generateVideoThumbnail(file);

      // 3. Upload thumbnail
      if (thumbBlob && presign.thumbnailSignedUrl) {
        setVideoProgressLabel("Uploading thumbnail…");
        await putToSignedUrl(presign.thumbnailSignedUrl, thumbBlob, "image/jpeg");
      }

      // 4. Upload video with progress
      setVideoProgressLabel("Uploading video…");
      await putToSignedUrl(presign.videoSignedUrl, file, file.type || "video/mp4", pct => setVideoProgress(pct));

      // 5. Confirm
      setVideoProgressLabel("Saving…");
      const confirmRes = await fetch("/api/atlasbid/bid-videos/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bid_id: bidId,
          company_id: presign.company_id,
          video_path: presign.videoPath,
          thumbnail_path: thumbBlob ? presign.thumbnailPath : null,
          file_name: file.name,
          file_size: file.size,
          duration_seconds: durationSec ?? null,
        }),
      });
      const confirm = await confirmRes.json();
      if (!confirmRes.ok) throw new Error(confirm?.error ?? "Confirm failed");

      await loadVideos();
    } catch (e: any) { setError(e?.message ?? "Video upload failed"); }
    finally { setVideoUploading(false); setVideoProgress(0); setVideoProgressLabel(""); if (videoFileRef.current) videoFileRef.current.value = ""; }
  }

  // ── Delete video ──────────────────────────────────────────────────────────
  async function deleteVideo(video: Video) {
    if (!confirm(`Delete "${video.file_name}"?`)) return;
    try {
      const res = await fetch(`/api/atlasbid/bid-videos?id=${video.id}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json(); throw new Error(j?.error); }
      setVideos(prev => prev.filter(v => v.id !== video.id));
      if (videoLightbox?.id === video.id) setVideoLightbox(null);
    } catch (e: any) { setError(e?.message ?? "Delete failed"); }
  }

  // ── Recording ─────────────────────────────────────────────────────────────
  async function startCamera() {
    setRecordModal(true);
    setRecordedBlob(null);
    setRecordedDuration(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;
      if (liveVideoRef.current) { liveVideoRef.current.srcObject = stream; liveVideoRef.current.play(); }
    } catch (e: any) {
      setError("Camera access denied: " + e.message);
      setRecordModal(false);
    }
  }

  function startRecording() {
    if (!streamRef.current) return;
    const mime = MediaRecorder.isTypeSupported("video/mp4") ? "video/mp4" : "video/webm";
    const mr = new MediaRecorder(streamRef.current, { mimeType: mime });
    recordedChunksRef.current = [];
    mr.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: mime });
      setRecordedBlob(blob);
      if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
    };
    mr.start(1000);
    mediaRecorderRef.current = mr;
    setRecording(true);
    setRecordedDuration(0);
    recordTimerRef.current = setInterval(() => setRecordedDuration(d => d + 1), 1000);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    setRecording(false);
  }

  function closeRecordModal() {
    stopRecording();
    streamRef.current?.getTracks().forEach(t => t.stop());
    setRecordModal(false);
    setRecordedBlob(null);
  }

  async function useRecordedVideo() {
    if (!recordedBlob) return;
    const ext = recordedBlob.type.includes("mp4") ? "mp4" : "webm";
    const file = new File([recordedBlob], `recording-${Date.now()}.${ext}`, { type: recordedBlob.type });
    closeRecordModal();
    await uploadVideoFile(file, recordedDuration);
  }

  // Show recorded blob in preview
  useEffect(() => {
    if (recordedBlob && previewVideoRef.current) {
      previewVideoRef.current.src = URL.createObjectURL(recordedBlob);
      previewVideoRef.current.load();
    }
  }, [recordedBlob]);

  // ── Share link ────────────────────────────────────────────────────────────
  async function handleShare() {
    setShareLoading(true);
    try {
      if (!shareLink) {
        const res = await fetch("/api/atlasbid/bid-share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bid_id: bidId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Failed to create share link");
        setShareLink(buildShareUrl(json.data.token));
      }
      setShareModal(true);
    } catch (e: any) { setError(e?.message); }
    finally { setShareLoading(false); }
  }

  async function copyShareLink() {
    if (!shareLink) return;
    await navigator.clipboard.writeText(shareLink).catch(() => {});
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

  async function revokeShareLink() {
    if (!confirm("Revoke this share link? Anyone with the link will no longer be able to view photos.")) return;
    await fetch(`/api/atlasbid/bid-share?bid_id=${bidId}`, { method: "DELETE" });
    setShareLink(null);
    setShareModal(false);
  }

  // ── PDF Report ────────────────────────────────────────────────────────────
  function generateReport() {
    const toInclude = photos.filter(p => pdfSelected.has(p.id));
    if (!toInclude.length) return;
    const win = window.open("", "_blank");
    if (!win) { alert("Please allow popups to generate the report."); return; }

    const photosHtml = toInclude.map(p => `
      <div class="photo">
        ${p.url ? `<img src="${p.url}" alt="${p.file_name}" />` : '<div class="no-img">No image</div>'}
        <div class="meta">
          ${p.tags?.length ? `<div class="tags">${p.tags.map((t: string) => `<span class="tag tag-${t.toLowerCase()}">${t}</span>`).join("")}</div>` : ""}
          ${p.caption ? `<p class="caption">${p.caption}</p>` : ""}
          ${p.lat && p.lng ? `<a class="gps" href="https://maps.google.com/?q=${p.lat},${p.lng}" target="_blank">📍 View on map</a>` : ""}
          <p class="date">${new Date(p.created_at).toLocaleString()}</p>
        </div>
      </div>`).join("");

    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Site Photos Report</title><style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; color: #1f2937; background: #fff; }
      .header { background: #123b1f; color: #fff; padding: 24px 32px; margin-bottom: 24px; }
      .header h1 { font-size: 22px; font-weight: 700; }
      .header p { font-size: 13px; opacity: 0.7; margin-top: 4px; }
      .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; padding: 0 32px 32px; }
      .photo { break-inside: avoid; }
      .photo img { width: 100%; border-radius: 8px; display: block; max-height: 280px; object-fit: cover; }
      .no-img { width: 100%; height: 180px; background: #f3f4f6; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #9ca3af; }
      .meta { padding: 8px 2px 0; }
      .tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 5px; }
      .tag { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 9999px; }
      .tag-before { background: #dbeafe; color: #1d4ed8; }
      .tag-during { background: #fef9c3; color: #854d0e; }
      .tag-after { background: #dcfce7; color: #15803d; }
      .tag-issue { background: #fee2e2; color: #b91c1c; }
      .tag-completed { background: #f3e8ff; color: #7c3aed; }
      .caption { font-size: 12px; color: #374151; line-height: 1.4; }
      .gps { font-size: 10px; color: #2563eb; margin-top: 3px; display: block; }
      .date { font-size: 10px; color: #9ca3af; margin-top: 3px; }
      @media print { @page { margin: 1cm; } .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .tag { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style></head><body>
      <div class="header">
        <h1>Site Photos Report</h1>
        <p>${toInclude.length} photo${toInclude.length !== 1 ? "s" : ""} · Generated ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
      </div>
      <div class="grid">${photosHtml}</div>
      <script>window.onload = function() { setTimeout(function() { window.print(); }, 300); }</script>
    </body></html>`);
    win.document.close();
    setPdfModal(false);
  }

  // ── Filtered photos ───────────────────────────────────────────────────────
  const filtered = tagFilter ? photos.filter(p => p.tags?.includes(tagFilter)) : photos;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Tab bar ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          <button onClick={() => setTab("photos")}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${tab === "photos" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            Photos {photosLoading ? "" : `(${photos.length})`}
          </button>
          <button onClick={() => setTab("videos")}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${tab === "videos" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            Videos {videosLoading ? "" : `(${videos.length})`}
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {tab === "photos" && (
            <>
              <button onClick={() => setPdfModal(true)}
                className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 border border-gray-200 bg-white px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                PDF Report
              </button>
              <button onClick={handleShare} disabled={shareLoading}
                className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 border border-gray-200 bg-white px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                Share
              </button>
              <button onClick={() => { setCompareMode(m => !m); setCompareFirst(null); setCompareSecond(null); }}
                className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl border transition-colors ${compareMode ? "bg-blue-50 border-blue-300 text-blue-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/></svg>
                {compareMode ? "Cancel Compare" : "Compare"}
              </button>
              <label className="flex items-center gap-2 cursor-pointer bg-[#123b1f] text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-[#1a5c2e] transition-colors">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                Upload
                <input ref={fileInputRef} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={e => e.target.files && uploadFiles(e.target.files)} />
              </label>
            </>
          )}
          {tab === "videos" && (
            <>
              <button onClick={startCamera}
                className="flex items-center gap-2 bg-[#123b1f] text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-[#1a5c2e] transition-colors">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                Record
              </button>
              <label className="flex items-center gap-2 cursor-pointer border border-gray-200 bg-white text-gray-700 text-sm font-semibold px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Upload Video
                <input ref={videoFileRef} type="file" accept="video/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadVideoFile(f); }} />
              </label>
            </>
          )}
        </div>
      </div>

      {/* Compare mode hint */}
      {compareMode && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 flex items-center gap-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <p className="text-sm text-blue-700">
            {!compareFirst ? "Click the BEFORE photo" : !compareSecond ? "Click the AFTER photo" : ""}
          </p>
          {compareFirst && <span className="text-xs font-semibold bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full">1 selected</span>}
        </div>
      )}

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Upload progress */}
      {uploading && (
        <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-green-800">Uploading photos…</span>
            <span className="text-sm text-green-700">{uploadProgress}%</span>
          </div>
          <div className="h-1.5 bg-green-100 rounded-full overflow-hidden">
            <div className="h-full bg-green-600 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}
      {videoUploading && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-blue-800">{videoProgressLabel || "Uploading video…"}</span>
            {videoProgress > 0 && <span className="text-sm text-blue-700">{videoProgress}%</span>}
          </div>
          {videoProgress > 0 && (
            <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${videoProgress}%` }} />
            </div>
          )}
        </div>
      )}

      {/* ── PHOTOS TAB ── */}
      {tab === "photos" && (
        <>
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); uploadFiles(e.dataTransfer.files); }}
            className={`rounded-2xl border-2 border-dashed transition-all text-center py-6 px-4 ${dragging ? "border-green-400 bg-green-50" : "border-gray-200 bg-gray-50/50 hover:border-gray-300"}`}
          >
            <p className="text-sm font-medium text-gray-500">Drag photos here · or use Upload above</p>
            <p className="text-xs text-gray-400 mt-0.5">JPG, PNG, HEIC, WebP · Auto-compressed to 1920px</p>
          </div>

          {/* Tag filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setTagFilter(null)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${!tagFilter ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}>
              All ({photos.length})
            </button>
            {ALL_TAGS.map(tag => {
              const count = photos.filter(p => p.tags?.includes(tag)).length;
              if (count === 0) return null;
              return (
                <button key={tag} onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${tagFilter === tag ? TAG_COLORS[tag].replace("border-", "border-").split(" ").slice(0, 2).join(" ") + " border" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}>
                  {tag} ({count})
                </button>
              );
            })}
          </div>

          {/* Photo grid */}
          {photosLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {[...Array(8)].map((_, i) => <div key={i} className="aspect-square rounded-xl bg-gray-100 animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              {tagFilter ? `No photos tagged "${tagFilter}"` : "No photos yet — drag or upload above."}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filtered.map(photo => {
                const isFirst = compareFirst?.id === photo.id;
                const isSecond = compareSecond?.id === photo.id;
                return (
                  <div key={photo.id}
                    className={`group relative aspect-square rounded-xl overflow-hidden bg-gray-100 border shadow-sm cursor-pointer transition-all ${isFirst ? "border-blue-500 ring-2 ring-blue-400" : isSecond ? "border-orange-400 ring-2 ring-orange-400" : "border-gray-200 hover:border-gray-300"}`}
                    onClick={() => handlePhotoClick(photo)}>
                    {photo.url
                      ? <img src={photo.url} alt={photo.file_name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                      : <div className="w-full h-full flex items-center justify-center text-gray-300"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>
                    }
                    {/* Compare badge */}
                    {(isFirst || isSecond) && (
                      <div className={`absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${isFirst ? "bg-blue-500" : "bg-orange-400"}`}>
                        {isFirst ? "1" : "2"}
                      </div>
                    )}
                    {/* GPS dot */}
                    {photo.lat && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center" title="Has GPS">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                      </div>
                    )}
                    {/* Tag badges */}
                    {photo.tags?.length > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 p-1.5 flex flex-wrap gap-1">
                        {photo.tags.slice(0, 2).map((tag: string) => (
                          <span key={tag} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${TAG_COLORS[tag] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>{tag}</span>
                        ))}
                      </div>
                    )}
                    {/* Delete btn */}
                    <button onClick={e => { e.stopPropagation(); deletePhoto(photo); }}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── VIDEOS TAB ── */}
      {tab === "videos" && (
        <>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <p><strong>iPhone tip:</strong> For faster uploads, go to Settings → Camera → Record Video and choose 1080p HD at 30 fps before recording.</p>
          </div>

          {videosLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => <div key={i} className="aspect-video rounded-xl bg-gray-100 animate-pulse" />)}
            </div>
          ) : videos.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">No videos yet — record or upload above.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {videos.map(video => (
                <div key={video.id} className="group relative rounded-xl overflow-hidden bg-gray-900 border border-gray-200 shadow-sm cursor-pointer aspect-video"
                  onClick={() => setVideoLightbox(video)}>
                  {video.thumbnail_url
                    ? <img src={video.thumbnail_url} alt={video.file_name} className="w-full h-full object-cover group-hover:opacity-80 transition-opacity" />
                    : <div className="w-full h-full flex items-center justify-center text-gray-600"><svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
                  }
                  {/* Play overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </div>
                  </div>
                  {/* Duration */}
                  {video.duration_seconds && (
                    <div className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
                      {fmtDur(video.duration_seconds)}
                    </div>
                  )}
                  {/* Delete */}
                  <button onClick={e => { e.stopPropagation(); deleteVideo(video); }}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                  {/* File name */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-white text-[10px] truncate">{video.file_name}</p>
                    <p className="text-white/60 text-[10px]">{fmtSize(video.file_size)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Photo Editor ── */}
      {editing && editing.url && (
        <PhotoEditor photoUrl={editing.url} fileName={editing.file_name} bidId={bidId}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); loadPhotos(); }} />
      )}

      {/* ── Before/After Slider ── */}
      {compareFirst && compareSecond && compareFirst.url && compareSecond.url && (
        <BeforeAfterSlider
          beforeUrl={compareFirst.url}
          afterUrl={compareSecond.url}
          beforeLabel={compareFirst.tags?.[0] ?? compareFirst.file_name}
          afterLabel={compareSecond.tags?.[0] ?? compareSecond.file_name}
          onClose={() => { setCompareFirst(null); setCompareSecond(null); setCompareMode(false); }}
        />
      )}

      {/* ── Photo Lightbox ── */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <div className="flex flex-col lg:flex-row items-start gap-4 max-w-5xl w-full" onClick={e => e.stopPropagation()}>
            {/* Image */}
            <div className="flex-1 min-w-0">
              {lightbox.url && <img src={lightbox.url} alt={lightbox.file_name} className="max-w-full max-h-[80vh] rounded-lg shadow-2xl object-contain" />}
            </div>
            {/* Side panel */}
            <div className="lg:w-64 shrink-0 bg-white/10 backdrop-blur-sm rounded-xl p-4 space-y-4 text-white">
              <div>
                <p className="text-xs text-white/50 mb-1">File</p>
                <p className="text-sm truncate">{lightbox.file_name}</p>
                <p className="text-xs text-white/40">{fmtSize(lightbox.file_size)}</p>
              </div>

              {/* Tags */}
              <div>
                <p className="text-xs text-white/50 mb-2">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_TAGS.map(tag => {
                    const active = lightbox.tags?.includes(tag);
                    return (
                      <button key={tag}
                        onClick={() => {
                          const newTags = active ? lightbox.tags.filter(t => t !== tag) : [...(lightbox.tags ?? []), tag];
                          patchPhoto(lightbox.id, { tags: newTags });
                        }}
                        className={`text-[11px] font-semibold px-2 py-1 rounded-full border transition-colors ${active ? TAG_COLORS[tag] + " bg-opacity-90" : "border-white/20 text-white/60 hover:border-white/40"}`}>
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Caption */}
              <div>
                <p className="text-xs text-white/50 mb-1">Caption</p>
                <textarea
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 resize-none outline-none focus:border-white/50 transition-colors"
                  rows={3}
                  placeholder="Add a caption…"
                  defaultValue={lightbox.caption ?? ""}
                  onBlur={e => patchPhoto(lightbox.id, { caption: e.target.value })}
                />
              </div>

              {/* GPS */}
              {lightbox.lat && lightbox.lng && (
                <div>
                  <p className="text-xs text-white/50 mb-1">Location</p>
                  <a href={`https://maps.google.com/?q=${lightbox.lat},${lightbox.lng}`} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-300 hover:text-blue-200 flex items-center gap-1">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                    {lightbox.lat.toFixed(5)}, {lightbox.lng.toFixed(5)}
                  </a>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-1 border-t border-white/10">
                <button onClick={() => { setEditing(lightbox); setLightbox(null); }}
                  className="text-emerald-400 hover:text-emerald-300 text-xs flex items-center gap-1 font-semibold">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Edit
                </button>
                <a href={lightbox.url ?? "#"} download={lightbox.file_name} onClick={e => e.stopPropagation()}
                  className="text-white/60 hover:text-white text-xs flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Download
                </a>
                <button onClick={() => deletePhoto(lightbox)}
                  className="text-red-400 hover:text-red-300 text-xs flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Video Lightbox ── */}
      {videoLightbox && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4" onClick={() => setVideoLightbox(null)}>
          <button onClick={() => setVideoLightbox(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <div onClick={e => e.stopPropagation()} className="max-w-4xl w-full">
            {videoLightbox.url && (
              <video src={videoLightbox.url} controls autoPlay playsInline
                className="w-full max-h-[80vh] rounded-xl shadow-2xl bg-black" />
            )}
            <div className="flex items-center justify-between mt-3 px-1">
              <p className="text-white/60 text-sm truncate">{videoLightbox.file_name} · {fmtSize(videoLightbox.file_size)}</p>
              <button onClick={() => deleteVideo(videoLightbox)} className="text-red-400 hover:text-red-300 text-xs flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Record Modal ── */}
      {recordModal && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-900">
            <h3 className="text-white font-semibold">Record Video</h3>
            <button onClick={closeRecordModal} className="text-gray-400 hover:text-white">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center bg-black">
            {!recordedBlob ? (
              <video ref={liveVideoRef} autoPlay muted playsInline className="max-w-full max-h-full" />
            ) : (
              <video ref={previewVideoRef} controls playsInline className="max-w-full max-h-full rounded-lg" />
            )}
          </div>

          <div className="bg-gray-900 px-6 py-5 flex flex-col items-center gap-3">
            {!recordedBlob ? (
              <>
                {recording && (
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-white font-mono text-lg">{fmtDur(recordedDuration)}</span>
                  </div>
                )}
                <button
                  onClick={recording ? stopRecording : startRecording}
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${recording ? "bg-red-600 hover:bg-red-700" : "bg-white hover:bg-gray-200"}`}>
                  {recording
                    ? <div className="w-6 h-6 bg-white rounded-sm" />
                    : <div className="w-6 h-6 rounded-full bg-red-500" />
                  }
                </button>
                <p className="text-white/50 text-xs">{recording ? "Tap to stop" : "Tap to start recording"}</p>
              </>
            ) : (
              <>
                <p className="text-white/60 text-sm">Preview — {fmtDur(recordedDuration)} · {fmtSize(recordedBlob.size)}</p>
                <div className="flex gap-3">
                  <button onClick={() => { setRecordedBlob(null); if (streamRef.current) { if (liveVideoRef.current) { liveVideoRef.current.srcObject = streamRef.current; liveVideoRef.current.play(); }}}}
                    className="px-5 py-2.5 rounded-xl border border-white/20 text-white text-sm font-semibold hover:bg-white/10 transition-colors">
                    Re-record
                  </button>
                  <button onClick={useRecordedVideo}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors">
                    Use This Video
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Share Modal ── */}
      {shareModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShareModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Share Photos</h3>
              <button onClick={() => setShareModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">Anyone with this link can view the site photos — no login required.</p>
            <div className="flex gap-2">
              <input readOnly value={shareLink ?? ""} className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 text-gray-700 outline-none" />
              <button onClick={copyShareLink}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${shareCopied ? "bg-green-600 text-white" : "bg-[#123b1f] text-white hover:bg-[#1a5c2e]"}`}>
                {shareCopied ? "Copied!" : "Copy"}
              </button>
            </div>
            <button onClick={revokeShareLink} className="mt-4 text-xs text-red-500 hover:text-red-700 underline">Revoke link</button>
          </div>
        </div>
      )}

      {/* ── PDF Report Modal ── */}
      {pdfModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setPdfModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Generate PDF Report</h3>
              <button onClick={() => setPdfModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-500">{pdfSelected.size} of {photos.length} selected</p>
              <div className="flex gap-2 text-xs">
                <button onClick={() => setPdfSelected(new Set(photos.map(p => p.id)))} className="text-blue-600 hover:underline">All</button>
                <button onClick={() => setPdfSelected(new Set())} className="text-gray-400 hover:underline">None</button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto mb-4">
              {photos.map(p => (
                <div key={p.id} className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${pdfSelected.has(p.id) ? "border-[#123b1f]" : "border-transparent opacity-50"}`}
                  onClick={() => setPdfSelected(prev => { const s = new Set(prev); s.has(p.id) ? s.delete(p.id) : s.add(p.id); return s; })}>
                  {p.url && <img src={p.url} alt="" className="w-full h-full object-cover" />}
                  {pdfSelected.has(p.id) && (
                    <div className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-[#123b1f] flex items-center justify-center">
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button onClick={generateReport} disabled={pdfSelected.size === 0}
              className="w-full bg-[#123b1f] hover:bg-[#1a5c2e] text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-40">
              Print / Save as PDF ({pdfSelected.size} photos)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
