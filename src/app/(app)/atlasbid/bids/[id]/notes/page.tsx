"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

async function readJsonOrThrow(res: Response) {
  const text = await res.text();
  if (!res.ok) {
    try { throw new Error(JSON.parse(text || "{}")?.error || `HTTP ${res.status}`); }
    catch { throw new Error(text || `HTTP ${res.status}`); }
  }
  return text ? JSON.parse(text) : {};
}

export default function BidNotesPage() {
  const { id } = useParams<{ id: string }>();
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`/api/bids/${id}`, { cache: "no-store" })
      .then(r => readJsonOrThrow(r))
      .then(d => setNotes(d?.data?.internal_notes ?? ""))
      .catch(() => {});
  }, [id]);

  async function save(value: string) {
    setStatus("saving");
    try {
      await fetch(`/api/bids/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ internal_notes: value.trim() || null }),
      });
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }

  function handleChange(val: string) {
    setNotes(val);
    setStatus("idle");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(val), 1200);
  }

  function handleBlur() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    save(notes);
  }

  return (
    <div className="space-y-3 max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Job Notes</p>
        <span className="text-xs text-gray-400">
          {status === "saving" && "Saving…"}
          {status === "saved"  && "✓ Saved"}
          {status === "error"  && "Save failed"}
        </span>
      </div>
      <textarea
        className="w-full min-h-[60vh] border border-gray-200 rounded-2xl px-4 py-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all resize-none leading-relaxed"
        value={notes}
        placeholder="Tap the mic on your keyboard to dictate notes about the job…"
        onChange={e => handleChange(e.target.value)}
        onBlur={handleBlur}
      />
    </div>
  );
}
