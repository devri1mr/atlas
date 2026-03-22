"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export default function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
  beforeLabel = "Before",
  afterLabel = "After",
  onClose,
}: {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50); // percent
  const dragging = useRef(false);

  const updatePosition = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100));
    setPosition(pct);
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent | TouchEvent) {
      if (!dragging.current) return;
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      updatePosition(clientX);
    }
    function onUp() { dragging.current = false; }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
    };
  }, [updatePosition]);

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4">
      <button onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>

      <p className="text-white/60 text-sm mb-4">Drag the slider to compare</p>

      <div
        ref={containerRef}
        className="relative w-full max-w-4xl overflow-hidden rounded-xl select-none"
        style={{ maxHeight: "80vh", aspectRatio: "4/3" }}
        onMouseDown={e => { dragging.current = true; updatePosition(e.clientX); }}
        onTouchStart={e => { dragging.current = true; updatePosition(e.touches[0].clientX); }}
      >
        {/* After (full width, underneath) */}
        <img src={afterUrl} alt={afterLabel} className="absolute inset-0 w-full h-full object-contain bg-black" draggable={false} />

        {/* Before (clipped to left portion) */}
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
          <img src={beforeUrl} alt={beforeLabel}
            className="absolute inset-0 w-full h-full object-contain bg-black"
            style={{ width: containerRef.current?.clientWidth ?? "100%" }}
            draggable={false}
          />
        </div>

        {/* Divider line */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_12px_rgba(0,0,0,0.8)] cursor-ew-resize"
          style={{ left: `${position}%`, transform: "translateX(-50%)" }}>
          {/* Handle circle */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white shadow-xl flex items-center justify-center cursor-ew-resize">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2.5" strokeLinecap="round">
              <line x1="8" y1="12" x2="2" y2="12"/><polyline points="5 9 2 12 5 15"/>
              <line x1="16" y1="12" x2="22" y2="12"/><polyline points="19 9 22 12 19 15"/>
            </svg>
          </div>
        </div>

        {/* Labels */}
        <div className="absolute top-3 left-3 bg-black/60 text-white text-xs font-semibold px-2 py-1 rounded-lg pointer-events-none">{beforeLabel}</div>
        <div className="absolute top-3 right-3 bg-black/60 text-white text-xs font-semibold px-2 py-1 rounded-lg pointer-events-none">{afterLabel}</div>
      </div>
    </div>
  );
}
