"use client";

import { useEffect, useState } from "react";
import type React from "react";
import AccessGate from "@/components/AccessGate";
import { SECTIONS, cleanOverrides as _cleanOverrides, type Permissions } from "@/lib/permissions";

// ── Types ─────────────────────────────────────────────────────────────────────

type UserProfile = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  role_id: string | null;
  is_active: boolean;
  invite_sent: boolean | null;
  created_at: string;
  permissions: Permissions;
  allowed_division_ids: string[] | null;
};

type Division = { id: string; name: string };

type RoleOption = { id: string; name: string; description: string | null; is_admin: boolean; is_system: boolean; permissions: Permissions };

// ── Helpers ───────────────────────────────────────────────────────────────────

function getResolved(rolePerms: Permissions, overrides: Permissions, key: string): boolean {
  return overrides[key] !== undefined ? !!overrides[key] : !!(rolePerms[key] ?? false);
}

function cleanOverrides(rolePerms: Permissions, overrides: Permissions): Permissions {
  return _cleanOverrides(rolePerms, overrides);
}

function roleStyle(roleName: string) {
  const map: Record<string, string> = {
    "Admin": "bg-purple-50 text-purple-700 border-purple-200",
    "Sales": "bg-blue-50 text-blue-700 border-blue-200",
    "Sales Coordinator": "bg-sky-50 text-sky-700 border-sky-200",
    "Production": "bg-amber-50 text-amber-700 border-amber-200",
  };
  return map[roleName] ?? "bg-gray-50 text-gray-700 border-gray-200";
}
function roleLabel(roleName: string) { return roleName; }
function userInitials(u: UserProfile) {
  if (u.full_name) return u.full_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return u.email.slice(0, 2).toUpperCase();
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
}

// ── DivisionPicker ────────────────────────────────────────────────────────────

function DivisionPicker({ divisions, selected, onChange }: {
  divisions: Division[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  }

  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden bg-white">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Operations — Division Access</p>
        <p className="text-xs text-gray-400 mt-0.5">Unchecked = sees all divisions. Check specific divisions to restrict access.</p>
      </div>
      <div className="divide-y divide-gray-50">
        {divisions.map(div => {
          const on = selected.includes(div.id);
          return (
            <div key={div.id} className="flex items-center justify-between px-4 py-2.5">
              <span className={`text-sm ${on ? "text-gray-800 font-medium" : "text-gray-400"}`}>{div.name}</span>
              <button
                onClick={() => toggle(div.id)}
                className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${on ? "bg-green-500" : "bg-gray-200"}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
            </div>
          );
        })}
        {divisions.length === 0 && (
          <div className="px-4 py-3 text-xs text-gray-400">No active divisions found.</div>
        )}
      </div>
      {selected.length > 0 && (
        <div className="px-4 py-2 bg-green-50 border-t border-green-100 flex items-center justify-between">
          <span className="text-xs text-green-700 font-medium">Restricted to: {divisions.filter(d => selected.includes(d.id)).map(d => d.name).join(", ")}</span>
          <button onClick={() => onChange([])} className="text-xs text-green-600 hover:underline font-semibold ml-3 shrink-0">Clear</button>
        </div>
      )}
    </div>
  );
}

// ── PermissionsPanel ──────────────────────────────────────────────────────────

