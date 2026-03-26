-- Add labor overhead rate to at_settings (used for labor cost estimation in time clock)
ALTER TABLE at_settings ADD COLUMN IF NOT EXISTS labor_overhead_rate numeric(5,2) DEFAULT 15.00;
