-- 0011_reply_moderation_escalation
-- Offenses stay as history; `active` drops to FALSE on /offenses reset or one
-- year after the user's latest offense, and only active ones drive escalation.
ALTER TABLE custom_command_actions ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

-- Escalating commands time the user out (1h, 1d, 1w) and alert this channel at 1w.
ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS reply_escalation BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS reply_escalation_channel_id VARCHAR(20);
