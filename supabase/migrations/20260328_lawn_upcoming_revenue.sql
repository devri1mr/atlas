create table if not exists lawn_upcoming_revenue (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  date           date not null,
  mowing         numeric(10,2) not null default 0,
  weeding        numeric(10,2) not null default 0,
  shrubs         numeric(10,2) not null default 0,
  cleanups       numeric(10,2) not null default 0,
  brush_hogging  numeric(10,2) not null default 0,
  string_trimming numeric(10,2) not null default 0,
  other          numeric(10,2) not null default 0,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique(company_id, date)
);

alter table lawn_upcoming_revenue enable row level security;

create policy "service role full access" on lawn_upcoming_revenue
  for all using (true);
