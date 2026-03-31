"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@/lib/userContext";

const BASE_TABS = [
  { label: "Dashboard",         href: "/operations-center/atlas-ops/lawn" },
  { label: "Upcoming Revenue",  href: "/operations-center/atlas-ops/lawn/upcoming-revenue" },
  { label: "Imports",           href: "/operations-center/atlas-ops/lawn/imports" },
  { label: "Rankings",          href: "/operations-center/atlas-ops/lawn/rankings" },
  { label: "Reports",           href: "/operations-center/atlas-ops/lawn/reports" },
  { label: "COGS",              href: "/operations-center/atlas-ops/lawn/cogs" },
];

const SUPER_ADMIN_EMAIL = "matthew@garpielgroup.com";

const ADMIN_TABS = [
  { label: "Admin Pay",  href: "/operations-center/atlas-ops/lawn/admin-pay" },
];

export default function LawnLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useUser();
  const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL;
  const TABS = isSuperAdmin ? [...BASE_TABS, ...ADMIN_TABS] : BASE_TABS;

  return (
    <div className="flex flex-col min-h-screen">
      <div
        className="no-print shrink-0 border-b border-white/10 overflow-x-auto sticky top-0 z-20"
        style={{ background: "linear-gradient(180deg, #0d2616 0%, #123b1f 100%)" }}
      >
        <div className="flex gap-0.5 px-4 min-w-max">
          {TABS.map((tab) => {
            const exact = tab.href === "/operations-center/atlas-ops/lawn";
            const active = exact
              ? pathname === tab.href
              : pathname === tab.href || pathname.startsWith(tab.href + "/");
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 ${
                  active
                    ? "border-green-400 text-white"
                    : "border-transparent text-white/40 hover:text-white/70"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
