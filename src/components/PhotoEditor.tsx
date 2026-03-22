"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────
type Tool = "pen" | "arrow" | "rect" | "circle" | "text" | "crop";

type ArrowAnn  = { type: "arrow";  x1: number; y1: number; x2: number; y2: number; color: string; sw: number };
type RectAnn   = { type: "rect";   x: number;  y: number;  w: number;  h: number;  color: string; sw: number };
type CircleAnn = { type: "circle"; x: number;  y: number;  w: number;  h: number;  color: string; sw: number };
type PenAnn    = { type: "pen";    pts: [number, number][]; color: string; sw: number };
type TextAnn   = { type: "text";   x: number;  y: number;  text: string; color: string; fs: number };
type Annotation = ArrowAnn | RectAnn | CircleAnn | PenAnn | TextAnn;

type HistoryEntry = { annotations: Annotation[]; brightness: number; contrast: number; saturation: number };

export type PhotoEditorProps = {
  photoUrl: string;
  fileName: string;
  bidId: string;
  onClose: () => void;
  onSaved: () => void;
};

// ── Drawing helpers ────────────────────────────────────────────────────────────
function drawArrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, sw: number) {
  const headLen = Math.max(12, sw * 4);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = sw;
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath(); ctx.fill();
}

function drawAnnotation(ctx: CanvasRenderingContext2D, ann: Annotation) {
  ctx.save();
  if (ann.type === "pen") {
    if (ann.pts.length < 2) { ctx.restore(); return; }
    ctx.strokeStyle = ann.color; ctx.lineWidth = ann.sw; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(ann.pts[0][0], ann.pts[0][1]);
    for (let i = 1; i < ann.pts.length; i++) ctx.lineTo(ann.pts[i][0], ann.pts[i][1]);
    ctx.stroke();
  } else if (ann.type === "arrow") {
    drawArrow(ctx, ann.x1, ann.y1, ann.x2, ann.y2, ann.color, ann.sw);
  } else if (ann.type === "rect") {
    ctx.strokeStyle = ann.color; ctx.lineWidth = ann.sw;
    ctx.strokeRect(ann.x, ann.y, ann.w, ann.h);
  } else if (ann.type === "circle") {
    ctx.strokeStyle = ann.color; ctx.lineWidth = ann.sw;
    ctx.beginPath();
    ctx.ellipse(ann.x + ann.w / 2, ann.y + ann.h / 2, Math.abs(ann.w / 2), Math.abs(ann.h / 2), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (ann.type === "text") {
    ctx.font = `bold ${ann.fs}px 'Inter', Arial, sans-serif`;
    ctx.fillStyle = "#000"; ctx.globalAlpha = 0.35;
    ctx.fillText(ann.text, ann.x + 1, ann.y + 1);
    ctx.globalAlpha = 1; ctx.fillStyle = ann.color;
    ctx.fillText(ann.text, ann.x, ann.y);
  }
  ctx.restore();
}

function canvasPt(e: React.MouseEvent | MouseEvent, canvas: HTMLCanvasElement) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((e as MouseEvent).clientX - r.left) * (canvas.width / r.width),
    y: ((e as MouseEvent).clientY - r.top) * (canvas.height / r.height),
  };
}

// ── Colors & tools ─────────────────────────────────────────────────────────────
const COLORS = ["#ef4444","#f97316","#eab308","#22c55e","#3b82f6","#8b5cf6","#ffffff","#000000"];
const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: "pen",    label: "Pen",     icon: "✏️" },
  { id: "arrow",  label: "Arrow",   icon: "↗" },
  { id: "rect",   label: "Rect",    icon: "□" },
  { id: "circle", label: "Circle",  icon: "○" },
  { id: "text",   label: "Text",    icon: "T" },
  { id: "crop",   label: "Crop",    icon: "✂" },
];

