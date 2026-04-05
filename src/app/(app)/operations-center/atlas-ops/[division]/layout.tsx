"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

export default function DivisionLayout({ children }: { children: React.ReactNode }) {
  const { division } = useParams<{ division: string }>();
  const pathname = usePathname();

  const base = `/operations-center/atlas-ops/${division}`;
  const TABS = [
    { label: "Dashboard",        href: base },
    { label: "Upcoming Revenue", href: `${base}/upcoming-revenue` },
    { label: "COGS",             href: `${base}/cogs` },
    ...(division === "fertilization" ? [
      { label: "Production Close-Out", href: `${base}/imports` },
      { label: "Admin Pay",            href: `${base}/admin-pay` },
      { label: "Inventory",            href: `${base}/inventory` },
    ] : []),
  ];

  return (
    <div className="flex flex-col min-h-screen">
      <div
        className="shrink-0 border-b border-white/10 overflow-x-auto sticky top-0 z-20"
        style={{ background: "linear-gradient(180deg, #0d2616 0%, #123b1f 100%)" }}
      >
        <div className="flex gap-0.5 px-4 min-w-max">
          {TABS.map((tab) => {
            const exact  = tab.href === base;
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
