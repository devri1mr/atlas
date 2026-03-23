"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────
type Tool = "select" | "arrow" | "text";

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

// ── Hit testing ────────────────────────────────────────────────────────────────
function annotationBounds(ann: Annotation) {
  const pad = "sw" in ann ? (ann as any).sw + 12 : 12;
  if (ann.type === "arrow") {
    return { x: Math.min(ann.x1, ann.x2) - pad, y: Math.min(ann.y1, ann.y2) - pad, w: Math.abs(ann.x2 - ann.x1) + pad * 2, h: Math.abs(ann.y2 - ann.y1) + pad * 2 };
  }
  if (ann.type === "rect" || ann.type === "circle") {
    return { x: Math.min(ann.x, ann.x + ann.w) - pad, y: Math.min(ann.y, ann.y + ann.h) - pad, w: Math.abs(ann.w) + pad * 2, h: Math.abs(ann.h) + pad * 2 };
  }
  if (ann.type === "pen") {
    const xs = ann.pts.map(p => p[0]); const ys = ann.pts.map(p => p[1]);
    return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 };
  }
  // text
  const w = ann.text.length * ann.fs * 0.62;
  return { x: ann.x - 4, y: ann.y - ann.fs - 4, w: w + 8, h: ann.fs * 1.4 + 8 };
}

function hitTest(ann: Annotation, px: number, py: number): boolean {
  const b = annotationBounds(ann);
  return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
}

function moveAnnotation(ann: Annotation, dx: number, dy: number): Annotation {
  if (ann.type === "arrow") return { ...ann, x1: ann.x1 + dx, y1: ann.y1 + dy, x2: ann.x2 + dx, y2: ann.y2 + dy };
  if (ann.type === "rect" || ann.type === "circle") return { ...ann, x: ann.x + dx, y: ann.y + dy };
  if (ann.type === "pen") return { ...ann, pts: ann.pts.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
  return { ...ann, x: (ann as TextAnn).x + dx, y: (ann as TextAnn).y + dy };
}

// ── Drawing helpers ────────────────────────────────────────────────────────────
function drawArrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, sw: number) {
  const headLen = Math.max(sw * 5, 22);
  const headAngle = Math.PI / 5.5;
  const angle = Math.atan2(y2 - y1, x2 - x1);

  // White outline pass
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = sw + 3;
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - headAngle), y2 - headLen * Math.sin(angle - headAngle));
  ctx.lineTo(x2 - headLen * Math.cos(angle + headAngle), y2 - headLen * Math.sin(angle + headAngle));
  ctx.closePath(); ctx.fill();
  ctx.restore();

  // Color pass
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = sw;
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - headAngle), y2 - headLen * Math.sin(angle - headAngle));
  ctx.lineTo(x2 - headLen * Math.cos(angle + headAngle), y2 - headLen * Math.sin(angle + headAngle));
  ctx.closePath(); ctx.fill();
  ctx.restore();
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
    ctx.fillText(ann.text, ann.x + 2, ann.y + 2);
    ctx.globalAlpha = 1; ctx.fillStyle = ann.color;
    ctx.fillText(ann.text, ann.x, ann.y);
  }
  ctx.restore();
}

function drawSelectionBox(ctx: CanvasRenderingContext2D, ann: Annotation) {
  const b = annotationBounds(ann);
  ctx.save();
  ctx.strokeStyle = "#4ade80";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 3]);
  ctx.strokeRect(b.x, b.y, b.w, b.h);
  ctx.restore();
}

function canvasPt(e: React.MouseEvent | MouseEvent | React.Touch | Touch, canvas: HTMLCanvasElement) {
  const r = canvas.getBoundingClientRect();
  const clientX = "clientX" in e ? e.clientX : 0;
  const clientY = "clientY" in e ? e.clientY : 0;
  return {
    x: (clientX - r.left) * (canvas.width / r.width),
    y: (clientY - r.top) * (canvas.height / r.height),
  };
}

// ── Colors & tools ─────────────────────────────────────────────────────────────
const COLORS = ["#ef4444","#f97316","#eab308","#22c55e","#3b82f6","#8b5cf6","#ffffff","#000000"];