function PermissionsPanel({
  rolePerms, overrides, onChange,
}: {
  rolePerms: Permissions;
  overrides: Permissions;
  onChange: (next: Permissions) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function togglePerm(key: string) {
    const cur = getResolved(rolePerms, overrides, key);
    onChange({ ...overrides, [key]: !cur });
  }

  function toggleSection(section: { perms: { key: string }[] }) {
    const allOn = section.perms.every(p => getResolved(rolePerms, overrides, p.key));
    const next = { ...overrides };
    section.perms.forEach(p => { next[p.key] = !allOn; });
    onChange(next);
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-1.5">
      {SECTIONS.map(section => {
        const enabledCount = section.perms.filter(p => getResolved(rolePerms, overrides, p.key)).length;
        const total = section.perms.length;
        const allOn = enabledCount === total;
        const someOn = enabledCount > 0 && !allOn;
        const isOpen = expanded.has(section.id);

        return (
          <div key={section.id} className="rounded-xl border border-gray-100 overflow-hidden bg-white">
            <div
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer select-none ${isOpen ? "border-b border-gray-100 bg-gray-50/60" : ""}`}
              onClick={() => toggleExpand(section.id)}
            >
              <button
                onClick={e => { e.stopPropagation(); toggleSection(section); }}
                className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${
                  allOn ? "bg-green-500" : someOn ? "bg-amber-400" : "bg-gray-200"
                }`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  allOn ? "translate-x-4" : "translate-x-0.5"
                }`} />
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">{section.label}</span>
                  {section.tag && <span className="text-[10px] text-gray-400 font-medium">{section.tag}</span>}
                </div>
              </div>

              <span className={`text-xs font-semibold tabular-nums mr-1 ${enabledCount > 0 ? "text-green-600" : "text-gray-300"}`}>
                {enabledCount}/{total}
              </span>

              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round"
                className={`text-gray-300 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>

            {isOpen && (
              <div>
                {section.perms.map((perm, i) => {
                  const val = getResolved(rolePerms, overrides, perm.key);
                  const isOverride = overrides[perm.key] !== undefined &&
                    overrides[perm.key] !== (rolePerms[perm.key] ?? false);
                  const showSub = perm.sub && perm.sub !== section.perms[i - 1]?.sub;

                  return (
                    <div key={perm.key}>
                      {showSub && (
                        <div className="px-4 py-1.5 bg-gray-50 border-y border-gray-100 first:border-t-0">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{perm.sub}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50 last:border-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-sm ${val ? "text-gray-800" : "text-gray-400"}`}>{perm.label}</span>
                          {isOverride && (
                            <span className="text-[9px] text-amber-500 font-bold uppercase tracking-wide shrink-0">custom</span>
                          )}
                        </div>
                        <button
                          onClick={() => togglePerm(perm.key)}
                          className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ml-4 ${val ? "bg-green-500" : "bg-gray-200"}`}
                        >
                          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${val ? "translate-x-4" : "translate-x-0.5"}`} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Drawer ────────────────────────────────────────────────────────────────────

function Drawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[560px] h-full bg-white shadow-2xl flex flex-col">
        {children}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);

  // Add flow
  const [addOpen, setAddOpen] = useState(false);
  const [addStep, setAddStep] = useState<1 | 2>(1);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRoleId, setNewRoleId] = useState<string>("");
  const [newPerms, setNewPerms] = useState<Permissions>({});
  const [newDivIds, setNewDivIds] = useState<string[]>([]);
  const [addSaving, setAddSaving] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);

  // Edit flow
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [editName, setEditName] = useState("");
  const [editRoleId, setEditRoleId] = useState<string>("");
  const [editActive, setEditActive] = useState(true);
  const [editPerms, setEditPerms] = useState<Permissions>({});
  const [editDivIds, setEditDivIds] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [inviteSending, setInviteSending] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/users");
    const json = await res.json();
    setUsers(json.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    fetch("/api/roles").then(r => r.json()).then(j => {
      const opts: RoleOption[] = j.data ?? [];
      setRoleOptions(opts);
      const firstNonAdmin = opts.find(r => !r.is_admin);
      if (firstNonAdmin) setNewRoleId(firstNonAdmin.id);
    }).catch(() => {});
    fetch("/api/operations-center/divisions").then(r => r.json()).then(j => {
      const active = ((j.data ?? []) as any[]).filter((d: any) => d.active).map((d: any) => ({ id: d.id, name: d.name }));
      setDivisions(active);
    }).catch(() => {});
  }, []);

  // ── Add ───────────────────────────────────────────────────────────────────

  function openAdd() {
    setAddOpen(true); setAddStep(1);
    setNewEmail(""); setNewName("");
    const firstNonAdmin = roleOptions.find(r => !r.is_admin);
    setNewRoleId(firstNonAdmin?.id ?? roleOptions[0]?.id ?? "");
    setNewPerms({});
    setNewDivIds([]);
    setAddErr(null);
  }

  function nextStep() {
    if (!newEmail.trim()) { setAddErr("Email is required."); return; }
    setAddErr(null);
    setAddStep(2);
  }

  async function createUser(sendInvite: boolean) {
    setAddSaving(true); setAddErr(null);
    const selectedRole = roleOptions.find(r => r.id === newRoleId);
    const rolePerms = selectedRole?.permissions ?? {};
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: newEmail.trim(),
        full_name: newName.trim() || null,
        role: selectedRole?.name ?? "",
        role_id: newRoleId || null,
        permissions: cleanOverrides(rolePerms, newPerms),
        allowed_division_ids: newDivIds.length > 0 ? newDivIds : null,
        send_invite: sendInvite,
      }),
    });
    const json = await res.json();
    if (!res.ok) { setAddErr(json.error ?? "Failed to create user."); setAddSaving(false); return; }
    setAddOpen(false);
    await load();
    setAddSaving(false);
    if (json.emailWarning) alert(`User created but invite email failed: ${json.emailWarning}`);
  }

  // ── Edit ──────────────────────────────────────────────────────────────────

  function openEdit(user: UserProfile) {
    setEditing(user);
    setEditName(user.full_name ?? "");
    setEditRoleId(user.role_id ?? "");
    setEditActive(user.is_active);
    setEditPerms(user.permissions ?? {});
    setEditDivIds(user.allowed_division_ids ?? []);
    setEditErr(null);
    setConfirmDelete(false);
  }

  async function saveEdit() {
    if (!editing) return;
    setEditSaving(true); setEditErr(null);
    const selectedRole = roleOptions.find(r => r.id === editRoleId);
    const rolePerms = selectedRole?.permissions ?? {};
    const res = await fetch(`/api/users/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: selectedRole?.name ?? editing.role,
        role_id: editRoleId || null,
        is_active: editActive,
        permissions: cleanOverrides(rolePerms, editPerms),
        full_name: editName.trim() || null,
        allowed_division_ids: editDivIds.length > 0 ? editDivIds : null,
      }),
    });
    const json = await res.json();
    if (!res.ok) { setEditErr(json.error ?? "Failed to save."); setEditSaving(false); return; }
    setEditing(null);
    await load();
    setEditSaving(false);
  }

  async function deleteUser() {
    if (!editing) return;
    setEditSaving(true); setEditErr(null);
    const res = await fetch(`/api/users/${editing.id}`, { method: "DELETE" });
    if (!res.ok) { setEditErr("Failed to delete."); setEditSaving(false); return; }
    setEditing(null);
    await load();
    setEditSaving(false);
  }

  async function sendInvite(user: UserProfile) {
    setInviteSending(user.id);
    const res = await fetch(`/api/users/${user.id}/invite`, { method: "POST" });
    if (!res.ok) alert("Failed to send invite.");
    await load();
    setInviteSending(null);
  }

  // ── Groups ────────────────────────────────────────────────────────────────

  const pending  = users.filter(u => u.invite_sent === false);
  const active   = users.filter(u => u.invite_sent !== false && u.is_active);
  const inactive = users.filter(u => u.invite_sent !== false && !u.is_active);

  const inputCls = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 bg-white";
  const labelCls = "block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide";

  return (
    <AccessGate permKey="users_view">
    <div className="p-4 md:p-8 space-y-6 max-w-5xl">

      {/* Header */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
            <p className="mt-1 text-sm text-gray-500">Create users, configure access, then send the invite.</p>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add User
          </button>
        </div>
      </div>

      {/* Pending users */}
      {pending.length > 0 && (
        <div className="bg-amber-50 rounded-2xl border border-amber-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-amber-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <h2 className="font-bold text-amber-800 text-sm">Pending — Invite Not Sent</h2>
            </div>
            <span className="text-xs text-amber-600 font-medium">{pending.length}</span>
          </div>
          <div className="divide-y divide-amber-100">
            {pending.map(user => (
              <div key={user.id} className="flex items-center gap-3 px-6 py-3.5">
                <div className="w-8 h-8 rounded-full bg-amber-200 flex items-center justify-center text-amber-800 text-xs font-bold shrink-0">
                  {userInitials(user)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm">{user.full_name || "—"}</div>
                  <div className="text-gray-400 text-xs">{user.email}</div>
                </div>
                <span className={`hidden sm:inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${roleStyle(user.role)}`}>
                  {roleLabel(user.role)}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => openEdit(user)}
                    className="text-xs text-gray-400 hover:text-gray-700 font-medium transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white border border-transparent hover:border-gray-200"
                  >
                    Edit Access
                  </button>
                  <button
                    onClick={() => sendInvite(user)}
                    disabled={inviteSending === user.id}
                    className="text-xs bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold px-3 py-1.5 rounded-lg transition-all"
                  >
                    {inviteSending === user.id ? "Sending…" : "Send Invite"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active users */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Active Users</h2>
          <span className="text-xs text-gray-400 font-medium">{active.length}</span>
        </div>
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />)}
          </div>
        ) : active.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-400">No active users yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-50">
                  <th className="text-left px-6 py-3">User</th>
                  <th className="text-left px-6 py-3">Role</th>
                  <th className="text-left px-6 py-3 hidden sm:table-cell">Joined</th>
                  <th className="text-right px-6 py-3" />
                </tr>
              </thead>
              <tbody>
                {active.map(user => (
                  <tr key={user.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {userInitials(user)}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{user.full_name || "—"}</div>
                          <div className="text-gray-400 text-xs">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${roleStyle(user.role)}`}>
                          {roleLabel(user.role)}
                        </span>
                        {Object.keys(user.permissions ?? {}).length > 0 && (
                          <span className="text-[10px] text-amber-500 font-semibold uppercase tracking-wide">custom</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-gray-400 text-xs hidden sm:table-cell">{fmtDate(user.created_at)}</td>
                    <td className="px-6 py-3.5 text-right">
                      <button onClick={() => openEdit(user)} className="text-xs text-gray-400 hover:text-green-700 font-medium transition-colors">
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inactive users */}
      {inactive.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden opacity-70">
          <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
            <h2 className="font-bold text-gray-500">Deactivated Users</h2>
            <span className="text-xs text-gray-400">{inactive.length}</span>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {inactive.map(user => (
                <tr key={user.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {userInitials(user)}
                      </div>
                      <div>
                        <div className="font-medium text-gray-400">{user.full_name || "—"}</div>
                        <div className="text-gray-300 text-xs">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${roleStyle(user.role)}`}>
                      {roleLabel(user.role)}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-gray-300 text-xs hidden sm:table-cell">{fmtDate(user.created_at)}</td>
                  <td className="px-6 py-3.5 text-right">
                    <button onClick={() => openEdit(user)} className="text-xs text-gray-300 hover:text-green-700 font-medium transition-colors">
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add User Drawer ─────────────────────────────────────────────────── */}
      <Drawer open={addOpen} onClose={() => setAddOpen(false)}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Add User</h2>
            <div className="flex items-center gap-2 mt-1.5">
              {([1, 2] as const).map(n => (
                <div key={n} className="flex items-center gap-1.5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                    addStep >= n ? "bg-green-600 text-white" : "bg-gray-100 text-gray-400"
                  }`}>{n}</div>
                  <span className={`text-xs font-medium transition-colors ${addStep >= n ? "text-gray-700" : "text-gray-300"}`}>
                    {n === 1 ? "Info" : "Permissions"}
                  </span>
                  {n < 2 && <span className="text-gray-200 text-xs mx-0.5">›</span>}
                </div>
              ))}
            </div>
          </div>
          <button onClick={() => setAddOpen(false)} className="text-gray-400 hover:text-gray-600">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {addStep === 1 ? (
            <>
              <div>
                <label className={labelCls}>Email *</label>
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                  placeholder="user@garpielgroup.com" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Full Name</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="Jane Smith" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Role</label>
                <select value={newRoleId} onChange={e => { setNewRoleId(e.target.value); setNewPerms({}); }}
                  className={inputCls}>
                  {roleOptions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <p className="mt-1.5 text-xs text-gray-400">Role sets default permissions. Customize them in the next step.</p>
              </div>

              {/* Role permission summary */}
              {(() => {
                const selectedRole = roleOptions.find(r => r.id === newRoleId);
                const rolePerms = selectedRole?.permissions ?? {};
                return (
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{selectedRole?.name ?? ""} — default access</p>
                    {selectedRole?.is_admin ? (
                      <p className="text-xs text-purple-600 font-medium">Admin has full access to everything.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {SECTIONS.map(section => {
                          const count = section.perms.filter(p => rolePerms[p.key]).length;
                          return (
                            <span key={section.id} className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                              count > 0
                                ? "bg-white border-gray-200 text-gray-700"
                                : "bg-white border-gray-100 text-gray-300"
                            }`}>
                              {section.label}
                              {count > 0
                                ? <span className="text-green-600 ml-1">{count}/{section.perms.length}</span>
                                : <span className="ml-1">—</span>
                              }
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Configuring access for <span className="font-semibold text-gray-800">{newName || newEmail}</span>
                </p>
                <button onClick={() => setNewPerms({})} className="text-xs text-green-600 hover:underline font-medium shrink-0">
                  Reset to defaults
                </button>
              </div>
              <PermissionsPanel rolePerms={roleOptions.find(r => r.id === newRoleId)?.permissions ?? {}} overrides={newPerms} onChange={setNewPerms} />
              <DivisionPicker divisions={divisions} selected={newDivIds} onChange={setNewDivIds} />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 space-y-2.5 shrink-0">
          {addErr && <p className="text-red-500 text-sm">{addErr}</p>}
          {addStep === 1 ? (
            <div className="flex gap-3">
              <button onClick={() => setAddOpen(false)}
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all">
                Cancel
              </button>
              <button onClick={nextStep}
                className="flex-1 bg-[#123b1f] hover:bg-[#0d2616] text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all">
                Next: Set Permissions →
              </button>
            </div>
          ) : (
            <>
              <button onClick={() => createUser(true)} disabled={addSaving}
                className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all">
                {addSaving ? "Creating…" : "Create & Send Invite"}
              </button>
              <button onClick={() => createUser(false)} disabled={addSaving}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-all">
                Create (Send Invite Later)
              </button>
              <button onClick={() => setAddStep(1)}
                className="w-full text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors">
                ← Back to Info
              </button>
            </>
          )}
        </div>
      </Drawer>

      {/* ── Edit User Drawer ────────────────────────────────────────────────── */}
      <Drawer open={!!editing} onClose={() => setEditing(null)}>
        {editing && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-green-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {userInitials(editing)}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-gray-900 truncate">{editing.full_name || editing.email}</div>
                  <div className="text-gray-400 text-xs truncate">{editing.email}</div>
                </div>
              </div>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600 shrink-0 ml-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div>
                <label className={labelCls}>Full Name</label>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                  placeholder="Jane Smith" className={inputCls} />
              </div>

              <div>
                <label className={labelCls}>Role</label>
                <select value={editRoleId} onChange={e => { setEditRoleId(e.target.value); setEditPerms({}); }}
                  className={inputCls}>
                  {roleOptions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <p className="mt-1.5 text-xs text-gray-400">Changing role resets permissions to that role&apos;s defaults.</p>
              </div>

              <div className="flex items-center gap-3">
                <button onClick={() => setEditActive(a => !a)}
                  className={`relative w-10 h-6 rounded-full transition-colors ${editActive ? "bg-green-500" : "bg-gray-200"}`}>
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${editActive ? "left-5" : "left-1"}`} />
                </button>
                <span className="text-sm text-gray-700">{editActive ? "Active" : "Deactivated"}</span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className={labelCls} style={{ margin: 0 }}>Permissions</label>
                  <button onClick={() => setEditPerms({})} className="text-xs text-green-600 hover:underline font-medium">
                    Reset to role defaults
                  </button>
                </div>
                <PermissionsPanel rolePerms={roleOptions.find(r => r.id === editRoleId)?.permissions ?? {}} overrides={editPerms} onChange={setEditPerms} />
              </div>

              <DivisionPicker divisions={divisions} selected={editDivIds} onChange={setEditDivIds} />
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 space-y-3 shrink-0">
              {editErr && <p className="text-red-500 text-sm">{editErr}</p>}
              <div className="flex gap-3">
                <button onClick={() => setEditing(null)}
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all">
                  Cancel
                </button>
                <button onClick={saveEdit} disabled={editSaving}
                  className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all">
                  {editSaving ? "Saving…" : "Save Changes"}
                </button>
              </div>
              {!confirmDelete ? (
                <button onClick={() => setConfirmDelete(true)}
                  className="w-full text-xs text-red-400 hover:text-red-600 font-medium transition-colors py-1">
                  Delete user permanently
                </button>
              ) : (
                <div className="flex gap-2 items-center bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                  <span className="text-xs text-red-600 flex-1">This permanently removes them from Atlas.</span>
                  <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400 hover:text-gray-600 font-medium">Cancel</button>
                  <button onClick={deleteUser} disabled={editSaving}
                    className="text-xs bg-red-500 hover:bg-red-600 text-white font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50">
                    {editSaving ? "…" : "Confirm Delete"}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </Drawer>

    </div>
    </AccessGate>
  );
}
