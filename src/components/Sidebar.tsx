"use client";

import { useEffect, useMemo, useState } from "react";
import type React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useUser } from "@/lib/userContext";

type Child = { label: string; href: string; badge?: string; permKey?: string; adminOnly?: boolean };
type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  poweredBy?: string;
  permKey?: string;
  children?: Child[];
};

const NAV: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    permKey: "dashboard",
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
    permKey: "bids_view",
    icon: <Image src="/atlas-bid-logo.png" alt="AtlasBid" width={18} height={18} className="object-contain" />,
  },
  {
    label: "Takeoff",
    href: "/atlastakeoff",
    permKey: "takeoff_view",
    icon: <Image src="/atlas-takeoff-logo.png" alt="AtlasTakeoff" width={18} height={18} className="object-contain" />,
  },
  {
    label: "Materials",
    href: "/operations-center/materials-catalog",
    permKey: "mat_catalog_view",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a10 10 0 0 1 10 10" /><path d="M12 2a10 10 0 0 0-6.88 17.24" />
        <path d="M12 8c-2.5 2-3.5 4.5-2 7.5" /><path d="M12 8c2 1.5 4 4 3 7" />
        <circle cx="12" cy="19" r="1" />
      </svg>
    ),
    children: [
      { label: "Catalog", href: "/operations-center/materials-catalog", permKey: "mat_catalog_view" },
      { label: "Inventory", href: "/operations-center/inventory", permKey: "mat_inventory_view" },
      { label: "Pricing Books", href: "/operations-center/materials-catalog/pricing-books", permKey: "mat_pricing_view" },
    ],
  },
  {
    label: "Atlas HR",
    href: "/operations-center/atlas-time",
    permKey: "hr_team_view",
    poweredBy: "Powered by Kolka",
    icon: (
      <div style={{ background: "rgba(255,255,255,0.9)", borderRadius: 5, padding: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Image src="/atlas-hr-logo.png" alt="Atlas HR" width={18} height={18} className="object-contain" />
      </div>
    ),
    children: [
      { label: "Team Members", href: "/operations-center/atlas-time/employees", permKey: "hr_team_view" },
      { label: "Time Clock (Kiosk)", href: "/operations-center/atlas-time/punch", permKey: "hr_kiosk" },
      { label: "Manager View", href: "/operations-center/atlas-time/clock", permKey: "hr_manager" },
      { label: "Departments", href: "/operations-center/atlas-time/departments", permKey: "hr_dept_view" },
      { label: "Profile Settings", href: "/operations-center/atlas-time/profile-settings" },
      { label: "Time Clock Settings", href: "/operations-center/atlas-time/settings", permKey: "hr_settings" },
      { label: "Import", href: "/operations-center/atlas-time/import", permKey: "hr_import" },
      { label: "Timesheets", href: "/operations-center/atlas-time/timesheets", permKey: "hr_timesheets_view" },
      { label: "PTO & Time Off", href: "/operations-center/atlas-time/pto", permKey: "hr_pto_view", badge: "P4" },
      { label: "Payroll", href: "/operations-center/atlas-time/payroll", permKey: "hr_payroll_view" },
      { label: "Uniforms", href: "/operations-center/atlas-time/uniforms", permKey: "hr_team_view" },
      { label: "Reports", href: "/operations-center/atlas-time/reports", permKey: "hr_reports" },
    ],
  },
  {
    label: "Performance",
    href: "/atlasperformance",
    permKey: "perf_view",
    icon: <Image src="/atlas-performance-logo.png" alt="Performance" width={18} height={18} className="object-contain" />,
  },
  {
    label: "Users",
    href: "/operations-center/users",
    permKey: "users_view",
    children: [
      { label: "All Users", href: "/operations-center/users", permKey: "users_view" },
      { label: "Roles & Permissions", href: "/operations-center/roles", permKey: "users_permissions", adminOnly: true },
    ],
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

const SETTINGS_ITEM: NavItem = {
  label: "Settings",
  href: "/operations-center",
  permKey: "settings_view",
  icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
    </svg>
  ),
  children: [
    { label: "All Settings", href: "/operations-center", permKey: "settings_view" },
    { label: "Sports Ticker", href: "/operations-center/sports-ticker", permKey: "settings_view" },
  ],
};

type OpsDiv = { id: string; name: string };

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, can } = useUser();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [opsDivisions, setOpsDivisions] = useState<OpsDiv[]>([]);

  useEffect(() => {
    fetch("/api/operations-center/divisions", { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        const ops = (d.data ?? []).filter((div: any) => div.show_in_ops && div.active) as OpsDiv[];
        setOpsDivisions(ops);
      })
      .catch(() => {});
  }, []);

  const fullNav = useMemo<NavItem[]>(() => {
    if (!opsDivisions.length) return NAV;
    const opsItem: NavItem = {
      label: "Operations",
      href: "/operations-center/atlas-ops",
      icon: <Image src="/atlas-ops-logo.png" alt="Atlas Ops" width={18} height={18} className="object-contain" />,
      children: opsDivisions.map(d => ({
        label: d.name,
        href: `/operations-center/atlas-ops/${d.name.toLowerCase().replace(/\s+/g, "-")}`,
      })),
    };
    return [...NAV.slice(0, 4), opsItem, ...NAV.slice(4)];
  }, [opsDivisions]);

  // Auto-expand groups whose children include the current path
  useEffect(() => {
    const toOpen = new Set<string>();
    for (const item of fullNav) {
      if (item.children?.some(c => pathname === c.href || pathname.startsWith(c.href + "/"))) {
        toOpen.add(item.href);
      }
    }
    setOpenGroups(prev => {
      const next = new Set(prev);
      toOpen.forEach(h => next.add(h));
      return next;
    });
  }, [pathname, fullNav]);

  function toggleGroup(href: string) {
    setOpenGroups(prev => {
      const next = new Set(prev);
      next.has(href) ? next.delete(href) : next.add(href);
      return next;
    });
  }

  async function signOut() {
    await getSupabaseClient().auth.signOut();
    router.push("/");
  }

  const email = user?.email ?? null;
  const fullName = user?.full_name ?? null;
  const displayName = fullName?.trim() ||
    (email ? email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "");
  const initials = fullName
    ? fullName.trim().split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
    : email ? email.substring(0, 2).toUpperCase() : "…";

  // Filter nav items by permission.
  // While loading: show nothing (avoid flashing all items).
  // For parent groups: visible only if at least one permKey-gated child passes.
  // Children with no permKey are always shown once the parent is visible, but
  // don't count toward making the parent visible on their own.
  const isAdmin = user?.role_is_admin ?? false;
  function childVisible(c: Child) {
    if (c.adminOnly && !isAdmin) return false;
    return !c.permKey || can(c.permKey);
  }

  const visibleNav = loading
    ? []
    : fullNav.filter(item => {
        if (item.children?.length) {
          // Items with no permKey children (like Operations) are always visible
          const hasGatedChild = item.children.some(c => c.permKey);
          if (!hasGatedChild) return true;
          return item.children.some(c => c.permKey && childVisible(c));
        }
        return !item.permKey || can(item.permKey);
      });

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
        <button onClick={() => setCollapsed(c => !c)} className="text-white/40 hover:text-white/80 transition-colors ml-auto">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {collapsed
              ? <><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></>
              : <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
            }
          </svg>
        </button>
      </div>

      <div className="mx-4 mb-4 border-t border-white/10" />

      {/* Nav */}
      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        {visibleNav.map(item => {
          const visibleChildren = item.children?.filter(c => childVisible(c));
          const hasChildren = !!visibleChildren?.length;
          const isOpen = openGroups.has(item.href);
          const childActive = visibleChildren?.some(c => pathname === c.href || pathname.startsWith(c.href + "/"));
          const selfActive = !hasChildren && (
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href) &&
              !NAV.some(o => o.href !== item.href && o.href.startsWith(item.href) && pathname.startsWith(o.href)))
          );
          const active = selfActive || (!hasChildren && childActive);
          const groupHighlighted = hasChildren && childActive;

          if (item.children && hasChildren) {
            return (
              <div key={item.href}>
                {/* Parent row */}
                <div className={`flex items-center rounded-lg transition-all ${groupHighlighted ? "bg-white/10" : "hover:bg-white/8"}`}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium flex-1 min-w-0 group ${groupHighlighted ? "text-white" : "text-white/60 hover:text-white"}`}
                  >
                    <span className={`shrink-0 ${groupHighlighted ? "text-green-300" : "text-white/50 group-hover:text-white/80"}`}>
                      {item.icon}
                    </span>
                    {!collapsed && (
                      <span className="truncate flex-1 min-w-0">
                        {item.label}
                        {item.poweredBy && <em className="block text-[9px] not-italic font-normal text-white/35 leading-tight">{item.poweredBy}</em>}
                      </span>
                    )}
                  </Link>
                  {!collapsed && (
                    <button
                      onClick={() => toggleGroup(item.href)}
                      className="shrink-0 px-2 py-2.5 text-white/30 hover:text-white/60 transition-colors"
                    >
                      <svg
                        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round"
                        className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Children */}
                {isOpen && !collapsed && (
                  <div className="pl-4 mt-0.5 mb-1">
                    <div className="border-l border-white/10 ml-3 space-y-0.5 pl-2">
                      {visibleChildren!.map(child => {
                        const cActive = pathname === child.href || pathname.startsWith(child.href + "/");
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={onClose}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              cActive ? "bg-white/12 text-white" : "text-white/45 hover:text-white/80 hover:bg-white/6"
                            }`}
                          >
                            <span className="truncate">{child.label}</span>
                            <span className="flex items-center gap-1.5 shrink-0 ml-1">
                              {child.badge && (
                                <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-white/10 text-white/30">{child.badge}</span>
                              )}
                              {cActive && <span className="w-1 h-1 rounded-full bg-green-400" />}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
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
                active ? "bg-white/15 text-white shadow-sm" : "text-white/60 hover:text-white hover:bg-white/10"
              }`}
            >
              <span className={`shrink-0 ${active ? "text-green-300" : "text-white/50 group-hover:text-white/80"}`}>
                {item.icon}
              </span>
              {!collapsed && (
                <span className="truncate flex-1 min-w-0">
                  {item.label}
                  {item.poweredBy && <em className="block text-[9px] not-italic font-normal text-white/35 leading-tight">{item.poweredBy}</em>}
                </span>
              )}
              {active && !collapsed && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />}
            </Link>
          );
        })}
      </nav>

      {/* Settings — always pinned above bottom */}
      {(!SETTINGS_ITEM.permKey || can(SETTINGS_ITEM.permKey)) && (() => {
        const item = SETTINGS_ITEM;
        const visibleChildren = item.children?.filter(c => !c.permKey || can(c.permKey));
        const hasChildren = !!visibleChildren?.length;
        const isOpen = openGroups.has(item.href);
        const childActive = visibleChildren?.some(c => pathname === c.href || pathname.startsWith(c.href + "/"));
        const selfActive = pathname === item.href || pathname.startsWith(item.href + "/");
        const groupHighlighted = hasChildren && childActive;
        return (
          <div className="px-2 pt-1 border-t border-white/10">
            {hasChildren ? (
              <div>
                <div className={`flex items-center rounded-lg transition-all ${groupHighlighted ? "bg-white/10" : "hover:bg-white/8"}`}>
                  <Link href={item.href} onClick={onClose} title={collapsed ? item.label : undefined}
                    className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium flex-1 min-w-0 group ${groupHighlighted ? "text-white" : "text-white/60 hover:text-white"}`}>
                    <span className={`shrink-0 ${groupHighlighted ? "text-green-300" : "text-white/50 group-hover:text-white/80"}`}>{item.icon}</span>
                    {!collapsed && <span className="truncate flex-1 min-w-0">{item.label}</span>}
                  </Link>
                  {!collapsed && (
                    <button onClick={() => toggleGroup(item.href)} className="shrink-0 px-2 py-2.5 text-white/30 hover:text-white/60 transition-colors">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  )}
                </div>
                {isOpen && !collapsed && (
                  <div className="pl-4 mt-0.5 mb-1">
                    <div className="border-l border-white/10 ml-3 space-y-0.5 pl-2">
                      {visibleChildren!.map(child => {
                        const cActive = pathname === child.href || pathname.startsWith(child.href + "/");
                        return (
                          <Link key={child.href} href={child.href} onClick={onClose}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              cActive ? "bg-white/12 text-white" : "text-white/45 hover:text-white/80 hover:bg-white/6"
                            }`}>
                            <span className="truncate">{child.label}</span>
                            {cActive && <span className="w-1 h-1 rounded-full bg-green-400 shrink-0 ml-1" />}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link href={item.href} onClick={onClose} title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                  selfActive ? "bg-white/15 text-white shadow-sm" : "text-white/60 hover:text-white hover:bg-white/10"
                }`}>
                <span className={`shrink-0 ${selfActive ? "text-green-300" : "text-white/50 group-hover:text-white/80"}`}>{item.icon}</span>
                {!collapsed && <span className="truncate flex-1 min-w-0">{item.label}</span>}
                {selfActive && !collapsed && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />}
              </Link>
            )}
          </div>
        );
      })()}

      {/* Bottom */}
      <div className="px-2 pb-8 space-y-1 border-t border-white/10 pt-3 mt-2" style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}>
        <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg ${collapsed ? "justify-center" : ""}`}>
          <div className="w-7 h-7 rounded-full bg-green-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {initials}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-white text-xs font-semibold truncate">{displayName}</div>
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
