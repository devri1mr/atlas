"use client";

import Link from "next/link";

type Section = {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
};

type Group = {
  label: string;
  sections: Section[];
};

const GROUPS: Group[] = [
  {
    label: "Clock In / Out",
    sections: [
      {
        title: "Kiosk",
        description: "iPad punch station. Team members tap their name and enter their PIN to clock in or out.",
        href: "/operations-center/atlas-time/punch",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
          </svg>
        ),
      },
      {
        title: "Punch Log",
        description: "Manually clock crew in/out, see who's live right now, and view today's completed punches. Import punch CSVs here.",
        href: "/operations-center/atlas-time/clock",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        ),
      },
    ],
  },
  {
    label: "Roster",
    sections: [
      {
        title: "Roster",
        description: "All team members — profiles, pay rates, hire dates, certifications, uniforms, and status.",
        href: "/operations-center/atlas-time/employees",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        ),
      },
      {
        title: "Import Roster",
        description: "Import new hires from a QuickBooks HR export. Existing team members are skipped automatically.",
        href: "/operations-center/atlas-time/import",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        ),
      },
    ],
  },
  {
    label: "Payroll",
    sections: [
      {
        title: "Payroll",
        description: "Pay adjustments, deductions, reimbursements, and QuickBooks export by pay period.",
        href: "/operations-center/atlas-time/payroll",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
        ),
      },
      {
        title: "Timesheets",
        description: "Review, approve, and correct punches by pay period. Lock and export to QuickBooks.",
        href: "/operations-center/atlas-time/timesheets",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
        ),
      },
      {
        title: "PTO & Time Off",
        description: "Accrual rules, request approvals, balances, and Michigan ESTA sick time tracking.",
        href: "/operations-center/atlas-time/pto",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        ),
        badge: "Phase 4",
      },
      {
        title: "Reports",
        description: "Labor cost by division, overtime trends, PTO usage, and budget vs. actual.",
        href: "/operations-center/atlas-time/reports",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
        ),
      },
    ],
  },
  {
    label: "Other",
    sections: [
      {
        title: "Uniforms",
        description: "Inventory tracking, issuances, returns, and automatic payroll deductions.",
        href: "/operations-center/atlas-time/uniforms",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.57a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.57a2 2 0 0 0-1.34-2.23z"/>
          </svg>
        ),
      },
    ],
  },
  {
    label: "Settings",
    sections: [
      {
        title: "Settings",
        description: "Time clock rules, pay cycle, overtime, geofencing, kiosk PIN, departments, divisions, and profile fields.",
        href: "/operations-center/atlas-time/settings",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>
          </svg>
        ),
      },
    ],
  },
];

const GROUP_COLORS: Record<string, string> = {
  "Clock In / Out": "text-green-700 bg-green-50",
  "Roster":         "text-violet-700 bg-violet-50",
  "Payroll":        "text-blue-700 bg-blue-50",
  "Other":          "text-amber-700 bg-amber-50",
  "Settings":       "text-slate-700 bg-slate-50",
};

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
            <span className="text-white/80">Atlas HR</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Atlas HR</h1>
          <p className="text-white/50 text-sm mt-1">Workforce time tracking, payroll, PTO, and QuickBooks export.</p>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-8">
        {GROUPS.map(group => (
          <div key={group.label}>
            <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">{group.label}</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.sections.map(s => (
                <Link
                  key={s.href}
                  href={s.href}
                  className="block bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md hover:border-gray-200 transition-all"
                >
                  <div className="flex items-start gap-4">
                    <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${GROUP_COLORS[group.label] ?? "text-gray-600 bg-gray-50"}`}>
                      {s.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 text-sm group-hover:text-[#123b1f] transition-colors">{s.title}</h3>
                        {s.badge && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">{s.badge}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{s.description}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
