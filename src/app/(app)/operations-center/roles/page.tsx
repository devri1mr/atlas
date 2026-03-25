"use client";

import { useEffect, useState } from "react";
import type React from "react";
import Link from "next/link";
import { SECTIONS, ALL_KEYS, type Permissions } from "@/lib/permissions";

type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  is_admin: boolean;
  is_system: boolean;
  permissions: Permissions;
  user_count: number;
};

type DrawerMode = "create" | "edit";

function PermissionsPanel({
  perms,
  onChange,
  disabled,
}: {
  perms: Permissions;
  onChange: (next: Permissions) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set(SECTIONS.map(s => s.id)));

  function toggle(key: string) {
    if (disabled) return;
    onChange({ ...perms, [key]: !perms[key] });
  }

  function toggleSection(sectionId: string, on: boolean) {
    if (disabled) return;
    const section = SECTIONS.find(s => s.id === sectionId);
    if (!section) return;
    const next = { ...perms };
    section.perms.forEach(p => { next[p.key] = on; });
    onChange(next);
  }

  return (
    <div className="space-y-1">
      {SECTIONS.map(section => {
        const keys = section.perms.map(p => p.key);
        const onCount = keys.filter(k => !!perms[k]).length;
        const allOn = onCount === keys.length;
        const someOn = onCount > 0 && !allOn;
        const isOpen = open.has(section.id);

        return (
          <div key={section.id} className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50/80">
              <button
                onClick={() => {
                  if (!disabled) toggleSection(section.id, !allOn);
                }}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                  disabled ? "opacity-40 cursor-not-allowed" :
                  allOn ? "bg-green-500 border-green-500" :
                  someOn ? "bg-amber-400 border-amber-400" :
                  "border-gray-300 hover:border-gray-400"
                }`}
              >
                {(allOn || someOn) && (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    {someOn ? <line x1="2" y1="6" x2="10" y2="6" /> : <polyline points="2 6 5 9 10 3" />}
                  </svg>
                )}
              </button>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800">{section.label}</span>
                  {section.tag && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#123b1f]/10 text-[#123b1f]">{section.tag}</span>}
                </div>
                <span className="text-xs text-gray-400">{onCount}/{keys.length} enabled</span>
              </div>
              <button onClick={() => setOpen(prev => { const n = new Set(prev); n.has(section.id) ? n.delete(section.id) : n.add(section.id); return n; })}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className={`transition-transform ${isOpen ? "rotate-180" : ""}`}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
            {isOpen && (
              <div className="p-3 grid grid-cols-1 gap-0.5">
                {section.perms.map(perm => (
                  <div key={perm.key}>
                    {perm.sub && (
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 pt-2 pb-1">{perm.sub}</div>
                    )}
                    <label className={`flex items-center gap-3 px-2 py-1.5 rounded-lg ${disabled ? "cursor-not-allowed opacity-60" : "hover:bg-gray-50 cursor-pointer"} transition-colors`}>
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                        perms[perm.key] ? "bg-green-500 border-green-500" : "border-gray-300"
                      } ${!disabled && "hover:border-gray-400"}`}
                        onClick={() => toggle(perm.key)}>
                        {perms[perm.key] && (
                          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="2 6 5 9 10 3" />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm text-gray-700">{perm.label}</span>
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPerms, setFormPerms] = useState<Permissions>({});
  const [formIsAdmin, setFormIsAdmin] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const res = await fetch("/api/roles");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load roles");
      setRoles(json.data ?? []);
    } catch (e: any) {
      setError(e.message ?? "Failed to load roles");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setDrawerMode("create");
    setEditingId(null);
    setFormName("");
    setFormDesc("");
    setFormPerms({});
    setFormIsAdmin(false);
    setDrawerOpen(true);
  }

  function openEdit(role: RoleRow) {
    setDrawerMode("edit");
    setEditingId(role.id);
    setFormName(role.name);
    setFormDesc(role.description ?? "");
    setFormPerms({ ...role.permissions });
    setFormIsAdmin(role.is_admin);
    setDrawerOpen(true);
  }

  async function save() {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      if (drawerMode === "create") {
        const res = await fetch("/api/roles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: formName.trim(), description: formDesc.trim() || null, permissions: formPerms }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setRoles(prev => [...prev, { ...json.data, user_count: 0 }]);
      } else if (editingId) {
        const res = await fetch(`/api/roles/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: formName.trim(), description: formDesc.trim() || null, permissions: formPerms }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setRoles(prev => prev.map(r => r.id === editingId ? { ...r, ...json.data } : r));
      }
      setDrawerOpen(false);
    } catch (e: any) {
      setError(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRole(id: string) {
    try {
      const res = await fetch(`/api/roles/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setRoles(prev => prev.filter(r => r.id !== id));
      setDeleteConfirm(null);
    } catch (e: any) {
      setError(e.message ?? "Delete failed");
      setDeleteConfirm(null);
    }
  }

  const enabledCount = ALL_KEYS.filter(k => !!formPerms[k]).length;

  return (
    <div className="min-h-screen bg-[#f0f4f0]">
      {/* Header */}
      <div className="px-4 md:px-8 py-6 md:py-8" style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 text-white/50 text-xs mb-2">
            <Link href="/operations-center" className="hover:text-white/80 transition-colors">Settings</Link>
            <span>/</span>
            <span className="text-white/80">Roles</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Roles & Permissions</h1>
              <p className="text-white/50 text-sm mt-1">Define what each role can access across Atlas</p>
            </div>
            <button
              onClick={openCreate}
              className="shrink-0 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors flex items-center gap-2 border border-white/20"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New Role
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-4xl mx-auto">
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
            {error}
            <button onClick={() => setError("")} className="text-red-400 hover:text-red-600 ml-4">&#x2715;</button>
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-3">
            {[1,2,3,4].map(i => <div key={i} className="h-16 bg-gray-50 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="divide-y divide-gray-50">
              {roles.map(role => (
                <div key={role.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{role.name}</span>
                      {role.is_admin && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Admin</span>
                      )}
                      {role.is_system && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">System</span>
                      )}
                    </div>
                    {role.description && <p className="text-xs text-gray-500 mt-0.5">{role.description}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {role.is_admin ? "Full access to everything" : `${Object.values(role.permissions).filter(Boolean).length} permissions enabled`}
                      {" · "}
                      <span className={role.user_count > 0 ? "text-gray-600 font-medium" : "text-gray-400"}>
                        {role.user_count} user{role.user_count !== 1 ? "s" : ""}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => openEdit(role)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      Edit
                    </button>
                    {!role.is_system && (
                      deleteConfirm === role.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-600 font-medium">Delete?</span>
                          <button onClick={() => deleteRole(role.id)} className="px-2 py-1 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 transition-colors">Yes</button>
                          <button onClick={() => setDeleteConfirm(null)} className="px-2 py-1 rounded-lg text-xs text-gray-500 hover:bg-gray-100 transition-colors">No</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(role.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors"
                        >
                          Delete
                        </button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mt-4 text-xs text-gray-400 text-center">
          System roles are built-in defaults. You can rename them but not delete them while users are assigned.{" "}
          <Link href="/operations-center/users" className="text-green-600 hover:underline">Manage users &#x2192;</Link>
        </p>
      </div>

      {/* Drawer */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-[420px] max-w-full bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
              <h2 className="font-bold text-gray-900 text-lg">{drawerMode === "create" ? "New Role" : `Edit: ${formName}`}</h2>
              <button onClick={() => setDrawerOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Role Name</label>
                  <input
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="e.g. Foreman, Office Admin, Estimator..."
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Description <span className="text-gray-400 font-normal normal-case">(optional)</span></label>
                  <input
                    value={formDesc}
                    onChange={e => setFormDesc(e.target.value)}
                    placeholder="Brief description of this role..."
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Permissions</label>
                  {!formIsAdmin && (
                    <span className="text-xs text-gray-400">{enabledCount} / {ALL_KEYS.length} enabled</span>
                  )}
                </div>
                {formIsAdmin ? (
                  <div className="rounded-xl bg-purple-50 border border-purple-100 px-5 py-4 text-center">
                    <div className="text-purple-600 font-semibold text-sm mb-1">Admin Role &mdash; Full Access</div>
                    <div className="text-xs text-purple-500">Admin always has access to everything in Atlas. Permissions cannot be restricted for this role.</div>
                  </div>
                ) : (
                  <PermissionsPanel perms={formPerms} onChange={setFormPerms} />
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex gap-3">
              <button
                onClick={() => setDrawerOpen(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || !formName.trim()}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#123b1f] text-white text-sm font-semibold hover:bg-[#1a5c2a] disabled:opacity-40 transition-colors"
              >
                {saving ? "Saving..." : drawerMode === "create" ? "Create Role" : "Save Changes"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
