"use client";

import Link from "next/link";

const sections = [
  {
    title: "Pricing Settings",
    description:
      "Manage prepay discount, contingency, rounding, and default pricing controls.",
    href: "/operations-center/pricing",
    status: "Build first",
  },
  {
    title: "Divisions",
    description:
      "Manage divisions, active status, and division-level rules like Allow OT.",
    href: "/operations-center/divisions",
    status: "Next",
  },
  {
    title: "Labor Rates",
    description:
      "Manage labor and trucking rates with effective dates by division.",
    href: "/operations-center/labor-rates",
    status: "Next",
  },
  {
    title: "Task Catalog",
    description:
      "Manage reusable labor tasks, units, min qty, round qty, seasonality, and difficulty defaults.",
    href: "/operations-center/tasks",
    status: "After rates",
  },
  {
    title: "Complexity Profiles",
    description:
      "Manage reusable complexity multipliers such as Standard, Moderate, Difficult, and Extreme.",
    href: "/operations-center/complexity",
    status: "Later",
  },
  {
    title: "Materials Catalog",
    description:
      "Manage materials, units, default costs, vendors, and inventory links.",
    href: "/operations-center/materials-catalog",
    status: "Later",
  },
  {
    title: "Bundle Builder",
    description:
      "Manage scope bundles, questions, task rules, and default proposal wording.",
    href: "/operations-center/bundles",
    status: "Later",
  },
  {
    title: "Inventory",
    description:
      "Track on-hand stock, add receipts, view inventory value and transaction ledger by division.",
    href: "/operations-center/inventory",
    status: "Active",
  },
  {
    title: "Inventory Locations",
    description:
      "Manage physical storage sites (e.g. Main Yard, North Lot) used when logging inventory receipts.",
    href: "/operations-center/inventory-locations",
    status: "Active",
  },
  {
    title: "User Management",
    description:
      "Invite teammates and assign roles. Control who has access to Atlas and what they can do.",
    href: "/operations-center/users",
    status: "Active",
  },
];

function statusClasses(status: string) {
  switch (status) {
    case "Build first":
      return "bg-green-50 text-green-700 border-green-200";
    case "Next":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "After rates":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "Active":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    default:
      return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

export default function OperationsCenterPage() {
  return (
    <div className="p-8 space-y-8">
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Operations Center</h1>
            <div className="mt-2 max-w-3xl text-sm text-gray-600">
              Configure Atlas admin settings, pricing controls, divisions, labor
              rates, task defaults, and future bundle/material management.
            </div>
          </div>

          <div className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
            Admin Hub
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-xl border bg-white p-5 shadow-sm transition hover:border-gray-400 hover:shadow"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900">
                {section.title}
              </h2>

              <div
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusClasses(
                  section.status
                )}`}
              >
                {section.status}
              </div>
            </div>

            <p className="mt-3 text-sm leading-6 text-gray-600">
              {section.description}
            </p>

            <div className="mt-5 text-sm font-medium text-black">
              Open section →
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
