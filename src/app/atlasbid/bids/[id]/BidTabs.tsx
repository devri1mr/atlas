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

  function renderTab(t: { name: string; href: string }) {
    const isActive =
      pathname === t.href ||
      (t.href !== "/" && pathname.startsWith(t.href + "/"));
    return (
      <Link
        key={t.href}
        href={t.href}
        className={[
          "cursor-pointer rounded-md border px-3 py-2 text-sm font-medium whitespace-nowrap",
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

  return <div className="flex flex-wrap gap-2">{tabs.map(renderTab)}</div>;
}
