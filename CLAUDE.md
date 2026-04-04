# Atlas — Claude Code Context

## What This Is
Internal business platform for **Garpiel Group**, a landscaping/lawn service company.
2026 revenue goal: **$8.245M**.

## Stack
- **Framework:** Next.js 16 (App Router), React 19
- **Database/Auth:** Supabase (Postgres + RLS + auth)
- **Styling:** Tailwind CSS v4
- **Charts:** Recharts
- **Email:** Resend
- **PDF:** pdfjs-dist
- **Spreadsheet:** xlsx, PapaParse
- **UI:** Radix UI (dialog, dropdown, toast), Lucide icons

## Key Directories
```
src/
  app/
    (app)/              # Authenticated app routes
      dashboard/
      atlasbid/         # Bid/estimating module
      atlasperformance/ # Company-wide performance dashboard
      atlastakeoff/     # Takeoff tool (hidden for now)
      operations-center/
        atlas-ops/      # Division ops (lawn, snow, etc.)
        atlas-time/     # HR/payroll module
        materials-catalog/
        divisions/
        inventory/
        ... (other settings pages)
    api/                # Next.js API routes (server-side, use supabaseAdmin)
    kiosk/              # Standalone time clock kiosk (unauthenticated)
  components/
    Sidebar.tsx         # Main nav — edit here for all nav changes
    ops/                # Shared ops components (CogsDashboard, etc.)
    AccessGate.tsx      # Permission gate component
    UnitInput.tsx
  lib/
    supabaseAdmin.ts    # Server-side Supabase client (service role key)
    supabaseClient.ts   # Client-side Supabase client
    userContext.tsx     # Auth + permissions context
    permissions.ts      # Permission key definitions
    atPayPeriod.ts      # Payroll period helpers
    atHours.ts          # Time/hours helpers
```

## Module Overview

### Bids (AtlasBid) — `/atlasbid`
Estimating and proposal tool. Bids have: scope, measurements, materials, tasks, pricing, proposals.
- Materials catalog, pricing books (PDF), inventory, bundle builder
- Sidebar children: Bids, Catalog, Inventory, Pricing Books

### Atlas HR — `/operations-center/atlas-time`
Full workforce management: time clock kiosk, roster, payroll, timesheets, PTO, uniforms, QuickBooks export.
- Sidebar tab structure: Overview, Roster, Punch Log, Kiosk, Payroll, Uniforms, Settings
- Payroll sub-nav: Pay Adjustments, Timesheets, PTO & Time Off, Reports, QB Export
- Settings sub-nav: Time Clock, Departments, Profile Settings

### Operations — `/atlasperformance` (main), `/operations-center/atlas-ops` (upcoming revenue)
- Main landing = performance dashboard (revenue vs budget, COGS, GP margin by division/month)
- Sub-items: Upcoming Revenue (`/operations-center/atlas-ops`), then each active division (Lawn, Snow, etc.)
- Divisions shown in sidebar are those with `show_in_ops = true AND active = true` in the `divisions` table

### Settings — `/operations-center`
Grid of settings cards: Pricing, Divisions, Labor Rates, Task Catalog, Complexity Profiles, Materials Catalog, Bundle Builder, Inventory, Inventory Locations, User Management, Atlas Design, Atlas HR, Sports Ticker.

### Materials Catalog — `/operations-center/materials-catalog`
- Categories with hierarchy (`parent_id`), `sort_order`, `color`, `icon`
- Materials with `parent_material_id` + `variant_label` for vendor/size grouping
- Pricing books (PDF uploads with page references)
- Auto-group endpoint: `GET /api/materials-catalog/auto-group` (dry run), `?apply=true` to commit

## Supabase Patterns

### Server-side (API routes)
```typescript
import { supabaseAdmin } from "@/lib/supabaseAdmin";
const supabase = supabaseAdmin(); // uses SUPABASE_SERVICE_ROLE_KEY, bypasses RLS
```

### Client-side (components)
```typescript
import { getSupabaseClient } from "@/lib/supabaseClient";
```

### Auth/Permissions
```typescript
import { useUser } from "@/lib/userContext";
const { user, can } = useUser();
can("perm_key") // returns boolean
```

