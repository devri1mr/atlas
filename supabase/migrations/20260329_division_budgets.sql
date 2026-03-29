create table if not exists division_budgets (
  id             uuid          default gen_random_uuid() primary key,
  company_id     uuid          not null references companies(id) on delete cascade,
  division       text          not null,
  year           int           not null,
  month          int           not null check (month between 1 and 12),
  revenue        numeric(14,2) not null default 0,
  labor          numeric(14,2) not null default 0,
  job_materials  numeric(14,2) not null default 0,
  fuel           numeric(14,2) not null default 0,
  equipment      numeric(14,2) not null default 0,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now(),
  unique (company_id, division, year, month)
);
