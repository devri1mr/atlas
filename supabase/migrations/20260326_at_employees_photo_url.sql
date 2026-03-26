-- Add photo_url to at_employees
ALTER TABLE at_employees ADD COLUMN IF NOT EXISTS photo_url text;