Permission keys are defined in `src/lib/permissions.ts`. Common ones:
`bids_view`, `hr_team_view`, `hr_manager`, `hr_payroll_view`, `perf_view`, `settings_view`, `users_view`

## Sidebar Nav
Defined in `src/components/Sidebar.tsx`. Structure:
- Static `NAV` array + dynamic `SETTINGS_ITEM`
- `Operations` item is built dynamically in `fullNav` memo, always present
- `children` array on a nav item enables the expand/collapse sub-menu
- `permKey` on items/children controls visibility via `can()`
- `alsoActive` pattern used in layout tab bars (not sidebar) for multi-route active detection

## Conventions
- API routes use `supabaseAdmin()` (service role, no RLS)
- Fault-tolerant DB queries: if a new column might not exist yet, catch the error and retry without it
- `"use client"` at top of any component using hooks/state
- No `"use client"` on API routes or server components
- Tailwind for all styling — no CSS modules or styled-components
- **CRITICAL — Table alignment: ALL table cells (`<th>` and `<td>`) must use `text-center`. NEVER use `text-right` or `text-left` on any table cell, header, or value in any table anywhere in the app. This applies to every table without exception.**
- **CRITICAL — No text truncation: NEVER use `truncate` or `overflow-hidden` on cell content. All cells must show their full text. Size columns wide enough to display full values — no fixed widths that clip content.**
- Brand colors: `#0d2616` (darkest), `#123b1f` (dark green), `#1a5c2a` (mid green)
- Font weights: use `font-semibold` for data values, `font-bold` for headings — avoid `font-black` (renders poorly on Windows)
- Gradient header pattern: `linear-gradient(135deg, #0d2616 0%, #123b1f 50%, #1a5c2a 100%)`
- Hours format: always display as `X,XXX hrs` (rounded integer, comma-formatted) — never use `h` suffix
- **Name display format: always Last, First** — whenever displaying a person's name in any UI table, list, or label, use `Last, First` order (e.g. "Warian, Ayslyn"). Variables and DB fields keep whatever format they use internally.
- **Payroll calculations**: unless explicitly specified otherwise, always use 100% of a person's total payroll cost (all hours they are paid for — on-job + down time combined). Never attribute only the on-job portion. If someone worked 45 hrs and generated $1,000 revenue, labor % = total_payroll_cost / $1,000 and rev/hr = $1,000 / 45.
- **Timezone: always Eastern (America/New_York)** — all timestamps are stored in UTC in Supabase. Always display using `America/New_York` (handles EDT/EST automatically). Never use `getUTCHours()` or raw UTC for display. Use `Intl.DateTimeFormat` with `timeZone: "America/New_York"` for display, and reverse the Eastern offset when writing back to UTC.

- **Atlas Time punch item display**: Always use the punch item's own `name` field for display — never substitute the QB class name (`qb_class_name`). QB class is metadata for QuickBooks export only, not a label. E.g. "Shop - Admin" and "Office" both have QB class "Admin" but must display as "Shop - Admin" and "Office".
- **Atlas Time dual punch sources**: `at_punches` has two division columns: `at_division_id` → `at_divisions` (specific punch item), and `division_id` → `divisions` (general division). When querying by expanded division_id (derived from at_division FK), always add `at_division_id IS NULL` to avoid pulling punches that belong to other at_divisions sharing the same parent division.

## Database Notes
- Supabase MCP is configured — can query DB directly in Claude Code sessions
- Project ref: `cbmnwpcasbbueiysgtkv`
- Key tables: `divisions`, `materials_catalog`, `material_categories`, `employees`, `punch_records`, `payroll_adjustments`, `lawn_production_reports`, `lawn_production_jobs`, `lawn_production_members`, `bids`, `bid_items`, `companies`
- `divisions.show_in_ops` controls which divisions appear in the Operations sidebar
- `materials_catalog.parent_material_id` enables vendor/size variant grouping

## Git
- Remote: `https://github.com/devri1mr/atlas`
- Branch: `main`
- Push only when user says to push — don't push automatically after every change
