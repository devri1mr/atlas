-- Dispatch board (Report 2: Service AutoPilot SchedulingViewExport)
-- Linked by company_id + report_date, not FK, so upload order doesn't matter

CREATE TABLE IF NOT EXISTS lawn_dispatch_jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL,
  report_date      date NOT NULL,
  work_order       text,           -- WorkOrderProjectNum, for matching to Report 1
  client_name      text NOT NULL,
  address          text,
  city             text,
  zip              text,
  service          text,
  crew_code        text,           -- AssignedTo (LC-N)
  personnel_count  int,            -- Men column, for crew size verification
  start_time       timestamptz,    -- null when time_varies = true
  end_time         timestamptz,    -- null when time_varies = true
  time_varies      boolean NOT NULL DEFAULT false,
  imported_at      timestamptz NOT NULL DEFAULT now()
);

-- Manual time entries for "Varies" jobs, per team member
-- Multiple rows allowed per (dispatch_job, employee)
CREATE TABLE IF NOT EXISTS lawn_dispatch_job_times (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_job_id  uuid NOT NULL REFERENCES lawn_dispatch_jobs(id) ON DELETE CASCADE,
  employee_id      uuid,
  resource_name    text,
  start_time       timestamptz NOT NULL,
  end_time         timestamptz,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lawn_dispatch_jobs_date ON lawn_dispatch_jobs(company_id, report_date);
