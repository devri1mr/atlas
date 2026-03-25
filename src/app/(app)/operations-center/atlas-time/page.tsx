"use client";

import Link from "next/link";

const sections = [
  {
    title: "Time Clock Settings",
    description: "Pay cycle, overtime rules, lunch deductions, geofencing, kiosk PIN, and Michigan ESTA sick accrual.",
    href: "/operations-center/atlas-time/settings",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
    color: "text-blue-600 bg-blue-50",
  },
  {
    title: "Departments",
    description: "Manage departments and divisions used for crew assignment and payroll reporting.",
    href: "/operations-center/atlas-time/departments",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
      </svg>
    ),
    color: "text-emerald-600 bg-emerald-50",
  },
  {
    title: "Employees",
    description: "Employee profiles, pay rates, hire dates, uniform info, and termination workflow.",
    href: "/operations-center/atlas-time/employees",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    color: "text-violet-600 bg-violet-50",
  },
  {
    title: "Live Dashboard",
    description: "See who's clocked in right now, flag missed punches, and view today's hours by crew.",
    href: "/operations-center/atlas-time/dashboard",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>
      </svg>
    ),
    color: "text-amber-600 bg-amber-50",
    badge: "Phase 2",
  },
  {
    title: "Timesheets",
    description: "Review, approve, and correct punches by pay period. Lock and export to QuickBooks.",
    href: "/operations-center/atlas-time/timesheets",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
    color: "text-indigo-600 bg-indigo-50",
    badge: "Phase 3",
  },
  {
    title: "PTO & Time Off",
    description: "Accrual rules, request approvals, balances, and Michigan ESTA sick time tracking.",
    href: "/operations-center/atlas-time/pto",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
    color: "text-teal-600 bg-teal-50",
    badge: "Phase 4",
  },
  {
    title: "Bonuses",
    description: "Referral, performance, and safety bonuses tied to payroll periods.",
    href: "/operations-center/atlas-time/bonuses",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>
      </svg>
    ),
    color: "text-orange-600 bg-orange-50",
    badge: "Phase 4",
  },
  {
    title: "Payroll & Export",
    description: "Lock payroll periods and export IIF files for QuickBooks Desktop.",
    href: "/operations-center/atlas-time/payroll",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    ),
    color: "text-green-600 bg-green-50",
    badge: "Phase 4",
  },
  {
    title: "Reports",
    description: "Labor cost by division, OT trends, PTO usage, and budget vs. actual per project.",
    href: "/operations-center/atlas-time/reports",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    ),
    color: "text-rose-600 bg-rose-50",
    badge: "Phase 5",
  },
];

export default function AtlasTimePage() {
  return (
    <div className="min-h-screen bg-[#f0f4f0]">
      <div
        className="px-4 md:px-8 py-6 md:py-8"
        style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)" }}
      >
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 text-white/50 text-xs mb-2">
            <span>Operations Center</span>
            <span>/</span>
            <span className="text-white/80">Atlas Time</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Atlas Time</h1>
          <p className="text-white/50 text-sm mt-1">Workforce time tracking, payroll, PTO, and QuickBooks export.</p>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sections.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md hover:border-gray-200 transition-all"
            >
              <div className="flex items-start gap-4">
                <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}>
                  {s.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-gray-900 text-sm group-hover:text-[#123b1f] transition-colors">{s.title}</h2>
                    {s.badge && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">{s.badge}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{s.description}</p>
                </div>
                <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-gray-300 group-hover:text-gray-500 mt-0.5 transition-colors">
                  <path d="M3 9L9 3M9 3H5M9 3v4"/>
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
