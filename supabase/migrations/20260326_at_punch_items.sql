-- Add at_division_id to at_punches (for time-clock-only punch items)
ALTER TABLE at_punches ADD COLUMN IF NOT EXISTS at_division_id uuid REFERENCES at_divisions(id) ON DELETE SET NULL;

-- Add division_id to at_divisions (to link a time-clock-only item to a parent company division)
ALTER TABLE at_divisions ADD COLUMN IF NOT EXISTS division_id uuid REFERENCES divisions(id) ON DELETE SET NULL;