const TOOLS: { id: Tool; label: string; icon: React.ReactNode }[] = [
  { id: "select", label: "Select", icon: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4 0L4 20L9 15L13 24L15.5 23L11.5 14L18 14Z"/></svg>
  )},
  { id: "arrow",  label: "Arrow",  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="19" x2="19" y2="5"/><polyline points="9 5 19 5 19 15"/></svg> },
  { id: "text",   label: "Text",   icon: <span className="font-bold text-base leading-none">T</span> },
];

// ── Component ──────────────────────────────────────────────────────────────────
export default function PhotoEditor({ photoUrl, fileName, bidId, onClose, onSaved }: PhotoEditorProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const imgRef     = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const [tool, setTool]     = useState<Tool>("arrow");
  const [color, setColor]   = useState("#ef4444");
  const [sw, setSw]         = useState(4);
  const [fs, setFs]         = useState(28);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast]     = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [saving, setSaving]   = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loaded, setLoaded]   = useState(false);

  // Drawing state (refs to avoid stale closures)
  const drawing    = useRef(false);
  const startPt    = useRef({ x: 0, y: 0 });
  const inProgress = useRef<Annotation | null>(null);

  // Drag/select state
  const draggingIdx   = useRef<number | null>(null);
  const dragOriginPt  = useRef<{ mx: number; my: number } | null>(null);
  const dragOriginAnn = useRef<Annotation | null>(null);

  // Text input
  const [textInput, setTextInput] = useState<{ x: number; y: number; canvasX: number; canvasY: number } | null>(null);
  const [textValue, setTextValue] = useState("");
  const [editingTextIdx, setEditingTextIdx] = useState<number | null>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  // ── Load image via proxy ───────────────────────────────────────────────────
  useEffect(() => {
    const img = new Image();
    img.onload = () => { imgRef.current = img; setLoaded(true); };
    img.onerror = () => setSaveError("Failed to load image");
    img.src = `/api/atlasbid/bid-photos/proxy?url=${encodeURIComponent(photoUrl)}`;
  }, [photoUrl]);

  // ── Redraw canvas ──────────────────────────────────────────────────────────
  const redraw = useCallback((anns: Annotation[], inProg: Annotation | null, selIdx: number | null = null) => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d")!;

    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.filter = "none";

    for (const ann of anns) { try { drawAnnotation(ctx, ann); } catch {} }
    if (inProg) { try { drawAnnotation(ctx, inProg); } catch {} }

    // Selection box
    if (selIdx !== null && anns[selIdx]) {
      try { drawSelectionBox(ctx, anns[selIdx]); } catch {}
    }

  }, [brightness, contrast, saturation]);

  useEffect(() => {
    if (loaded) redraw(annotations, inProgress.current, selectedIdx);
  }, [loaded, annotations, brightness, contrast, saturation, tool, selectedIdx, redraw]);

  // ── Size canvas on load ────────────────────────────────────────────────────
  useEffect(() => {
    if (!loaded || !imgRef.current || !canvasRef.current) return;
    canvasRef.current.width  = imgRef.current.naturalWidth;
    canvasRef.current.height = imgRef.current.naturalHeight;
    redraw(annotations, null);
  }, [loaded]); // eslint-disable-line

  // ── Keyboard: delete selected, undo ───────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIdx !== null) {
        e.preventDefault();
        pushHistory();
        setAnnotations(prev => {
          const next = prev.filter((_, i) => i !== selectedIdx);
          redraw(next, null, null);
          return next;
        });
        setSelectedIdx(null);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line

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
      setSelectedIdx(null);
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
      setSelectedIdx(null);
      redraw([], null);
    };
    newImg.src = off.toDataURL("image/jpeg", 0.95);
  }

