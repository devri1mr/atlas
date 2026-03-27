-- Add show_in_ops column to divisions table
-- Controls whether a division appears as a sub-menu item under the Operations nav section

ALTER TABLE divisions
  ADD COLUMN IF NOT EXISTS show_in_ops boolean NOT NULL DEFAULT false;
