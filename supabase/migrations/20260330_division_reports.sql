-- Saved report definitions
CREATE TABLE IF NOT EXISTS division_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  division text NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS division_reports_company_division_idx ON division_reports (company_id, division);

-- Widgets within a report, ordered by position
CREATE TABLE IF NOT EXISTS division_report_widgets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id uuid NOT NULL REFERENCES division_reports(id) ON DELETE CASCADE,
  widget_type text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}',
  position integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS division_report_widgets_report_position_idx ON division_report_widgets (report_id, position);
