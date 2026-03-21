"use client";

import { useEffect, useState } from "react";

type Role = "admin" | "sales" | "sales_coordinator" | "production";

type Permissions = {
  bids_view?: boolean;
  bids_create?: boolean;
  bids_edit?: boolean;
  bids_delete?: boolean;
  inventory_view?: boolean;
  inventory_edit?: boolean;
  materials_view?: boolean;
  materials_edit?: boolean;
  operations_view?: boolean;
  operations_edit?: boolean;
  users_manage?: boolean;
};

type UserProfile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
  permissions: Permissions;
};

const ROLES: { value: Role; label: string; color: string }[] = [
  { value: "admin",             label: "Admin",             color: "bg-purple-50 text-purple-700 border-purple-200" },
  { value: "sales",             label: "Sales",             color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "sales_coordinator", label: "Sales Coordinator", color: "bg-sky-50 text-sky-700 border-sky-200" },
  { value: "production",        label: "Production",        color: "bg-amber-50 text-amber-700 border-amber-200" },
];

const PERMISSION_GROUPS = [
  {
    label: "Bids",
    perms: [
      { key: "bids_view",   label: "View bids" },
      { key: "bids_create", label: "Create bids" },
      { key: "bids_edit",   label: "Edit bids" },
      { key: "bids_delete", label: "Delete bids" },
    ],
  },
  {
    label: "Inventory",
    perms: [
      { key: "inventory_view", label: "View inventory" },
      { key: "inventory_edit", label: "Log receipts & manage stock" },
    ],
  },
  {
    label: "Materials",
    perms: [
      { key: "materials_view", label: "View materials catalog" },
      { key: "materials_edit", label: "Edit materials catalog" },
    ],
  },
  {
    label: "Operations",
    perms: [
      { key: "operations_view", label: "View Operations Center" },
      { key: "operations_edit", label: "Edit settings & config" },
    ],
  },
  {
    label: "Admin",
    perms: [
      { key: "users_manage", label: "Manage users & permissions" },
    ],
  },
];

// Default permissions per role
const ROLE_DEFAULTS: Record<Role, Permissions> = {
  admin: {
    bids_view: true, bids_create: true, bids_edit: true, bids_delete: true,
    inventory_view: true, inventory_edit: true,
    materials_view: true, materials_edit: true,
    operations_view: true, operations_edit: true,
    users_manage: true,
  },
  sales: {
    bids_view: true, bids_create: true, bids_edit: true, bids_delete: false,
    inventory_view: true, inventory_edit: false,
    materials_view: true, materials_edit: false,
    operations_view: false, operations_edit: false,
    users_manage: false,
  },
  sales_coordinator: {
    bids_view: true, bids_create: false, bids_edit: true, bids_delete: false,
    inventory_view: true, inventory_edit: false,
    materials_view: true, materials_edit: false,
    operations_view: false, operations_edit: false,
    users_manage: false,
  },
  production: {
    bids_view: true, bids_create: false, bids_edit: false, bids_delete: false,
    inventory_view: true, inventory_edit: true,
    materials_view: false, materials_edit: false,
    operations_view: false, operations_edit: false,
    users_manage: false,
  },
};

function resolvedPerms(role: Role, overrides: Permissions): Permissions {
  return { ...ROLE_DEFAULTS[role], ...overrides };
}

