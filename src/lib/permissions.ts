// Shared permission definitions used throughout the app.

export type Permissions = Record<string, boolean>;
export type PermDef = { key: string; label: string; sub?: string };
export type Section = { id: string; label: string; tag?: string; perms: PermDef[] };

export const SECTIONS: Section[] = [
  {
    id: "dashboard", label: "Dashboard",
    perms: [{ key: "dashboard", label: "Access dashboard" }],
  },
  {
    id: "bids", label: "Bids", tag: "AtlasBid",
    perms: [
      { key: "bids_view",     label: "View bids" },
      { key: "bids_create",   label: "Create bids" },
      { key: "bids_edit",     label: "Edit bids" },
      { key: "bids_delete",   label: "Delete bids" },
      { key: "bids_share",    label: "Share & send to clients" },
      { key: "bids_settings", label: "Bid settings & config" },
    ],
  },
  {
    id: "takeoff", label: "Takeoff", tag: "AtlasTakeoff",
    perms: [
      { key: "takeoff_view",   label: "View takeoffs" },
      { key: "takeoff_create", label: "Create takeoffs" },
      { key: "takeoff_edit",   label: "Edit takeoffs" },
    ],
  },
  {
    id: "materials", label: "Materials",
    perms: [
      { key: "mat_catalog_view",   label: "View catalog",                sub: "Catalog" },
      { key: "mat_catalog_create", label: "Add catalog items" },
      { key: "mat_catalog_edit",   label: "Edit catalog items" },
      { key: "mat_catalog_delete", label: "Delete catalog items" },
      { key: "mat_inventory_view", label: "View inventory",              sub: "Inventory" },
      { key: "mat_inventory_edit", label: "Log receipts & manage stock" },
      { key: "mat_pricing_view",   label: "View pricing books",          sub: "Pricing Books" },
      { key: "mat_pricing_manage", label: "Manage pricing books" },
    ],
  },
  {
    id: "atlas_hr", label: "Atlas HR",
    perms: [
      { key: "hr_team_view",          label: "View team members",          sub: "Team Members" },
      { key: "hr_team_create",        label: "Add team members" },
      { key: "hr_team_edit",          label: "Edit team member profiles" },
      { key: "hr_team_delete",        label: "Delete team members" },
      { key: "hr_team_export",        label: "Export team data" },
      { key: "hr_kiosk",              label: "Time Clock Kiosk access",    sub: "Time Clock" },
      { key: "hr_manager",            label: "Manager time clock view" },
      { key: "hr_dept_view",          label: "View departments",           sub: "Departments" },
      { key: "hr_dept_manage",        label: "Manage departments" },
      { key: "hr_timesheets_view",    label: "View timesheets",            sub: "Timesheets" },
      { key: "hr_timesheets_approve", label: "Approve timesheets" },
      { key: "hr_pto_view",           label: "View PTO & time off",        sub: "PTO & Time Off" },
      { key: "hr_pto_approve",        label: "Approve PTO requests" },
      { key: "hr_pto_manage",         label: "Manage PTO policies" },
      { key: "hr_payroll_view",       label: "View payroll",               sub: "Payroll" },
      { key: "hr_payroll_export",     label: "Export payroll" },
      { key: "hr_reports",            label: "View HR reports",            sub: "Reports & Other" },
      { key: "hr_import",             label: "Import HR data" },
      { key: "hr_settings",           label: "HR profile settings" },
    ],
  },
  {
    id: "performance", label: "Performance", tag: "AtlasPerformance",
    perms: [
      { key: "perf_view",   label: "View performance data" },
      { key: "perf_manage", label: "Manage performance settings" },
    ],
  },
  {
    id: "users", label: "Users",
    perms: [
      { key: "users_view",        label: "View user list" },
      { key: "users_create",      label: "Create & invite users" },
      { key: "users_edit",        label: "Edit user profiles" },
      { key: "users_delete",      label: "Delete users" },
      { key: "users_permissions", label: "Manage user permissions" },
    ],
  },
  {
    id: "settings", label: "Settings",
    perms: [
      { key: "settings_view",   label: "View settings" },
      { key: "settings_manage", label: "Manage system settings" },
    ],
  },
];

export const ALL_KEYS = SECTIONS.flatMap(s => s.perms.map(p => p.key));

/** Resolve a single permission key. isAdmin always returns true. rolePerms = role defaults, userOverrides = per-user overrides. */
export function can(isAdmin: boolean, rolePerms: Permissions, userOverrides: Permissions, key: string): boolean {
  if (isAdmin) return true;
  if (userOverrides[key] !== undefined) return !!userOverrides[key];
  return !!(rolePerms[key] ?? false);
}

/** Return only the user overrides that differ from role permissions (for clean storage). */
export function cleanOverrides(rolePerms: Permissions, userOverrides: Permissions): Permissions {
  const result: Permissions = {};
  for (const [k, v] of Object.entries(userOverrides)) {
    if ((rolePerms[k] ?? false) !== v) result[k] = v;
  }
  return result;
}
