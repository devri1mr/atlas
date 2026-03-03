// src/app/atlasbid/bids/[id]/BidTabs.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BidTabs({
  tabs,
}: {
  tabs: Array<{ name: string; href: string }>;
}) {
  const pathname = usePathname() || "";

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((t) => {
        const isActive =
          pathname === t.href ||
          (t.href !== "/" && pathname.startsWith(t.href + "/"));

        return (
          <Link
            key={t.href}
            href={t.href}
            className={[
              "cursor-pointer rounded-md border px-3 py-2 text-sm font-medium",
              isActive
                ? "border-[#16a34a] bg-[#eef6f0] text-[#123b1f]"
                : "border-[#9cc4a6] bg-white text-[#123b1f] hover:bg-[#eef6f0]",
            ].join(" ")}
          >
            {t.name}
          </Link>
        );
      })}
    </div>
  );
}
