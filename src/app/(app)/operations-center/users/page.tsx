"use client";

import { useEffect, useState } from "react";

type Role = "admin" | "sales" | "sales_coordinator" | "production";

type UserProfile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
};

const ROLES: { value: Role; label: string; color: string }[] = [
  { value: "admin",             label: "Admin",             color: "bg-purple-50 text-purple-700 border-purple-200" },
  { value: "sales",             label: "Sales",             color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "sales_coordinator", label: "Sales Coordinator", color: "bg-sky-50 text-sky-700 border-sky-200" },
  { value: "production",        label: "Production",        color: "bg-amber-50 text-amber-700 border-amber-200" },
];

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

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("sales");

  // Edit modal
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [editRole, setEditRole] = useState<Role>("sales");
  const [editActive, setEditActive] = useState(true);

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
  }

  function openEdit(user: UserProfile) {
    setEditing(user);
    setEditRole(user.role);
    setEditActive(user.is_active);
    setErr(null);
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true); setErr(null);
    const res = await fetch(`/api/users/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: editRole, is_active: editActive }),
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
    <div className="p-8 space-y-6 max-w-5xl">

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
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="user@garpielgroup.com"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Full Name</label>
                <input
                  type="text"
                  value={inviteName}
                  onChange={e => setInviteName(e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Role</label>
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value as Role)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 bg-white"
                >
                  {ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {err && <p className="text-red-500 text-sm">{err}</p>}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowInvite(false)}
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={invite}
                disabled={saving}
                className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all"
              >
                {saving ? "Sending…" : "Send Invite"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Edit User</h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <div className="w-9 h-9 rounded-full bg-green-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                {initials(editing)}
              </div>
              <div>
                <div className="font-semibold text-gray-900 text-sm">{editing.full_name || editing.email}</div>
                <div className="text-gray-400 text-xs">{editing.email}</div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Role</label>
                <select
                  value={editRole}
                  onChange={e => setEditRole(e.target.value as Role)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 bg-white"
                >
                  {ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setEditActive(a => !a)}
                  className={`relative w-10 h-6 rounded-full transition-colors ${editActive ? "bg-green-500" : "bg-gray-200"}`}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${editActive ? "left-5" : "left-1"}`} />
                </button>
                <span className="text-sm text-gray-700">{editActive ? "Active" : "Deactivated"}</span>
              </div>
            </div>

            {err && <p className="text-red-500 text-sm">{err}</p>}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setEditing(null)}
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active users */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Active Users</h2>
          <span className="text-xs text-gray-400 font-medium">{active.length} {active.length === 1 ? "user" : "users"}</span>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : active.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-400">No users yet. Invite your first teammate.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-50">
                <th className="text-left px-6 py-3">User</th>
                <th className="text-left px-6 py-3">Role</th>
                <th className="text-left px-6 py-3">Joined</th>
                <th className="text-right px-6 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {active.map(user => (
                <tr key={user.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-3.5">
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
                  <td className="px-6 py-3.5">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${roleStyle(user.role)}`}>
                      {roleLabel(user.role)}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-gray-400 text-xs">{fmtDate(user.created_at)}</td>
                  <td className="px-6 py-3.5 text-right">
                    <button
                      onClick={() => openEdit(user)}
                      className="text-xs text-gray-400 hover:text-green-700 font-medium transition-colors"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                    <button
                      onClick={() => openEdit(user)}
                      className="text-xs text-gray-300 hover:text-green-700 font-medium transition-colors"
                    >
                      Reactivate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Role legend */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-bold text-gray-900 text-sm mb-3">Role Permissions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="p-3 rounded-xl bg-purple-50 border border-purple-100">
            <div className="font-semibold text-purple-700 mb-1">Admin</div>
            <div className="text-purple-600/70 text-xs leading-relaxed">Full access — users, settings, all bids, all operations.</div>
          </div>
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
            <div className="font-semibold text-blue-700 mb-1">Sales</div>
            <div className="text-blue-600/70 text-xs leading-relaxed">Create and manage bids, view materials catalog, view inventory.</div>
          </div>
          <div className="p-3 rounded-xl bg-sky-50 border border-sky-100">
            <div className="font-semibold text-sky-700 mb-1">Sales Coordinator</div>
            <div className="text-sky-600/70 text-xs leading-relaxed">View and edit bids, send proposals. Cannot create new bids or access settings.</div>
          </div>
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
            <div className="font-semibold text-amber-700 mb-1">Production</div>
            <div className="text-amber-600/70 text-xs leading-relaxed">View won jobs, log inventory receipts. No access to pricing or bid creation.</div>
          </div>
        </div>
      </div>

    </div>
  );
}
