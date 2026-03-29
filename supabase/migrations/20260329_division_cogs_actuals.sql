create table if not exists division_cogs_actuals (
  id               uuid          default gen_random_uuid() primary key,
  company_id       uuid          not null references companies(id) on delete cascade,
  division         text          not null default 'lawn',
  year             int           not null,
  month            int           not null check (month between 1 and 12),
  revenue_override numeric(14,2),   -- null = use production reports
  labor_override   numeric(14,2),   -- null = use production reports
  job_materials    numeric(14,2),   -- null = 0
  fuel_override    numeric(14,2),   -- null = use formula: (actual_labor / budget_labor) * budget_fuel
  equipment        numeric(14,2),   -- null = 0
  updated_at       timestamptz   not null default now(),
  unique (company_id, division, year, month)
);
