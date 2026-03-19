"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Category = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  color: string | null;
  icon: string | null;
};

type CategoryNode = Category & { children: CategoryNode[] };

const COLORS = [
  { label: "Green",  value: "#22c55e" },
  { label: "Emerald", value: "#10b981" },
  { label: "Blue",   value: "#3b82f6" },
  { label: "Amber",  value: "#f59e0b" },
  { label: "Orange", value: "#f97316" },
  { label: "Red",    value: "#ef4444" },
  { label: "Purple", value: "#a855f7" },
  { label: "Pink",   value: "#ec4899" },
  { label: "Gray",   value: "#6b7280" },
  { label: "Brown",  value: "#92400e" },
];

function buildTree(flat: Category[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>();
  for (const c of flat) map.set(c.id, { ...c, children: [] });
  const roots: CategoryNode[] = [];
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500";
const btnPrimary = "bg-green-500 hover:bg-green-600 active:bg-green-700 text-white font-bold text-sm px-4 py-2 rounded-lg shadow-sm transition-colors disabled:opacity-40";
const btnGhost = "text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded transition-colors";

type AddForm = { name: string; color: string; icon: string };
const emptyForm = (): AddForm => ({ name: "", color: "#22c55e", icon: "" });

function CategoryRow({
  node,
  depth,
  onAdd,
  onEdit,
  onDelete,
  editingId,
  editForm,
  setEditForm,
  savingId,
  deletingId,
}: {
  node: CategoryNode;
  depth: number;
  onAdd: (parentId: string) => void;
  onEdit: (id: string, patch: Partial<Category>) => void;
  onDelete: (id: string) => void;
  editingId: string | null;
  editForm: AddForm;
  setEditForm: (f: AddForm) => void;
  savingId: string | null;
  deletingId: string | null;
}) {
  const isEditing = editingId === node.id;
  const isDeleting = deletingId === node.id;
  const isSaving = savingId === node.id;

  return (
    <div>
      <div
        className="group flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors"
        style={{ paddingLeft: `${12 + depth * 24}px` }}
      >
        {/* Color dot */}
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: node.color || "#6b7280" }}
        />

        {isEditing ? (
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <input
              className="border border-gray-200 rounded px-2 py-1 text-sm flex-1 min-w-[140px] focus:outline-none focus:ring-1 focus:ring-green-500"
              value={editForm.name}
              onChange={e => setEditForm({ ...editForm, name: e.target.value })}
              onKeyDown={e => e.key === "Enter" && onEdit(node.id, editForm)}
              autoFocus
            />
            <input
              className="border border-gray-200 rounded px-2 py-1 text-sm w-20 focus:outline-none focus:ring-1 focus:ring-green-500"
              placeholder="emoji"
              value={editForm.icon}
              onChange={e => setEditForm({ ...editForm, icon: e.target.value })}
            />
            <div className="flex gap-1 flex-wrap">
              {COLORS.map(c => (
                <button
                  key={c.value}
                  title={c.label}
                  className={`w-5 h-5 rounded-full border-2 transition-transform ${editForm.color === c.value ? "border-gray-800 scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c.value }}
                  onClick={() => setEditForm({ ...editForm, color: c.value })}
                />
              ))}
            </div>
            <button
              disabled={isSaving || !editForm.name.trim()}
              onClick={() => onEdit(node.id, editForm)}
              className="text-xs font-semibold text-green-600 hover:text-green-800 disabled:opacity-40"
            >
              {isSaving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => onEdit("cancel", emptyForm())} className="text-xs text-gray-400 hover:text-gray-600">
              Cancel
            </button>
          </div>
        ) : (
          <>
            <span className="text-sm mr-1">{node.icon || ""}</span>
            <span className="text-sm font-medium text-gray-800 flex-1">{node.name}</span>
            <div className="hidden group-hover:flex items-center gap-1">
              <button
                onClick={() => onAdd(node.id)}
                className="text-xs text-green-600 hover:text-green-800 font-medium px-2 py-0.5 rounded hover:bg-green-50"
              >
                + Sub
              </button>
              <button
                onClick={() => {
                  setEditForm({ name: node.name, color: node.color || "#22c55e", icon: node.icon || "" });
                  onEdit(node.id, { name: "__edit__" });
                }}
                className={btnGhost}
              >
                Edit
              </button>
              <button
                onClick={() => onDelete(node.id)}
                disabled={isDeleting}
                className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded disabled:opacity-40"
              >
                {isDeleting ? "…" : "Delete"}
              </button>
            </div>
          </>
        )}
      </div>

      {node.children.length > 0 && (
        <div className="border-l border-gray-100 ml-[23px]">
          {node.children
            .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
            .map(child => (
              <CategoryRow
                key={child.id}
                node={child}
                depth={depth + 1}
                onAdd={onAdd}
                onEdit={onEdit}
                onDelete={onDelete}
                editingId={editingId}
                editForm={editForm}
                setEditForm={setEditForm}
                savingId={savingId}
                deletingId={deletingId}
              />
            ))}
        </div>
      )}
    </div>
  );
}

export default function MaterialsCatalogPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [addParentId, setAddParentId] = useState<string | null>(null);
  const [addForm, setAddForm] = useState<AddForm>(emptyForm());
  const [adding, setAdding] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<AddForm>(emptyForm());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/material-categories", { cache: "no-store" });
    const j = await r.json();
    setCategories(j?.data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(parentId: string | null) {
    if (!addForm.name.trim()) return;
    setAdding(true);
    const r = await fetch("/api/material-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: addForm.name.trim(), color: addForm.color, icon: addForm.icon || null, parent_id: parentId }),
    });
    const j = await r.json();
    if (!r.ok) { setError(j?.error || "Failed to add"); setAdding(false); return; }
    setCategories(prev => [...prev, j.data]);
    setAddForm(emptyForm());
    setAddParentId(null);
    setAdding(false);
  }

  async function handleEdit(id: string, patch: Partial<AddForm> & { name?: string }) {
    if (id === "cancel") { setEditingId(null); return; }
    if (patch.name === "__edit__") { setEditingId(id); return; }
    setSavingId(id);
    const r = await fetch(`/api/material-categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const j = await r.json();
    if (!r.ok) { setError(j?.error || "Failed to save"); setSavingId(null); return; }
    setCategories(prev => prev.map(c => c.id === id ? { ...c, ...j.data } : c));
    setEditingId(null);
    setSavingId(null);
  }

  async function handleDelete(id: string) {
    const cat = categories.find(c => c.id === id);
    const childCount = categories.filter(c => c.parent_id === id).length;
    const msg = childCount > 0
      ? `Delete "${cat?.name}"? Its ${childCount} sub-categor${childCount === 1 ? "y" : "ies"} will move up a level.`
      : `Delete "${cat?.name}"?`;
    if (!confirm(msg)) return;
    setDeletingId(id);
    const r = await fetch(`/api/material-categories/${id}`, { method: "DELETE" });
    if (!r.ok) { setError("Failed to delete"); setDeletingId(null); return; }
    setCategories(prev => {
      // Reassign children to grandparent
      const parent_id = cat?.parent_id ?? null;
      return prev
        .map(c => c.parent_id === id ? { ...c, parent_id } : c)
        .filter(c => c.id !== id);
    });
    setDeletingId(null);
  }

  const tree = buildTree(categories);

  return (
    <div className="min-h-screen bg-[#f6f8f6]">
      <div className="bg-[#123b1f] px-8 py-4">
        <div className="text-2xl font-extrabold text-white uppercase tracking-[0.2em] text-center">Materials Catalog</div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        <Link href="/operations-center" className="text-sm text-emerald-700 hover:underline">← Back to Operations Center</Link>

        {error && (
          <div className="bg-red-100 border border-red-300 text-red-800 rounded-lg px-4 py-3 text-sm flex items-center justify-between">
            <span>⚠ {error}</span>
            <button onClick={() => setError(null)} className="underline text-red-600 ml-4">dismiss</button>
          </div>
        )}

        {/* Categories card */}
        <div className="bg-white rounded-xl border border-[#d7e6db] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <div>
              <h2 className="font-bold text-[#123b1f] text-base">Categories</h2>
              <p className="text-xs text-gray-500 mt-0.5">Organize materials into categories and sub-categories.</p>
            </div>
            <span className="text-xs text-gray-400">{categories.length} total</span>
          </div>

          {loading ? (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">Loading…</div>
          ) : (
            <div className="py-2">
              {tree.length === 0 && (
                <div className="px-5 py-6 text-sm text-gray-400 text-center">No categories yet. Add your first one below.</div>
              )}
              {tree
                .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
                .map(node => (
                  <div key={node.id}>
                    <CategoryRow
                      node={node}
                      depth={0}
                      onAdd={(parentId) => { setAddParentId(parentId); setAddForm(emptyForm()); }}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      editingId={editingId}
                      editForm={editForm}
                      setEditForm={setEditForm}
                      savingId={savingId}
                      deletingId={deletingId}
                    />
                    {/* Inline sub-category add form */}
                    {addParentId === node.id && (
                      <div
                        className="mx-3 mb-2 mt-1 bg-green-50 border border-green-200 rounded-lg p-3 space-y-2"
                        style={{ marginLeft: `${12 + 24}px` }}
                      >
                        <div className="text-xs font-semibold text-green-700">Add sub-category under "{node.name}"</div>
                        <div className="flex gap-2 items-center flex-wrap">
                          <input
                            className={inputCls + " flex-1 min-w-[160px]"}
                            placeholder="Sub-category name"
                            value={addForm.name}
                            onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                            onKeyDown={e => e.key === "Enter" && handleAdd(addParentId)}
                            autoFocus
                          />
                          <input
                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-green-500"
                            placeholder="emoji"
                            value={addForm.icon}
                            onChange={e => setAddForm({ ...addForm, icon: e.target.value })}
                          />
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {COLORS.map(c => (
                            <button
                              key={c.value}
                              title={c.label}
                              className={`w-6 h-6 rounded-full border-2 transition-transform ${addForm.color === c.value ? "border-gray-800 scale-110" : "border-transparent"}`}
                              style={{ backgroundColor: c.value }}
                              onClick={() => setAddForm({ ...addForm, color: c.value })}
                            />
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleAdd(addParentId)} disabled={adding || !addForm.name.trim()} className={btnPrimary}>
                            {adding ? "Adding…" : "+ Add Sub-category"}
                          </button>
                          <button onClick={() => { setAddParentId(null); setAddForm(emptyForm()); }} className={btnGhost}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}

          {/* Add root category */}
          <div className="border-t px-5 py-4 bg-gray-50 space-y-3">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add Category</div>
            <div className="flex gap-2 items-center flex-wrap">
              <input
                className={inputCls + " flex-1 min-w-[180px]"}
                placeholder="Category name (e.g. Mulch, Stone, Plants)"
                value={addParentId === null ? addForm.name : ""}
                onChange={e => { setAddParentId(null); setAddForm({ ...addForm, name: e.target.value }); }}
                onKeyDown={e => e.key === "Enter" && handleAdd(null)}
              />
              <input
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="emoji"
                value={addParentId === null ? addForm.icon : ""}
                onChange={e => { setAddParentId(null); setAddForm({ ...addForm, icon: e.target.value }); }}
              />
            </div>
            <div className="flex gap-1.5 flex-wrap items-center">
              <span className="text-xs text-gray-400 mr-1">Color:</span>
              {COLORS.map(c => (
                <button
                  key={c.value}
                  title={c.label}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${(addParentId === null ? addForm.color : "#22c55e") === c.value ? "border-gray-800 scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c.value }}
                  onClick={() => { setAddParentId(null); setAddForm({ ...addForm, color: c.value }); }}
                />
              ))}
            </div>
            <button
              onClick={() => handleAdd(null)}
              disabled={adding || !(addParentId === null ? addForm.name.trim() : false)}
              className={btnPrimary}
            >
              {adding ? "Adding…" : "+ Add Category"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
