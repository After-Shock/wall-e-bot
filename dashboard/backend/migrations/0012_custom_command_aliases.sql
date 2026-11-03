-- 0012_custom_command_aliases
-- Extra names a 'command' trigger also answers to (e.g. "nongoals" for "non-goals"),
-- so a common misspelling doesn't need a duplicate command.
ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}';
