# Custom Commands Overhaul — Design Document

## Goal

Rebuild the custom commands system to match YAGPDB-style functionality: multiple trigger types (command, starts_with, contains, exact_match, regex, reaction, interval), multiple random responses per command, Handlebars template engine for dynamic responses, and command groups with shared access control.

## Architecture

### Data Model

#### New table: `command_groups`
```sql
CREATE TABLE command_groups (
  id               SERIAL PRIMARY KEY,
  guild_id         VARCHAR(20) NOT NULL,
  name             VARCHAR(100) NOT NULL,
  description      TEXT,
  allowed_roles    TEXT[] DEFAULT '{}',
  allowed_channels TEXT[] DEFAULT '{}',
  ignore_roles     TEXT[] DEFAULT '{}',
  ignore_channels  TEXT[] DEFAULT '{}',
  position         INTEGER DEFAULT 0,
  created_at       TIMESTAMP DEFAULT NOW()
);
```

#### Changes to `custom_commands`
New columns (all via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`):
```sql
trigger_type        VARCHAR(20)  DEFAULT 'command'
  -- values: command | starts_with | contains | exact_match | regex | reaction | interval
group_id            INTEGER      REFERENCES command_groups(id) ON DELETE SET NULL
responses           JSONB        -- array of strings, replaces single response column
interval_cron       VARCHAR(100) -- cron expression e.g. "0 9 * * 1"
interval_channel_id VARCHAR(20)  -- Discord channel ID to post interval responses
reaction_message_id VARCHAR(20)
reaction_channel_id VARCHAR(20)
reaction_emoji      VARCHAR(100) -- unicode emoji or custom emoji ID
reaction_type       VARCHAR(10)  -- add | remove | both
```

Migration backfill: `UPDATE custom_commands SET responses = jsonb_build_array(response) WHERE responses IS NULL`

The old `response` column is kept but ignored by the bot and API once `responses` is populated.

#### Updated `shared/src/types/guild.ts`
```typescript
export type TriggerType =
  | 'command' | 'starts_with' | 'contains'
  | 'exact_match' | 'regex' | 'reaction' | 'interval';

export interface CommandGroup {
  id: number;
  guildId: string;
  name: string;
  description?: string;
  allowedRoles: string[];
  allowedChannels: string[];
  ignoreRoles: string[];
  ignoreChannels: string[];
  position: number;
  createdAt: Date;
}

export interface CustomCommand {
  id: number;
  guildId: string;
  name: string;             // display name / trigger string
  triggerType: TriggerType;
  groupId?: number;
  responses: string[];      // array; bot picks one randomly
  embedResponse: boolean;
  embedColor?: string;
  cooldown: number;
  deleteCommand: boolean;
  caseSensitive: boolean;
  triggerOnEdit: boolean;
  enabled: boolean;
  allowedRoles: string[];
  allowedChannels: string[];
  // Interval
  intervalCron?: string;
  intervalChannelId?: string;
  // Reaction
  reactionMessageId?: string;
  reactionChannelId?: string;
  reactionEmoji?: string;
  reactionType?: 'add' | 'remove' | 'both';
  // Stats
  uses: number;
  createdBy: string;
  createdAt: Date;
}
```

---

### Template Engine (Handlebars)

Install `handlebars` in `bot/`. Create `bot/src/services/TemplateService.ts`.

**Context object passed to every render:**
```typescript
{
  user: string,          // <@userId> mention
  username: string,      // display name
  userId: string,        // raw snowflake
  server: string,        // guild name
  memberCount: number,
  channel: string,       // #channel-name
  channelId: string,
  args: string[],        // message words after trigger (also joined as string via {{args}})
}
```

**Custom helpers registered at startup:**
```
{{randint 1 100}}            → random integer min–max inclusive
{{choose "a" "b" "c"}}       → picks one argument at random
{{upper str}}                → uppercase
{{lower str}}                → lowercase
{{time "HH:mm"}}             → current time (moment.js or date-fns)
{{date "YYYY-MM-DD"}}        → current date
```

**Validation:** Templates are compiled at save time. Handlebars `compile()` throws on syntax errors → backend returns 400 with the parse error message.

**Caching:** `TemplateService` keeps a `Map<commandId, HandlebarsTemplateDelegate[]>` — recompile on command update.

---

### Bot Changes

#### `messageCreate.ts` — extended trigger matching
Load all enabled non-interval, non-reaction commands for the guild once per message (cached per guild with short TTL). For each command, test based on `trigger_type`:

| type | test |
|---|---|
| `command` | `content.startsWith(prefix + name)` (case-insensitive unless `caseSensitive`) |
| `starts_with` | `content.startsWith(name)` |
| `contains` | `content.includes(name)` |
| `exact_match` | `content === name` |
| `regex` | `new RegExp(name, caseSensitive ? '' : 'i').test(content)` |

On match: pick random response from `responses[]`, render via TemplateService, send (plain or embed).

#### New: `bot/src/events/reactionAdd.ts` + `reactionRemove.ts`
On `messageReactionAdd` / `messageReactionRemove`:
1. Query `custom_commands` where `trigger_type = 'reaction'` and `reaction_message_id = event.messageId` and `guild_id = guild`
2. Filter by emoji match and reaction_type (add/remove/both)
3. Render and post response to same channel

#### New: `bot/src/services/SchedulerService.ts`
Uses `node-cron`. On bot `ready`:
- Load all `trigger_type = 'interval'` commands across all guilds
- Register a cron job per command using `interval_cron`
- On fire: pick random response, render (context has server/channel info only — no user), post to `interval_channel_id`
- Maintain `Map<commandId, CronJob>` — add/update/delete jobs when commands change via a `refresh(commandId)` method called from the API route

---

### Backend API Changes

#### New routes in `dashboard/backend/src/routes/commandGroups.ts`
```
GET    /api/guilds/:guildId/command-groups          → list groups
POST   /api/guilds/:guildId/command-groups          → create group
PATCH  /api/guilds/:guildId/command-groups/:id      → update group
DELETE /api/guilds/:guildId/command-groups/:id      → delete group (commands set group_id = null)
```

#### Updated `customCommands.ts` validation schema
```typescript
const CommandSchema = z.object({
  name: z.string().min(1).max(100),
  trigger_type: z.enum(['command','starts_with','contains','exact_match','regex','reaction','interval']).default('command'),
  group_id: z.number().int().nullable().optional(),
  responses: z.array(z.string().min(1).max(2500)).min(1).max(20),
  embed_response: z.boolean().default(false),
  embed_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  cooldown: z.number().int().min(0).max(3600).default(0),
  delete_command: z.boolean().default(false),
  case_sensitive: z.boolean().default(false),
  trigger_on_edit: z.boolean().default(false),
  enabled: z.boolean().default(true),
  allowed_roles: z.array(z.string()).default([]),
  allowed_channels: z.array(z.string()).default([]),
  // Interval
  interval_cron: z.string().optional().nullable(),
  interval_channel_id: z.string().optional().nullable(),
  // Reaction
  reaction_message_id: z.string().optional().nullable(),
  reaction_channel_id: z.string().optional().nullable(),
  reaction_emoji: z.string().optional().nullable(),
  reaction_type: z.enum(['add','remove','both']).optional().nullable(),
});
```

On POST/PATCH: if `trigger_type === 'regex'`, validate `new RegExp(name)` and return 400 on error. Validate Handlebars syntax for each response string.

After save/update/delete: call `SchedulerService.refresh(commandId)` if trigger_type is interval.

---

### Frontend UI

#### Layout — `CustomCommandsPage.tsx`
Two-panel layout:
- **Left (sidebar, w-64):** Group list with collapsible command items per group + ungrouped section. "New Group" button at top. Each group header has edit/delete icons.
- **Right (main):** Command editor, replaces current full-page editor.

#### Command list item
`[TYPE BADGE] trigger text  [enable toggle] [edit] [delete]`

Type badge colors:
- `COMMAND` → blurple
- `REGEX` → orange
- `INTERVAL` → green
- `REACTION` → pink
- `STARTS WITH / CONTAINS / EXACT` → gray

#### Command editor
1. **Display Name** (optional) + **Trigger Type** dropdown
2. **Trigger input** — label/placeholder changes per type:
   - command → "Command name (without prefix)"
   - starts_with → "Starts with text"
   - contains → "Contains text"
   - exact_match → "Exact message text"
   - regex → "Regex pattern" + live green/red validity border
   - reaction → Message ID + Channel ID + Emoji + Add/Remove/Both radio
   - interval → Cron expression + Channel picker + "Next run: …" preview
3. **Group** dropdown (None + all groups)
4. **Responses** — list of editors (CodeMirror on desktop, textarea on mobile), each removable. "+ Add Response" appends a new one. Label says "Response 1 of N — picked randomly".
5. **Behavior toggles** — Enabled, Case Sensitive, Trigger on Edit, Delete Command, Embed Response
6. **Access Control** — Allowed Roles chips, Allowed Channels chips
7. **Template Reference** — collapsible panel listing all `{{variables}}` and helpers with click-to-insert

#### Group editor (inline, expands on group row click)
Name, Description, Allowed Roles, Allowed Channels, Ignore Roles, Ignore Channels.

---

## Files Modified / Created

**Shared:**
- `shared/src/types/guild.ts` — add `TriggerType`, `CommandGroup`, update `CustomCommand`

**Bot:**
- `bot/src/events/messageCreate.ts` — extend trigger matching for all message types
- `bot/src/events/reactionAdd.ts` — new file
- `bot/src/events/reactionRemove.ts` — new file
- `bot/src/services/TemplateService.ts` — new file
- `bot/src/services/SchedulerService.ts` — new file
- `bot/src/index.ts` — register reaction events + init SchedulerService
- `bot/package.json` — add `handlebars`, `node-cron`, `@types/node-cron`

**Backend:**
- `dashboard/backend/src/db/migrate.ts` — add command_groups table + new columns
- `dashboard/backend/src/routes/customCommands.ts` — updated schema, regex/template validation
- `dashboard/backend/src/routes/commandGroups.ts` — new file
- `dashboard/backend/src/index.ts` — register commandGroups router

**Frontend:**
- `dashboard/frontend/src/pages/guild/CustomCommandsPage.tsx` — full redesign
- `dashboard/frontend/package.json` — no new deps (Handlebars only on bot/backend)

## Tech Stack

- Existing: React 18, TailwindCSS, TanStack Query, Express, discord.js, PostgreSQL
- New: `handlebars` (bot), `node-cron` (bot), `@types/node-cron` (bot)
