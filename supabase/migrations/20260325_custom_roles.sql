-- Custom roles table
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_admin boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  permissions jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES roles(id) ON DELETE SET NULL;

-- Seed system roles for each existing company
INSERT INTO roles (company_id, name, description, is_admin, is_system, permissions)
SELECT c.id, v.name, v.description, v.is_admin, true, v.permissions::jsonb
FROM companies c
CROSS JOIN (VALUES
  ('Admin', 'Full system access — cannot be restricted', true, '{}'),
  ('Sales', 'Bid creation, takeoff, and client management', false, '{"dashboard":true,"bids_view":true,"bids_create":true,"bids_edit":true,"bids_share":true,"takeoff_view":true,"takeoff_create":true,"takeoff_edit":true,"mat_catalog_view":true,"mat_inventory_view":true,"mat_pricing_view":true,"perf_view":true}'),
  ('Sales Coordinator', 'Bid support and coordination', false, '{"dashboard":true,"bids_view":true,"bids_edit":true,"takeoff_view":true,"takeoff_edit":true,"mat_catalog_view":true,"mat_inventory_view":true,"mat_pricing_view":true,"perf_view":true}'),
  ('Production', 'Field operations and HR access', false, '{"dashboard":true,"bids_view":true,"takeoff_view":true,"mat_catalog_view":true,"mat_inventory_view":true,"mat_inventory_edit":true,"hr_team_view":true,"hr_kiosk":true,"hr_dept_view":true,"hr_timesheets_view":true,"hr_pto_view":true}')
) AS v(name, description, is_admin, permissions)
ON CONFLICT DO NOTHING;

-- Map existing users to new role_id
UPDATE user_profiles up
SET role_id = r.id
FROM roles r
WHERE
  (up.role = 'admin'             AND r.name = 'Admin'             AND r.is_system = true) OR
  (up.role = 'sales'             AND r.name = 'Sales'             AND r.is_system = true) OR
  (up.role = 'sales_coordinator' AND r.name = 'Sales Coordinator' AND r.is_system = true) OR
  (up.role = 'production'        AND r.name = 'Production'        AND r.is_system = true);
