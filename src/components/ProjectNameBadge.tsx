"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  bidId: string;
  initialName: string | null;
};

export default function ProjectNameBadge({ bidId, initialName }: Props) {
  const [name, setName] = useState(initialName || "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-generate if no name yet
  useEffect(() => {
    if (!initialName) generate();
  }, []);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/atlasbid/project-names", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bid_id: bidId }),
      });
      const json = await res.json();
      if (json.project_name) setName(json.project_name);
    } catch {}
    setGenerating(false);
  }

  function startEdit() {
    setDraft(name);
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setError(null);
  }

  async function save() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === name) { cancelEdit(); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/atlasbid/project-names", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bid_id: bidId, project_name: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to save"); }
      else { setName(json.project_name); setEditing(false); }
    } catch (e: any) { setError(e?.message ?? "Failed to save"); }
    setSaving(false);
  }

  if (generating) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <div className="w-3 h-3 border border-gray-300 border-t-transparent rounded-full animate-spin" />
        Generating project name…
      </div>
    );
  }

  if (editing) {
    return (
      <div className="flex flex-col items-center gap-1 w-full max-w-xs">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") cancelEdit(); }}
            className="border border-[#16a34a] rounded-lg px-3 py-1.5 text-sm font-semibold text-[#0d2616] focus:outline-none focus:ring-2 focus:ring-green-400 text-center w-52"
          />
          <button
            onClick={save}
            disabled={saving}
            className="bg-[#16a34a] text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors"
          >
            {saving ? "…" : "Save"}
          </button>
          <button
            onClick={cancelEdit}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-xs text-red-600 text-center max-w-xs">{error}</p>}
      </div>
    );
  }

  return (
    <button
      onClick={startEdit}
      className="group flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#d7e6db] bg-[#eef6f0] hover:border-[#16a34a] hover:bg-[#ddf0e4] transition-colors"
      title="Click to edit project name"
    >
      <span className="text-sm font-bold text-[#123b1f]">
        {name || "Set project name…"}
      </span>
      <svg
        width="12" height="12" viewBox="0 0 16 16" fill="currentColor"
        className="text-[#16a34a] opacity-50 group-hover:opacity-100 transition-opacity"
      >
        <path d="M12.854 2.146a.5.5 0 0 0-.707 0l-9 9A.5.5 0 0 0 3 11.5V14a.5.5 0 0 0 .5.5H6a.5.5 0 0 0 .354-.146l9-9a.5.5 0 0 0 0-.707l-2.5-2.5ZM4 11.707l8.5-8.5 1.293 1.293-8.5 8.5H4v-1.293Z" />
      </svg>
    </button>
  );
}
