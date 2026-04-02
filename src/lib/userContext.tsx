"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type React from "react";
import { getSupabaseClient } from "./supabaseClient";
import { can as _can, type Permissions } from "./permissions";
import { isSuperAdmin } from "./superAdmin";

export type UserProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null; // legacy text role
  role_id: string | null;
  role_name: string | null;
  role_is_admin: boolean;
  role_permissions: Permissions;
  permissions: Permissions; // per-user overrides
  allowed_division_ids: string[] | null; // null = no restriction
  is_super_admin: boolean;
};

type UserContextValue = {
  user: UserProfile | null;
  loading: boolean;
  can: (key: string) => boolean;
};

const UserContext = createContext<UserContextValue>({
  user: null,
  loading: true,
  can: () => true,
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sb = getSupabaseClient();

    async function load() {
      const { data } = await sb.auth.getSession();
      const token = data.session?.access_token;
      if (!token) { setLoading(false); return; }

      const res = await fetch("/api/users/me", {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
      const json = await res?.json().catch(() => null);

      if (json?.data) setUser({ ...json.data, is_super_admin: isSuperAdmin(json.data.email) });
      setLoading(false);
    }

    load();

    function onVisible() { if (document.visibilityState === "visible") load(); }
    document.addEventListener("visibilitychange", onVisible);

    const { data: { subscription } } = sb.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED") load();
      if (event === "SIGNED_OUT") { setUser(null); setLoading(false); }
    });

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      subscription.unsubscribe();
    };
  }, []);

  function can(key: string): boolean {
    if (loading) return true;
    if (!user) return false;
    if (user.is_super_admin) return true;
    // Fall back to legacy role check if role_id not yet migrated
    if (!user.role_id && user.role === "admin") return true;
    return _can(user.role_is_admin, user.role_permissions ?? {}, user.permissions ?? {}, key);
  }

  return (
    <UserContext.Provider value={{ user, loading, can }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
