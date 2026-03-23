"use client";

import { useEffect, useState } from "react";
import type React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";

const NAV: { label: string; href: string; icon: React.ReactNode; sub?: boolean }[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    label: "Bids",
    href: "/atlasbid/bids",
    icon: (
      <Image src="/atlas-bid-logo.png" alt="AtlasBid" width={18} height={18} className="object-contain" />
    ),
  },
  {
    label: "Takeoff",
    href: "/atlastakeoff",
    icon: (
      <Image src="/atlas-takeoff-icon.png" alt="AtlasTakeoff" width={18} height={18} className="object-contain" />
    ),
  },
  {
    label: "Inventory",
    href: "/operations-center/inventory",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
  },
  {
    label: "Materials",
    href: "/operations-center/materials-catalog",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a10 10 0 0 1 10 10" /><path d="M12 2a10 10 0 0 0-6.88 17.24" />
        <path d="M12 8c-2.5 2-3.5 4.5-2 7.5" /><path d="M12 8c2 1.5 4 4 3 7" />
        <circle cx="12" cy="19" r="1" />
      </svg>
    ),
  },
  {
    label: "Pricing Books",
    href: "/operations-center/materials-catalog/pricing-books",
    sub: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  {
    label: "Operations",
    href: "/operations-center",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
      </svg>
    ),
  },
  {
    label: "Performance",
    href: "/atlasperformance",
    icon: (
      <Image src="/atlas-performance-logo.png" alt="Performance" width={18} height={18} className="object-contain" />
    ),
  },
  {
    label: "Users",
    href: "/operations-center/users",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
];

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const sb = getSupabaseClient();
    sb.auth.getSession().then(async ({ data }) => {
      const user = data.session?.user;
      setEmail(user?.email ?? null);
      const token = data.session?.access_token;
      if (token) {
        const res = await fetch("/api/users/me", {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null);
        const json = await res?.json().catch(() => null);
        setFullName(json?.data?.full_name ?? null);
      }
    });
    const { data: listener } = sb.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await getSupabaseClient().auth.signOut();
    router.push("/");
  }

  const displayName = fullName?.trim() ||
    (email ? email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "");
  const initials = fullName
    ? fullName.trim().split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
    : email ? email.substring(0, 2).toUpperCase() : "…";
  const username = displayName;

  return (
    <aside
      className="flex flex-col sticky top-0 shrink-0 transition-all duration-300"
      style={{ width: collapsed ? 64 : 220, height: "100dvh", background: "linear-gradient(180deg, #0d2616 0%, #123b1f 60%, #0f3019 100%)" }}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 pt-5 pb-4">
        {!collapsed && (
          <div className="flex items-center justify-center flex-1">
            <div style={{ background: "rgba(255,255,255,0.92)", borderRadius: 12, padding: "6px 14px" }}>
              <Image src="/atlas-logo-transparent.png" alt="Atlas" width={100} height={66} style={{ objectFit: "contain", display: "block" }} />
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="text-white/40 hover:text-white/80 transition-colors ml-auto"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {collapsed
              ? <><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></>
              : <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
            }
          </svg>
        </button>
      </div>

      {/* Divider */}
      <div className="mx-4 mb-4 border-t border-white/10" />

      {/* Nav */}
      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        {NAV.map(item => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" &&
              pathname.startsWith(item.href) &&
              !NAV.some(
                (other) =>
                  other.href !== item.href &&
                  other.href.startsWith(item.href) &&
                  pathname.startsWith(other.href)
              ));

          if (item.sub) {
            return (
              <div key={item.href} className={collapsed ? "" : "pl-4"}>
                <div className={collapsed ? "" : "border-l border-white/10 ml-1"}>
                  <Link
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    onClick={onClose}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${collapsed ? "justify-center" : "ml-2"} ${
                      active
                        ? "bg-white/10 text-white"
                        : "text-white/45 hover:text-white/80 hover:bg-white/8"
                    }`}
                  >
                    <span className={`shrink-0 ${active ? "text-green-300" : "text-white/40 group-hover:text-white/60"}`}>
                      {item.icon}
                    </span>
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {active && !collapsed && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />}
                  </Link>
                </div>
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                active
                  ? "bg-white/15 text-white shadow-sm"
                  : "text-white/60 hover:text-white hover:bg-white/10"
              }`}
            >
              <span className={`shrink-0 ${active ? "text-green-300" : "text-white/50 group-hover:text-white/80"}`}>
                {item.icon}
              </span>
              {!collapsed && <span className="truncate">{item.label}</span>}
              {active && !collapsed && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-2 pb-8 space-y-1 border-t border-white/10 pt-3 mt-2" style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}>
        {/* User */}
        <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg ${collapsed ? "justify-center" : ""}`}>
          <div className="w-7 h-7 rounded-full bg-green-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {initials}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-white text-xs font-semibold truncate">{username}</div>
              <div className="text-white/40 text-[10px] truncate">{email}</div>
            </div>
          )}
        </div>
        <button
          onClick={signOut}
          title={collapsed ? "Sign out" : undefined}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 text-xs transition-all ${collapsed ? "justify-center" : ""}`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          {!collapsed && "Sign out"}
        </button>
        {!collapsed && (
          <p className="text-center text-[9px] text-white/20 pt-1 tracking-widest uppercase">InterRivus Systems</p>
        )}
      </div>
    </aside>
  );
}