// ── Component ──────────────────────────────────────────────────────────────────
export default function PhotoEditor({ photoUrl, fileName, bidId, onClose, onSaved }: PhotoEditorProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const imgRef     = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [tool, setTool]     = useState<Tool>("arrow");
  const [color, setColor]   = useState("#ef4444");
  const [sw, setSw]         = useState(3);
  const [fs, setFs]         = useState(28);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast]     = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [saving, setSaving]   = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loaded, setLoaded]   = useState(false);

  // Drawing state (refs to avoid stale closures)
  const drawing    = useRef(false);
  const startPt    = useRef({ x: 0, y: 0 });
  const penPts     = useRef<[number, number][]>([]);
  const inProgress = useRef<Annotation | null>(null);
  const cropRect   = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  // Text input
  const [textInput, setTextInput] = useState<{ x: number; y: number; canvasX: number; canvasY: number } | null>(null);
  const [textValue, setTextValue] = useState("");
  const textInputRef = useRef<HTMLInputElement>(null);

  // ── Load image via proxy ───────────────────────────────────────────────────
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setLoaded(true);
    };
    img.onerror = () => setSaveError("Failed to load image");
    img.src = `/api/atlasbid/bid-photos/proxy?url=${encodeURIComponent(photoUrl)}`;
  }, [photoUrl]);

  // ── Redraw canvas ──────────────────────────────────────────────────────────
  const redraw = useCallback((anns: Annotation[], inProg: Annotation | null) => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d")!;

    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.filter = "none";

    for (const ann of anns) drawAnnotation(ctx, ann);
    if (inProg) drawAnnotation(ctx, inProg);

    // Crop overlay
    if (tool === "crop" && cropRect.current) {
      const cr = cropRect.current;
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.clearRect(cr.x, cr.y, cr.w, cr.h);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.setLineDash([6, 3]);
      ctx.strokeRect(cr.x, cr.y, cr.w, cr.h);
      ctx.restore();
    }
  }, [brightness, contrast, saturation, tool]);

  useEffect(() => {
    if (loaded) redraw(annotations, inProgress.current);
  }, [loaded, annotations, brightness, contrast, saturation, tool, redraw]);

  // ── Size canvas on load ────────────────────────────────────────────────────
  useEffect(() => {
    if (!loaded || !imgRef.current || !canvasRef.current) return;
    canvasRef.current.width  = imgRef.current.naturalWidth;
    canvasRef.current.height = imgRef.current.naturalHeight;
    redraw(annotations, null);
  }, [loaded]); // eslint-disable-line

  // ── Undo ──────────────────────────────────────────────────────────────────
  function pushHistory() {
    setHistory(h => [...h, { annotations, brightness, contrast, saturation }]);
  }
  function undo() {
    setHistory(h => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setAnnotations(prev.annotations);
      setBrightness(prev.brightness);
      setContrast(prev.contrast);
      setSaturation(prev.saturation);
      return h.slice(0, -1);
    });
  }

  // ── Rotate ────────────────────────────────────────────────────────────────
  function rotate(dir: "cw" | "ccw") {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    pushHistory();

    const off = document.createElement("canvas");
    off.width = img.naturalHeight; off.height = img.naturalWidth;
    const ctx = off.getContext("2d")!;
    ctx.translate(off.width / 2, off.height / 2);
    ctx.rotate(dir === "cw" ? Math.PI / 2 : -Math.PI / 2);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

    const newImg = new Image();
    newImg.onload = () => {
      imgRef.current = newImg;
      canvas.width = newImg.naturalWidth;
      canvas.height = newImg.naturalHeight;
      setAnnotations([]);
      redraw([], null);
    };
    newImg.src = off.toDataURL("image/jpeg", 0.95);
  }

  // ── Crop apply ────────────────────────────────────────────────────────────
  function applyCrop() {
    const cr = cropRect.current;
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!cr || !img || !canvas) return;
    if (cr.w < 10 || cr.h < 10) return;
    pushHistory();

    const off = document.createElement("canvas");
    const sx = cr.w > 0 ? cr.x : cr.x + cr.w;
    const sy = cr.h > 0 ? cr.y : cr.y + cr.h;
    const sw2 = Math.abs(cr.w); const sh = Math.abs(cr.h);
    off.width = sw2; off.height = sh;
    const ctx = off.getContext("2d")!;
    ctx.drawImage(img, sx, sy, sw2, sh, 0, 0, sw2, sh);

    const newImg = new Image();
    newImg.onload = () => {
      imgRef.current = newImg;
      canvas.width = newImg.naturalWidth;
      canvas.height = newImg.naturalHeight;
      cropRect.current = null;
      setAnnotations([]);
      redraw([], null);
    };
    newImg.src = off.toDataURL("image/jpeg", 0.95);
    setTool("arrow");
  }

  // ── Mouse handlers ────────────────────────────────────────────────────────
  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (textInput) return;
    const canvas = canvasRef.current!;
    const pt = canvasPt(e, canvas);

    if (tool === "text") {
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width / canvas.width;
      const scaleY = rect.height / canvas.height;
      setTextInput({
        x: (e as React.MouseEvent).clientX - rect.left,
        y: (e as React.MouseEvent).clientY - rect.top,
        canvasX: pt.x,
        canvasY: pt.y + fs * scaleY,
      });
      setTextValue("");
      setTimeout(() => textInputRef.current?.focus(), 50);
      return;
    }

    drawing.current = true;
    startPt.current = pt;
    if (tool === "pen") penPts.current = [[pt.x, pt.y]];
    if (tool === "crop") cropRect.current = { x: pt.x, y: pt.y, w: 0, h: 0 };
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const canvas = canvasRef.current!;
    const pt = canvasPt(e, canvas);
    const sp = startPt.current;

    if (tool === "pen") {
      penPts.current.push([pt.x, pt.y]);
      inProgress.current = { type: "pen", pts: [...penPts.current], color, sw };
    } else if (tool === "arrow") {
      inProgress.current = { type: "arrow", x1: sp.x, y1: sp.y, x2: pt.x, y2: pt.y, color, sw };
    } else if (tool === "rect") {
      inProgress.current = { type: "rect", x: sp.x, y: sp.y, w: pt.x - sp.x, h: pt.y - sp.y, color, sw };
    } else if (tool === "circle") {
      inProgress.current = { type: "circle", x: sp.x, y: sp.y, w: pt.x - sp.x, h: pt.y - sp.y, color, sw };
    } else if (tool === "crop" && cropRect.current) {
      cropRect.current = { x: sp.x, y: sp.y, w: pt.x - sp.x, h: pt.y - sp.y };
    }
    redraw(annotations, inProgress.current);
  }

  function onMouseUp() {
    if (!drawing.current) return;
    drawing.current = false;

    if (tool === "crop") {
      redraw(annotations, null);
      return;
    }

    if (inProgress.current) {
      pushHistory();
      setAnnotations(prev => {
        const next = [...prev, inProgress.current!];
        inProgress.current = null;
        redraw(next, null);
        return next;
      });
      inProgress.current = null;
    }
  }

  // ── Text commit ───────────────────────────────────────────────────────────
  function commitText() {
    if (!textInput || !textValue.trim()) { setTextInput(null); setTextValue(""); return; }
    pushHistory();
    const ann: TextAnn = { type: "text", x: textInput.canvasX, y: textInput.canvasY, text: textValue.trim(), color, fs };
    setAnnotations(prev => {
      const next = [...prev, ann];
      redraw(next, null);
      return next;
    });
    setTextInput(null);
    setTextValue("");
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    setSaving(true); setSaveError(null);

    try {
      const off = document.createElement("canvas");
      off.width = canvas.width; off.height = canvas.height;
      const ctx = off.getContext("2d")!;
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
      ctx.drawImage(img, 0, 0);
      ctx.filter = "none";
      for (const ann of annotations) drawAnnotation(ctx, ann);

      const blob = await new Promise<Blob>((res, rej) =>
        off.toBlob(b => b ? res(b) : rej(new Error("Canvas export failed")), "image/jpeg", 0.92)
      );

      const editedName = fileName.replace(/(\.[^.]+)?$/, "_edited$1") || "edited.jpg";
      const file = new File([blob], editedName, { type: "image/jpeg" });
      const fd = new FormData();
      fd.append("bid_id", bidId);
      fd.append("files", file);

      const res = await fetch("/api/atlasbid/bid-photos", { method: "POST", body: fd });
      if (!res.ok) { const j = await res.json(); throw new Error(j?.error || "Save failed"); }

      onSaved();
      onClose();
    } catch (e: any) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Cursor ────────────────────────────────────────────────────────────────
  const cursors: Record<Tool, string> = {
    pen: "crosshair", arrow: "crosshair", rect: "crosshair",
    circle: "crosshair", text: "text", crop: "crosshair",
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-gray-950">

      {/* ── Toolbar ── */}
      <div className="shrink-0 bg-gray-900 border-b border-gray-800 px-3 py-2 flex flex-wrap items-center gap-3">

        {/* Close */}
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-lg leading-none mr-1">✕</button>

        {/* Tools */}
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5">
          {TOOLS.map(t => (
            <button
              key={t.id}
              title={t.label}
              onClick={() => setTool(t.id)}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${tool === t.id ? "bg-emerald-600 text-white" : "text-gray-300 hover:text-white hover:bg-gray-700"}`}
            >
              {t.icon}
            </button>
          ))}
        </div>

        {/* Colors */}
        <div className="flex items-center gap-1">
          {COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className="w-5 h-5 rounded-full transition-transform hover:scale-110 shrink-0"
              style={{ background: c, outline: color === c ? "2px solid #4ade80" : "2px solid transparent", outlineOffset: 1 }}
            />
          ))}
          <input type="color" value={color} onChange={e => setColor(e.target.value)}
            className="w-5 h-5 rounded cursor-pointer opacity-80 hover:opacity-100" title="Custom color" />
        </div>

        {/* Stroke / font size */}
        {tool !== "text" ? (
          <label className="flex items-center gap-1.5 text-xs text-gray-400">
            Size
            <input type="range" min={1} max={20} value={sw} onChange={e => setSw(+e.target.value)}
              className="w-20 accent-emerald-500" />
            <span className="text-white w-4 text-center">{sw}</span>
          </label>
        ) : (
          <label className="flex items-center gap-1.5 text-xs text-gray-400">
            Font
            <input type="range" min={12} max={80} value={fs} onChange={e => setFs(+e.target.value)}
              className="w-20 accent-emerald-500" />
            <span className="text-white w-6 text-center">{fs}</span>
          </label>
        )}

        {/* Separtor */}
        <div className="w-px h-6 bg-gray-700" />

        {/* Adjustments */}
        {[
          { label: "☀", value: brightness, set: setBrightness, title: "Brightness" },
          { label: "◑", value: contrast, set: setContrast, title: "Contrast" },
          { label: "🎨", value: saturation, set: setSaturation, title: "Saturation" },
        ].map(({ label, value, set, title }) => (
          <label key={title} className="flex items-center gap-1 text-xs text-gray-400" title={title}>
            <span>{label}</span>
            <input type="range" min={0} max={200} value={value} onChange={e => set(+e.target.value)}
              className="w-16 accent-emerald-500" />
          </label>
        ))}

        {/* Separator */}
        <div className="w-px h-6 bg-gray-700" />

        {/* Rotate */}
        <button onClick={() => rotate("ccw")} title="Rotate CCW" className="text-gray-300 hover:text-white text-sm px-2 py-1 rounded hover:bg-gray-700">⟲</button>
        <button onClick={() => rotate("cw")}  title="Rotate CW"  className="text-gray-300 hover:text-white text-sm px-2 py-1 rounded hover:bg-gray-700">⟳</button>

        {/* Crop apply */}
        {tool === "crop" && (
          <button onClick={applyCrop} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
            Apply Crop
          </button>
        )}

        {/* Undo */}
        <button onClick={undo} disabled={history.length === 0} title="Undo"
          className="text-gray-300 hover:text-white text-sm px-2 py-1 rounded hover:bg-gray-700 disabled:opacity-30">
          ↩ Undo
        </button>

        {/* Reset */}
        <button onClick={() => { undo(); setAnnotations([]); setHistory([]); setBrightness(100); setContrast(100); setSaturation(100); }}
          className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-gray-700 transition-colors">
          Reset
        </button>

        {/* Save */}
        <button onClick={handleSave} disabled={saving}
          className="ml-auto bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-5 py-1.5 rounded-lg transition-colors disabled:opacity-50">
          {saving ? "Saving…" : "Save as New Photo"}
        </button>
      </div>

      {saveError && (
        <div className="shrink-0 bg-red-900/60 text-red-200 text-sm px-4 py-2">{saveError}</div>
      )}

      {/* ── Canvas area ── */}
      <div ref={containerRef} className="flex-1 overflow-auto flex items-center justify-center bg-gray-950 p-4 relative select-none">
        {!loaded && (
          <div className="text-gray-400 text-sm flex items-center gap-2">
            <div className="w-5 h-5 border-2 border-gray-600 border-t-emerald-500 rounded-full animate-spin" />
            Loading image…
          </div>
        )}
        <div className="relative">
          <canvas
            ref={canvasRef}
            style={{
              maxWidth: "100%",
              maxHeight: "calc(100dvh - 120px)",
              display: loaded ? "block" : "none",
              cursor: cursors[tool],
              touchAction: "none",
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          />
          {/* Text input overlay */}
          {textInput && (
            <input
              ref={textInputRef}
              value={textValue}
              onChange={e => setTextValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") commitText(); if (e.key === "Escape") { setTextInput(null); setTextValue(""); } }}
              onBlur={commitText}
              style={{
                position: "absolute",
                left: textInput.x,
                top: textInput.y - 30,
                background: "rgba(0,0,0,0.6)",
                color: color,
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: 4,
                padding: "3px 6px",
                fontSize: 14,
                outline: "none",
                minWidth: 120,
                zIndex: 10,
              }}
              placeholder="Type, then Enter…"
            />
          )}
        </div>
      </div>
    </div>
  );
}
