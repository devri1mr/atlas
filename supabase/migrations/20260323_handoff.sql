-- ============================================================
-- Atlas Handoff — Migration
-- Run this in your Supabase SQL editor
-- ============================================================

-- ── 1. Column additions to existing tables ──────────────────

alter table materials_catalog
  add column if not exists botanical_name text,
  add column if not exists landscape_category text; -- tree/shrub/perennial/grass/groundcover/other

alter table task_catalog
  add column if not exists landscape_category text; -- tree/shrub/perennial/grass/groundcover/other

alter table bids
  add column if not exists handoff_session_id uuid;

alter table takeoff_items
  add column if not exists revision_hash text;

-- ── 2. handoff_sessions ─────────────────────────────────────

create table if not exists handoff_sessions (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null,
  takeoff_id           uuid not null references takeoffs(id) on delete cascade,
  bid_id               uuid references bids(id) on delete set null,
  status               text not null default 'in_review',  -- in_review | bid_created | archived
  revision_number      integer not null default 1,
  previous_session_id  uuid references handoff_sessions(id),
  markup_pct           numeric,
  pct_matched          numeric,
  total_material_cost  numeric,
  total_labor_cost     numeric,
  suggested_price      numeric,
  notes                text,
  created_at           timestamptz not null default now(),
  finalized_at         timestamptz
);

-- ── 3. takeoff_item_matches ──────────────────────────────────

create table if not exists takeoff_item_matches (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null,
  takeoff_id           uuid not null references takeoffs(id) on delete cascade,
  takeoff_item_id      uuid not null references takeoff_items(id) on delete cascade,
  handoff_session_id   uuid references handoff_sessions(id) on delete set null,

  -- Material match
  catalog_material_id  uuid references materials_catalog(id) on delete set null,
  material_match_conf  text default 'none',  -- high | medium | none
  material_match_note  text,

  -- Labor match
  task_catalog_id      uuid references task_catalog(id) on delete set null,
  labor_match_conf     text default 'none',  -- high | medium | none
  labor_match_note     text,

  -- Review state
  reviewed             boolean not null default false,
  override_by_user     boolean not null default false,
  excluded             boolean not null default false,

  -- Inventory snapshot
  inventory_qty_on_hand numeric,
  inventory_flagged    boolean default false,

  -- Audit
  ai_matched_at        timestamptz,
  reviewed_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  unique (takeoff_item_id)
);

-- ── 4. takeoff_match_rules ───────────────────────────────────

create table if not exists takeoff_match_rules (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null,

  -- Trigger (normalized lowercase)
  match_common_name    text,
  match_botanical_name text,
  match_category       text,
  match_size           text,

  -- Answers
  catalog_material_id  uuid references materials_catalog(id) on delete set null,
  task_catalog_id      uuid references task_catalog(id) on delete set null,

  usage_count          integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  unique (company_id, match_common_name, match_botanical_name, match_category, match_size)
);

-- ── 5. FK: bids.handoff_session_id ──────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_bids_handoff_session'
  ) THEN
    ALTER TABLE bids
      ADD CONSTRAINT fk_bids_handoff_session
      FOREIGN KEY (handoff_session_id) REFERENCES handoff_sessions(id) ON DELETE SET NULL;
  END IF;
END $$;