// ── Mouse handlers ────────────────────────────────────────────────────────
  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (textInput) return;
    const canvas = canvasRef.current!;
    const pt = canvasPt(e, canvas);

    // SELECT tool
    if (tool === "select") {
      let found = -1;
      for (let i = annotations.length - 1; i >= 0; i--) {
        if (hitTest(annotations[i], pt.x, pt.y)) { found = i; break; }
      }
      if (found >= 0) {
        setSelectedIdx(found);
        draggingIdx.current = found;
        dragOriginPt.current = { mx: pt.x, my: pt.y };
        dragOriginAnn.current = annotations[found];
        pushHistory();
      } else {
        setSelectedIdx(null);
        draggingIdx.current = null;
        dragOriginPt.current = null;
        dragOriginAnn.current = null;
      }
      return;
    }

    // TEXT tool
    if (tool === "text") {
      const rect = canvas.getBoundingClientRect();
      const scaleY = rect.height / canvas.height;
      setEditingTextIdx(null);
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
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const pt = canvasPt(e, canvas);

    // Drag with select tool
    if (tool === "select" && draggingIdx.current !== null && dragOriginPt.current && dragOriginAnn.current) {
      const dx = pt.x - dragOriginPt.current.mx;
      const dy = pt.y - dragOriginPt.current.my;
      const moved = moveAnnotation(dragOriginAnn.current, dx, dy);
      setAnnotations(prev => {
        const next = prev.map((a, i) => i === draggingIdx.current ? moved : a);
        redraw(next, null, draggingIdx.current);
        return next;
      });
      return;
    }

    if (!drawing.current) return;
    const sp = startPt.current;

    if (tool === "arrow") {
      inProgress.current = { type: "arrow", x1: sp.x, y1: sp.y, x2: pt.x, y2: pt.y, color, sw };
    }
    redraw(annotations, inProgress.current, selectedIdx);
  }

  function onMouseUp() {
    // End drag
    if (tool === "select") {
      draggingIdx.current = null;
      dragOriginPt.current = null;
      dragOriginAnn.current = null;
      return;
    }

    if (!drawing.current) return;
    drawing.current = false;

    const completed = inProgress.current;
    inProgress.current = null;

    if (completed) {
      pushHistory();
      setAnnotations(prev => {
        const next = [...prev, completed];
        redraw(next, null, selectedIdx);
        return next;
      });
    }
  }

  // ── Double-click: edit text annotation ────────────────────────────────────
  function onDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (tool !== "select") return;
    const canvas = canvasRef.current!;
    const pt = canvasPt(e, canvas);
    for (let i = annotations.length - 1; i >= 0; i--) {
      const ann = annotations[i];
      if (ann.type === "text" && hitTest(ann, pt.x, pt.y)) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / canvas.width;
        const scaleY = rect.height / canvas.height;
        setEditingTextIdx(i);
        setTextInput({
          x: ann.x * scaleX,
          y: ann.y * scaleY - ann.fs * scaleY,
          canvasX: ann.x,
          canvasY: ann.y,
        });
        setTextValue(ann.text);
        setColor(ann.color);
        setFs(ann.fs);
        setTimeout(() => textInputRef.current?.focus(), 50);
        return;
      }
    }
  }

  // ── Text commit ───────────────────────────────────────────────────────────
  function commitText() {
    if (!textInput) { setEditingTextIdx(null); setTextValue(""); return; }
    if (!textValue.trim()) { setTextInput(null); setTextValue(""); setEditingTextIdx(null); return; }
    pushHistory();
    if (editingTextIdx !== null) {
      setAnnotations(prev => {
        const next = prev.map((a, i) => i === editingTextIdx ? { ...a, text: textValue.trim(), color, fs } as TextAnn : a);
        redraw(next, null, selectedIdx);
        return next;
      });
    } else {
      const ann: TextAnn = { type: "text", x: textInput.canvasX, y: textInput.canvasY, text: textValue.trim(), color, fs };
      setAnnotations(prev => {
        const next = [...prev, ann];
        redraw(next, null, selectedIdx);
        return next;
      });
    }
    setTextInput(null);
    setTextValue("");
    setEditingTextIdx(null);
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
      for (const ann of annotations) { try { drawAnnotation(ctx, ann); } catch {} }

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

  const cursors: Record<Tool, string> = {
    select: "default", arrow: "crosshair", text: "text",
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-gray-950">
      {/* Toolbar */}
      <div ref={toolbarRef} className="shrink-0 bg-gray-900 border-b border-gray-800 px-3 py-2.5 flex flex-wrap items-center gap-2">

        {/* Close */}
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors" title="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>

        <div className="w-px h-6 bg-gray-700 mx-1" />

        {/* Tools */}
        <div className="flex items-center gap-1">
          {TOOLS.map(t => (
            <button
              key={t.id}
              title={t.label}
              onClick={() => { setTool(t.id); if (t.id !== "select") setSelectedIdx(null); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${tool === t.id ? "bg-emerald-600 text-white" : "text-gray-300 hover:text-white hover:bg-gray-800"}`}
            >
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Colors */}
        {tool !== "select" && (
          <>
            <div className="w-px h-6 bg-gray-700 mx-1" />
            <div className="flex items-center gap-1.5">
              {COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className="w-6 h-6 rounded-full transition-transform hover:scale-110 shrink-0"
                  style={{ background: c, outline: color === c ? "2px solid #4ade80" : "2px solid transparent", outlineOffset: 2 }}
                />
              ))}
              <input type="color" value={color} onChange={e => setColor(e.target.value)}
                className="w-6 h-6 rounded cursor-pointer opacity-80 hover:opacity-100" title="Custom color" />
            </div>
          </>
        )}

        {/* Font size — shown for text tool or while editing text */}
        {(tool === "text" || editingTextIdx !== null) && (
          <>
            <div className="w-px h-6 bg-gray-700 mx-1" />
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <span className="text-gray-300 font-medium">Size</span>
              <input type="range" min={12} max={80} value={fs}
                onChange={e => setFs(+e.target.value)}
                className="w-24 accent-emerald-500" />
              <span className="text-white font-semibold w-7 text-center tabular-nums">{fs}</span>
            </label>
          </>
        )}

        <div className="w-px h-6 bg-gray-700 mx-1" />

        {/* Photo adjustments */}
        <div className="flex items-center gap-3">
          {[
            { label: "Brightness", icon: "☀", value: brightness, set: setBrightness },
            { label: "Contrast",   icon: "◑", value: contrast,   set: setContrast },
            { label: "Saturation", icon: "🎨", value: saturation, set: setSaturation },
          ].map(({ label, icon, value, set }) => (
            <label key={label} className="flex items-center gap-1.5 text-xs text-gray-400" title={label}>
              <span className="text-base leading-none">{icon}</span>
              <input type="range" min={0} max={200} value={value}
                onChange={e => set(+e.target.value)}
                className="w-16 accent-emerald-500" />
            </label>
          ))}
        </div>

        <div className="w-px h-6 bg-gray-700 mx-1" />

        {/* Rotate */}
        <div className="flex items-center gap-1">
          <button onClick={() => rotate("ccw")} title="Rotate CCW" className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 text-base transition-colors">⟲</button>
          <button onClick={() => rotate("cw")}  title="Rotate CW"  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 text-base transition-colors">⟳</button>
        </div>

        <div className="w-px h-6 bg-gray-700 mx-1" />

        {/* Undo / Reset */}
        <button onClick={undo} disabled={history.length === 0} title="Undo (⌘Z)"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-gray-800 disabled:opacity-30 transition-colors">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>
          <span className="hidden sm:inline">Undo</span>
        </button>
        <button onClick={() => { setAnnotations([]); setHistory([]); setBrightness(100); setContrast(100); setSaturation(100); setSelectedIdx(null); }}
          className="px-3 py-2 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
          Reset
        </button>

        {/* Save */}
        <button onClick={handleSave} disabled={saving}
          className="ml-auto flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-5 py-2 rounded-lg transition-colors disabled:opacity-50">
          {saving ? (
            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
          ) : (
            <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save</>
          )}
        </button>
      </div>

      {saveError && (
        <div className="shrink-0 bg-red-900/60 text-red-200 text-sm px-4 py-2">{saveError}</div>
      )}

      {/* Canvas area */}
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
            onDoubleClick={onDoubleClick}
          />
          {textInput && (
            <input
              ref={textInputRef}
              value={textValue}
              onChange={e => setTextValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") commitText(); if (e.key === "Escape") { setTextInput(null); setTextValue(""); setEditingTextIdx(null); } }}
              onBlur={e => {
                // Don't commit if focus moved to the toolbar (e.g. font size slider)
                if (toolbarRef.current?.contains(e.relatedTarget as Node)) return;
                commitText();
              }}
              style={{
                position: "absolute",
                left: textInput.x,
                top: textInput.y - 30,
                background: "rgba(0,0,0,0.75)",
                color: color,
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: 4,
                padding: "3px 6px",
                fontSize: 14,
                outline: "none",
                minWidth: 140,
                zIndex: 10,
              }}
              placeholder={editingTextIdx !== null ? "Edit text…" : "Type, then Enter…"}
            />
          )}
        </div>
      </div>
    </div>
  );
}