function roleStyle(role: Role) {
  return ROLES.find(r => r.value === role)?.color ?? "bg-gray-50 text-gray-700 border-gray-200";
}
function roleLabel(role: Role) {
  return ROLES.find(r => r.value === role)?.label ?? role;
}
function initials(user: UserProfile) {
  if (user.full_name) return user.full_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return user.email.slice(0, 2).toUpperCase();
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("sales");

  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [editRole, setEditRole] = useState<Role>("sales");
  const [editActive, setEditActive] = useState(true);
  const [editPerms, setEditPerms] = useState<Permissions>({});
  const [editName, setEditName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/users");
    const json = await res.json();
    setUsers(json.data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function invite() {
    if (!inviteEmail.trim()) { setErr("Email is required."); return; }
    setSaving(true); setErr(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail.trim(), full_name: inviteName.trim() || null, role: inviteRole }),
    });
    const json = await res.json();
    if (!res.ok) { setErr(json.error ?? "Failed to invite user."); setSaving(false); return; }
    setInviteEmail(""); setInviteName(""); setInviteRole("sales");
    setShowInvite(false);
    await load();
    setSaving(false);
    if (json.emailWarning) {
      alert(`User created but invite email failed: ${json.emailWarning}`);
    }
  }

  function openEdit(user: UserProfile) {
    setEditing(user);
    setEditRole(user.role);
    setEditActive(user.is_active);
    setEditPerms(user.permissions ?? {});
    setEditName(user.full_name ?? "");
    setConfirmDelete(false);
    setErr(null);
  }

  async function deleteUser() {
    if (!editing) return;
    setSaving(true); setErr(null);
    const res = await fetch(`/api/users/${editing.id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) { setErr(json.error ?? "Failed to delete."); setSaving(false); return; }
    setEditing(null);
    setConfirmDelete(false);
    await load();
    setSaving(false);
  }

  function togglePerm(key: string) {
    const current = resolvedPerms(editRole, editPerms);
    const defaultVal = (ROLE_DEFAULTS[editRole] as any)[key] ?? false;
    const currentVal = (current as any)[key] ?? false;
    // If currently matches default, set an explicit override to the opposite
    // If override already exists, toggle it
    setEditPerms(prev => ({ ...prev, [key]: !currentVal }));
  }

  function resetPermsToRole() {
    setEditPerms({});
  }

  // When role changes in the edit modal, clear per-user overrides
  function changeEditRole(role: Role) {
    setEditRole(role);
    setEditPerms({});
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true); setErr(null);

    // Only store overrides that differ from the new role's defaults
    const defaults = ROLE_DEFAULTS[editRole];
    const cleanOverrides: Permissions = {};
    for (const [k, v] of Object.entries(editPerms)) {
      if ((defaults as any)[k] !== v) {
        (cleanOverrides as any)[k] = v;
      }
    }

    const res = await fetch(`/api/users/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: editRole, is_active: editActive, permissions: cleanOverrides, full_name: editName.trim() || null }),
    });
    const json = await res.json();
    if (!res.ok) { setErr(json.error ?? "Failed to save."); setSaving(false); return; }
    setEditing(null);
    await load();
    setSaving(false);
  }

  const active = users.filter(u => u.is_active);
  const inactive = users.filter(u => !u.is_active);

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-5xl">

      {/* Header */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
            <p className="mt-1 text-sm text-gray-500">Invite teammates and manage roles. Access is invite-only.</p>
          </div>
          <button
            onClick={() => { setShowInvite(true); setErr(null); }}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Invite User
          </button>
        </div>
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Invite User</h2>
              <button onClick={() => setShowInvite(false)} className="text-gray-400 hover:text-gray-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Email *</label>
                <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                  placeholder="user@garpielgroup.com"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Full Name</label>
                <input type="text" value={inviteName} onChange={e => setInviteName(e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Role</label>
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value as Role)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 bg-white">
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            </div>
            {err && <p className="text-red-500 text-sm">{err}</p>}
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowInvite(false)}
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all">
                Cancel
              </button>
              <button onClick={invite} disabled={saving}
                className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all">
                {saving ? "Sending…" : "Send Invite"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Edit User</h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

              {/* User info */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="w-9 h-9 rounded-full bg-green-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {initials(editing)}
                </div>
                <div>
                  <div className="font-semibold text-gray-900 text-sm">{editing.full_name || editing.email}</div>
                  <div className="text-gray-400 text-xs">{editing.email}</div>
                </div>
              </div>

              {/* Full name */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Full Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Role</label>
                <select value={editRole} onChange={e => changeEditRole(e.target.value as Role)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 bg-white">
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <p className="mt-1.5 text-xs text-gray-400">Changing role resets permissions to that role&apos;s defaults.</p>
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-3">
                <button onClick={() => setEditActive(a => !a)}
                  className={`relative w-10 h-6 rounded-full transition-colors ${editActive ? "bg-green-500" : "bg-gray-200"}`}>
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${editActive ? "left-5" : "left-1"}`} />
                </button>
                <span className="text-sm text-gray-700">{editActive ? "Active" : "Deactivated"}</span>
              </div>

              {/* Permissions */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Permissions</label>
                  <button onClick={resetPermsToRole} className="text-xs text-green-600 hover:underline font-medium">
                    Reset to role defaults
                  </button>
                </div>

                <div className="space-y-4">
                  {PERMISSION_GROUPS.map(group => {
                    const resolved = resolvedPerms(editRole, editPerms);
                    const defaults = ROLE_DEFAULTS[editRole];
                    return (
                      <div key={group.label}>
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{group.label}</div>
                        <div className="space-y-1.5">
                          {group.perms.map(p => {
                            const val = (resolved as any)[p.key] ?? false;
                            const isOverride = (editPerms as any)[p.key] !== undefined &&
                              (editPerms as any)[p.key] !== (defaults as any)[p.key];
                            return (
                              <label key={p.key} className="flex items-center gap-3 cursor-pointer group">
                                <div
                                  onClick={() => togglePerm(p.key)}
                                  className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                                    val
                                      ? "bg-green-500 border-green-500"
                                      : "border-gray-300 bg-white group-hover:border-gray-400"
                                  }`}
                                >
                                  {val && (
                                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="2 6 5 9 10 3" />
                                    </svg>
                                  )}
                                </div>
                                <span className={`text-sm ${val ? "text-gray-800" : "text-gray-400"}`}>{p.label}</span>
                                {isOverride && (
                                  <span className="text-[10px] text-amber-500 font-semibold uppercase tracking-wide">custom</span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 space-y-3">
              {err && <p className="text-red-500 text-sm">{err}</p>}

              <div className="flex gap-3">
                <button onClick={() => setEditing(null)}
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all">
                  Cancel
                </button>
                <button onClick={saveEdit} disabled={saving}
                  className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all">
                  {saving ? "Saving…" : "Save Changes"}
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
                  <button onClick={deleteUser} disabled={saving}
                    className="text-xs bg-red-500 hover:bg-red-600 text-white font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50">
                    {saving ? "Deleting…" : "Confirm Delete"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Active users table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Active Users</h2>
          <span className="text-xs text-gray-400 font-medium">{active.length} {active.length === 1 ? "user" : "users"}</span>
        </div>
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />)}
          </div>
        ) : active.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-400">No users yet. Invite your first teammate.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-50">
                  <th className="text-left px-4 md:px-6 py-3">User</th>
                  <th className="text-left px-4 md:px-6 py-3">Role</th>
                  <th className="text-left px-4 md:px-6 py-3 hidden sm:table-cell">Joined</th>
                  <th className="text-right px-4 md:px-6 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {active.map(user => (
                  <tr key={user.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 md:px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {initials(user)}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{user.full_name || "—"}</div>
                          <div className="text-gray-400 text-xs">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 md:px-6 py-3.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${roleStyle(user.role)}`}>
                          {roleLabel(user.role)}
                        </span>
                        {user.permissions && Object.keys(user.permissions).length > 0 && (
                          <span className="text-[10px] text-amber-500 font-semibold uppercase tracking-wide">custom</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 md:px-6 py-3.5 text-gray-400 text-xs hidden sm:table-cell">{fmtDate(user.created_at)}</td>
                    <td className="px-4 md:px-6 py-3.5 text-right">
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
            <span className="text-xs text-gray-400 font-medium">{inactive.length}</span>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {inactive.map(user => (
                <tr key={user.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {initials(user)}
                      </div>
                      <div>
                        <div className="font-medium text-gray-400">{user.full_name || "—"}</div>
                        <div className="text-gray-300 text-xs">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    <span className="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold border bg-gray-50 text-gray-400 border-gray-200">
                      {roleLabel(user.role)}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-gray-300 text-xs">{fmtDate(user.created_at)}</td>
                  <td className="px-6 py-3.5 text-right">
                    <button onClick={() => openEdit(user)} className="text-xs text-gray-300 hover:text-green-700 font-medium transition-colors">
                      Reactivate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
