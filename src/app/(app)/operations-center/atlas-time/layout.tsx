"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = {
  label: string;
  href: string;
  exact?: boolean;
  alsoActive?: string[];
};

const TABS: Tab[] = [
  { label: "Overview",  href: "/operations-center/atlas-time", exact: true },
  { label: "Roster",    href: "/operations-center/atlas-time/employees" },
  { label: "Punch Log", href: "/operations-center/atlas-time/clock" },
  { label: "Kiosk",     href: "/operations-center/atlas-time/punch" },
  {
    label: "Payroll",
    href: "/operations-center/atlas-time/payroll",
    alsoActive: [
      "/operations-center/atlas-time/timesheets",
      "/operations-center/atlas-time/pto",
      "/operations-center/atlas-time/reports",
    ],
  },
  { label: "Uniforms",  href: "/operations-center/atlas-time/uniforms" },
  {
    label: "Settings",
    href: "/operations-center/atlas-time/settings",
    alsoActive: [
      "/operations-center/atlas-time/departments",
      "/operations-center/atlas-time/profile-settings",
    ],
  },
];

export default function AtlasTimeLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col min-h-screen">
      {/* Tab bar */}
      <div
        className="shrink-0 border-b border-white/10 overflow-x-auto sticky top-0 z-20"
        style={{ background: "linear-gradient(180deg, #0d2616 0%, #123b1f 100%)" }}
      >
        <div className="flex gap-0.5 px-4 min-w-max">
          {TABS.map((tab) => {
            const active = tab.exact
              ? pathname === tab.href
              : pathname === tab.href ||
                pathname.startsWith(tab.href + "/") ||
                (tab.alsoActive?.some(
                  (a) => pathname === a || pathname.startsWith(a + "/")
                ) ?? false);
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

      {/* Page content */}
      <div className="flex-1">{children}</div>
    </div>
  );
}
