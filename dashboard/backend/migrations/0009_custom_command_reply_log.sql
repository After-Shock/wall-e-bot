-- 0009_custom_command_reply_log
-- Reply-moderation commands can post each action to a mod review channel, and
-- every action is recorded so repeat offenders show up in the count.
ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS reply_log_channel_id VARCHAR(20);

CREATE TABLE IF NOT EXISTS custom_command_actions (
  id SERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  command_id INTEGER NOT NULL REFERENCES custom_commands(id) ON DELETE CASCADE,
  target_id VARCHAR(20) NOT NULL,
  moderator_id VARCHAR(20) NOT NULL,
  message_content TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_custom_command_actions_target
  ON custom_command_actions (command_id, target_id);
