-- Add Human Resources system role
INSERT INTO roles (company_id, name, description, is_admin, is_system, permissions)
SELECT c.id,
  'Human Resources',
  'Full HR access including pay rates, payroll, and team management',
  false,
  true,
  '{
    "dashboard": true,
    "hr_team_view": true,
    "hr_team_create": true,
    "hr_team_edit": true,
    "hr_team_delete": true,
    "hr_team_export": true,
    "hr_kiosk": true,
    "hr_manager": true,
    "hr_dept_view": true,
    "hr_dept_manage": true,
    "hr_timesheets_view": true,
    "hr_timesheets_approve": true,
    "hr_pto_view": true,
    "hr_pto_approve": true,
    "hr_pto_manage": true,
    "hr_payroll_view": true,
    "hr_payroll_export": true,
    "hr_reports": true,
    "hr_import": true,
    "hr_settings": true,
    "hr_labor_cost": true
  }'::jsonb
FROM companies c
ON CONFLICT DO NOTHING;
