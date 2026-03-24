"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

type Step = "upload" | "editing" | "generating" | "result";

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "image/png";
  const binary = atob(data);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export default function DesignPage() {
  const params = useParams<{ id: string }>();
  const bidId = params.id;

  const [step, setStep] = useState<Step>("upload");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageW, setImageW] = useState(0);
  const [imageH, setImageH] = useState(0);
  const [brushSize, setBrushSize] = useState(28);
  const [isEraser, setIsEraser] = useState(false);
  const [hasPainted, setHasPainted] = useState(false);
  const [description, setDescription] = useState("");
  const [refinedPrompt, setRefinedPrompt] = useState<string | null>(null);
  const [isRefining, setIsRefining] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [sliderPos, setSliderPos] = useState(50);
  const [savedDesigns, setSavedDesigns] = useState<{ id: string; signed_url: string | null; original_url: string | null; refined_prompt: string | null; created_at: string }[]>([]);
  const [beforeUrl, setBeforeUrl] = useState<string | null>(null);
  const [firstImageDataUrl, setFirstImageDataUrl] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const sliderDraggingRef = useRef(false);
  const sliderContainerRef = useRef<HTMLDivElement>(null);
  const sliderLineRef = useRef<HTMLDivElement>(null);
  const sliderBeforeRef = useRef<HTMLDivElement>(null);

  // Load saved designs for this bid
  async function loadSavedDesigns() {
    const res = await fetch(`/api/atlasbid/ai-design/list?bid_id=${bidId}`);
    const json = await res.json();
    if (!json.error) setSavedDesigns(json.designs ?? []);
  }

  useEffect(() => { loadSavedDesigns(); }, [bidId]);

  // Clear canvas when image changes
  useEffect(() => {
    if (!imageDataUrl || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d")!;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setHasPainted(false);
    setRefinedPrompt(null);
    setError(null);
  }, [imageDataUrl]);

  async function handleImageFile(file: File, isRefinement = false) {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file.");
      return;
    }
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
    await new Promise<void>((res) => { img.onload = () => res(); });

    const MAX = 1024;
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (w > MAX || h > MAX) {
      const scale = MAX / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    // Align to 64 for Stability AI
    w = Math.max(64, Math.round(w / 64) * 64);
    h = Math.max(64, Math.round(h / 64) * 64);

    const offscreen = document.createElement("canvas");
    offscreen.width = w;
    offscreen.height = h;
    offscreen.getContext("2d")!.drawImage(img, 0, 0, w, h);
    const dataUrl = offscreen.toDataURL("image/jpeg", 0.92);

    URL.revokeObjectURL(objectUrl);
    setImageDataUrl(dataUrl);
    if (!isRefinement) setFirstImageDataUrl(dataUrl);
    setImageW(w);
    setImageH(h);
    setResultUrl(null);
    setStep("editing");
  }

  // ── Canvas drawing ──────────────────────────────────────────────────────

  function getCanvasPos(clientX: number, clientY: number) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function paintAt(fromX: number | null, fromY: number | null, toX: number, toY: number) {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.lineWidth = brushSize * 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (isEraser) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgba(34,197,94,0.55)";
    }

    ctx.beginPath();
    ctx.moveTo(fromX ?? toX, fromY ?? toY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";

    if (!isEraser) setHasPainted(true);
  }

  function handleCanvasPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    const pos = getCanvasPos(e.clientX, e.clientY);
    paintAt(null, null, pos.x, pos.y);
    lastPosRef.current = pos;
  }

  function handleCanvasPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return;
    const pos = getCanvasPos(e.clientX, e.clientY);
    const last = lastPosRef.current;
    paintAt(last?.x ?? null, last?.y ?? null, pos.x, pos.y);
    lastPosRef.current = pos;
  }

  function handleCanvasPointerUp() {
    isDrawingRef.current = false;
    lastPosRef.current = null;
  }

  function clearCanvas() {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasPainted(false);
  }

  function exportMask(): string {
    const canvas = canvasRef.current!;
    const offscreen = document.createElement("canvas");
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const ctx = offscreen.getContext("2d")!;

    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, offscreen.width, offscreen.height);

    const src = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    const dst = ctx.getImageData(0, 0, offscreen.width, offscreen.height);

    for (let i = 0; i < src.data.length; i += 4) {
      if (src.data[i + 3] > 10) {
        dst.data[i] = 255;
        dst.data[i + 1] = 255;
        dst.data[i + 2] = 255;
        dst.data[i + 3] = 255;
      }
    }

    ctx.putImageData(dst, 0, 0);
    return offscreen.toDataURL("image/png");
  }

  // ── AI actions ──────────────────────────────────────────────────────────

  async function refinePrompt() {
    if (!description.trim()) return;
    setIsRefining(true);
    setError(null);
    try {
      const res = await fetch("/api/atlasbid/ai-design/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Refinement failed");
      if (json.refined) setRefinedPrompt(json.refined);
    } catch (e: any) {
      setError(e?.message ?? "Refinement failed");
    }
    setIsRefining(false);
  }

  async function generate() {
    if (!imageDataUrl) return;
    if (!hasPainted) {
      setError("Paint the area you want to redesign first.");
      return;
    }
    const prompt = refinedPrompt || description;
    if (!prompt.trim()) {
      setError("Describe what you want to design.");
      return;
    }

    setError(null);
    setIsGenerating(true);

    try {
      const maskDataUrl = exportMask();
      const form = new FormData();
      form.append("bid_id", bidId);
      form.append("prompt", prompt);
      form.append("image", dataUrlToBlob(imageDataUrl), "image.jpg");
      form.append("mask", dataUrlToBlob(maskDataUrl), "mask.png");

      const res = await fetch("/api/atlasbid/ai-design/generate", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Generation failed");

      setResultUrl(json.result_url);
      setBeforeUrl(json.original_url ?? imageDataUrl);
      setStep("result");
      setJustSaved(true);
      loadSavedDesigns();
    } catch (e: any) {
      setError(e?.message ?? "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  // ── Use result as new base image ─────────────────────────────────────────
  async function refineThisDesign() {
    if (!resultUrl) return;
    try {
      const res = await fetch(resultUrl);
      const blob = await res.blob();
      const file = new File([blob], "design.png", { type: "image/png" });
      await handleImageFile(file, true);
    } catch {
      setError("Could not load result image for editing.");
    }
  }

  // ── Voice recording ─────────────────────────────────────────────────────

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setIsTranscribing(true);
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const form = new FormData();
        form.append("audio", blob, "recording.webm");
        try {
          const res = await fetch("/api/atlasbid/ai-design/transcribe", {
            method: "POST",
            body: form,
          });
          const json = await res.json();
          if (json.transcript) {
            setDescription((prev) =>
              prev ? `${prev} ${json.transcript}` : json.transcript
            );
          }
        } catch {
          setError("Transcription failed. Try typing instead.");
        }
        setIsTranscribing(false);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      setError("Microphone access denied. Please allow microphone access.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }

  // ── Before/after slider ─────────────────────────────────────────────────

  function updateSlider(clientX: number) {
    const container = sliderContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    // Direct DOM update — no React re-render, smooth on mobile
    if (sliderLineRef.current) sliderLineRef.current.style.left = `${pct}%`;
    if (sliderBeforeRef.current) sliderBeforeRef.current.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
  }

  function onSliderPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    sliderDraggingRef.current = true;
    updateSlider(e.clientX);
  }

  function onSliderPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!sliderDraggingRef.current) return;
    updateSlider(e.clientX);
  }

  function onSliderPointerUp() {
    sliderDraggingRef.current = false;
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[#0d2616]">Atlas Landscape Design</h2>
        {step !== "upload" && (
          <button
            onClick={() => {
              setStep("upload");
              setImageDataUrl(null);
              setFirstImageDataUrl(null);
              setBeforeUrl(null);
              setResultUrl(null);
              setDescription("");
              setRefinedPrompt(null);
              setError(null);
            }}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Start over
          </button>
        )}
      </div>

      {/* ── UPLOAD ─────────────────────────────────────────────────── */}
      {step === "upload" && (
        <div
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) handleImageFile(file);
          }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-5 p-16 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
            dragOver
              ? "border-green-500 bg-green-50"
              : "border-gray-200 bg-gray-50 hover:border-green-400 hover:bg-[#f6fbf7]"
          }`}
        >
          <div className="w-14 h-14 rounded-2xl bg-[#eef6f0] flex items-center justify-center">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
          <div className="text-center">
            <div className="font-semibold text-gray-800">Upload a site photo</div>
            <div className="text-sm text-gray-400 mt-1">Click or drag & drop · JPG, PNG, HEIC</div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImageFile(f);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {/* ── EDITING ────────────────────────────────────────────────── */}
      {step === "editing" && imageDataUrl && (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Canvas */}
          <div className="lg:flex-1 min-w-0">
            <div
              className="relative rounded-xl overflow-hidden bg-gray-100 w-full"
              style={{ aspectRatio: `${imageW} / ${imageH}` }}
            >
              <img
                src={imageDataUrl}
                className="absolute inset-0 w-full h-full object-fill"
                draggable={false}
                alt=""
              />
              <canvas
                ref={canvasRef}
                width={imageW}
                height={imageH}
                className={`absolute inset-0 w-full h-full ${isEraser ? "cursor-cell" : "cursor-crosshair"}`}
                style={{ touchAction: "none" }}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onPointerLeave={handleCanvasPointerUp}
              />
              {isGenerating && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 pointer-events-none">
                  <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mb-3" />
                  <span className="text-white text-sm font-medium">Generating design…</span>
                </div>
              )}
              {!hasPainted && !isGenerating && (
                <div className="absolute inset-0 flex items-end justify-center pb-4 pointer-events-none">
                  <span className="bg-black/60 text-white text-xs font-medium px-3 py-1.5 rounded-full">
                    Paint over the area you want to redesign
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="w-full lg:w-72 shrink-0 space-y-3">
            {/* Brush tools */}
            <div className="rounded-xl border border-[#d7e6db] bg-[#f6fbf7] p-4 space-y-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Brush</p>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setIsEraser(false)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    !isEraser
                      ? "bg-[#123b1f] text-white"
                      : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Paint
                </button>
                <button
                  onClick={() => setIsEraser(true)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    isEraser
                      ? "bg-[#123b1f] text-white"
                      : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Erase
                </button>
                <button
                  onClick={clearCanvas}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold bg-white border border-gray-200 text-gray-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors"
                >
                  Clear
                </button>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Size</span>
                  <span className="tabular-nums">{brushSize}px</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={80}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-full accent-green-600"
                />
              </div>
            </div>

            {/* Describe */}
            <div className="rounded-xl border border-[#d7e6db] bg-[#f6fbf7] p-4 space-y-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Describe the design</p>
              <textarea
                value={description}
                onChange={(e) => { setDescription(e.target.value); setRefinedPrompt(null); }}
                placeholder="e.g. Add a stone pathway with ornamental grasses along the sides…"
                rows={3}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
              />

              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isTranscribing}
                className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  isRecording
                    ? "bg-red-500 text-white hover:bg-red-600"
                    : isTranscribing
                    ? "bg-gray-100 text-gray-400 cursor-wait"
                    : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {isTranscribing ? (
                  <>
                    <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    Transcribing…
                  </>
                ) : isRecording ? (
                  <>
                    <span className="inline-block w-2 h-2 rounded-full bg-white animate-pulse" />
                    Stop Recording
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                    Use Voice
                  </>
                )}
              </button>

              {description.trim() && (
                <button
                  onClick={refinePrompt}
                  disabled={isRefining}
                  className="w-full py-2 rounded-lg text-xs font-semibold bg-[#eef6f0] text-[#123b1f] hover:bg-[#ddf0e4] transition-colors disabled:opacity-50"
                >
                  {isRefining ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <div className="w-3 h-3 border-2 border-[#123b1f]/40 border-t-[#123b1f] rounded-full animate-spin" />
                      Refining…
                    </span>
                  ) : (
                    "✦ Refine with Claude"
                  )}
                </button>
              )}

              {refinedPrompt && (
                <div className="text-xs text-gray-600 bg-white border border-[#d7e6db] rounded-lg px-3 py-2.5 leading-relaxed">
                  <span className="text-[#16a34a] font-semibold">Refined: </span>
                  {refinedPrompt}
                  <button
                    onClick={() => setRefinedPrompt(null)}
                    className="ml-2 text-gray-300 hover:text-gray-500 text-xs"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              onClick={generate}
              disabled={isGenerating}
              className="w-full py-3 rounded-xl bg-[#123b1f] text-white font-semibold text-sm hover:bg-[#1a5c2e] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? "Generating…" : "Generate Design →"}
            </button>
          </div>
        </div>
      )}

      {/* ── GENERATING ─────────────────────────────────────────────── */}
      {step === "generating" && (
        <div className="flex flex-col items-center justify-center py-24 gap-5">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-[#d7e6db] border-t-[#16a34a] animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-gray-800">Generating your design…</div>
            <div className="text-sm text-gray-400 mt-1">This usually takes 10–20 seconds</div>
          </div>
        </div>
      )}

      {/* ── RESULT ─────────────────────────────────────────────────── */}
      {step === "result" && resultUrl && (
        <div className="space-y-4">
          {(firstImageDataUrl ?? beforeUrl) && (
            <p className="text-xs text-gray-400 text-center">Drag the handle to compare before & after</p>
          )}

          {/* Before/after slider */}
          <div
            ref={sliderContainerRef}
            className="relative rounded-xl overflow-hidden select-none w-full cursor-ew-resize"
            style={{ aspectRatio: imageW && imageH ? `${imageW} / ${imageH}` : "4/3", touchAction: "none" }}
            onPointerDown={onSliderPointerDown}
            onPointerMove={onSliderPointerMove}
            onPointerUp={onSliderPointerUp}
            onPointerLeave={onSliderPointerUp}
          >
            {/* After (result) — full background */}
            <img
              src={resultUrl}
              className="absolute inset-0 w-full h-full object-cover"
              draggable={false}
              alt="Atlas design result"
            />
            {/* Before (original) — clipped to left side, only if available */}
            {(firstImageDataUrl ?? beforeUrl) && (
              <div
                ref={sliderBeforeRef}
                className="absolute inset-0 overflow-hidden"
                style={{ clipPath: `inset(0 50% 0 0)` }}
              >
                <img
                  src={(firstImageDataUrl ?? beforeUrl)!}
                  className="absolute inset-0 w-full h-full object-cover"
                  draggable={false}
                  alt="Original photo"
                />
              </div>
            )}

            {/* Labels */}
            {(firstImageDataUrl ?? beforeUrl) && (
            <div className="absolute top-3 left-3 bg-black/60 text-white text-[10px] font-bold px-2.5 py-1 rounded-full pointer-events-none">
              BEFORE
            </div>
            )}
            <div className="absolute top-3 right-3 bg-[#123b1f]/80 text-white text-[10px] font-bold px-2.5 py-1 rounded-full pointer-events-none">
              AFTER
            </div>

            {/* Slider line + handle — only when before image is available */}
            {(firstImageDataUrl ?? beforeUrl) && <div
              ref={sliderLineRef}
              className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_rgba(0,0,0,0.4)] pointer-events-none"
              style={{ left: "50%", transform: "translateX(-50%)" }}
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 bg-white rounded-full shadow-xl flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="15 18 9 12 15 6" />
                  <polyline points="9 6 15 12 9 18" style={{ transform: "translateX(6px)" }} />
                </svg>
              </div>
            </div>}
          </div>

          {/* Save confirmation */}
          {justSaved && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm font-medium">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Saved to this bid
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={refineThisDesign}
              className="flex-1 py-2.5 rounded-xl border border-[#d7e6db] bg-[#f6fbf7] text-sm font-semibold text-[#123b1f] hover:bg-[#eaf4ec] transition-colors"
            >
              ✦ Refine This Design
            </button>
            <button
              onClick={() => {
                setStep("editing");
                setResultUrl(null);
                setError(null);
                setJustSaved(false);
              }}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Edit Mask & Retry
            </button>
            <button
              onClick={() => {
                setDescription("");
                setRefinedPrompt(null);
                clearCanvas();
                setStep("editing");
                setResultUrl(null);
                setError(null);
                setJustSaved(false);
              }}
              className="flex-1 py-2.5 rounded-xl bg-[#123b1f] text-white text-sm font-semibold hover:bg-[#1a5c2e] transition-colors"
            >
              New Design
            </button>
          </div>
        </div>
      )}

      {/* ── SAVED DESIGNS ───────────────────────────────────────────── */}
      {savedDesigns.length > 0 && step !== "generating" && (
        <div className="space-y-3 pt-2 border-t border-gray-100">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Saved Designs</p>
          <div className="grid grid-cols-2 gap-3">
            {savedDesigns.map((d) => d.signed_url && (
              <div key={d.id} className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-50 cursor-pointer"
                onClick={() => {
                  setResultUrl(d.signed_url!);
                  setBeforeUrl(d.original_url ?? null);
                  setJustSaved(false);
                  setStep("result");
                }}
              >
                <img src={d.signed_url} alt="Saved design" className="w-full aspect-video object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                  <span className="opacity-0 group-hover:opacity-100 text-white text-xs font-semibold bg-black/60 px-3 py-1.5 rounded-full transition-opacity">View</span>
                </div>
                <div className="px-2 py-1.5">
                  <p className="text-[10px] text-gray-400 truncate">{new Date(d.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
