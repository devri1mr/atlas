-- Add invite_sent column to track whether the invitation email has been sent
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS invite_sent BOOLEAN DEFAULT FALSE;

-- Mark all existing users as already invited (they were created via the old flow)
UPDATE user_profiles SET invite_sent = TRUE WHERE invite_sent IS NULL OR invite_sent = FALSE;
