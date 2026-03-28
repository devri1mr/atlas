-- Lawn Admin Pay: config + per-date overrides

CREATE TABLE IF NOT EXISTS lawn_admin_pay_config (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  year       int  NOT NULL,
  manager_1_name text NOT NULL DEFAULT '',
  manager_2_name text NOT NULL DEFAULT '',
  -- Annual salaries (used to auto-compute monthly daily rates)
  manager_1_annual numeric(12,2),
  manager_2_annual numeric(12,2),
  -- Per-month daily rate overrides (null = auto-compute from annual/12/weekdays)
  jan_daily numeric(10,4),
  feb_daily numeric(10,4),
  mar_daily numeric(10,4),
  apr_daily numeric(10,4),
  may_daily numeric(10,4),
  jun_daily numeric(10,4),
  jul_daily numeric(10,4),
  aug_daily numeric(10,4),
  sep_daily numeric(10,4),
  oct_daily numeric(10,4),
  nov_daily numeric(10,4),
  dec_daily numeric(10,4),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, year)
);

CREATE TABLE IF NOT EXISTS lawn_admin_pay_overrides (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  date       date NOT NULL,
  payroll_cost numeric(10,4), -- null = revert to computed; 0 = explicitly $0
  notes      text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, date)
);
