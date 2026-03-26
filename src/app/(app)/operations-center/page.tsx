"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const sections = [
  {
    title: "Pricing Settings",
    description: "Default margin, prepay discount, contingency, and rounding controls.",
    href: "/operations-center/pricing",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    ),
    color: "text-green-600 bg-green-50",
  },
  {
    title: "Divisions",
    description: "Manage service divisions, active status, and division-level rules.",
    href: "/operations-center/divisions",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
      </svg>
    ),
    color: "text-blue-600 bg-blue-50",
  },
  {
    title: "Labor Rates",
    description: "Labor and trucking rates with effective dates by division.",
    href: "/operations-center/labor-rates",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
    color: "text-amber-600 bg-amber-50",
  },
  {
    title: "Task Catalog",
    description: "Reusable labor tasks with units, min qty, seasonality, and difficulty.",
    href: "/operations-center/tasks",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
    color: "text-purple-600 bg-purple-50",
  },
  {
    title: "Complexity Profiles",
    description: "Reusable complexity multipliers: Standard, Moderate, Difficult, Extreme.",
    href: "/operations-center/complexity",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
    color: "text-orange-600 bg-orange-50",
  },
  {
    title: "Materials Catalog",
    description: "Materials, units, default costs, vendors, and inventory links.",
    href: "/operations-center/materials-catalog",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      </svg>
    ),
    color: "text-teal-600 bg-teal-50",
  },
  {
    title: "Bundle Builder",
    description: "Scope bundles, questions, task rules, and proposal wording.",
    href: "/operations-center/bundles",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>
      </svg>
    ),
    color: "text-indigo-600 bg-indigo-50",
  },
  {
    title: "Inventory",
    description: "Track on-hand stock, log receipts, and view inventory value by division.",
    href: "/operations-center/inventory",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
      </svg>
    ),
    color: "text-emerald-600 bg-emerald-50",
  },
  {
    title: "Inventory Locations",
    description: "Physical storage sites used when logging inventory receipts.",
    href: "/operations-center/inventory-locations",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
      </svg>
    ),
    color: "text-rose-600 bg-rose-50",
  },
  {
    title: "User Management",
    description: "Invite teammates, assign roles, and control access to Atlas.",
    href: "/operations-center/users",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    color: "text-gray-600 bg-gray-100",
  },
  {
    title: "Atlas Design",
    description: "Monthly usage, generation limits, and recent Atlas landscape design history.",
    href: "/operations-center/ai-design",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 8v4l3 3"/><path d="M18 2l4 4-4 4"/><path d="M22 6H16"/>
      </svg>
    ),
    color: "text-violet-600 bg-violet-50",
  },
  {
    title: "Atlas HR",
    description: "Time clock, payroll, overtime, PTO, bonuses, and QuickBooks Desktop export.",
    href: "/operations-center/atlas-time",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
    color: "text-sky-600 bg-sky-50",
  },
  {
    title: "Sports Ticker",
    description: "Configure live scores and news leagues shown in the dashboard ticker bar.",
    href: "/operations-center/sports-ticker",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    ),
    color: "text-cyan-600 bg-cyan-50",
  },
];

const STORAGE_KEY = "ops-center-card-order";

function GripIcon() {
  return (
    <div className="flex flex-col gap-[3px] opacity-0 group-hover:opacity-30 shrink-0 mt-0.5 transition-opacity">
      {[0,1,2].map(r => (
        <div key={r} className="flex gap-[3px]">
          <div className="w-1 h-1 rounded-full bg-gray-500"/>
          <div className="w-1 h-1 rounded-full bg-gray-500"/>
        </div>
      ))}
    </div>
  );
}

export default function OperationsCenterPage() {
  const [order, setOrder] = useState<number[]>(() => sections.map((_, i) => i));
  const [dragOver, setDragOver] = useState<number | null>(null);
  const dragIdx = useRef<number | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === sections.length) setOrder(parsed);
      }
    } catch {}
  }, []);

  function handleDrop(toPos: number) {
    const from = dragIdx.current;
    setDragOver(null);
    dragIdx.current = null;
    if (from === null || from === toPos) return;
    const newOrder = [...order];
    const [item] = newOrder.splice(from, 1);
    newOrder.splice(toPos, 0, item);
    setOrder(newOrder);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newOrder)); } catch {}
  }

  return (
    <div className="min-h-screen bg-[#f0f4f0]">
      <div
        className="px-4 md:px-8 py-6 md:py-8"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}
      >
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Settings</h1>
          <p className="text-white/50 text-sm mt-1">Configure pricing, divisions, rates, catalog, and team settings.</p>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {order.map((sIdx, pos) => {
            const s = sections[sIdx];
            return (
              <div
                key={s.href}
                draggable
                onDragStart={() => { dragIdx.current = pos; }}
                onDragOver={e => { e.preventDefault(); setDragOver(pos); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => handleDrop(pos)}
                onDragEnd={() => { setDragOver(null); dragIdx.current = null; }}
                className={`group relative transition-opacity ${dragOver === pos ? "opacity-40" : ""}`}
                style={{ cursor: "grab" }}
              >
                <Link
                  href={s.href}
                  draggable={false}
                  className="block bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md hover:border-gray-200 transition-all"
                >
                  <div className="flex items-start gap-4">
                    <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}>
                      {s.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-semibold text-gray-900 text-sm group-hover:text-[#123b1f] transition-colors">{s.title}</h2>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{s.description}</p>
                    </div>
                    <GripIcon />
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
