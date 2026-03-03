# Custom Commands — Full Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `enabled`, `case_sensitive`, and `trigger_on_edit` toggles to custom commands, wire the dashboard Custom Commands page to the real API, and handle message edits as triggers.

**Architecture:** DB gets 3 new columns on `custom_commands`. A new REST router handles CRUD for commands per guild. `messageCreate.ts` gains `enabled`/`case_sensitive` checks. A new `messageUpdate.ts` event mirrors the trigger logic for `trigger_on_edit` commands. The frontend replaces mock state with real API queries/mutations and adds toggle UI.

**Tech Stack:** PostgreSQL (JSONB, ALTER TABLE), Express + Zod, discord.js `Events.MessageUpdate`, React + TanStack Query v5.

---

### Task 1: DB — Add columns to custom_commands

**Files:**
- Modify: `dashboard/backend/src/db/migrate.ts`

**Step 1: Add the ALTER TABLE statements** after the existing `guild_whitelist` columns block:

```sql
ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS case_sensitive BOOLEAN DEFAULT FALSE;
ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS trigger_on_edit BOOLEAN DEFAULT FALSE;
ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT TRUE;
```

Add these lines at the bottom of the `schema` string, before the closing backtick.

**Step 2: Verify TypeScript compiles**

```bash
cd /home/plex/wall-e-bot && node_modules/.bin/tsc --noEmit -p dashboard/backend/tsconfig.json 2>&1 | grep -v connect-redis
```
Expected: no output (no errors).

**Step 3: Commit**

```bash
git add dashboard/backend/src/db/migrate.ts
git commit -m "feat: add case_sensitive, trigger_on_edit, enabled columns to custom_commands"
```

---

### Task 2: Backend — Custom Commands CRUD router

**Files:**
- Create: `dashboard/backend/src/routes/customCommands.ts`
- Modify: `dashboard/backend/src/index.ts` (register router)

**Step 1: Create the router file**

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth, requireGuildAccess } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logger } from '../utils/logger.js';

export const customCommandsRouter = Router({ mergeParams: true });

customCommandsRouter.use(requireAuth, requireGuildAccess);

const CommandSchema = z.object({
  name: z.string().min(1).max(100).toLowerCase(),
  response: z.string().min(1).max(2000),
  embed_response: z.boolean().default(false),
  embed_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  cooldown: z.number().int().min(0).max(3600).default(0),
  delete_command: z.boolean().default(false),
  case_sensitive: z.boolean().default(false),
  trigger_on_edit: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

// GET /api/guilds/:guildId/custom-commands
customCommandsRouter.get('/', asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const result = await db.query(
    `SELECT id, name, response, embed_response, embed_color, cooldown,
            delete_command, case_sensitive, trigger_on_edit, enabled, uses, created_at
     FROM custom_commands WHERE guild_id = $1 ORDER BY name`,
    [guildId]
  );
  res.json(result.rows);
}));

