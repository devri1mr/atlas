-- Add is_voided flag to lawn_upcoming_revenue so past days that had no work
-- can be formally closed out without deleting the planned revenue history.
ALTER TABLE lawn_upcoming_revenue
  ADD COLUMN IF NOT EXISTS is_voided boolean NOT NULL DEFAULT false;
