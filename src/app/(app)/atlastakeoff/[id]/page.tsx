"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";

/* ─── Types ────────────────────────────────────────────────────────── */
type Takeoff = {
  id: string; name: string; client_name: string | null; address: string | null;
  plan_storage_path: string | null; plan_image_path: string | null;
  plan_file_name: string | null; scale_ft_per_inch: number | null;
};
type Item = {
  id: string; common_name: string; botanical_name: string | null;
  category: string; size: string | null; container: string | null;
  spacing: string | null; designation: string | null; remarks: string | null;
  color: string; symbol: string; count: number; unit: string;
  unit_price: number | null; sort_order: number;
};
type Mark = {
  id: string; item_id: string | null; mark_type: string;
  x_pct: number | null; y_pct: number | null;
  points: { x: number; y: number }[] | null; value: number | null; label: string | null;
};
type Tool = "select" | "count" | "area" | "length";

const BUCKET = "takeoff-plans";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

const CAT_COLORS: Record<string, string> = {
  tree: "#15803d", shrub: "#7c3aed", perennial: "#ea580c",
  grass: "#ca8a04", groundcover: "#0891b2", other: "#6b7280",
};
const CAT_ICON: Record<string, string> = {
  tree: "🌳", shrub: "🌿", perennial: "🌸", grass: "🌾", groundcover: "🟫", other: "📦",
};

