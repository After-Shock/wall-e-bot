import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const schema = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  discord_id VARCHAR(20) UNIQUE NOT NULL,
  username VARCHAR(100) NOT NULL,
  discriminator VARCHAR(4),
  avatar VARCHAR(100),
  email VARCHAR(255),
  access_token TEXT,
  refresh_token TEXT,
  token_expires TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Guild configs table
CREATE TABLE IF NOT EXISTS guild_configs (
  id SERIAL PRIMARY KEY,
  guild_id VARCHAR(20) UNIQUE NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Guild members table (for leveling)
CREATE TABLE IF NOT EXISTS guild_members (
  id SERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  user_id VARCHAR(20) NOT NULL,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 0,
  total_xp BIGINT DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  voice_minutes INTEGER DEFAULT 0,
  last_xp_gain TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(guild_id, user_id)
);

-- Warnings table
CREATE TABLE IF NOT EXISTS warnings (
  id SERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  user_id VARCHAR(20) NOT NULL,
  moderator_id VARCHAR(20) NOT NULL,
  reason TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Mod actions log table
CREATE TABLE IF NOT EXISTS mod_actions (
  id SERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  target_id VARCHAR(20) NOT NULL,
  moderator_id VARCHAR(20) NOT NULL,
  action VARCHAR(50) NOT NULL,
  reason TEXT,
  duration BIGINT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Reaction roles table
CREATE TABLE IF NOT EXISTS reaction_roles (
  id SERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  channel_id VARCHAR(20) NOT NULL,
  message_id VARCHAR(20) NOT NULL,
  emoji VARCHAR(100) NOT NULL,
  role_id VARCHAR(20) NOT NULL,
  mode VARCHAR(20) DEFAULT 'toggle',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(message_id, emoji)
);

-- Custom commands table
CREATE TABLE IF NOT EXISTS custom_commands (
  id SERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  response TEXT NOT NULL,
  embed_response BOOLEAN DEFAULT FALSE,
  embed_color VARCHAR(7),
  allowed_roles TEXT[] DEFAULT '{}',
  allowed_channels TEXT[] DEFAULT '{}',
  cooldown INTEGER DEFAULT 0,
  delete_command BOOLEAN DEFAULT FALSE,
  created_by VARCHAR(20) NOT NULL,
  uses INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(guild_id, name)
);

-- Reminders table
CREATE TABLE IF NOT EXISTS reminders (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(20) NOT NULL,
  channel_id VARCHAR(20) NOT NULL,
  guild_id VARCHAR(20),
  message TEXT NOT NULL,
  remind_at TIMESTAMP NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Starboard messages table
CREATE TABLE IF NOT EXISTS starboard_messages (
  id SERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  original_message_id VARCHAR(20) NOT NULL,
  original_channel_id VARCHAR(20) NOT NULL,
  starboard_message_id VARCHAR(20),
  star_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(guild_id, original_message_id)
);

-- Scheduled messages table
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id SERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  channel_id VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  embed BOOLEAN DEFAULT FALSE,
  embed_color VARCHAR(7),
  cron_expression VARCHAR(100),
  interval_minutes INTEGER,
  next_run TIMESTAMP NOT NULL,
  last_run TIMESTAMP,
  enabled BOOLEAN DEFAULT TRUE,
  created_by VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Reaction role messages table
CREATE TABLE IF NOT EXISTS reaction_role_messages (
  id SERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  channel_id VARCHAR(20) NOT NULL,
  message_id VARCHAR(20) UNIQUE NOT NULL,
  title VARCHAR(200),
  type VARCHAR(20) DEFAULT 'buttons',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Auto roles table
CREATE TABLE IF NOT EXISTS auto_roles (
  id SERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  role_id VARCHAR(20) NOT NULL,
  delay_minutes INTEGER DEFAULT 0,
  include_bots BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(guild_id, role_id)
);

-- Ticket config table
CREATE TABLE IF NOT EXISTS ticket_config (
  id SERIAL PRIMARY KEY,
  guild_id VARCHAR(20) UNIQUE NOT NULL,
  channel_id VARCHAR(20),
  category_id VARCHAR(20),
  support_role_id VARCHAR(20),
  panel_title VARCHAR(200),
  panel_description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tickets table
CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  channel_id VARCHAR(20) NOT NULL,
  user_id VARCHAR(20) NOT NULL,
  ticket_number INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'open',
  claimed_by VARCHAR(20),
  closed_by VARCHAR(20),
  closed_at TIMESTAMP,
  close_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Temp bans table
CREATE TABLE IF NOT EXISTS temp_bans (
  id SERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  user_id VARCHAR(20) NOT NULL,
  moderator_id VARCHAR(20) NOT NULL,
  reason TEXT,
  duration BIGINT NOT NULL,
  unban_at TIMESTAMP NOT NULL,
  unbanned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add label column to reaction_roles if not exists
ALTER TABLE reaction_roles ADD COLUMN IF NOT EXISTS label VARCHAR(100);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_guild_members_guild ON guild_members(guild_id);
CREATE INDEX IF NOT EXISTS idx_guild_members_xp ON guild_members(guild_id, total_xp DESC);
CREATE INDEX IF NOT EXISTS idx_warnings_guild_user ON warnings(guild_id, user_id);
CREATE INDEX IF NOT EXISTS idx_mod_actions_guild ON mod_actions(guild_id);
CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders(remind_at) WHERE completed = FALSE;
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_next ON scheduled_messages(next_run) WHERE enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_temp_bans_unban ON temp_bans(unban_at) WHERE unbanned = FALSE;
CREATE INDEX IF NOT EXISTS idx_tickets_guild_user ON tickets(guild_id, user_id);
`;

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Running migrations...');
    await pool.query(schema);
    console.log('Migrations completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
