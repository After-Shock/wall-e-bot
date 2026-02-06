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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_guild_members_guild ON guild_members(guild_id);
CREATE INDEX IF NOT EXISTS idx_guild_members_xp ON guild_members(guild_id, total_xp DESC);
CREATE INDEX IF NOT EXISTS idx_warnings_guild_user ON warnings(guild_id, user_id);
CREATE INDEX IF NOT EXISTS idx_mod_actions_guild ON mod_actions(guild_id);
CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders(remind_at) WHERE completed = FALSE;
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
