"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import UnitInput from "@/components/UnitInput";

// ── Types ──────────────────────────────────────────────────────────────────────
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
type CategoryNode = Category & { children: CategoryNode[]; count?: number };

type Material = {
  id: string;
  name: string;
  default_unit: string;
  default_unit_cost: number;
  vendor: string | null;
  sku: string | null;
  is_active: boolean;
  category_id: string | null;
  in_inventory?: boolean;
  inventory_material_id?: string | null;
};

type Tab = "materials" | "categories";
type DrawerMode = "add" | "edit";
const btnSuccess = "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm px-4 py-2 rounded-lg shadow-sm transition-colors disabled:opacity-40";

// ── Helpers ────────────────────────────────────────────────────────────────────
function buildTree(flat: Category[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>();
  for (const c of flat) map.set(c.id, { ...c, children: [], count: 0 });
  const roots: CategoryNode[] = [];
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) map.get(node.parent_id)!.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function countMaterials(node: CategoryNode, matsByCat: Map<string, number>): number {
  const own = matsByCat.get(node.id) ?? 0;
  const child = node.children.reduce((s, c) => s + countMaterials(c, matsByCat), 0);
  return own + child;
}

const COLORS = [
  "#22c55e","#10b981","#3b82f6","#f59e0b","#f97316",
  "#ef4444","#a855f7","#ec4899","#6b7280","#92400e",
];

const UNITS = ["ea", "yd", "bag", "flat", "roll", "lb", "ton", "hr", "sf", "lf", "ft", "stick", "gal"];

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500";
const btnPrimary = "bg-green-500 hover:bg-green-600 active:bg-green-700 text-white font-bold text-sm px-4 py-2 rounded-lg shadow-sm transition-colors disabled:opacity-40";
const btnGhost = "text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded transition-colors";
const btnDanger = "text-sm text-red-500 hover:text-red-700 px-3 py-2 rounded-lg border border-red-200 hover:bg-red-50 transition-colors";

// ── Category Tree (sidebar nav) ────────────────────────────────────────────────
function CategoryNavNode({
  node,
  depth,
  selected,
  onSelect,
  matsByCat,
}: {
  node: CategoryNode;
  depth: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
  matsByCat: Map<string, number>;
}) {
  const [open, setOpen] = useState(depth === 0);
  const total = countMaterials(node, matsByCat);
  const isSelected = selected === node.id;

  return (
    <div>
      <button
        onClick={() => onSelect(isSelected ? null : node.id)}
        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left text-sm transition-colors ${
          isSelected ? "bg-green-100 text-green-800 font-semibold" : "hover:bg-gray-100 text-gray-700"
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: node.color || "#9ca3af" }} />
        <span className="flex-1 truncate">{node.icon ? `${node.icon} ` : ""}{node.name}</span>
        {total > 0 && <span className="text-xs text-gray-400 flex-shrink-0">{total}</span>}
        {node.children.length > 0 && (
          <span
            className="text-gray-400 flex-shrink-0 text-xs"
            onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
          >
            {open ? "▾" : "▸"}
          </span>
        )}
      </button>
      {open && node.children.length > 0 && (
        <div>
          {node.children
            .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
            .map(child => (
              <CategoryNavNode key={child.id} node={child} depth={depth + 1} selected={selected} onSelect={onSelect} matsByCat={matsByCat} />
            ))}
        </div>
      )}
    </div>
  );
}

// ── Category Management Tree (same as before) ─────────────────────────────────
type AddForm = { name: string; color: string; icon: string };
const emptyForm = (): AddForm => ({ name: "", color: "#22c55e", icon: "" });

