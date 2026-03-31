"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Overview", href: "/operations-center/atlas-time" },
  { label: "Team Members", href: "/operations-center/atlas-time/employees" },
  { label: "Time Clock", href: "/operations-center/atlas-time/clock" },
  { label: "Kiosk", href: "/operations-center/atlas-time/punch" },
  { label: "Departments", href: "/operations-center/atlas-time/departments" },
  { label: "Timesheets", href: "/operations-center/atlas-time/timesheets" },
  { label: "PTO & Time Off", href: "/operations-center/atlas-time/pto" },
  { label: "Payroll", href: "/operations-center/atlas-time/payroll" },
  { label: "Uniforms", href: "/operations-center/atlas-time/uniforms" },
  { label: "Import", href: "/operations-center/atlas-time/import" },
  { label: "Reports", href: "/operations-center/atlas-time/reports" },
  { label: "Settings", href: "/operations-center/atlas-time/settings" },
  { label: "Profile", href: "/operations-center/atlas-time/profile-settings" },
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
            const exact = tab.href === "/operations-center/atlas-time";
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

      {/* Page content */}
      <div className="flex-1">{children}</div>
    </div>
  );
}
