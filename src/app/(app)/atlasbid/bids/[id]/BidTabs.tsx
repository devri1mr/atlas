// src/app/atlasbid/bids/[id]/BidTabs.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BidTabs({
  tabs,
  center,
}: {
  tabs: Array<{ name: string; href: string }>;
  center?: React.ReactNode;
}) {
  const pathname = usePathname() || "";

  // Find the longest-matching tab so Overview doesn't match when Scope/Pricing/Proposal are active
  const activeHref = tabs
    .slice()
    .sort((a, b) => b.href.length - a.href.length)
    .find((t) => pathname === t.href || pathname.startsWith(t.href + "/"))?.href;

  function renderTab(t: { name: string; href: string }) {
    const isActive = t.href === activeHref;
    return (
      <Link
        key={t.href}
        href={t.href}
        className={[
          "cursor-pointer rounded-md border px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium whitespace-nowrap",
          isActive
            ? "border-[#16a34a] bg-[#eef6f0] text-[#123b1f]"
            : "border-[#9cc4a6] bg-white text-[#123b1f] hover:bg-[#eef6f0]",
        ].join(" ")}
      >
        {t.name}
      </Link>
    );
  }

  if (center) {
    const half = Math.ceil(tabs.length / 2);
    const leftTabs = tabs.slice(0, half);
    const rightTabs = tabs.slice(half);
    return (
      <div className="flex items-center gap-4">
        <div className="flex gap-2 shrink-0">{leftTabs.map(renderTab)}</div>
        <div className="flex-1 flex justify-center">{center}</div>
        <div className="flex gap-2 shrink-0">{rightTabs.map(renderTab)}</div>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex gap-1.5 pb-0.5 min-w-max mx-auto">{tabs.map(renderTab)}</div>
    </div>
  );
}
