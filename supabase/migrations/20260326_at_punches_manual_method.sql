-- Allow 'manual' as a punch_method value (used when manager adds a punch for a past date)
ALTER TABLE at_punches DROP CONSTRAINT IF EXISTS at_punches_punch_method_check;
ALTER TABLE at_punches ADD CONSTRAINT at_punches_punch_method_check
  CHECK (punch_method IN ('kiosk', 'admin', 'manual'));
