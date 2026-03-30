-- Allow material_select as a valid input_type for scope_bundle_questions
ALTER TABLE scope_bundle_questions
  DROP CONSTRAINT IF EXISTS chk_scope_bundle_questions_input_type;

ALTER TABLE scope_bundle_questions
  ADD CONSTRAINT chk_scope_bundle_questions_input_type
  CHECK (input_type IN ('number', 'checkbox', 'text', 'material_select'));
