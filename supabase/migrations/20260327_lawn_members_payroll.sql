-- Add payroll columns to lawn_production_members
ALTER TABLE lawn_production_members
  ADD COLUMN IF NOT EXISTS reg_hours           numeric(10,4),
  ADD COLUMN IF NOT EXISTS ot_hours            numeric(10,4),
  ADD COLUMN IF NOT EXISTS total_payroll_hours numeric(10,4),
  ADD COLUMN IF NOT EXISTS pay_rate            numeric(10,2),
  ADD COLUMN IF NOT EXISTS payroll_cost        numeric(10,2);

-- Store all individual punches per employee per report day
-- Links to report (not job) since punch data is day-level
CREATE TABLE IF NOT EXISTS lawn_report_punches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id     uuid NOT NULL REFERENCES lawn_production_reports(id) ON DELETE CASCADE,
  employee_id   uuid,
  resource_name text NOT NULL,
  clock_in_at   timestamptz,
  clock_out_at  timestamptz,
  regular_hours numeric(10,4),
  ot_hours      numeric(10,4),
  dt_hours      numeric(10,4)
);
