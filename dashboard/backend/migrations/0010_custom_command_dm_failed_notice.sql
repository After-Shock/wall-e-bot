-- 0010_custom_command_dm_failed_notice
-- Text posted in the channel (after the user's mention) when a reply-moderation
-- DM can't be delivered. NULL falls back to a generic notice.
ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS reply_dm_failed_notice TEXT;