// POST /api/guilds/:guildId/custom-commands
customCommandsRouter.post('/', asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const parsed = CommandSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    return;
  }
  const d = parsed.data;

  // Check for duplicate name
  const existing = await db.query(
    'SELECT id FROM custom_commands WHERE guild_id = $1 AND name = $2',
    [guildId, d.name]
  );
  if (existing.rows.length > 0) {
    res.status(409).json({ error: `Command "${d.name}" already exists` });
    return;
  }

  const result = await db.query(
    `INSERT INTO custom_commands
       (guild_id, name, response, embed_response, embed_color, cooldown,
        delete_command, case_sensitive, trigger_on_edit, enabled, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [guildId, d.name, d.response, d.embed_response, d.embed_color ?? null,
     d.cooldown, d.delete_command, d.case_sensitive, d.trigger_on_edit,
     d.enabled, (req as any).user?.discord_id ?? 'dashboard']
  );
  logger.info(`Custom command created: ${d.name} in ${guildId}`);
  res.status(201).json(result.rows[0]);
}));

// PATCH /api/guilds/:guildId/custom-commands/:commandId
customCommandsRouter.patch('/:commandId', asyncHandler(async (req, res) => {
  const { guildId, commandId } = req.params;
  const parsed = CommandSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    return;
  }
  const d = parsed.data;
  const fields = Object.keys(d) as (keyof typeof d)[];
  if (fields.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  const setClauses = fields.map((f, i) => `${f} = $${i + 3}`).join(', ');
  const values = fields.map(f => d[f]);

  const result = await db.query(
    `UPDATE custom_commands SET ${setClauses}, updated_at = NOW()
     WHERE id = $1 AND guild_id = $2 RETURNING *`,
    [commandId, guildId, ...values]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Command not found' });
    return;
  }
  res.json(result.rows[0]);
}));

// DELETE /api/guilds/:guildId/custom-commands/:commandId
customCommandsRouter.delete('/:commandId', asyncHandler(async (req, res) => {
  const { guildId, commandId } = req.params;
  const result = await db.query(
    'DELETE FROM custom_commands WHERE id = $1 AND guild_id = $2 RETURNING name',
    [commandId, guildId]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Command not found' });
    return;
  }
  logger.info(`Custom command deleted: ${result.rows[0].name} in ${guildId}`);
  res.json({ success: true });
}));
```

**Step 2: Register router in `dashboard/backend/src/index.ts`**

Find where other guild sub-routes are registered. Add:
```typescript
import { customCommandsRouter } from './routes/customCommands.js';
// ...
app.use('/api/guilds/:guildId/custom-commands', customCommandsRouter);
```

**Step 3: Check index.ts imports and router registration pattern** — look for how `guildsRouter` is mounted to match the style.

**Step 4: Verify TypeScript compiles**

```bash
cd /home/plex/wall-e-bot && node_modules/.bin/tsc --noEmit -p dashboard/backend/tsconfig.json 2>&1 | grep -v connect-redis
```
Expected: no output.

**Step 5: Commit**

```bash
git add dashboard/backend/src/routes/customCommands.ts dashboard/backend/src/index.ts
git commit -m "feat: add custom commands CRUD API endpoints"
```

---

### Task 3: Bot — Update messageCreate trigger logic

**Files:**
- Modify: `bot/src/events/messageCreate.ts`

**Step 1: Update the DB query and add enabled/case_sensitive checks**

Replace the existing custom command block in `messageCreate.ts`:

```typescript
// Handle custom commands (guild only)
if (message.guild && message.channel.isTextBased() && 'send' in message.channel) {
  const config = await client.db.getGuildConfig(message.guild.id);
  const prefix = config?.prefix ?? '!';
  if (message.content.startsWith(prefix)) {
    const rawName = message.content.slice(prefix.length).trim().split(/\s+/)[0];
    if (rawName) {
      const result = await client.db.pool.query(
        `SELECT response, embed_response, embed_color, delete_command, case_sensitive, enabled
         FROM custom_commands
         WHERE guild_id = $1
           AND enabled = TRUE
           AND (CASE WHEN case_sensitive THEN name = $2 ELSE name = lower($2) END)`,
        [message.guild.id, rawName]
      );
      if (result.rows.length > 0) {
        const cmd = result.rows[0];
        const channel = message.channel as import('discord.js').TextChannel;

        if (cmd.delete_command) await message.delete().catch(() => {});

        if (cmd.embed_response) {
          const { EmbedBuilder } = await import('discord.js');
          const embed = new EmbedBuilder()
            .setDescription(cmd.response)
            .setColor(cmd.embed_color ?? '#5865F2');
          await channel.send({ embeds: [embed] });
        } else {
          await channel.send(cmd.response);
        }

        client.db.pool.query(
          'UPDATE custom_commands SET uses = uses + 1 WHERE guild_id = $1 AND (CASE WHEN case_sensitive THEN name = $2 ELSE name = lower($2) END)',
          [message.guild.id, rawName]
        ).catch(() => {});
      }
    }
  }
}
```

Key changes from before:
- Added `AND enabled = TRUE` to the query — disabled commands are skipped
- Added `CASE WHEN case_sensitive THEN name = $2 ELSE name = lower($2) END` — case insensitive matching when not case_sensitive

**Step 2: Verify TypeScript compiles**

```bash
cd /home/plex/wall-e-bot && node_modules/.bin/tsc --noEmit -p bot/tsconfig.json 2>&1
```
Expected: no output.

**Step 3: Commit**

```bash
git add bot/src/events/messageCreate.ts
git commit -m "feat: apply enabled and case_sensitive checks to custom command trigger"
```

---

### Task 4: Bot — Add messageUpdate event for trigger_on_edit

**Files:**
- Create: `bot/src/events/messageUpdate.ts`

**Step 1: Create the event handler**

```typescript
import { Events } from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.MessageUpdate,
  once: false,
  async execute(client: WallEClient, oldMessage: any, newMessage: any) {
    if (!newMessage.guild || newMessage.author?.bot) return;
    // Ignore if content hasn't changed
    if (oldMessage.content === newMessage.content) return;

    // Whitelist check (same as messageCreate)
    const wl = await client.db.pool.query(
      'SELECT status, permanent, expires_at FROM guild_whitelist WHERE guild_id = $1',
      [newMessage.guild.id]
    ).catch(() => null);
    const wlRow = wl?.rows[0];
    const expired = !wlRow?.permanent && wlRow?.expires_at && new Date(wlRow.expires_at) < new Date();
    if ((wlRow?.status !== 'approved' || expired) && newMessage.author?.id !== process.env.BOT_OWNER_ID) return;

    if (!newMessage.channel?.isTextBased() || !('send' in newMessage.channel)) return;

    try {
      const config = await client.db.getGuildConfig(newMessage.guild.id);
      const prefix = config?.prefix ?? '!';
      const content = newMessage.content ?? '';

      if (!content.startsWith(prefix)) return;

      const rawName = content.slice(prefix.length).trim().split(/\s+/)[0];
      if (!rawName) return;

      const result = await client.db.pool.query(
        `SELECT response, embed_response, embed_color, delete_command, case_sensitive
         FROM custom_commands
         WHERE guild_id = $1
           AND enabled = TRUE
           AND trigger_on_edit = TRUE
           AND (CASE WHEN case_sensitive THEN name = $2 ELSE name = lower($2) END)`,
        [newMessage.guild.id, rawName]
      );
      if (result.rows.length === 0) return;

      const cmd = result.rows[0];

      if (cmd.embed_response) {
        const { EmbedBuilder } = await import('discord.js');
        const embed = new EmbedBuilder()
          .setDescription(cmd.response)
          .setColor(cmd.embed_color ?? '#5865F2');
        await newMessage.channel.send({ embeds: [embed] });
      } else {
        await newMessage.channel.send(cmd.response);
      }

      client.db.pool.query(
        'UPDATE custom_commands SET uses = uses + 1 WHERE guild_id = $1 AND (CASE WHEN case_sensitive THEN name = $2 ELSE name = lower($2) END)',
        [newMessage.guild.id, rawName]
      ).catch(() => {});
    } catch (error) {
      logger.error('Error in messageUpdate custom command handler:', error);
    }
  },
};
```

**Step 2: Verify TypeScript compiles**

```bash
cd /home/plex/wall-e-bot && node_modules/.bin/tsc --noEmit -p bot/tsconfig.json 2>&1
```
Expected: no output.

**Step 3: Commit**

```bash
git add bot/src/events/messageUpdate.ts
git commit -m "feat: trigger custom commands on message edits via trigger_on_edit flag"
```

---

### Task 5: Frontend — Wire CustomCommandsPage to real API with toggles

**Files:**
- Modify: `dashboard/frontend/src/pages/guild/CustomCommandsPage.tsx`

**Step 1: Replace the entire file with a version that:**
- Fetches commands from `GET /api/guilds/:guildId/custom-commands`
- Creates via `POST /api/guilds/:guildId/custom-commands`
- Updates via `PATCH /api/guilds/:guildId/custom-commands/:id`
- Deletes via `DELETE /api/guilds/:guildId/custom-commands/:id`
- Uses TanStack Query v5 (`useQuery`, `useMutation`, `useQueryClient`)
- Adds 3 toggle switches in the editor: **Enabled**, **Case Sensitive**, **Trigger on Edits**
- Shows the actual guild prefix (from `generalConfig`) in the command list and editor prefix label
- Removes all mock data (the hardcoded `rules` command)

**Interface shape** (match what the backend returns):
```typescript
interface CustomCommand {
  id: number;
  name: string;
  response: string;
  embed_response: boolean;
  embed_color: string | null;
  cooldown: number;
  delete_command: boolean;
  case_sensitive: boolean;
  trigger_on_edit: boolean;
  enabled: boolean;
  uses: number;
  created_at: string;
}
```

**Editor default state:**
```typescript
const emptyCommand = (): Partial<CustomCommand> => ({
  name: '',
  response: '',
  embed_response: false,
  embed_color: null,
  cooldown: 0,
  delete_command: false,
  case_sensitive: false,
  trigger_on_edit: false,
  enabled: true,
});
```

**Toggle component** (inline, reuse 3 times):
```tsx
function Toggle({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-discord-light">{description}</div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${checked ? 'bg-green-500' : 'bg-discord-dark'}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}
```

**Mutation pattern** (TanStack Query v5 — no `onSuccess` in `useQuery`):
```typescript
const createCmd = useMutation({
  mutationFn: (data: Partial<CustomCommand>) =>
    api.post(`/api/guilds/${guildId}/custom-commands`, data).then(r => r.data),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['custom-commands', guildId] }),
});

const updateCmd = useMutation({
  mutationFn: ({ id, ...data }: Partial<CustomCommand> & { id: number }) =>
    api.patch(`/api/guilds/${guildId}/custom-commands/${id}`, data).then(r => r.data),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['custom-commands', guildId] }),
});

const deleteCmd = useMutation({
  mutationFn: (id: number) =>
    api.delete(`/api/guilds/${guildId}/custom-commands/${id}`),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['custom-commands', guildId] }),
});
```

**Save handler** (distinguish create vs update by presence of `editingCommand.id`):
```typescript
const saveCommand = () => {
  if (!editingCommand?.name || !editingCommand?.response) return;
  if (editingCommand.id) {
    updateCmd.mutate(editingCommand as CustomCommand & { id: number }, {
      onSuccess: () => { setShowEditor(false); setEditingCommand(null); }
    });
  } else {
    createCmd.mutate(editingCommand, {
      onSuccess: () => { setShowEditor(false); setEditingCommand(null); }
    });
  }
};
```

**Quick-toggle enabled** from the list view (without opening editor):
```typescript
// Inline enable/disable toggle on command row
onClick={() => updateCmd.mutate({ id: cmd.id, enabled: !cmd.enabled })
```

**Step 2: Verify TypeScript compiles**

```bash
cd /home/plex/wall-e-bot && node_modules/.bin/tsc --noEmit -p dashboard/frontend/tsconfig.json 2>&1 | grep CustomCommands
```
Expected: no output.

**Step 3: Commit**

```bash
git add dashboard/frontend/src/pages/guild/CustomCommandsPage.tsx
git commit -m "feat: wire CustomCommandsPage to real API, add enabled/case_sensitive/trigger_on_edit toggles"
```

---

### Task 6: Deploy

**Step 1: Run migrations on VPS**

```bash
# SSH to VPS then:
docker compose -f /opt/wall-e-bot/docker/docker-compose.yml exec backend node dist/db/migrate.js
```
Expected: `Migrations completed successfully!`

**Step 2: Rebuild and restart all changed containers**

```bash
docker compose -f /opt/wall-e-bot/docker/docker-compose.yml build --no-cache bot backend frontend
docker compose -f /opt/wall-e-bot/docker/docker-compose.yml up -d bot backend frontend
```

**Step 3: Verify bot loaded messageUpdate event**

```bash
docker compose -f /opt/wall-e-bot/docker/docker-compose.yml logs bot --tail=30
```
Expected: `Loaded event: messageUpdate` in the startup log.

---

## Files Modified
- `dashboard/backend/src/db/migrate.ts`
- `dashboard/backend/src/routes/customCommands.ts` *(new)*
- `dashboard/backend/src/index.ts`
- `bot/src/events/messageCreate.ts`
- `bot/src/events/messageUpdate.ts` *(new)*
- `dashboard/frontend/src/pages/guild/CustomCommandsPage.tsx`
