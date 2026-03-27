-- Lawn Operations: Daily Production Report tables

CREATE TABLE IF NOT EXISTS lawn_production_reports (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL,
  report_date           date NOT NULL,
  file_name             text,
  imported_at           timestamptz NOT NULL DEFAULT now(),
  total_budgeted_hours  numeric(10,4),
  total_actual_hours    numeric(10,4),
  total_budgeted_amount numeric(10,2),
  total_actual_amount   numeric(10,2)
);

CREATE TABLE IF NOT EXISTS lawn_production_jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id        uuid NOT NULL REFERENCES lawn_production_reports(id) ON DELETE CASCADE,
  work_order       text,
  client_name      text NOT NULL,
  client_address   text,
  service          text,
  service_date     date,
  crew_code        text,
  budgeted_hours   numeric(10,4),
  actual_hours     numeric(10,4),
  variance_hours   numeric(10,4),
  budgeted_amount  numeric(10,2),
  actual_amount    numeric(10,2)
);

CREATE TABLE IF NOT EXISTS lawn_production_members (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         uuid NOT NULL REFERENCES lawn_production_jobs(id) ON DELETE CASCADE,
  resource_name  text NOT NULL,
  resource_code  text,
  employee_id    uuid,
  actual_hours   numeric(10,4),
  earned_amount  numeric(10,2)
);
