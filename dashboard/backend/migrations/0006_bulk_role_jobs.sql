-- 0006_bulk_role_jobs
-- One row per bulk role run. The bot executes queued jobs and records progress here;
-- the dashboard polls it. At most one active job per guild.
CREATE TABLE IF NOT EXISTS bulk_role_jobs (
  id SERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  role_id VARCHAR(20) NOT NULL,
  operation VARCHAR(10) NOT NULL CHECK (operation IN ('add', 'remove')),
  filter_type VARCHAR(20) NOT NULL
    CHECK (filter_type IN ('all', 'humans', 'bots', 'has_roles', 'missing_roles', 'joined_after', 'joined_before')),
  filter_role_ids TEXT[] NOT NULL DEFAULT '{}',
  require_all BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMPTZ,
  notify_channel_id VARCHAR(20),
  status VARCHAR(12) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'cancelling', 'cancelled', 'done', 'failed')),
  total INTEGER,
  processed INTEGER NOT NULL DEFAULT 0,
  changed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_by VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bulk_role_jobs_guild ON bulk_role_jobs (guild_id, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS bulk_role_jobs_one_active ON bulk_role_jobs (guild_id)
  WHERE status IN ('queued', 'running', 'cancelling');
