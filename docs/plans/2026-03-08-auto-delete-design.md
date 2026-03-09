# Auto-Delete Design

## Goal

Per-channel automatic message cleanup: delete messages older than a configurable age and/or keep only the most recent N messages. Messages from exempt roles and pinned messages are always skipped.

## Architecture

- **DB**: `auto_delete_channels` table — one row per configured channel
- **Bot**: `checkAutoDelete()` in `SchedulerService`, runs every hour
- **Backend**: REST routes under `/api/guilds/:guildId/auto-delete`
- **Frontend**: new "Auto-Delete" tab in the guild settings sidebar

## Data Model

```sql
CREATE TABLE auto_delete_channels (
  id             SERIAL PRIMARY KEY,
  guild_id       VARCHAR(20) NOT NULL,
  channel_id     VARCHAR(20) NOT NULL,
  max_age_hours  INTEGER,              -- null = no time limit
  max_messages   INTEGER,              -- null = no count limit
  exempt_roles   TEXT[] DEFAULT '{}',
  enabled        BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMP DEFAULT NOW(),
  UNIQUE (guild_id, channel_id)
);
```

At least one of `max_age_hours` or `max_messages` must be set per row.

## Bot Cleanup Logic

`checkAutoDelete()` runs every hour in `SchedulerService` alongside `checkAutoClose()`.

For each enabled channel:
1. Fetch all messages via Discord API (paginated 100 at a time using `before` cursor)
2. Filter out pinned messages (`message.pinned === true`)
3. Filter out messages from exempt roles (check `message.member.roles.cache`)
4. Apply rules — a message is deleted if it fails **either** rule:
   - **Time-based**: `message.createdAt < now - max_age_hours`
   - **Count-based**: message is not in the newest `max_messages` messages
5. Split into two buckets:
   - Messages < 14 days old → `channel.bulkDelete()` (batches of 100)
   - Messages ≥ 14 days old → delete individually with 1s delay between each
6. Log results; errors per-channel are caught and skipped

## API Routes

All routes use existing `requireAuth` + `requireGuildAccess` middleware.

- `GET    /api/guilds/:guildId/auto-delete` — list all configured channels
- `POST   /api/guilds/:guildId/auto-delete` — add a channel config
- `PATCH  /api/guilds/:guildId/auto-delete/:id` — update (toggle enabled, change limits/roles)
- `DELETE /api/guilds/:guildId/auto-delete/:id` — remove a channel config

## Frontend

New "Auto-Delete" tab in guild sidebar (alongside Commands, Settings, Access, etc.).

**List view**: table of configured channels showing:
- Channel name (resolved from Discord channel list)
- Time limit (e.g. "24 hours" or "—")
- Message limit (e.g. "50 messages" or "—")
- Exempt roles (pills)
- Enabled toggle
- Delete button

**Add/Edit form**:
- Channel dropdown (text channels from `GET /api/guilds/:guildId/channels`)
- Max age in hours (optional number input)
- Max messages (optional number input)
- Exempt roles multi-select (from `GET /api/guilds/:guildId/roles`)
- Validation: at least one of max age or max messages must be set

## Key Constraints

- `bulkDelete` only works for messages < 14 days old (Discord API limit)
- Bot needs `MANAGE_MESSAGES` permission in each configured channel
- Rate limit: individual deletes spaced 1s apart for old messages
- Pinned messages are always preserved regardless of rules
