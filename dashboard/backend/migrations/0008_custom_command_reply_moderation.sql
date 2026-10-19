-- 0008_custom_command_reply_moderation
-- When a moderator uses the command as a reply, delete the replied-to message
-- and DM its author the response instead of posting it in the channel.
ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS reply_moderation BOOLEAN NOT NULL DEFAULT FALSE;
