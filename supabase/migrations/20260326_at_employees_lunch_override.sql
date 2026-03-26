-- Per-employee lunch deduction overrides (null = inherit from global at_settings)
ALTER TABLE at_employees ADD COLUMN IF NOT EXISTS lunch_auto_deduct boolean DEFAULT NULL;
ALTER TABLE at_employees ADD COLUMN IF NOT EXISTS lunch_deduct_after_hours numeric(4,2) DEFAULT NULL;
ALTER TABLE at_employees ADD COLUMN IF NOT EXISTS lunch_deduct_minutes integer DEFAULT NULL;
