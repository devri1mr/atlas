"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";
import Sidebar from "@/components/Sidebar";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/atlasbid/bids": "Bids",
  "/atlasbid": "AtlasBid",
  "/operations-center/inventory": "Inventory",
  "/operations-center/materials-catalog": "Materials Catalog",
  "/operations-center/users": "Users",
  "/operations-center/bundles": "Bundles",
  "/operations-center/tasks": "Tasks",
  "/operations-center/labor-rates": "Labor Rates",
  "/operations-center/divisions": "Divisions",
  "/operations-center/inventory-locations": "Inventory Locations",
  "/operations-center/pricing": "Pricing",
  "/operations-center/atlas-time/punch": "Kiosk",
  "/operations-center/atlas-time/clock": "Time Clock",
  "/operations-center/atlas-time": "Atlas HR",
  "/operations-center/atlas-time/settings": "Time Clock Settings",
  "/operations-center/atlas-time/departments": "Departments & Divisions",
  "/operations-center/atlas-time/employees/new": "New Team Member",
  "/operations-center/atlas-time/employees": "Team Members",
  "/operations-center": "Operations Center",
};

function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (/\/atlasbid\/bids\/[^/]+\/scope/.test(pathname)) return "Scope";
  if (/\/atlasbid\/bids\/[^/]+\/pricing/.test(pathname)) return "Pricing";
  if (/\/atlasbid\/bids\/[^/]+\/proposal/.test(pathname)) return "Proposal";
  if (/\/atlasbid\/bids\/[^/]+\/photos/.test(pathname)) return "Photos";
  if (/\/atlasbid\/bids\/[^/]+/.test(pathname)) return "Bid";
  return "Atlas";
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  useEffect(() => {
    const title = getPageTitle(pathname);
    const full = title === "Atlas" ? "Atlas" : `${title} | Atlas`;
    // Delay slightly so Next.js metadata doesn't override after us
    const t = setTimeout(() => { document.title = full; }, 50);
    return () => clearTimeout(t);
  }, [pathname, ready]);

  useEffect(() => {
    const sb = getSupabaseClient();
    sb.auth.getSession().then(({ data }) => {
      if (!data.session?.user) {
        router.replace("/");
      } else {
        setReady(true);
      }
    });
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6f8f6]">
        <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f6f8f6]">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-40 lg:relative lg:flex lg:translate-x-0 transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center gap-3 px-3 py-2.5 border-b border-gray-200 bg-white shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors shrink-0"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <img src="/atlas-logo.png" alt="Atlas" style={{ height: 26, mixBlendMode: "multiply" }} className="shrink-0" />
          <span className="text-sm font-semibold text-gray-700 truncate">{getPageTitle(pathname)}</span>
        </div>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
