-- Add division and salesperson to takeoffs
ALTER TABLE takeoffs
  ADD COLUMN IF NOT EXISTS division_id uuid REFERENCES divisions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS salesperson_name text;
