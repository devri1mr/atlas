-- Add foreign key from at_employees.division_id to at_divisions.id
-- Required for Supabase to resolve the relationship in select queries

ALTER TABLE at_employees
  ADD CONSTRAINT at_employees_division_id_fkey
  FOREIGN KEY (division_id) REFERENCES at_divisions(id)
  ON DELETE SET NULL;