function CategoryMgmtRow({
  node, depth, onAdd, onEdit, onDelete, editingId, editForm, setEditForm, savingId, deletingId,
}: {
  node: CategoryNode; depth: number;
  onAdd: (id: string) => void;
  onEdit: (id: string, patch: Partial<AddForm> & { name?: string }) => void;
  onDelete: (id: string) => void;
  editingId: string | null; editForm: AddForm;
  setEditForm: (f: AddForm) => void;
  savingId: string | null; deletingId: string | null;
}) {
  const isEditing = editingId === node.id;
  return (
    <div>
      <div
        className="group flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-gray-50"
        style={{ paddingLeft: `${12 + depth * 24}px` }}
      >
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: node.color || "#6b7280" }} />
        {isEditing ? (
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <input className="border rounded px-2 py-1 text-sm flex-1 min-w-[140px] focus:outline-none focus:ring-1 focus:ring-green-500"
              value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
              onKeyDown={e => e.key === "Enter" && onEdit(node.id, editForm)} autoFocus />
            <input className="border rounded px-2 py-1 text-sm w-20 focus:outline-none" placeholder="emoji"
              value={editForm.icon} onChange={e => setEditForm({ ...editForm, icon: e.target.value })} />
            <div className="flex gap-1 flex-wrap">
              {COLORS.map(c => (
                <button key={c} title={c}
                  className={`w-5 h-5 rounded-full border-2 ${editForm.color === c ? "border-gray-800 scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c }} onClick={() => setEditForm({ ...editForm, color: c })} />
              ))}
            </div>
            <button disabled={savingId === node.id || !editForm.name.trim()} onClick={() => onEdit(node.id, editForm)}
              className="text-xs font-semibold text-green-600 hover:text-green-800 disabled:opacity-40">
              {savingId === node.id ? "Saving…" : "Save"}
            </button>
            <button onClick={() => onEdit("cancel", emptyForm())} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
          </div>
        ) : (
          <>
            <span className="text-sm mr-1">{node.icon || ""}</span>
            <span className="text-sm font-medium text-gray-800 flex-1">{node.name}</span>
            <div className="hidden group-hover:flex items-center gap-1">
              <button onClick={() => onAdd(node.id)} className="text-xs text-green-600 hover:text-green-800 font-medium px-2 py-0.5 rounded hover:bg-green-50">+ Sub</button>
              <button onClick={() => { setEditForm({ name: node.name, color: node.color || "#22c55e", icon: node.icon || "" }); onEdit(node.id, { name: "__edit__" }); }} className={btnGhost}>Edit</button>
              <button onClick={() => onDelete(node.id)} disabled={deletingId === node.id} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded disabled:opacity-40">
                {deletingId === node.id ? "…" : "Delete"}
              </button>
            </div>
          </>
        )}
      </div>
      {node.children.length > 0 && (
        <div className="border-l border-gray-100 ml-[23px]">
          {node.children.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)).map(child => (
            <CategoryMgmtRow key={child.id} node={child} depth={depth + 1}
              onAdd={onAdd} onEdit={onEdit} onDelete={onDelete}
              editingId={editingId} editForm={editForm} setEditForm={setEditForm}
              savingId={savingId} deletingId={deletingId} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Material Drawer ────────────────────────────────────────────────────────────
function MaterialDrawer({
  mode, material, categories, onSave, onDelete, onAddToInventory, onUnregister, onClose, saving, deleting, addingToInventory,
}: {
  mode: DrawerMode;
  material: Partial<Material>;
  categories: Category[];
  onSave: (data: Partial<Material>) => void;
  onDelete?: () => void;
  onAddToInventory?: () => void;
  onUnregister?: () => void;
  onClose: () => void;
  saving: boolean;
  deleting: boolean;
  addingToInventory: boolean;
}) {
  const [form, setForm] = useState<Partial<Material>>(material);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);
  useEffect(() => { setForm(material); }, [material]);

  const flat = categories.filter(c => c.is_active);
  const tree = buildTree(flat);

  function CategoryOption({ node, depth }: { node: CategoryNode; depth: number }) {
    return (
      <>
        <option value={node.id}>{"\u00a0".repeat(depth * 3)}{depth > 0 ? "↳ " : ""}{node.name}</option>
        {node.children.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)).map(c => (
          <CategoryOption key={c.id} node={c} depth={depth + 1} />
        ))}
      </>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between bg-[#123b1f]">
          <h2 className="text-white font-bold text-base">{mode === "add" ? "Add Material" : "Edit Material"}</h2>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Name *</label>
            <input ref={nameRef} className={inputCls} value={form.name ?? ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Emerald Green Arborvitae 4-5'" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Category</label>
            <select className={inputCls} value={form.category_id ?? ""} onChange={e => setForm(f => ({ ...f, category_id: e.target.value || null }))}>
              <option value="">— Uncategorized —</option>
              {tree.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)).map(n => (
                <CategoryOption key={n.id} node={n} depth={0} />
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Unit *</label>
              <UnitInput className={inputCls} value={form.default_unit ?? "ea"} onChange={v => setForm(f => ({ ...f, default_unit: v }))} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Default Cost</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input className={inputCls + " pl-6"} type="number" min="0" step="0.01"
                  value={form.default_unit_cost ?? ""} onChange={e => setForm(f => ({ ...f, default_unit_cost: Number(e.target.value) }))} placeholder="0.00" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Vendor</label>
            <input className={inputCls} value={form.vendor ?? ""} onChange={e => setForm(f => ({ ...f, vendor: e.target.value || null }))} placeholder="e.g. Kluck Nursery" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">SKU / Item #</label>
            <input className={inputCls} value={form.sku ?? ""} onChange={e => setForm(f => ({ ...f, sku: e.target.value || null }))} placeholder="Optional" />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_active !== false ? "bg-green-500" : "bg-gray-300"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.is_active !== false ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <span className="text-sm text-gray-600">{form.is_active !== false ? "Active" : "Inactive"}</span>
          </div>

          {/* Inventory section — edit mode only */}
          {mode === "edit" && (
            <div className={`rounded-lg border px-4 py-3 mt-2 ${material.in_inventory ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-gray-50"}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-0.5">Inventory</div>
                  {material.in_inventory ? (
                    <div>
                      <div className="text-sm text-emerald-700 font-medium">✓ Registered — add receipts on the Inventory page</div>
                      <div className="text-xs text-gray-400 mt-0.5">Inventory summary shows items once a receipt is added</div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">Register to enable receipt tracking</div>
                  )}
                </div>
                {material.in_inventory && onUnregister && (
                  <button
                    onClick={onUnregister}
                    disabled={addingToInventory}
                    className="text-xs text-red-400 hover:text-red-600 underline disabled:opacity-40"
                  >
                    {addingToInventory ? "Unlinking…" : "Unlink from catalog"}
                  </button>
                )}
                {!material.in_inventory && onAddToInventory && (
                  <div className="text-right">
                    <button
                      onClick={onAddToInventory}
                      disabled={addingToInventory}
                      className={btnSuccess}
                    >
                      {addingToInventory ? "Registering…" : "Register for Inventory"}
                    </button>
                    <div className="text-[10px] text-gray-400 mt-1">Enables receipts on inventory page</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between gap-3">
          {mode === "edit" && onDelete && (
            <button onClick={onDelete} disabled={deleting} className={btnDanger}>
              {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} className={btnGhost}>Cancel</button>
            <button
              onClick={() => onSave(form)}
              disabled={saving || !form.name?.trim() || !form.default_unit?.trim()}
              className={btnPrimary}
            >
              {saving ? "Saving…" : mode === "add" ? "Add Material" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function MaterialsCatalogPage() {
  const [tab, setTab] = useState<Tab>("materials");

  // ── categories
  const [categories, setCategories] = useState<Category[]>([]);
  const [catsLoading, setCatsLoading] = useState(true);
  const [catError, setCatError] = useState<string | null>(null);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);

  // category mgmt state
  const [addCatParentId, setAddCatParentId] = useState<string | null>(null);
  const [addCatForm, setAddCatForm] = useState<AddForm>(emptyForm());
  const [addingCat, setAddingCat] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatForm, setEditCatForm] = useState<AddForm>(emptyForm());
  const [savingCatId, setSavingCatId] = useState<string | null>(null);
  const [deletingCatId, setDeletingCatId] = useState<string | null>(null);

  // ── materials
  const [materials, setMaterials] = useState<Material[]>([]);
  const [matsLoading, setMatsLoading] = useState(true);
  const [matError, setMatError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  // ── drawer
  const [drawer, setDrawer] = useState<{ mode: DrawerMode; material: Partial<Material> } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingToInventory, setAddingToInventory] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────
  async function loadCategories() {
    setCatsLoading(true);
    const r = await fetch("/api/material-categories", { cache: "no-store" });
    const j = await r.json();
    setCategories(j?.data ?? []);
    setCatsLoading(false);
  }

  async function loadMaterials() {
    setMatsLoading(true);
    const params = new URLSearchParams({ include_inactive: showInactive ? "true" : "false" });
    if (selectedCatId) params.set("category_id", selectedCatId);
    if (search) params.set("q", search);
    const r = await fetch(`/api/materials-catalog?${params}`, { cache: "no-store" });
    const j = await r.json();
    setMaterials(j?.data ?? []);
    setMatsLoading(false);
  }

  useEffect(() => { loadCategories(); }, []);
  useEffect(() => { loadMaterials(); }, [selectedCatId, search, showInactive]);

  // ── Category map for display ───────────────────────────────────────────────
  const catById = new Map(categories.map(c => [c.id, c]));

  // Count materials per category
  const matsByCat = new Map<string, number>();
  for (const m of materials) {
    if (m.category_id) matsByCat.set(m.category_id, (matsByCat.get(m.category_id) ?? 0) + 1);
  }
  // For sidebar counts, use all materials (no filter applied)
  const [allMaterials, setAllMaterials] = useState<Material[]>([]);
  useEffect(() => {
    fetch("/api/materials-catalog?include_inactive=false", { cache: "no-store" })
      .then(r => r.json()).then(j => setAllMaterials(j?.data ?? []));
  }, []);
  const allMatsByCat = new Map<string, number>();
  for (const m of allMaterials) {
    if (m.category_id) allMatsByCat.set(m.category_id, (allMatsByCat.get(m.category_id) ?? 0) + 1);
  }

  const tree = buildTree(categories);

  // ── Material CRUD ──────────────────────────────────────────────────────────
  async function handleSave(form: Partial<Material>) {
    if (!form.name?.trim() || !form.default_unit?.trim()) return;
    setSaving(true);
    if (drawer?.mode === "add") {
      const r = await fetch("/api/materials-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, category_id: form.category_id || null }),
      });
      const j = await r.json();
      if (!r.ok) { setMatError(j?.error || "Failed to add"); setSaving(false); return; }
      setMaterials(prev => [...prev, j.data].sort((a, b) => a.name.localeCompare(b.name)));
      setAllMaterials(prev => [...prev, j.data]);
    } else if (drawer?.mode === "edit" && drawer.material.id) {
      const r = await fetch(`/api/materials-catalog/${drawer.material.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, category_id: form.category_id || null }),
      });
      const j = await r.json();
      if (!r.ok) { setMatError(j?.error || "Failed to save"); setSaving(false); return; }
      setMaterials(prev => prev.map(m => m.id === drawer.material.id ? { ...m, ...j.data } : m));
      setAllMaterials(prev => prev.map(m => m.id === drawer.material.id ? { ...m, ...j.data } : m));
    }
    setSaving(false);
    setDrawer(null);
  }

  async function handleDelete() {
    if (!drawer?.material.id) return;
    if (!confirm(`Delete "${drawer.material.name}"?`)) return;
    setDeleting(true);
    const r = await fetch(`/api/materials-catalog/${drawer.material.id}`, { method: "DELETE" });
    if (!r.ok) { setMatError("Failed to delete"); setDeleting(false); return; }
    setMaterials(prev => prev.filter(m => m.id !== drawer.material.id));
    setAllMaterials(prev => prev.filter(m => m.id !== drawer.material.id));
    setDeleting(false);
    setDrawer(null);
  }

  async function handleUnregisterInventory() {
    const invId = drawer?.material.inventory_material_id;
    if (!invId) return;
    if (!confirm(`Unlink "${drawer?.material.name}" from this catalog entry? Existing transactions are preserved.`)) return;
    setAddingToInventory(true);
    const r = await fetch(`/api/materials/${invId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ catalog_material_id: null }),
    });
    if (!r.ok) { setMatError("Failed to un-register"); setAddingToInventory(false); return; }
    setMaterials(prev => prev.map(m => m.id === drawer!.material.id ? { ...m, in_inventory: false, inventory_material_id: null } : m));
    setAllMaterials(prev => prev.map(m => m.id === drawer!.material.id ? { ...m, in_inventory: false, inventory_material_id: null } : m));
    setDrawer(prev => prev ? { ...prev, material: { ...prev.material, in_inventory: false, inventory_material_id: null } } : null);
    setAddingToInventory(false);
  }

  async function handleAddToInventory() {
    if (!drawer?.material.id) return;
    setAddingToInventory(true);
    const m = drawer.material;
    const r = await fetch("/api/materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: m.name,
        display_name: m.name,
        unit: m.default_unit,
        unit_cost: m.default_unit_cost ?? null,
        catalog_material_id: m.id,
        is_active: true,
      }),
    });
    const j = await r.json();
    if (!r.ok) { setMatError(j?.error || "Failed to add to inventory"); setAddingToInventory(false); return; }
    // Update in_inventory flag locally
    setMaterials(prev => prev.map(mat => mat.id === m.id ? { ...mat, in_inventory: true } : mat));
    setAllMaterials(prev => prev.map(mat => mat.id === m.id ? { ...mat, in_inventory: true } : mat));
    setDrawer(prev => prev ? { ...prev, material: { ...prev.material, in_inventory: true } } : null);
    setAddingToInventory(false);
  }

  // ── Category CRUD (management tab) ────────────────────────────────────────
  async function handleAddCat(parentId: string | null) {
    if (!addCatForm.name.trim()) return;
    setAddingCat(true);
    const r = await fetch("/api/material-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: addCatForm.name.trim(), color: addCatForm.color, icon: addCatForm.icon || null, parent_id: parentId }),
    });
    const j = await r.json();
    if (!r.ok) { setCatError(j?.error || "Failed to add"); setAddingCat(false); return; }
    setCategories(prev => [...prev, j.data]);
    setAddCatForm(emptyForm());
    setAddCatParentId(null);
    setAddingCat(false);
  }

  async function handleEditCat(id: string, patch: Partial<AddForm> & { name?: string }) {
    if (id === "cancel") { setEditingCatId(null); return; }
    if (patch.name === "__edit__") { setEditingCatId(id); return; }
    setSavingCatId(id);
    const r = await fetch(`/api/material-categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const j = await r.json();
    if (!r.ok) { setCatError(j?.error || "Failed to save"); setSavingCatId(null); return; }
    setCategories(prev => prev.map(c => c.id === id ? { ...c, ...j.data } : c));
    setEditingCatId(null);
    setSavingCatId(null);
  }

  async function handleDeleteCat(id: string) {
    const cat = categories.find(c => c.id === id);
    const childCount = categories.filter(c => c.parent_id === id).length;
    if (!confirm(childCount > 0
      ? `Delete "${cat?.name}"? Its ${childCount} sub-categor${childCount === 1 ? "y" : "ies"} will move up a level.`
      : `Delete "${cat?.name}"?`)) return;
    setDeletingCatId(id);
    const r = await fetch(`/api/material-categories/${id}`, { method: "DELETE" });
    if (!r.ok) { setCatError("Failed to delete"); setDeletingCatId(null); return; }
    const parent_id = cat?.parent_id ?? null;
    setCategories(prev => prev.map(c => c.parent_id === id ? { ...c, parent_id } : c).filter(c => c.id !== id));
    setDeletingCatId(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const totalMats = allMaterials.length;

  return (
    <div className="min-h-screen bg-[#f6f8f6]">
      {/* Header */}
      <div className="bg-[#123b1f] px-4 md:px-8 py-4 flex items-center justify-between">
        <div className="text-2xl font-extrabold text-white uppercase tracking-[0.2em]">Materials Catalog</div>
        <Link href="/operations-center" className="text-white/60 hover:text-white text-sm transition-colors">← Operations Center</Link>
      </div>

      {/* Tabs */}
      <div className="border-b bg-white px-4 md:px-8">
        <div className="flex gap-0">
          {(["materials", "categories"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors capitalize ${
                tab === t ? "border-green-600 text-green-700" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "materials" ? `Materials (${totalMats})` : "Manage Categories"}
            </button>
          ))}
        </div>
      </div>

      {/* Error banner */}
      {(matError || catError) && (
        <div className="mx-6 mt-4 bg-red-100 border border-red-300 text-red-800 rounded-lg px-4 py-3 text-sm flex items-center justify-between">
          <span>⚠ {matError || catError}</span>
          <button onClick={() => { setMatError(null); setCatError(null); }} className="underline text-red-600 ml-4">dismiss</button>
        </div>
      )}

      {/* ── MATERIALS TAB ─────────────────────────────────────────────────── */}
      {tab === "materials" && (
        <div className="flex flex-col md:flex-row h-[calc(100vh-112px)]">
          {/* Sidebar */}
          <div className="md:w-56 flex-shrink-0 bg-white border-b md:border-b-0 md:border-r overflow-y-auto py-3 px-2 max-h-36 md:max-h-none">
            <button
              onClick={() => setSelectedCatId(null)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left text-sm font-semibold mb-1 transition-colors ${
                selectedCatId === null ? "bg-green-100 text-green-800" : "hover:bg-gray-100 text-gray-700"
              }`}
            >
              <span className="flex-1">All Materials</span>
              <span className="text-xs text-gray-400">{totalMats}</span>
            </button>
            <div className="border-t my-2" />
            {catsLoading ? (
              <div className="text-xs text-gray-400 px-3 py-2">Loading…</div>
            ) : (
              tree.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)).map(node => (
                <CategoryNavNode key={node.id} node={node} depth={0} selected={selectedCatId} onSelect={setSelectedCatId} matsByCat={allMatsByCat} />
              ))
            )}
          </div>

          {/* Main content */}
          <div className="flex-1 overflow-y-auto">
            {/* Toolbar */}
            <div className="sticky top-0 z-10 bg-white border-b px-6 py-3 flex items-center gap-3">
              <input
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 max-w-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Search materials…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <label className="flex items-center gap-1.5 text-sm text-gray-500 cursor-pointer select-none">
                <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded" />
                Inactive only
              </label>
              <div className="ml-auto">
                <button
                  onClick={() => setDrawer({ mode: "add", material: { category_id: selectedCatId, is_active: true, default_unit: "ea", default_unit_cost: 0 } })}
                  className={btnPrimary}
                >
                  + Add Material
                </button>
              </div>
            </div>

            {/* Category breadcrumb */}
            {selectedCatId && catById.has(selectedCatId) && (
              <div className="px-6 pt-4 pb-1 flex items-center gap-2 text-sm">
                <button onClick={() => setSelectedCatId(null)} className="text-green-700 hover:underline">All Materials</button>
                <span className="text-gray-400">›</span>
                <span className="font-semibold text-gray-700">{catById.get(selectedCatId)?.name}</span>
              </div>
            )}

            {/* Table */}
            <div className="px-6 py-4">
              {matsLoading ? (
                <div className="text-sm text-gray-400 text-center py-16">Loading…</div>
              ) : materials.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-16">
                  {search ? `No results for "${search}"` : "No materials in this category yet."}
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-[#d7e6db] shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        <th className="text-left px-4 py-3">Name</th>
                        <th className="text-left px-4 py-3">Category</th>
                        <th className="text-left px-4 py-3">Unit</th>
                        <th className="text-right px-4 py-3">Cost</th>
                        <th className="text-left px-4 py-3">Vendor</th>
                        <th className="text-center px-4 py-3">Inventory</th>
                        <th className="text-center px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {materials.map((m, i) => {
                        const cat = m.category_id ? catById.get(m.category_id) : null;
                        return (
                          <tr
                            key={m.id}
                            className={`border-b last:border-0 cursor-pointer hover:bg-green-50 transition-colors ${i % 2 === 0 ? "" : "bg-gray-50/50"}`}
                            onClick={() => setDrawer({ mode: "edit", material: m })}
                          >
                            <td className="px-4 py-3 font-medium text-gray-900">{m.name}</td>
                            <td className="px-4 py-3">
                              {cat ? (
                                <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: cat.color || "#9ca3af" }} />
                                  {cat.name}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-600">{m.default_unit}</td>
                            <td className="px-4 py-3 text-right font-medium text-gray-900">
                              {m.default_unit_cost > 0 ? `$${m.default_unit_cost.toFixed(2)}` : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-gray-500 text-xs">{m.vendor || <span className="text-gray-300">—</span>}</td>
                            <td className="px-4 py-3 text-center">
                              {m.in_inventory
                                ? <span className="text-green-600 font-semibold text-xs">✓ In inventory</span>
                                : <span className="text-gray-300 text-xs">—</span>}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${m.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                                {m.is_active ? "Active" : "Inactive"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="px-4 py-2 bg-gray-50 border-t text-xs text-gray-400 text-right">
                    {materials.length} item{materials.length !== 1 ? "s" : ""}
                    {selectedCatId || search ? " (filtered)" : ""}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CATEGORIES TAB ────────────────────────────────────────────────── */}
      {tab === "categories" && (
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
          <div className="bg-white rounded-xl border border-[#d7e6db] shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <div>
                <h2 className="font-bold text-[#123b1f] text-base">Categories</h2>
                <p className="text-xs text-gray-500 mt-0.5">Organize materials into categories and sub-categories.</p>
              </div>
              <span className="text-xs text-gray-400">{categories.length} total</span>
            </div>
            {catsLoading ? (
              <div className="px-5 py-8 text-sm text-gray-400 text-center">Loading…</div>
            ) : (
              <div className="py-2">
                {tree.length === 0 && (
                  <div className="px-5 py-6 text-sm text-gray-400 text-center">No categories yet. Add one below.</div>
                )}
                {tree.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)).map(node => (
                  <div key={node.id}>
                    <CategoryMgmtRow
                      node={node} depth={0}
                      onAdd={(id) => { setAddCatParentId(id); setAddCatForm(emptyForm()); }}
                      onEdit={handleEditCat} onDelete={handleDeleteCat}
                      editingId={editingCatId} editForm={editCatForm} setEditForm={setEditCatForm}
                      savingId={savingCatId} deletingId={deletingCatId}
                    />
                    {addCatParentId === node.id && (
                      <div className="mx-3 mb-2 mt-1 bg-green-50 border border-green-200 rounded-lg p-3 space-y-2" style={{ marginLeft: "36px" }}>
                        <div className="text-xs font-semibold text-green-700">Add sub-category under "{node.name}"</div>
                        <div className="flex gap-2 items-center flex-wrap">
                          <input className={inputCls + " flex-1 min-w-[160px]"} placeholder="Sub-category name"
                            value={addCatForm.name} onChange={e => setAddCatForm({ ...addCatForm, name: e.target.value })}
                            onKeyDown={e => e.key === "Enter" && handleAddCat(addCatParentId)} autoFocus />
                          <input className="border rounded-lg px-3 py-2 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-green-500"
                            placeholder="emoji" value={addCatForm.icon} onChange={e => setAddCatForm({ ...addCatForm, icon: e.target.value })} />
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {COLORS.map(c => (
                            <button key={c} title={c}
                              className={`w-6 h-6 rounded-full border-2 transition-transform ${addCatForm.color === c ? "border-gray-800 scale-110" : "border-transparent"}`}
                              style={{ backgroundColor: c }} onClick={() => setAddCatForm({ ...addCatForm, color: c })} />
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleAddCat(addCatParentId)} disabled={addingCat || !addCatForm.name.trim()} className={btnPrimary}>
                            {addingCat ? "Adding…" : "+ Add Sub-category"}
                          </button>
                          <button onClick={() => { setAddCatParentId(null); setAddCatForm(emptyForm()); }} className={btnGhost}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="border-t px-5 py-4 bg-gray-50 space-y-3">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add Category</div>
              <div className="flex gap-2 items-center flex-wrap">
                <input className={inputCls + " flex-1 min-w-[180px]"} placeholder="Category name"
                  value={addCatParentId === null ? addCatForm.name : ""}
                  onChange={e => { setAddCatParentId(null); setAddCatForm({ ...addCatForm, name: e.target.value }); }}
                  onKeyDown={e => e.key === "Enter" && handleAddCat(null)} />
                <input className="border rounded-lg px-3 py-2 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="emoji"
                  value={addCatParentId === null ? addCatForm.icon : ""}
                  onChange={e => { setAddCatParentId(null); setAddCatForm({ ...addCatForm, icon: e.target.value }); }} />
              </div>
              <div className="flex gap-1.5 flex-wrap items-center">
                <span className="text-xs text-gray-400 mr-1">Color:</span>
                {COLORS.map(c => (
                  <button key={c} title={c}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${(addCatParentId === null ? addCatForm.color : "#22c55e") === c ? "border-gray-800 scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }} onClick={() => { setAddCatParentId(null); setAddCatForm({ ...addCatForm, color: c }); }} />
                ))}
              </div>
              <button onClick={() => handleAddCat(null)}
                disabled={addingCat || !(addCatParentId === null ? addCatForm.name.trim() : false)} className={btnPrimary}>
                {addingCat ? "Adding…" : "+ Add Category"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer */}
      {drawer && (
        <MaterialDrawer
          mode={drawer.mode}
          material={drawer.material}
          categories={categories}
          onSave={handleSave}
          onDelete={drawer.mode === "edit" ? handleDelete : undefined}
          onAddToInventory={drawer.mode === "edit" && !drawer.material.in_inventory ? handleAddToInventory : undefined}
          onUnregister={drawer.mode === "edit" && drawer.material.in_inventory ? handleUnregisterInventory : undefined}
          onClose={() => setDrawer(null)}
          saving={saving}
          deleting={deleting}
          addingToInventory={addingToInventory}
        />
      )}
    </div>
  );
}