/* ─── Main page ─────────────────────────────────────────────────────── */
export default function TakeoffEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();

  const [takeoff, setTakeoff] = useState<Takeoff | null>(null);
  const [items,   setItems]   = useState<Item[]>([]);
  const [marks,   setMarks]   = useState<Mark[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTool,   setActiveTool]   = useState<Tool>("select");
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [imageUrl,     setImageUrl]     = useState<string | null>(null);
  const [imgLoaded,    setImgLoaded]    = useState(false);
  const [imgDims,      setImgDims]      = useState({ w: 1, h: 1 });
  const [zoom,         setZoom]         = useState(1);
  const [uploadState,  setUploadState]  = useState<"idle"|"uploading"|"rendering">("idle");
  const [aiParsing,    setAiParsing]    = useState(false);
  const [aiStatus,     setAiStatus]     = useState("");
  const [showAddItem,  setShowAddItem]  = useState(false);
  const [newItemForm,  setNewItemForm]  = useState({ common_name: "", category: "tree", color: "#15803d" });
  const [inProgressPts, setInProgressPts] = useState<{ x: number; y: number }[]>([]);
  const [sidebarTab,   setSidebarTab]   = useState<"items"|"table">("items");

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const imgRef       = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewerRef    = useRef<HTMLDivElement>(null);

  /* ── Load ── */
  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    try {
      const [tr, ir, mr] = await Promise.all([
        fetch(`/api/takeoff/${id}`).then(r => r.json()),
        fetch(`/api/takeoff/${id}/items`).then(r => r.json()),
        fetch(`/api/takeoff/${id}/marks`).then(r => r.json()),
      ]);
      const t = tr.data as Takeoff;
      setTakeoff(t);
      setItems(ir.data ?? []);
      setMarks(mr.data ?? []);
      if (ir.data?.length > 0) setActiveItemId(ir.data[0].id);

      if (t?.plan_image_path) {
        setImageUrl(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${t.plan_image_path}`);
      } else if (t?.plan_storage_path && !t.plan_storage_path.endsWith(".pdf")) {
        setImageUrl(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${t.plan_storage_path}`);
      }
    } finally {
      setLoading(false);
    }
  }

  /* ── Canvas draw ── */
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img || !imgLoaded) return;

    const dispW = img.offsetWidth  * zoom;
    const dispH = img.offsetHeight * zoom;
    canvas.width  = dispW;
    canvas.height = dispH;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, dispW, dispH);

    const toC = (xPct: number, yPct: number) => ({
      x: (xPct / 100) * dispW,
      y: (yPct / 100) * dispH,
    });

    // Draw count marks
    const countMarks = marks.filter(m => m.mark_type === "count");
    // Group by item for sequential numbering
    const byItem: Record<string, Mark[]> = {};
    countMarks.forEach(m => {
      const k = m.item_id ?? "__none";
      (byItem[k] = byItem[k] ?? []).push(m);
    });

    countMarks.forEach(m => {
      if (m.x_pct == null || m.y_pct == null) return;
      const { x, y }  = toC(m.x_pct, m.y_pct);
      const item       = items.find(i => i.id === m.item_id);
      const color      = item?.color ?? "#2563eb";
      const seqMarks   = byItem[m.item_id ?? "__none"] ?? [];
      const num        = seqMarks.indexOf(m) + 1;

      const r = 12;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth   = 2;
      ctx.stroke();

      ctx.fillStyle   = "#fff";
      ctx.font        = `bold ${num > 9 ? 9 : 11}px Inter, sans-serif`;
      ctx.textAlign   = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(num), x, y + 0.5);
    });

    // Draw area/length polygons
    marks.filter(m => m.mark_type === "area" || m.mark_type === "length").forEach(m => {
      if (!m.points?.length) return;
      const item  = items.find(i => i.id === m.item_id);
      const color = item?.color ?? "#2563eb";
      const pts   = m.points.map(p => ({
        x: (p.x / 100) * dispW,
        y: (p.y / 100) * dispH,
      }));

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      if (m.mark_type === "area") ctx.closePath();

      if (m.mark_type === "area") {
        ctx.fillStyle = color + "33";
        ctx.fill();
      }
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2.5;
      ctx.setLineDash(m.mark_type === "length" ? [6, 3] : []);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label
      if (m.value != null) {
        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
        ctx.fillStyle   = "#fff";
        ctx.strokeStyle = color;
        ctx.lineWidth   = 3;
        ctx.font        = "bold 11px Inter, sans-serif";
        ctx.textAlign   = "center";
        ctx.textBaseline = "middle";
        const lbl = m.mark_type === "area"
          ? `${Math.round(m.value).toLocaleString()} SF`
          : `${Math.round(m.value).toLocaleString()} LF`;
        ctx.strokeText(lbl, cx, cy);
        ctx.fillStyle = color;
        ctx.fillText(lbl, cx, cy);
      }
    });

    // Draw in-progress polygon/line
    if (inProgressPts.length > 0 && (activeTool === "area" || activeTool === "length")) {
      const item  = items.find(i => i.id === activeItemId);
      const color = item?.color ?? "#2563eb";
      const pts   = inProgressPts.map(p => ({
        x: (p.x / 100) * dispW,
        y: (p.y / 100) * dispH,
      }));
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      pts.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? color : "#fff";
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth   = 1.5;
        ctx.stroke();
      });
    }
  }, [marks, items, imgLoaded, zoom, inProgressPts, activeTool, activeItemId]);

  useEffect(() => { drawCanvas(); }, [drawCanvas]);

  /* ── Canvas click ── */
  function getCanvasPercent(e: React.MouseEvent<HTMLCanvasElement>) {
    const r   = canvasRef.current!.getBoundingClientRect();
    const x   = ((e.clientX - r.left) / r.width)  * 100;
    const y   = ((e.clientY - r.top)  / r.height) * 100;
    return { x, y };
  }

  async function onCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (activeTool === "select") return;
    const { x, y } = getCanvasPercent(e);

    if (activeTool === "count") {
      if (!activeItemId) { alert("Select an item first."); return; }
      const res  = await fetch(`/api/takeoff/${id}/marks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: activeItemId, mark_type: "count", x_pct: x, y_pct: y }),
      });
      const json = await res.json();
      if (json.data) {
        setMarks(prev => [...prev, json.data]);
        // Update count on item
        const item = items.find(i => i.id === activeItemId);
        if (item) {
          const newCount = item.count + 1;
          await fetch(`/api/takeoff/${id}/items`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: activeItemId, count: newCount }),
          });
          setItems(prev => prev.map(i => i.id === activeItemId ? { ...i, count: newCount } : i));
        }
      }
    } else if (activeTool === "area" || activeTool === "length") {
      // Double-click to finish
      if (e.detail === 2 && inProgressPts.length >= 2) {
        await finishPolygon();
      } else {
        setInProgressPts(prev => [...prev, { x, y }]);
      }
    }
  }

  async function finishPolygon() {
    if (!activeItemId || inProgressPts.length < 2) return;
    const pts = inProgressPts;

    // Calculate value
    let value = 0;
    const scaleFtPerInch = takeoff?.scale_ft_per_inch ?? 40;
    // Simplified: pixel distances in % units ≈ rough measurement
    // For a proper calculation, we'd need the image scale
    if (activeTool === "length") {
      // Sum of segment lengths in percentage units × scale
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i].x - pts[i - 1].x;
        const dy = pts[i].y - pts[i - 1].y;
        value += Math.sqrt(dx * dx + dy * dy);
      }
      value = Math.round(value * scaleFtPerInch * 0.3); // rough conversion
    } else {
      // Shoelace formula for area
      let area = 0;
      for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        area += pts[i].x * pts[j].y;
        area -= pts[j].x * pts[i].y;
      }
      value = Math.round(Math.abs(area / 2) * scaleFtPerInch * 0.4); // rough conversion
    }

    const res  = await fetch(`/api/takeoff/${id}/marks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_id: activeItemId,
        mark_type: activeTool,
        points: pts,
        value,
      }),
    });
    const json = await res.json();
    if (json.data) setMarks(prev => [...prev, json.data]);
    setInProgressPts([]);
  }

  async function deleteMark(markId: string, itemId: string | null) {
    await fetch(`/api/takeoff/${id}/marks?id=${markId}`, { method: "DELETE" });
    setMarks(prev => prev.filter(m => m.id !== markId));
    // Decrement count
    if (itemId) {
      const item = items.find(i => i.id === itemId);
      if (item && item.count > 0) {
        const newCount = item.count - 1;
        await fetch(`/api/takeoff/${id}/items`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: itemId, count: newCount }),
        });
        setItems(prev => prev.map(i => i.id === itemId ? { ...i, count: newCount } : i));
      }
    }
  }

  /* ── Plan upload ── */
  async function handlePlanUpload(file: File) {
    setUploadState("uploading");
    try {
      // Get presigned URL
      const presignRes  = await fetch("/api/takeoff/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name }),
      });
      const { signedUrl, path, ext } = await presignRes.json();
      if (!signedUrl) throw new Error("Failed to get upload URL");

      // Upload file
      await fetch(signedUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });

      // Save path to takeoff
      await fetch(`/api/takeoff/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_storage_path: path, plan_file_name: file.name }),
      });
      setTakeoff(prev => prev ? { ...prev, plan_storage_path: path, plan_file_name: file.name } : prev);

      // If PDF, render to image client-side using pdfjs-dist
      if (ext === "pdf") {
        setUploadState("rendering");
        try {
          const pdfjsLib = await import("pdfjs-dist");
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
          const arrayBuffer = await file.arrayBuffer();
          const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          const page = await pdfDoc.getPage(1);
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvas, viewport }).promise;
          const blob = await new Promise<Blob>((res) =>
            canvas.toBlob((b) => res(b!), "image/jpeg", 0.85)
          );
          const jpegName = file.name.replace(/\.pdf$/i, "-rendered.jpg");
          const jpegPresign = await fetch("/api/takeoff/presign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: jpegName }),
          }).then(r => r.json());
          if (!jpegPresign.signedUrl) throw new Error("Failed to get JPEG upload URL");
          await fetch(jpegPresign.signedUrl, { method: "PUT", body: blob, headers: { "Content-Type": "image/jpeg" } });
          await fetch(`/api/takeoff/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ plan_image_path: jpegPresign.path }),
          });
          setImageUrl(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${jpegPresign.path}`);
          setTakeoff(prev => prev ? { ...prev, plan_image_path: jpegPresign.path } : prev);
        } catch (renderErr: any) {
          alert("PDF render failed: " + renderErr.message);
        }
      } else {
        setImageUrl(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`);
        await fetch(`/api/takeoff/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan_image_path: path }),
        });
      }
    } catch (err: any) {
      alert("Upload failed: " + err.message);
    } finally {
      setUploadState("idle");
    }
  }

  /* ── AI Parse ── */
  async function runAiParse() {
    setAiParsing(true);
    setAiStatus("Reading plan with AI…");
    try {
      const res  = await fetch(`/api/takeoff/${id}/parse`, { method: "POST" });
      const json = await res.json();
      if (json.error) { setAiStatus(""); alert("AI Parse: " + json.error); return; }
      setAiStatus(`✓ Found ${json.count} items`);
      // Reload items
      const ir = await fetch(`/api/takeoff/${id}/items`).then(r => r.json());
      setItems(ir.data ?? []);
      if (ir.data?.length > 0 && !activeItemId) setActiveItemId(ir.data[0].id);
      setTimeout(() => setAiStatus(""), 4000);
    } catch (e: any) {
      setAiStatus("");
      alert("AI Parse failed: " + e.message);
    } finally {
      setAiParsing(false);
    }
  }

  /* ── Add item manually ── */
  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    const res  = await fetch(`/api/takeoff/${id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newItemForm),
    });
    const json = await res.json();
    if (json.data) {
      setItems(prev => [...prev, json.data]);
      setActiveItemId(json.data.id);
      setShowAddItem(false);
      setNewItemForm({ common_name: "", category: "tree", color: "#15803d" });
    }
  }

  /* ── Totals ── */
  const totalItems = items.reduce((s, i) => s + (i.count || 0), 0);
  const totalValue = items.reduce((s, i) => {
    if (i.unit === "EA") return s + (i.count || 0) * (i.unit_price || 0);
    const m = marks.filter(mk => mk.item_id === i.id && mk.mark_type !== "count");
    const v = m.reduce((sv, mk) => sv + (mk.value || 0), 0);
    return s + v * (i.unit_price || 0);
  }, 0);

  const byCategory = items.reduce((acc, i) => {
    (acc[i.category] = acc[i.category] ?? []).push(i);
    return acc;
  }, {} as Record<string, Item[]>);

  if (loading) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f4f8" }}>
      <div style={{ width: 32, height: 32, border: "3px solid #dbeafe", borderTopColor: "#2563eb", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "#0f1923", overflow: "hidden" }}>

      {/* ── Top bar ── */}
      <div style={{
        background: "linear-gradient(135deg, #0d1f3c 0%, #1a3a6b 100%)",
        padding: "8px 16px", display: "flex", alignItems: "center", gap: 12,
        flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}>
        <button
          onClick={() => router.push("/atlastakeoff")}
          style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 7, padding: "6px 12px", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 12 }}
        >
          ← Back
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ background: "#fff", borderRadius: 8, padding: "3px 8px", display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
            <Image src="/atlas-takeoff-logo.png" alt="Atlas Takeoff" height={36} width={54} style={{ objectFit: "contain", display: "block" }} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
              <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, fontWeight: 400 }}>·</span>
              <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 600 }}>{takeoff?.name ?? ""}</span>
            </div>
            {takeoff?.client_name && <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10 }}>{takeoff.client_name}{takeoff.address ? ` · ${takeoff.address}` : ""}</div>}
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* Tool strip */}
        <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.07)", borderRadius: 10, padding: 4 }}>
          {([
            { tool: "select" as Tool, icon: "↖", label: "Select" },
            { tool: "count"  as Tool, icon: "●", label: "Count" },
            { tool: "area"   as Tool, icon: "⬡", label: "Area" },
            { tool: "length" as Tool, icon: "⟋", label: "Length" },
          ] as const).map(({ tool, icon, label }) => (
            <button
              key={tool}
              onClick={() => { setActiveTool(tool); setInProgressPts([]); }}
              title={label}
              style={{
                background: activeTool === tool ? "rgba(255,255,255,0.18)" : "transparent",
                border: activeTool === tool ? "1px solid rgba(255,255,255,0.25)" : "1px solid transparent",
                borderRadius: 7, padding: "5px 12px", cursor: "pointer",
                color: activeTool === tool ? "#fff" : "rgba(255,255,255,0.5)",
                fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 5,
                transition: "all 0.15s",
              }}
            >
              <span style={{ fontSize: 15 }}>{icon}</span>
              <span style={{ fontSize: 11 }}>{label}</span>
            </button>
          ))}
          {(activeTool === "area" || activeTool === "length") && inProgressPts.length >= 2 && (
            <button
              onClick={finishPolygon}
              style={{ background: "#16a34a", border: "none", borderRadius: 7, padding: "5px 12px", color: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 700 }}
            >
              ✓ Finish
            </button>
          )}
          {inProgressPts.length > 0 && (
            <button
              onClick={() => setInProgressPts([])}
              style={{ background: "rgba(239,68,68,0.2)", border: "none", borderRadius: 7, padding: "5px 10px", color: "#f87171", cursor: "pointer", fontSize: 11 }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Zoom */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.07)", borderRadius: 8, padding: "4px 8px" }}>
          <button onClick={() => setZoom(z => Math.max(0.1, +(z - 0.1).toFixed(2)))} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>−</button>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", minWidth: 36, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(4, +(z + 0.1).toFixed(2)))} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>+</button>
          {imgLoaded && (
            <button
              onClick={() => {
                if (viewerRef.current && imgDims.w > 0) {
                  const vw = viewerRef.current.clientWidth - 48;
                  const vh = viewerRef.current.clientHeight - 48;
                  setZoom(Math.min(1, vw / imgDims.w, vh / imgDims.h));
                }
              }}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 10, fontWeight: 600, marginLeft: 2 }}
              title="Fit to screen"
            >FIT</button>
          )}
        </div>

        {/* Plan upload */}
        <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: "none" }}
          onChange={e => e.target.files?.[0] && handlePlanUpload(e.target.files[0])} />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadState !== "idle"}
          style={{
            background: takeoff?.plan_file_name ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,#2563eb,#1d4ed8)",
            border: "none", borderRadius: 8, padding: "7px 14px",
            color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600,
            opacity: uploadState !== "idle" ? 0.7 : 1,
          }}
        >
          {uploadState === "uploading" ? "⬆ Uploading…"
           : uploadState === "rendering" ? "⚙ Rendering…"
           : takeoff?.plan_file_name ? `📄 ${takeoff.plan_file_name.slice(0, 20)}…` : "⬆ Upload Plan"}
        </button>

        {/* AI Parse */}
        {takeoff?.plan_image_path && (
          <button
            onClick={runAiParse}
            disabled={aiParsing}
            style={{
              background: aiParsing ? "rgba(139,92,246,0.3)" : "linear-gradient(135deg,#7c3aed,#6d28d9)",
              border: "none", borderRadius: 8, padding: "7px 14px",
              color: "#fff", cursor: aiParsing ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {aiParsing ? (
              <><span style={{ width: 12, height: 12, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} /> Parsing…</>
            ) : "✦ AI Parse Schedule"}
          </button>
        )}
        {aiStatus && <span style={{ fontSize: 11, color: "#4ade80", fontWeight: 600 }}>{aiStatus}</span>}
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── Left sidebar ── */}
        <div style={{
          width: 260, background: "#1a2535", borderRight: "1px solid rgba(255,255,255,0.07)",
          display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden",
        }}>
          {/* Sidebar tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
            {(["items", "table"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setSidebarTab(tab)}
                style={{
                  flex: 1, padding: "10px 0", background: "none", border: "none",
                  borderBottom: sidebarTab === tab ? "2px solid #2563eb" : "2px solid transparent",
                  color: sidebarTab === tab ? "#fff" : "rgba(255,255,255,0.4)",
                  fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em",
                }}
              >
                {tab === "items" ? "Items" : "Summary"}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {sidebarTab === "items" ? (
              <div style={{ padding: "10px 10px" }}>
                {/* Add item + AI hint */}
                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                  <button
                    onClick={() => setShowAddItem(true)}
                    style={{
                      flex: 1, background: "rgba(37,99,235,0.2)", border: "1px dashed rgba(37,99,235,0.4)",
                      borderRadius: 8, padding: "8px 0", color: "#60a5fa", fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    + Add Item
                  </button>
                </div>

                {/* Items grouped by category */}
                {Object.entries(byCategory).map(([cat, catItems]) => (
                  <div key={cat} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6, paddingLeft: 2 }}>
                      {CAT_ICON[cat] ?? "📦"} {cat}s
                    </div>
                    {catItems.map(item => (
                      <button
                        key={item.id}
                        onClick={() => { setActiveItemId(item.id); setActiveTool("count"); }}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", gap: 8,
                          padding: "8px 10px", borderRadius: 8, border: "none",
                          background: activeItemId === item.id ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.03)",
                          cursor: "pointer", marginBottom: 3,
                          outline: activeItemId === item.id ? `2px solid ${item.color}` : "none",
                          transition: "all 0.1s",
                          textAlign: "left",
                        }}
                      >
                        <span style={{
                          width: 10, height: 10, borderRadius: "50%", background: item.color,
                          display: "inline-block", flexShrink: 0,
                          boxShadow: activeItemId === item.id ? `0 0 8px ${item.color}` : "none",
                        }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {item.common_name}
                          </div>
                          {(item.size || item.container) && (
                            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
                              {[item.size, item.container].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </div>
                        <span style={{
                          background: item.count > 0 ? item.color : "rgba(255,255,255,0.1)",
                          color: item.count > 0 ? "#fff" : "rgba(255,255,255,0.3)",
                          borderRadius: 99, fontSize: 11, fontWeight: 800, minWidth: 22,
                          textAlign: "center", padding: "1px 7px",
                        }}>
                          {item.count}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}

                {items.length === 0 && (
                  <div style={{ textAlign: "center", paddingTop: 30, color: "rgba(255,255,255,0.25)", fontSize: 12 }}>
                    {takeoff?.plan_image_path
                      ? <>Upload plan and click<br /><strong style={{ color: "#a78bfa" }}>✦ AI Parse Schedule</strong><br />to auto-extract plants</>
                      : <>Upload a plan to get started</>}
                  </div>
                )}
              </div>
            ) : (
              /* Summary table */
              <div style={{ padding: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
                  Takeoff Summary
                </div>
                {items.map(item => {
                  const itemMarks = marks.filter(m => m.item_id === item.id && m.mark_type !== "count");
                  const areaTotal = itemMarks.filter(m => m.mark_type === "area").reduce((s, m) => s + (m.value || 0), 0);
                  const lengthTotal = itemMarks.filter(m => m.mark_type === "length").reduce((s, m) => s + (m.value || 0), 0);
                  const qty = item.unit === "EA" ? item.count : item.unit === "SF" ? areaTotal : lengthTotal;
                  const sub = qty * (item.unit_price || 0);
                  return (
                    <div key={item.id} style={{
                      background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 10px",
                      marginBottom: 6, borderLeft: `3px solid ${item.color}`,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>{item.common_name}</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#60a5fa" }}>
                          {item.unit === "EA" ? `${item.count} EA`
                            : item.unit === "SF" ? `${Math.round(areaTotal).toLocaleString()} SF`
                            : `${Math.round(lengthTotal).toLocaleString()} LF`}
                        </div>
                      </div>
                      {item.size && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>{item.size}{item.container ? ` · ${item.container}` : ""}{item.designation ? ` · ${item.designation}` : ""}</div>}
                      {item.unit_price != null && item.unit_price > 0 && (
                        <div style={{ fontSize: 11, color: "#4ade80", marginTop: 3, fontWeight: 600 }}>
                          ${item.unit_price.toFixed(2)}/ea → ${sub.toFixed(2)}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Totals */}
                {items.length > 0 && (
                  <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Total items counted</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{totalItems.toLocaleString()}</span>
                    </div>
                    {totalValue > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Estimated value</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: "#4ade80" }}>
                          ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Export button */}
                {items.length > 0 && (
                  <button
                    onClick={() => exportCsv()}
                    style={{
                      width: "100%", marginTop: 14,
                      background: "linear-gradient(135deg,#15803d,#166534)",
                      border: "none", borderRadius: 8, padding: "10px",
                      color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    ⬇ Export CSV
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Plan viewer ── */}
        <div
          ref={viewerRef}
          style={{ flex: 1, overflow: "auto", background: "#0d1520" }}
        >
        <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", minWidth: "100%", minHeight: "100%", padding: 24, boxSizing: "border-box" }}>
          {!imageUrl ? (
            <div
              style={{
                margin: "auto", width: 400, border: "2px dashed rgba(255,255,255,0.15)", borderRadius: 16,
                padding: "60px 40px", textAlign: "center", color: "rgba(255,255,255,0.3)",
              }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) handlePlanUpload(f);
              }}
            >
              <div style={{ fontSize: 56, marginBottom: 16 }}>📐</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>Drop your plan here</div>
              <div style={{ fontSize: 13, marginBottom: 20 }}>PDF, PNG, or JPEG landscape plan</div>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              >
                Browse Files
              </button>
            </div>
          ) : (
            <div style={{ position: "relative", display: "inline-block", flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={imageUrl}
                alt="Landscape plan"
                style={{ display: "block", width: imgLoaded ? imgDims.w * zoom : undefined, maxWidth: "none", userSelect: "none" }}
                onLoad={() => {
                  setImgLoaded(true);
                  const nat = { w: imgRef.current!.naturalWidth, h: imgRef.current!.naturalHeight };
                  setImgDims(nat);
                  // Fit image to viewer on load
                  if (viewerRef.current && nat.w > 0 && nat.h > 0) {
                    const vw = viewerRef.current.clientWidth - 48;
                    const vh = viewerRef.current.clientHeight - 48;
                    setZoom(Math.min(1, vw / nat.w, vh / nat.h));
                  }
                }}
                draggable={false}
              />
              <canvas
                ref={canvasRef}
                style={{
                  position: "absolute", inset: 0, width: "100%", height: "100%",
                  cursor: activeTool === "select" ? "default"
                        : activeTool === "count"  ? "crosshair"
                        : "crosshair",
                }}
                onClick={onCanvasClick}
                onContextMenu={e => {
                  e.preventDefault();
                  if (inProgressPts.length >= 2) finishPolygon();
                }}
              />
              {/* Tool hint overlay */}
              {activeTool !== "select" && (
                <div style={{
                  position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)",
                  background: "rgba(0,0,0,0.7)", color: "#fff", borderRadius: 8, padding: "6px 14px",
                  fontSize: 11, fontWeight: 600, pointerEvents: "none", whiteSpace: "nowrap",
                }}>
                  {activeTool === "count" && `${activeItemId ? `Counting: ${items.find(i => i.id === activeItemId)?.common_name}` : "Select an item first"}`}
                  {activeTool === "area" && `${inProgressPts.length === 0 ? "Click to start area polygon" : `${inProgressPts.length} pts — double-click or right-click to close`}`}
                  {activeTool === "length" && `${inProgressPts.length === 0 ? "Click to start measuring" : `${inProgressPts.length} pts — double-click or right-click to finish`}`}
                </div>
              )}
            </div>
          )}
        </div>
        </div>

        {/* ── Right: mark list ── */}
        <div style={{
          width: 220, background: "#1a2535", borderLeft: "1px solid rgba(255,255,255,0.07)",
          display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden",
        }}>
          <div style={{ padding: "12px 12px 8px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Marks ({marks.length})
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
            {marks.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px 8px", fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
                No marks yet.<br />Use tools to count or measure.
              </div>
            ) : (
              marks.slice().reverse().map(m => {
                const item = items.find(i => i.id === m.item_id);
                return (
                  <div key={m.id} style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "6px 8px", borderRadius: 7, marginBottom: 3,
                    background: "rgba(255,255,255,0.04)",
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: item?.color ?? "#6b7280", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item?.common_name ?? "Unknown"}
                      </div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>
                        {m.mark_type === "count" ? "Count" : m.mark_type === "area" ? `Area · ${Math.round(m.value ?? 0)} SF` : `Length · ${Math.round(m.value ?? 0)} LF`}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteMark(m.id, m.item_id)}
                      style={{ background: "none", border: "none", color: "rgba(255,255,255,0.2)", cursor: "pointer", fontSize: 13, padding: "0 2px", flexShrink: 0 }}
                      title="Delete mark"
                    >
                      ✕
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Add item modal ── */}
      {showAddItem && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }} onClick={() => setShowAddItem(false)}>
          <div style={{ background: "#1e2d40", borderRadius: 14, padding: 24, width: 360, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ color: "#fff", marginBottom: 18, fontWeight: 700 }}>Add Item</h3>
            <form onSubmit={addItem} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 5, textTransform: "uppercase" }}>Common Name *</label>
                <input required value={newItemForm.common_name}
                  onChange={e => setNewItemForm(p => ({ ...p, common_name: e.target.value }))}
                  style={{ width: "100%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, padding: "8px 10px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                  placeholder="e.g. Legacy Sugar Maple" />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 5, textTransform: "uppercase" }}>Category</label>
                <select value={newItemForm.category}
                  onChange={e => setNewItemForm(p => ({ ...p, category: e.target.value, color: CAT_COLORS[e.target.value] ?? "#6b7280" }))}
                  style={{ width: "100%", background: "#0f1923", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, padding: "8px 10px", color: "#fff", fontSize: 13, outline: "none" }}>
                  {Object.keys(CAT_COLORS).map(c => <option key={c} value={c}>{CAT_ICON[c]} {c}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button type="button" onClick={() => setShowAddItem(false)}
                  style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "9px", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 13 }}>
                  Cancel
                </button>
                <button type="submit"
                  style={{ flex: 2, background: "#2563eb", border: "none", borderRadius: 8, padding: "9px", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                  Add Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  function exportCsv() {
    const rows = [
      ["Item", "Category", "Size", "Container", "Spacing", "Designation", "Qty", "Unit", "Unit Price", "Subtotal"],
      ...items.map(item => {
        const itemMarks = marks.filter(m => m.item_id === item.id && m.mark_type !== "count");
        const areaTotal   = itemMarks.filter(m => m.mark_type === "area").reduce((s, m) => s + (m.value || 0), 0);
        const lengthTotal = itemMarks.filter(m => m.mark_type === "length").reduce((s, m) => s + (m.value || 0), 0);
        const qty = item.unit === "EA" ? item.count : item.unit === "SF" ? Math.round(areaTotal) : Math.round(lengthTotal);
        const sub = qty * (item.unit_price || 0);
        return [item.common_name, item.category, item.size ?? "", item.container ?? "", item.spacing ?? "",
                item.designation ?? "", qty, item.unit, item.unit_price ?? "", sub.toFixed(2)];
      }),
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${takeoff?.name ?? "takeoff"}-takeoff.csv`;
    a.click();
  }
}
