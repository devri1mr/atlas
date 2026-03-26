-- Fix: at_employees.division_id should reference `divisions` (company-level),
-- not `at_divisions` (time-clock-only extras).

ALTER TABLE at_employees
  DROP CONSTRAINT IF EXISTS at_employees_division_id_fkey;

ALTER TABLE at_employees
  ADD CONSTRAINT at_employees_division_id_fkey
  FOREIGN KEY (division_id) REFERENCES divisions(id)
  ON DELETE SET NULL;
