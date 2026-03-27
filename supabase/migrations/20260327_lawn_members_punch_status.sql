-- Add punch_status to lawn_production_members
-- 'matched'      = employee found in Atlas AND has a Lawn punch on the report date
-- 'no_punch'     = employee found in Atlas but NO Lawn punch on the report date
-- 'unrecognized' = no matching Atlas employee found

ALTER TABLE lawn_production_members
  ADD COLUMN IF NOT EXISTS punch_status text NOT NULL DEFAULT 'unrecognized';
