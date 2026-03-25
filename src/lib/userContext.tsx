"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type React from "react";
import { getSupabaseClient } from "./supabaseClient";
import { can as _can, type Role, type Permissions } from "./permissions";

export type UserProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  permissions: Permissions;
};

type UserContextValue = {
  user: UserProfile | null;
  loading: boolean;
  /** Returns true if the current user has the given permission key. Always true while loading (avoid false flashes). */
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

      if (json?.data) setUser(json.data);
      setLoading(false);
    }

    load();

    // Re-fetch when tab becomes visible again (picks up permission changes made elsewhere)
    function onVisible() { if (document.visibilityState === "visible") load(); }
    document.addEventListener("visibilitychange", onVisible);

    // Reload if auth state changes (e.g. token refresh)
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
    if (loading) return true; // don't flash "access denied" while loading
    if (!user) return false;
    return _can(user.role, user.permissions ?? {}, key);
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
