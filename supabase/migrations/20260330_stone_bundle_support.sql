-- Stone bundle support:
-- 1. material_choice_question_key: when set on a task material row, the material_id
--    is resolved from the sales answer at apply time instead of being fixed.
-- 2. Drop NOT NULL on material_id so choice-only rows can exist without a fixed material.

ALTER TABLE scope_bundle_task_materials
  ADD COLUMN IF NOT EXISTS material_choice_question_key text;

ALTER TABLE scope_bundle_task_materials
  ALTER COLUMN material_id DROP NOT NULL;
