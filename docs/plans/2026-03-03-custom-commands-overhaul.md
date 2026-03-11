# Custom Commands Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild custom commands to support 7 trigger types (command, starts_with, contains, exact_match, regex, reaction, interval), multiple random responses per command, Handlebars template engine, and command groups with shared access control.

**Architecture:** DB migration adds `command_groups` table and new columns to `custom_commands` (trigger_type, responses JSONB array, group_id, interval/reaction fields). A new `TemplateService` handles Handlebars rendering. The existing `SchedulerService` gets interval-command support via `cron-parser`. `messageCreate.ts` is extended to test all message-type triggers. Two new event files handle reactions. The frontend `CustomCommandsPage` is fully redesigned as a two-panel YAGPDB-style UI.

**Tech Stack:** Node.js/TypeScript, Discord.js 14, PostgreSQL, React 18, TailwindCSS, Handlebars.js, cron-parser

---

### Task 1: DB Migration — command_groups + custom_commands new columns

**Files:**
- Modify: `dashboard/backend/src/db/migrate.ts`

**Step 1: Add migration SQL at the bottom of the `schema` string (before the closing backtick)**

Find the last `ALTER TABLE custom_commands` block and add after it:

```sql
-- Command groups for organizing custom commands
CREATE TABLE IF NOT EXISTS command_groups (
  id               SERIAL PRIMARY KEY,
  guild_id         VARCHAR(20) NOT NULL,
  name             VARCHAR(100) NOT NULL,
  description      TEXT,
  allowed_roles    TEXT[] DEFAULT '{}',
  allowed_channels TEXT[] DEFAULT '{}',
  ignore_roles     TEXT[] DEFAULT '{}',
  ignore_channels  TEXT[] DEFAULT '{}',
  position         INTEGER DEFAULT 0,
  created_at       TIMESTAMP DEFAULT NOW(),
  UNIQUE(guild_id, name)
);

-- Custom commands overhaul: trigger types, multiple responses, groups
ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS trigger_type VARCHAR(20) DEFAULT 'command';
ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES command_groups(id) ON DELETE SET NULL;
ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS responses JSONB;
ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS interval_cron VARCHAR(100);
ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS interval_channel_id VARCHAR(20);
ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS interval_next_run TIMESTAMP;
ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS reaction_message_id VARCHAR(20);
ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS reaction_channel_id VARCHAR(20);
ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS reaction_emoji VARCHAR(100);
ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS reaction_type VARCHAR(10) DEFAULT 'add';

-- Backfill responses array from existing response column
UPDATE custom_commands SET responses = jsonb_build_array(response) WHERE responses IS NULL;

CREATE INDEX IF NOT EXISTS idx_custom_commands_guild_trigger ON custom_commands(guild_id, trigger_type) WHERE enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_custom_commands_reaction ON custom_commands(guild_id, reaction_message_id) WHERE trigger_type = 'reaction';
CREATE INDEX IF NOT EXISTS idx_custom_commands_interval ON custom_commands(interval_next_run) WHERE trigger_type = 'interval' AND enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_command_groups_guild ON command_groups(guild_id);
```

**Step 2: Deploy migration to VPS**

```bash
git add dashboard/backend/src/db/migrate.ts
git commit -m "feat: add command_groups table and custom_commands trigger/response columns"
git push origin main
# On VPS:
# docker compose -f docker/docker-compose.yml exec backend node dist/db/migrate.js
```

---

### Task 2: Update shared types

**Files:**
- Modify: `shared/src/types/guild.ts`

**Step 1: Add TriggerType, CommandGroup, update CustomCommand**

Add before the existing `CustomCommand` interface:

```typescript
export type TriggerType =
  | 'command'
  | 'starts_with'
  | 'contains'
  | 'exact_match'
  | 'regex'
  | 'reaction'
  | 'interval';

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
```

Replace the existing `CustomCommand` interface with:

```typescript
export interface CustomCommand {
  id: number;
  guildId: string;
  name: string;
  triggerType: TriggerType;
  groupId?: number | null;
  responses: string[];
  embedResponse: boolean;
  embedColor?: string;
  cooldown: number;
  deleteCommand: boolean;
  caseSensitive: boolean;
  triggerOnEdit: boolean;
  enabled: boolean;
  allowedRoles: string[];
  allowedChannels: string[];
  intervalCron?: string | null;
  intervalChannelId?: string | null;
  reactionMessageId?: string | null;
  reactionChannelId?: string | null;
  reactionEmoji?: string | null;
  reactionType?: 'add' | 'remove' | 'both' | null;
  uses: number;
  createdBy: string;
  createdAt: Date;
}
```

**Step 2: Build shared**

```bash
cd shared && npm run build
```

**Step 3: Commit**

```bash
git add shared/src/types/guild.ts
git commit -m "feat: add TriggerType, CommandGroup types and update CustomCommand"
```

---

### Task 3: Install new bot dependencies

**Files:**
- Modify: `bot/package.json`

**Step 1: Install in bot**

```bash
cd bot && npm install handlebars cron-parser
npm install --save-dev @types/handlebars
```

Note: `handlebars` has built-in types in modern versions, `@types/handlebars` may not be needed — check if `import Handlebars from 'handlebars'` works without it.

**Step 2: Install handlebars in backend (for validation)**

```bash
cd dashboard/backend && npm install handlebars
```

**Step 3: Commit**

```bash
git add bot/package.json bot/package-lock.json dashboard/backend/package.json package-lock.json
git commit -m "feat: add handlebars and cron-parser dependencies"
```

---

### Task 4: Bot — TemplateService

**Files:**
- Create: `bot/src/services/TemplateService.ts`

**Step 1: Create the file**

```typescript
/**
 * Template Service
 *
 * Renders Handlebars templates for custom command responses.
 * All helpers are registered once at construction time.
 */

import Handlebars from 'handlebars';
import { logger } from '../utils/logger.js';

export interface TemplateContext {
  user: string;       // <@userId>
  username: string;   // display name
  userId: string;
  server: string;
  memberCount: number;
  channel: string;    // #channel-name
  channelId: string;
  args: string[];     // words after the trigger
}

export class TemplateService {
  constructor() {
    this.registerHelpers();
  }

  private registerHelpers() {
    // {{randint 1 100}} → random integer min–max inclusive
    Handlebars.registerHelper('randint', (min: number, max: number) => {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    });

    // {{choose "a" "b" "c"}} → picks one at random
    Handlebars.registerHelper('choose', (...args: unknown[]) => {
      const options = args.slice(0, -1) as string[];
      return options[Math.floor(Math.random() * options.length)];
    });

    Handlebars.registerHelper('upper', (str: string) => String(str).toUpperCase());
    Handlebars.registerHelper('lower', (str: string) => String(str).toLowerCase());

    // {{time "HH:mm"}}
    Handlebars.registerHelper('time', (fmt: string) => {
      const n = new Date();
      return String(fmt)
        .replace('HH', String(n.getHours()).padStart(2, '0'))
        .replace('mm', String(n.getMinutes()).padStart(2, '0'))
        .replace('ss', String(n.getSeconds()).padStart(2, '0'));
    });

    // {{date "YYYY-MM-DD"}}
    Handlebars.registerHelper('date', (fmt: string) => {
      const n = new Date();
      return String(fmt)
        .replace('YYYY', String(n.getFullYear()))
        .replace('MM', String(n.getMonth() + 1).padStart(2, '0'))
        .replace('DD', String(n.getDate()).padStart(2, '0'));
    });
  }

  /**
   * Render a Handlebars template string with the given context.
   * Falls back to the raw template if rendering fails.
   */
  render(template: string, context: Partial<TemplateContext> & Record<string, unknown>): string {
    try {
      const fn = Handlebars.compile(template, { noEscape: true });
      return fn(context);
    } catch (error) {
      logger.warn('Template render error:', error);
      return template;
    }
  }

  /**
   * Validate a template string. Returns { valid: true } or { valid: false, error: string }.
   */
  validate(template: string): { valid: true } | { valid: false; error: string } {
    try {
      Handlebars.precompile(template);
      return { valid: true };
    } catch (error: unknown) {
      return { valid: false, error: (error as Error).message };
    }
  }
}
```

**Step 2: Add to WallEClient**

In `bot/src/structures/Client.ts`:

Add import after the existing service imports:
```typescript
import { TemplateService } from '../services/TemplateService.js';
```

Add property declaration after the `public scheduler!: SchedulerService;` line:
```typescript
/** Handlebars template engine for custom command responses */
public template!: TemplateService;
```

In the `start()` method, add after `this.automod = new AutoModService(this);`:
```typescript
this.template = new TemplateService();
```

**Step 3: Commit**

```bash
git add bot/src/services/TemplateService.ts bot/src/structures/Client.ts
git commit -m "feat: add TemplateService with Handlebars helpers"
```

---

### Task 5: Bot — extend SchedulerService for interval commands

**Files:**
- Modify: `bot/src/services/SchedulerService.ts`

**Step 1: Add cron-parser import and interval command method**

At the top of the file, add:
```typescript
import { parseExpression } from 'cron-parser';
```

Replace the `getNextCronRun` private method with a working implementation:
```typescript
private getNextCronRun(expression: string): Date {
  try {
    const interval = parseExpression(expression);
    return interval.next().toDate();
  } catch {
    // Fallback: 1 hour from now
    return new Date(Date.now() + 60 * 60 * 1000);
  }
}
```

Add a new private method `checkIntervalCommands` after `checkScheduledTasks`:
```typescript
private async checkIntervalCommands() {
  try {
    const now = new Date();
    const result = await this.client.db.pool.query(
      `SELECT id, guild_id, name, responses, embed_response, embed_color,
              interval_cron, interval_channel_id, case_sensitive
       FROM custom_commands
       WHERE trigger_type = 'interval'
         AND enabled = TRUE
         AND interval_cron IS NOT NULL
         AND interval_channel_id IS NOT NULL
         AND (interval_next_run IS NULL OR interval_next_run <= $1)`,
      [now],
    );

    for (const cmd of result.rows) {
      await this.fireIntervalCommand(cmd);
    }
  } catch (error) {
    logger.error('Error checking interval commands:', error);
  }
}

private async fireIntervalCommand(cmd: {
  id: number;
  guild_id: string;
  responses: string[];
  embed_response: boolean;
  embed_color: string | null;
  interval_cron: string;
  interval_channel_id: string;
}) {
  try {
    const guild = this.client.guilds.cache.get(cmd.guild_id);
    if (!guild) return;

    const channel = guild.channels.cache.get(cmd.interval_channel_id);
    if (!channel || !channel.isTextBased() || !('send' in channel)) return;

    const responses = cmd.responses as string[];
    const raw = responses[Math.floor(Math.random() * responses.length)];
    const rendered = this.client.template.render(raw, {
      server: guild.name,
      memberCount: guild.memberCount,
      channel: 'name' in channel ? `#${(channel as { name: string }).name}` : '',
      channelId: channel.id,
      user: '',
      username: '',
      userId: '',
      args: [],
    });

    if (cmd.embed_response) {
      const { EmbedBuilder } = await import('discord.js');
      const embed = new EmbedBuilder()
        .setDescription(rendered)
        .setColor((cmd.embed_color ?? '#5865F2') as `#${string}`);
      await (channel as import('discord.js').TextChannel).send({ embeds: [embed] });
    } else {
      await (channel as import('discord.js').TextChannel).send(rendered);
    }

    // Update uses + schedule next run
    const nextRun = this.getNextCronRun(cmd.interval_cron);
    await this.client.db.pool.query(
      `UPDATE custom_commands
       SET uses = uses + 1, interval_next_run = $2
       WHERE id = $1`,
      [cmd.id, nextRun],
    );
  } catch (error) {
    logger.error(`Error firing interval command ${cmd.id}:`, error);
  }
}
```

**Step 2: Call checkIntervalCommands from start()**

In the `start()` method, after the existing `this.checkScheduledTasks()` call, add:
```typescript
this.checkIntervalCommands();
```

And add it to the setInterval callback:
```typescript
this.checkInterval = setInterval(() => {
  this.checkScheduledTasks();
  this.checkIntervalCommands();
}, 60 * 1000);
```

**Step 3: Commit**

```bash
git add bot/src/services/SchedulerService.ts
git commit -m "feat: add interval custom command support to SchedulerService with cron-parser"
```

---

### Task 6: Bot — rewrite messageCreate to handle all trigger types

**Files:**
- Modify: `bot/src/events/messageCreate.ts`

**Step 1: Replace the custom commands section**

Replace the entire custom commands block (from `if (message.guild && message.channel.isTextBased()` down to the closing `}`) with:

```typescript
      // Handle custom commands (guild only)
      if (message.guild && message.channel.isTextBased() && 'send' in message.channel) {
        await handleCustomCommands(client, message);
      }
```

**Step 2: Add the handleCustomCommands function at the bottom of the file (before the export)**

```typescript
async function handleCustomCommands(
  client: WallEClient,
  message: import('discord.js').Message,
) {
  const guild = message.guild!;
  const content = message.content;
  const contentLower = content.toLowerCase();

  // Load all active message-type commands for this guild
  const result = await client.db.pool.query(
    `SELECT id, name, trigger_type, responses, embed_response, embed_color,
            delete_command, case_sensitive, allowed_roles, allowed_channels
     FROM custom_commands
     WHERE guild_id = $1
       AND enabled = TRUE
       AND trigger_type IN ('command', 'starts_with', 'contains', 'exact_match', 'regex')`,
    [guild.id],
  );

  if (result.rows.length === 0) return;

  const config = await client.db.getGuildConfig(guild.id);
  const prefix = config?.prefix ?? '!';
  const channel = message.channel as import('discord.js').TextChannel;

  for (const cmd of result.rows) {
    const nameLower = cmd.name.toLowerCase();
    const checkContent = cmd.case_sensitive ? content : contentLower;
    const checkName = cmd.case_sensitive ? cmd.name : nameLower;

    let matched = false;
    let args: string[] = [];

    switch (cmd.trigger_type) {
      case 'command': {
        const prefixedTrigger = (cmd.case_sensitive ? prefix : prefix) + checkName;
        if (checkContent.startsWith(prefixedTrigger) &&
            (checkContent.length === prefixedTrigger.length || checkContent[prefixedTrigger.length] === ' ')) {
          matched = true;
          args = content.slice(prefix.length + cmd.name.length).trim().split(/\s+/).filter(Boolean);
        }
        break;
      }
      case 'starts_with':
        if (checkContent.startsWith(checkName)) {
          matched = true;
          args = content.slice(cmd.name.length).trim().split(/\s+/).filter(Boolean);
        }
        break;
      case 'contains':
        if (checkContent.includes(checkName)) {
          matched = true;
        }
        break;
      case 'exact_match':
        if (checkContent === checkName) {
          matched = true;
        }
        break;
      case 'regex':
        try {
          const regex = new RegExp(cmd.name, cmd.case_sensitive ? '' : 'i');
          if (regex.test(content)) {
            matched = true;
          }
        } catch {
          // Invalid regex stored in DB — skip silently
        }
        break;
    }

    if (!matched) continue;

    const responses = cmd.responses as string[];
    const raw = responses[Math.floor(Math.random() * responses.length)];

    const rendered = client.template.render(raw, {
      user: `<@${message.author.id}>`,
      username: message.member?.displayName ?? message.author.username,
      userId: message.author.id,
      server: guild.name,
      memberCount: guild.memberCount,
      channel: `#${'name' in message.channel ? (message.channel as { name: string }).name : ''}`,
      channelId: message.channel.id,
      args,
    });

    if (cmd.delete_command) await message.delete().catch(() => {});

    if (cmd.embed_response) {
      const { EmbedBuilder } = await import('discord.js');
      const embed = new EmbedBuilder()
        .setDescription(rendered)
        .setColor((cmd.embed_color ?? '#5865F2') as `#${string}`);
      await channel.send({ embeds: [embed] });
    } else {
      await channel.send(rendered);
    }

    client.db.pool.query(
      'UPDATE custom_commands SET uses = uses + 1 WHERE id = $1',
      [cmd.id],
    ).catch(() => {});
  }
}
```

**Step 3: TypeScript check**

```bash
cd bot && node_modules/.bin/tsc --noEmit
```

Expected: no errors.

**Step 4: Commit**

```bash
git add bot/src/events/messageCreate.ts
git commit -m "feat: extend messageCreate to handle starts_with, contains, exact_match, regex triggers and random responses via TemplateService"
```

---

### Task 7: Bot — reaction event handlers

**Files:**
- Create: `bot/src/events/reactionAdd.ts`
- Create: `bot/src/events/reactionRemove.ts`

**Step 1: Create reactionAdd.ts**

```typescript
import { Events, MessageReaction, User, PartialMessageReaction, PartialUser } from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.MessageReactionAdd,
  once: false,
  async execute(
    client: WallEClient,
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
  ) {
    if (user.bot) return;
    if (!reaction.message.guild) return;

    // Fetch partials
    if (reaction.partial) {
      try { await reaction.fetch(); } catch { return; }
    }
    if (reaction.message.partial) {
      try { await reaction.message.fetch(); } catch { return; }
    }

    await handleReactionCommand(client, reaction as MessageReaction, user as User, 'add');
  },
};

async function handleReactionCommand(
  client: WallEClient,
  reaction: MessageReaction,
  user: User,
  type: 'add' | 'remove',
) {
  const guild = reaction.message.guild!;

  // Whitelist check
  const wl = await client.db.pool.query(
    'SELECT status, permanent, expires_at FROM guild_whitelist WHERE guild_id = $1',
    [guild.id],
  ).catch(() => null);
  const wlRow = wl?.rows[0];
  const expired = !wlRow?.permanent && wlRow?.expires_at && new Date(wlRow.expires_at) < new Date();
  if (wlRow?.status !== 'approved' || expired) return;

  const emojiIdentifier = reaction.emoji.id ?? reaction.emoji.name ?? '';

  const result = await client.db.pool.query(
    `SELECT id, responses, embed_response, embed_color, reaction_type
     FROM custom_commands
     WHERE guild_id = $1
       AND enabled = TRUE
       AND trigger_type = 'reaction'
       AND reaction_message_id = $2
       AND (reaction_emoji = $3 OR reaction_emoji IS NULL)
       AND (reaction_type = $4 OR reaction_type = 'both')`,
    [guild.id, reaction.message.id, emojiIdentifier, type],
  );

  for (const cmd of result.rows) {
    try {
      const channel = reaction.message.channel;
      if (!channel.isTextBased() || !('send' in channel)) continue;

      const responses = cmd.responses as string[];
      const raw = responses[Math.floor(Math.random() * responses.length)];

      const member = await guild.members.fetch(user.id).catch(() => null);
      const rendered = client.template.render(raw, {
        user: `<@${user.id}>`,
        username: member?.displayName ?? user.username,
        userId: user.id,
        server: guild.name,
        memberCount: guild.memberCount,
        channel: 'name' in channel ? `#${(channel as { name: string }).name}` : '',
        channelId: channel.id,
        args: [],
      });

      if (cmd.embed_response) {
        const { EmbedBuilder } = await import('discord.js');
        const embed = new EmbedBuilder()
          .setDescription(rendered)
          .setColor((cmd.embed_color ?? '#5865F2') as `#${string}`);
        await (channel as import('discord.js').TextChannel).send({ embeds: [embed] });
      } else {
        await (channel as import('discord.js').TextChannel).send(rendered);
      }

      client.db.pool.query(
        'UPDATE custom_commands SET uses = uses + 1 WHERE id = $1',
        [cmd.id],
      ).catch(() => {});
    } catch (error) {
      logger.error('Error firing reaction command:', error);
    }
  }
}
```

**Step 2: Create reactionRemove.ts**

```typescript
import { Events, MessageReaction, User, PartialMessageReaction, PartialUser } from 'discord.js';
import type { WallEClient } from '../structures/Client.js';

export default {
  name: Events.MessageReactionRemove,
  once: false,
  async execute(
    client: WallEClient,
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
  ) {
    if (user.bot) return;
    if (!reaction.message.guild) return;

    if (reaction.partial) {
      try { await reaction.fetch(); } catch { return; }
    }
    if (reaction.message.partial) {
      try { await reaction.message.fetch(); } catch { return; }
    }

    // Reuse the same logic as reactionAdd but with type 'remove'
    const guild = reaction.message.guild!;

    const wl = await client.db.pool.query(
      'SELECT status, permanent, expires_at FROM guild_whitelist WHERE guild_id = $1',
      [guild.id],
    ).catch(() => null);
    const wlRow = wl?.rows[0];
    const expired = !wlRow?.permanent && wlRow?.expires_at && new Date(wlRow.expires_at) < new Date();
    if (wlRow?.status !== 'approved' || expired) return;

    const emojiIdentifier = reaction.emoji.id ?? reaction.emoji.name ?? '';

    const result = await client.db.pool.query(
      `SELECT id, responses, embed_response, embed_color
       FROM custom_commands
       WHERE guild_id = $1
         AND enabled = TRUE
         AND trigger_type = 'reaction'
         AND reaction_message_id = $2
         AND (reaction_emoji = $3 OR reaction_emoji IS NULL)
         AND (reaction_type = 'remove' OR reaction_type = 'both')`,
      [guild.id, reaction.message.id, emojiIdentifier],
    );

    for (const cmd of result.rows) {
      try {
        const channel = reaction.message.channel;
        if (!channel.isTextBased() || !('send' in channel)) continue;

        const responses = cmd.responses as string[];
        const raw = responses[Math.floor(Math.random() * responses.length)];

        const member = await guild.members.fetch((user as User).id).catch(() => null);
        const rendered = client.template.render(raw, {
          user: `<@${(user as User).id}>`,
          username: member?.displayName ?? (user as User).username,
          userId: (user as User).id,
          server: guild.name,
          memberCount: guild.memberCount,
          channel: 'name' in channel ? `#${(channel as { name: string }).name}` : '',
          channelId: channel.id,
          args: [],
        });

        if (cmd.embed_response) {
          const { EmbedBuilder } = await import('discord.js');
          const embed = new EmbedBuilder()
            .setDescription(rendered)
            .setColor((cmd.embed_color ?? '#5865F2') as `#${string}`);
          await (channel as import('discord.js').TextChannel).send({ embeds: [embed] });
        } else {
          await (channel as import('discord.js').TextChannel).send(rendered);
        }

        client.db.pool.query('UPDATE custom_commands SET uses = uses + 1 WHERE id = $1', [cmd.id]).catch(() => {});
      } catch { /* ignore per-command errors */ }
    }
  },
};
```

**Step 3: TypeScript check**

```bash
cd bot && node_modules/.bin/tsc --noEmit
```

**Step 4: Commit**

```bash
git add bot/src/events/reactionAdd.ts bot/src/events/reactionRemove.ts
git commit -m "feat: add reaction trigger event handlers for custom commands"
```

---

### Task 8: Backend — command groups CRUD route

**Files:**
- Create: `dashboard/backend/src/routes/commandGroups.ts`

**Step 1: Create the file**

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth, requireGuildAccess } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const commandGroupsRouter = Router({ mergeParams: true });

commandGroupsRouter.use(requireAuth, requireGuildAccess);

const GroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  allowed_roles: z.array(z.string()).default([]),
  allowed_channels: z.array(z.string()).default([]),
  ignore_roles: z.array(z.string()).default([]),
  ignore_channels: z.array(z.string()).default([]),
  position: z.number().int().min(0).default(0),
});

// GET /api/guilds/:guildId/command-groups
commandGroupsRouter.get('/', asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const result = await db.query(
    'SELECT * FROM command_groups WHERE guild_id = $1 ORDER BY position, name',
    [guildId],
  );
  res.json(result.rows);
}));

// POST /api/guilds/:guildId/command-groups
commandGroupsRouter.post('/', asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const parsed = GroupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    return;
  }
  const d = parsed.data;

  const result = await db.query(
    `INSERT INTO command_groups
       (guild_id, name, description, allowed_roles, allowed_channels,
        ignore_roles, ignore_channels, position)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [guildId, d.name, d.description ?? null, d.allowed_roles, d.allowed_channels,
     d.ignore_roles, d.ignore_channels, d.position],
  );
  res.status(201).json(result.rows[0]);
}));

// PATCH /api/guilds/:guildId/command-groups/:groupId
commandGroupsRouter.patch('/:groupId', asyncHandler(async (req, res) => {
  const { guildId, groupId } = req.params;
  const parsed = GroupSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    return;
  }
  const d = parsed.data;
  const fields = Object.keys(d) as (keyof typeof d)[];
  if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }

  const setClauses = fields.map((f, i) => `${f} = $${i + 3}`).join(', ');
  const values = fields.map(f => d[f]);

  const result = await db.query(
    `UPDATE command_groups SET ${setClauses} WHERE id = $1 AND guild_id = $2 RETURNING *`,
    [groupId, guildId, ...values],
  );
  if (result.rows.length === 0) { res.status(404).json({ error: 'Group not found' }); return; }
  res.json(result.rows[0]);
}));

// DELETE /api/guilds/:guildId/command-groups/:groupId
commandGroupsRouter.delete('/:groupId', asyncHandler(async (req, res) => {
  const { guildId, groupId } = req.params;
  // Commands are set to group_id = NULL by the FK ON DELETE SET NULL
  const result = await db.query(
    'DELETE FROM command_groups WHERE id = $1 AND guild_id = $2 RETURNING name',
    [groupId, guildId],
  );
  if (result.rows.length === 0) { res.status(404).json({ error: 'Group not found' }); return; }
  res.json({ success: true });
}));
```

**Step 2: Register in backend index.ts**

In `dashboard/backend/src/index.ts`, add import:
```typescript
import { commandGroupsRouter } from './routes/commandGroups.js';
```

Add route registration after the existing customCommandsRouter line:
```typescript
app.use('/api/guilds/:guildId/command-groups', commandGroupsRouter);
```

**Step 3: Commit**

```bash
git add dashboard/backend/src/routes/commandGroups.ts dashboard/backend/src/index.ts
git commit -m "feat: add command groups CRUD API routes"
```

---

### Task 9: Backend — update customCommands route for new schema

**Files:**
- Modify: `dashboard/backend/src/routes/customCommands.ts`

**Step 1: Replace the entire file**

```typescript
import { Router } from 'express';
import { z } from 'zod';
import Handlebars from 'handlebars';
import { db } from '../db/index.js';
import { requireAuth, requireGuildAccess } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logger } from '../utils/logger.js';

export const customCommandsRouter = Router({ mergeParams: true });

customCommandsRouter.use(requireAuth, requireGuildAccess);

const TriggerTypeEnum = z.enum([
  'command', 'starts_with', 'contains', 'exact_match', 'regex', 'reaction', 'interval',
]);

const CommandSchema = z.object({
  name: z.string().min(1).max(100),
  trigger_type: TriggerTypeEnum.default('command'),
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
  interval_cron: z.string().max(100).nullable().optional(),
  interval_channel_id: z.string().max(20).nullable().optional(),
  reaction_message_id: z.string().max(20).nullable().optional(),
  reaction_channel_id: z.string().max(20).nullable().optional(),
  reaction_emoji: z.string().max(100).nullable().optional(),
  reaction_type: z.enum(['add', 'remove', 'both']).nullable().optional(),
});

function validateCommand(data: z.infer<typeof CommandSchema>): string | null {
  // Validate regex
  if (data.trigger_type === 'regex') {
    try { new RegExp(data.name); } catch (e: unknown) {
      return `Invalid regex pattern: ${(e as Error).message}`;
    }
  }
  // Validate Handlebars templates
  for (const response of data.responses) {
    try { Handlebars.precompile(response); } catch (e: unknown) {
      return `Invalid template syntax: ${(e as Error).message}`;
    }
  }
  // Interval requires cron + channel
  if (data.trigger_type === 'interval') {
    if (!data.interval_cron) return 'interval_cron is required for interval commands';
    if (!data.interval_channel_id) return 'interval_channel_id is required for interval commands';
  }
  return null;
}

const SELECT_COLS = `
  id, guild_id, name, trigger_type, group_id, responses,
  embed_response, embed_color, cooldown, delete_command,
  case_sensitive, trigger_on_edit, enabled, allowed_roles, allowed_channels,
  interval_cron, interval_channel_id, interval_next_run,
  reaction_message_id, reaction_channel_id, reaction_emoji, reaction_type,
  uses, created_by, created_at, updated_at
`;

// GET /api/guilds/:guildId/custom-commands
customCommandsRouter.get('/', asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const result = await db.query(
    `SELECT ${SELECT_COLS} FROM custom_commands WHERE guild_id = $1 ORDER BY trigger_type, name`,
    [guildId],
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
  const validErr = validateCommand(d);
  if (validErr) { res.status(400).json({ error: validErr }); return; }

  // For command type, check uniqueness
  if (d.trigger_type === 'command') {
    const existing = await db.query(
      'SELECT id FROM custom_commands WHERE guild_id = $1 AND name = $2 AND trigger_type = $3',
      [guildId, d.name, 'command'],
    );
    if (existing.rows.length > 0) {
      res.status(409).json({ error: `Command "${d.name}" already exists` });
      return;
    }
  }

  const result = await db.query(
    `INSERT INTO custom_commands
       (guild_id, name, trigger_type, group_id, responses, response,
        embed_response, embed_color, cooldown, delete_command,
        case_sensitive, trigger_on_edit, enabled, allowed_roles, allowed_channels,
        interval_cron, interval_channel_id,
        reaction_message_id, reaction_channel_id, reaction_emoji, reaction_type,
        created_by)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
     RETURNING ${SELECT_COLS}`,
    [
      guildId, d.name, d.trigger_type, d.group_id ?? null,
      JSON.stringify(d.responses), d.responses[0], // keep response col in sync
      d.embed_response, d.embed_color ?? null, d.cooldown, d.delete_command,
      d.case_sensitive, d.trigger_on_edit, d.enabled,
      d.allowed_roles, d.allowed_channels,
      d.interval_cron ?? null, d.interval_channel_id ?? null,
      d.reaction_message_id ?? null, d.reaction_channel_id ?? null,
      d.reaction_emoji ?? null, d.reaction_type ?? null,
      (req as { user?: { discord_id?: string } }).user?.discord_id ?? 'dashboard',
    ],
  );
  logger.info(`Custom command created: ${d.name} (${d.trigger_type}) in ${guildId}`);
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

  // Validate if relevant fields present
  if (d.trigger_type || d.name || d.responses) {
    // Fetch current row to merge
    const current = await db.query(
      'SELECT trigger_type, name, responses FROM custom_commands WHERE id = $1 AND guild_id = $2',
      [commandId, guildId],
    );
    if (current.rows.length === 0) { res.status(404).json({ error: 'Command not found' }); return; }
    const merged = { ...current.rows[0], ...d } as z.infer<typeof CommandSchema>;
    const validErr = validateCommand(merged);
    if (validErr) { res.status(400).json({ error: validErr }); return; }
  }

  const fieldMap: Record<string, unknown> = { ...d };
  // Keep response col in sync if responses changed
  if (d.responses) fieldMap['response'] = d.responses[0];

  const fields = Object.keys(fieldMap);
  if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }

  const setClauses = fields.map((f, i) => {
    if (f === 'responses') return `responses = $${i + 3}::jsonb`;
    return `${f} = $${i + 3}`;
  }).join(', ');
  const values = fields.map(f => f === 'responses' ? JSON.stringify(fieldMap[f]) : fieldMap[f]);

  const result = await db.query(
    `UPDATE custom_commands SET ${setClauses}, updated_at = NOW()
     WHERE id = $1 AND guild_id = $2 RETURNING ${SELECT_COLS}`,
    [commandId, guildId, ...values],
  );
  if (result.rows.length === 0) { res.status(404).json({ error: 'Command not found' }); return; }
  res.json(result.rows[0]);
}));

// DELETE /api/guilds/:guildId/custom-commands/:commandId
customCommandsRouter.delete('/:commandId', asyncHandler(async (req, res) => {
  const { guildId, commandId } = req.params;
  const result = await db.query(
    'DELETE FROM custom_commands WHERE id = $1 AND guild_id = $2 RETURNING name',
    [commandId, guildId],
  );
  if (result.rows.length === 0) { res.status(404).json({ error: 'Command not found' }); return; }
  logger.info(`Custom command deleted: ${result.rows[0].name} in ${guildId}`);
  res.json({ success: true });
}));
```

**Step 2: TypeScript check**

```bash
cd dashboard/backend && node_modules/.bin/tsc --noEmit
```

**Step 3: Commit**

```bash
git add dashboard/backend/src/routes/customCommands.ts
git commit -m "feat: update customCommands API for trigger types, responses array, groups, regex/template validation"
```

---

### Task 10: Frontend — redesigned CustomCommandsPage

**Files:**
- Modify: `dashboard/frontend/src/pages/guild/CustomCommandsPage.tsx`

**Step 1: Replace the entire file**

This is a full rewrite. The component implements a two-panel YAGPDB-style layout.

```tsx
import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { oneDark } from '@codemirror/theme-one-dark';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import {
  Terminal, Plus, Trash2, Search, Save, Edit, Info, ChevronDown, ChevronRight,
  FolderPlus, Folder, Clock, Zap, Hash, AlignLeft, Code2, X, RefreshCw,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type TriggerType = 'command' | 'starts_with' | 'contains' | 'exact_match' | 'regex' | 'reaction' | 'interval';

interface CommandGroup {
  id: number;
  guild_id: string;
  name: string;
  description?: string;
  allowed_roles: string[];
  allowed_channels: string[];
  ignore_roles: string[];
  ignore_channels: string[];
  position: number;
}

interface CustomCommand {
  id: number;
  guild_id: string;
  name: string;
  trigger_type: TriggerType;
  group_id: number | null;
  responses: string[];
  embed_response: boolean;
  embed_color: string | null;
  cooldown: number;
  delete_command: boolean;
  case_sensitive: boolean;
  trigger_on_edit: boolean;
  enabled: boolean;
  allowed_roles: string[];
  allowed_channels: string[];
  interval_cron: string | null;
  interval_channel_id: string | null;
  reaction_message_id: string | null;
  reaction_channel_id: string | null;
  reaction_emoji: string | null;
  reaction_type: 'add' | 'remove' | 'both' | null;
  uses: number;
  created_at: string;
}

const emptyCommand = (): Partial<CustomCommand> => ({
  name: '',
  trigger_type: 'command',
  group_id: null,
  responses: [''],
  embed_response: false,
  embed_color: null,
  cooldown: 0,
  delete_command: false,
  case_sensitive: false,
  trigger_on_edit: false,
  enabled: true,
  allowed_roles: [],
  allowed_channels: [],
  interval_cron: null,
  interval_channel_id: null,
  reaction_message_id: null,
  reaction_channel_id: null,
  reaction_emoji: null,
  reaction_type: 'add',
});

const emptyGroup = (): Partial<CommandGroup> => ({
  name: '',
  description: '',
  allowed_roles: [],
  allowed_channels: [],
  ignore_roles: [],
  ignore_channels: [],
  position: 0,
});

// ─── Trigger type metadata ────────────────────────────────────────────────────

const TRIGGER_TYPES: { value: TriggerType; label: string; color: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'command',     label: 'Command',     color: 'bg-discord-blurple/20 text-discord-blurple', icon: Terminal },
  { value: 'starts_with', label: 'Starts With', color: 'bg-gray-500/20 text-gray-400',               icon: AlignLeft },
  { value: 'contains',    label: 'Contains',    color: 'bg-gray-500/20 text-gray-400',               icon: Hash },
  { value: 'exact_match', label: 'Exact Match', color: 'bg-gray-500/20 text-gray-400',               icon: AlignLeft },
  { value: 'regex',       label: 'Regex',       color: 'bg-orange-500/20 text-orange-400',           icon: Code2 },
  { value: 'reaction',    label: 'Reaction',    color: 'bg-pink-500/20 text-pink-400',               icon: Zap },
  { value: 'interval',    label: 'Interval',    color: 'bg-green-500/20 text-green-400',             icon: Clock },
];

const TEMPLATE_VARS = [
  { name: '{{user}}',        desc: 'User mention' },
  { name: '{{username}}',    desc: 'Display name' },
  { name: '{{userId}}',      desc: 'User ID' },
  { name: '{{server}}',      desc: 'Server name' },
  { name: '{{memberCount}}', desc: 'Member count' },
  { name: '{{channel}}',     desc: 'Channel name' },
  { name: '{{channelId}}',   desc: 'Channel ID' },
  { name: '{{args}}',        desc: 'All arguments' },
  { name: '{{args.[0]}}',    desc: 'First argument' },
  { name: '{{randint 1 100}}', desc: 'Random int' },
  { name: '{{choose "a" "b"}}', desc: 'Random pick' },
  { name: '{{upper username}}', desc: 'Uppercase' },
  { name: '{{lower username}}', desc: 'Lowercase' },
  { name: '{{time "HH:mm"}}',   desc: 'Current time' },
  { name: '{{date "YYYY-MM-DD"}}', desc: 'Current date' },
];

// ─── CodeMirror editor ────────────────────────────────────────────────────────

interface CMHandle { insertAtCursor: (text: string) => void; }

const cmTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', color: '#dcddde', fontSize: '13px',
         fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', minHeight: '8rem' },
  '.cm-content': { padding: '8px', caretColor: '#ffffff' },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground': { backgroundColor: '#5865f2 !important' },
  '&.cm-focused .cm-selectionBackground': { backgroundColor: '#5865f2 !important' },
  '.cm-cursor': { borderLeftColor: '#ffffff' },
});

const CodeMirrorEditor = forwardRef<CMHandle, { value: string; onChange: (v: string) => void }>(
  function CodeMirrorEditor({ value, onChange }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeCb = useCallback((v: string) => onChange(v), [onChange]);

    useImperativeHandle(ref, () => ({
      insertAtCursor: (text: string) => {
        const view = viewRef.current;
        if (!view) return;
        const { from } = view.state.selection.main;
        view.dispatch({ changes: { from, insert: text }, selection: { anchor: from + text.length } });
      },
    }));

    useEffect(() => {
      if (!containerRef.current) return;
      const view = new EditorView({
        state: EditorState.create({
          doc: value,
          extensions: [
            history(), keymap.of([...defaultKeymap, ...historyKeymap]),
            EditorView.lineWrapping, oneDark, cmTheme,
            EditorView.updateListener.of(u => { if (u.docChanged) onChangeCb(u.state.doc.toString()); }),
          ],
        }),
        parent: containerRef.current,
      });
      viewRef.current = view;
      return () => { view.destroy(); viewRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const current = view.state.doc.toString();
      if (current !== value) {
        view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
      }
    }, [value]);

    return <div ref={containerRef} className="input w-full min-h-32" style={{ padding: 0 }} />;
  },
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function useMobile() {
  const [m, setM] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const h = () => setM(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return m;
}

function extractApiError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string; message?: string } } };
  return e?.response?.data?.error ?? e?.response?.data?.message ?? 'Failed to save.';
}

function TriggerBadge({ type }: { type: TriggerType }) {
  const t = TRIGGER_TYPES.find(x => x.value === type)!;
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${t.color}`}>
      {t.label.toUpperCase()}
    </span>
  );
}

function Toggle({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="text-xs text-discord-light">{description}</div>}
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CustomCommandsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const queryClient = useQueryClient();
  const isMobile = useMobile();

  // ── Prefix ──
  const [prefixInput, setPrefixInput] = useState('');
  const [prefixSaved, setPrefixSaved] = useState(false);

  const { data: generalConfig } = useQuery<{ prefix: string }>({
    queryKey: ['guild-general', guildId],
    queryFn: () => api.get(`/api/guilds/${guildId}/config/general`).then(r => r.data),
  });

  useEffect(() => {
    if (generalConfig?.prefix) setPrefixInput(generalConfig.prefix);
  }, [generalConfig?.prefix]);

  const savePrefix = useMutation({
    mutationFn: (prefix: string) => api.patch(`/api/guilds/${guildId}/config/general`, { prefix }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guild-general', guildId] });
      setPrefixSaved(true);
      setTimeout(() => setPrefixSaved(false), 2000);
    },
  });

  // ── Data ──
  const { data: commands = [], isLoading: cmdsLoading } = useQuery<CustomCommand[]>({
    queryKey: ['custom-commands', guildId],
    queryFn: () => api.get(`/api/guilds/${guildId}/custom-commands`).then(r => r.data),
  });

  const { data: groups = [], isLoading: grpsLoading } = useQuery<CommandGroup[]>({
    queryKey: ['command-groups', guildId],
    queryFn: () => api.get(`/api/guilds/${guildId}/command-groups`).then(r => r.data),
  });

  // ── UI state ──
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [editingCommand, setEditingCommand] = useState<Partial<CustomCommand> | null>(null);
  const [editingGroup, setEditingGroup] = useState<Partial<CommandGroup> | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<number | 'new' | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showTemplateRef, setShowTemplateRef] = useState(false);
  const [regexValid, setRegexValid] = useState<boolean | null>(null);
  const editorRefs = useRef<(CMHandle | null)[]>([]);

  // ── Mutations ──
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['custom-commands', guildId] });
  };
  const invalidateGroups = () => {
    queryClient.invalidateQueries({ queryKey: ['command-groups', guildId] });
  };

  const createCmd = useMutation({
    mutationFn: (data: Partial<CustomCommand>) =>
      api.post(`/api/guilds/${guildId}/custom-commands`, data).then(r => r.data),
    onSuccess: () => { invalidate(); setEditingCommand(null); setSaveError(null); },
    onError: (err) => setSaveError(extractApiError(err)),
  });

  const updateCmd = useMutation({
    mutationFn: ({ id, ...data }: Partial<CustomCommand> & { id: number }) =>
      api.patch(`/api/guilds/${guildId}/custom-commands/${id}`, data).then(r => r.data),
    onSuccess: () => { invalidate(); setEditingCommand(null); setSaveError(null); },
    onError: (err) => setSaveError(extractApiError(err)),
  });

  const deleteCmd = useMutation({
    mutationFn: (id: number) => api.delete(`/api/guilds/${guildId}/custom-commands/${id}`),
    onSuccess: () => invalidate(),
  });

  const toggleCmd = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      api.patch(`/api/guilds/${guildId}/custom-commands/${id}`, { enabled }),
    onSuccess: () => invalidate(),
  });

  const createGroup = useMutation({
    mutationFn: (data: Partial<CommandGroup>) =>
      api.post(`/api/guilds/${guildId}/command-groups`, data).then(r => r.data),
    onSuccess: () => { invalidateGroups(); setEditingGroup(null); setEditingGroupId(null); },
  });

  const updateGroup = useMutation({
    mutationFn: ({ id, ...data }: Partial<CommandGroup> & { id: number }) =>
      api.patch(`/api/guilds/${guildId}/command-groups/${id}`, data).then(r => r.data),
    onSuccess: () => { invalidateGroups(); setEditingGroup(null); setEditingGroupId(null); },
  });

  const deleteGroup = useMutation({
    mutationFn: (id: number) => api.delete(`/api/guilds/${guildId}/command-groups/${id}`),
    onSuccess: () => invalidateGroups(),
  });

  // ── Helpers ──
  const openNewCommand = (groupId?: number | null) => {
    setSaveError(null);
    setEditingCommand({ ...emptyCommand(), group_id: groupId ?? null });
  };

  const openEditCommand = (cmd: CustomCommand) => {
    setSaveError(null);
    setEditingCommand({ ...cmd });
  };

  const saveCommand = () => {
    if (!editingCommand?.name || !editingCommand?.responses?.length) return;
    setSaveError(null);
    const id = (editingCommand as CustomCommand).id;
    if (id) {
      updateCmd.mutate(editingCommand as CustomCommand);
    } else {
      createCmd.mutate(editingCommand);
    }
  };

  const updateResponse = (idx: number, value: string) => {
    setEditingCommand(prev => {
      if (!prev) return prev;
      const responses = [...(prev.responses ?? [])];
      responses[idx] = value;
      return { ...prev, responses };
    });
  };

  const addResponse = () => {
    setEditingCommand(prev => prev ? { ...prev, responses: [...(prev.responses ?? []), ''] } : prev);
  };

  const removeResponse = (idx: number) => {
    setEditingCommand(prev => {
      if (!prev) return prev;
      const responses = (prev.responses ?? []).filter((_, i) => i !== idx);
      return { ...prev, responses: responses.length ? responses : [''] };
    });
  };

  const validateRegex = (pattern: string) => {
    try { new RegExp(pattern); setRegexValid(true); }
    catch { setRegexValid(false); }
  };

  const toggleGroup = (id: number) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const saveGroup = () => {
    if (!editingGroup?.name) return;
    if (editingGroupId === 'new') {
      createGroup.mutate(editingGroup);
    } else if (typeof editingGroupId === 'number') {
      updateGroup.mutate({ ...editingGroup, id: editingGroupId } as CommandGroup);
    }
  };

  // ── Filter ──
  const filteredCommands = commands.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.responses?.some(r => r.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  const commandsByGroup = (groupId: number | null) =>
    filteredCommands.filter(c => c.group_id === groupId);

  const isLoading = cmdsLoading || grpsLoading;
  const isSaving = createCmd.isPending || updateCmd.isPending;

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: editor panel
  // ─────────────────────────────────────────────────────────────────────────────

  const renderEditor = () => {
    if (!editingCommand) return null;
    const triggerMeta = TRIGGER_TYPES.find(t => t.value === editingCommand.trigger_type);

    return (
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">
            {(editingCommand as CustomCommand).id ? 'Edit Command' : 'New Command'}
          </h2>
          <button
            onClick={() => { setEditingCommand(null); setSaveError(null); }}
            className="text-discord-light hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Trigger type */}
        <div className="card space-y-4">
          <h3 className="font-semibold">Trigger</h3>

          <div>
            <label className="block text-sm font-medium mb-2">Trigger Type</label>
            <select
              value={editingCommand.trigger_type ?? 'command'}
              onChange={e => setEditingCommand(prev => prev ? { ...prev, trigger_type: e.target.value as TriggerType } : prev)}
              className="input w-full"
            >
              {TRIGGER_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Trigger input — varies by type */}
          {editingCommand.trigger_type !== 'reaction' && editingCommand.trigger_type !== 'interval' && (
            <div>
              <label className="block text-sm font-medium mb-2">
                {editingCommand.trigger_type === 'command' && 'Command Name (without prefix)'}
                {editingCommand.trigger_type === 'starts_with' && 'Starts With Text'}
                {editingCommand.trigger_type === 'contains' && 'Contains Text'}
                {editingCommand.trigger_type === 'exact_match' && 'Exact Message Text'}
                {editingCommand.trigger_type === 'regex' && 'Regex Pattern'}
              </label>
              <input
                type="text"
                value={editingCommand.name ?? ''}
                onChange={e => {
                  const val = e.target.value;
                  setEditingCommand(prev => prev ? { ...prev, name: val } : prev);
                  if (editingCommand.trigger_type === 'regex') validateRegex(val);
                }}
                className={`input w-full font-mono ${
                  editingCommand.trigger_type === 'regex' && regexValid === false ? 'border-red-500' :
                  editingCommand.trigger_type === 'regex' && regexValid === true ? 'border-green-500' : ''
                }`}
                placeholder={
                  editingCommand.trigger_type === 'command' ? 'hello' :
                  editingCommand.trigger_type === 'regex' ? '^hello\\s+world$' : 'text to match'
                }
              />
              {editingCommand.trigger_type === 'regex' && regexValid === false && (
                <p className="text-xs text-red-400 mt-1">Invalid regex pattern</p>
              )}
            </div>
          )}

          {/* Reaction fields */}
          {editingCommand.trigger_type === 'reaction' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-2">Display Name</label>
                <input type="text" value={editingCommand.name ?? ''} onChange={e => setEditingCommand(prev => prev ? { ...prev, name: e.target.value } : prev)} className="input w-full" placeholder="My Reaction Command" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-2">Message ID</label>
                  <input type="text" value={editingCommand.reaction_message_id ?? ''} onChange={e => setEditingCommand(prev => prev ? { ...prev, reaction_message_id: e.target.value } : prev)} className="input w-full font-mono" placeholder="1234567890" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Channel ID</label>
                  <input type="text" value={editingCommand.reaction_channel_id ?? ''} onChange={e => setEditingCommand(prev => prev ? { ...prev, reaction_channel_id: e.target.value } : prev)} className="input w-full font-mono" placeholder="1234567890" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-2">Emoji (unicode or ID)</label>
                  <input type="text" value={editingCommand.reaction_emoji ?? ''} onChange={e => setEditingCommand(prev => prev ? { ...prev, reaction_emoji: e.target.value } : prev)} className="input w-full" placeholder="👋 or 123456789" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Trigger On</label>
                  <select value={editingCommand.reaction_type ?? 'add'} onChange={e => setEditingCommand(prev => prev ? { ...prev, reaction_type: e.target.value as 'add' | 'remove' | 'both' } : prev)} className="input w-full">
                    <option value="add">Add reaction</option>
                    <option value="remove">Remove reaction</option>
                    <option value="both">Both</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Interval fields */}
          {editingCommand.trigger_type === 'interval' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-2">Display Name</label>
                <input type="text" value={editingCommand.name ?? ''} onChange={e => setEditingCommand(prev => prev ? { ...prev, name: e.target.value } : prev)} className="input w-full" placeholder="Daily Announcement" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Cron Expression</label>
                <input type="text" value={editingCommand.interval_cron ?? ''} onChange={e => setEditingCommand(prev => prev ? { ...prev, interval_cron: e.target.value } : prev)} className="input w-full font-mono" placeholder="0 9 * * 1  (every Monday at 9am)" />
                <p className="text-xs text-discord-light mt-1">Format: minute hour day month weekday (UTC)</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Post to Channel ID</label>
                <input type="text" value={editingCommand.interval_channel_id ?? ''} onChange={e => setEditingCommand(prev => prev ? { ...prev, interval_channel_id: e.target.value } : prev)} className="input w-full font-mono" placeholder="1234567890" />
              </div>
            </div>
          )}

          {/* Group */}
          <div>
            <label className="block text-sm font-medium mb-2">Group</label>
            <select
              value={editingCommand.group_id ?? ''}
              onChange={e => setEditingCommand(prev => prev ? { ...prev, group_id: e.target.value ? Number(e.target.value) : null } : prev)}
              className="input w-full"
            >
              <option value="">— No Group —</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        </div>

        {/* Responses */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">
              Responses
              {(editingCommand.responses?.length ?? 0) > 1 && (
                <span className="ml-2 text-xs text-discord-light font-normal">(picked randomly)</span>
              )}
            </h3>
            <button onClick={addResponse} className="btn btn-secondary text-xs flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add Response
            </button>
          </div>

          {(editingCommand.responses ?? ['']).map((resp, idx) => (
            <div key={idx} className="space-y-1">
              {(editingCommand.responses?.length ?? 0) > 1 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-discord-light">Response {idx + 1}</span>
                  <button onClick={() => removeResponse(idx)} className="text-red-400 hover:text-red-300">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <div className="relative">
                {isMobile ? (
                  <textarea
                    value={resp}
                    onChange={e => updateResponse(idx, e.target.value)}
                    className="input w-full h-32 resize-y font-mono text-sm pb-6"
                    placeholder="Response text… use {{user}} for mentions"
                  />
                ) : (
                  <CodeMirrorEditor
                    ref={el => { editorRefs.current[idx] = el; }}
                    value={resp}
                    onChange={v => updateResponse(idx, v)}
                  />
                )}
                <span className={`absolute bottom-1 right-3 text-xs pointer-events-none z-10 ${resp.length >= 2400 ? 'text-red-400' : 'text-discord-light'}`}>
                  {resp.length} / 2500
                </span>
              </div>
            </div>
          ))}

          {/* Response type */}
          <div>
            <label className="block text-sm font-medium mb-2">Response Type</label>
            <div className="flex gap-4">
              {['Plain Text', 'Embed'].map((label, i) => (
                <label key={label} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={i === 0 ? !editingCommand.embed_response : !!editingCommand.embed_response}
                    onChange={() => setEditingCommand(prev => prev ? { ...prev, embed_response: i === 1 } : prev)}
                    className="w-4 h-4" />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Template reference */}
        <div className="card">
          <button
            className="flex items-center gap-2 w-full text-left"
            onClick={() => setShowTemplateRef(v => !v)}
          >
            <Info className="w-4 h-4 text-discord-blurple" />
            <span className="font-semibold text-sm">Template Variables &amp; Helpers</span>
            {showTemplateRef ? <ChevronDown className="w-4 h-4 ml-auto" /> : <ChevronRight className="w-4 h-4 ml-auto" />}
          </button>
          {showTemplateRef && (
            <div className="mt-3 flex flex-wrap gap-2">
              {TEMPLATE_VARS.map(v => (
                <button
                  key={v.name}
                  title={v.desc}
                  onClick={() => {
                    const activeIdx = 0; // insert into first editor by default
                    if (editorRefs.current[activeIdx]) {
                      editorRefs.current[activeIdx]!.insertAtCursor(v.name);
                    } else {
                      updateResponse(activeIdx, (editingCommand.responses?.[activeIdx] ?? '') + v.name);
                    }
                  }}
                  className="bg-discord-dark hover:bg-discord-blurple/20 px-2 py-1 rounded text-xs font-mono transition-colors"
                >
                  {v.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Behavior */}
        <div className="card">
          <h3 className="font-semibold mb-2">Behavior</h3>
          <div className="divide-y divide-discord-dark">
            <Toggle label="Enabled" description="Allow this command to be triggered"
              checked={editingCommand.enabled ?? true}
              onChange={v => setEditingCommand(prev => prev ? { ...prev, enabled: v } : prev)} />
            {editingCommand.trigger_type !== 'interval' && editingCommand.trigger_type !== 'reaction' && (
              <>
                <Toggle label="Case Sensitive" description="Exact capitalization required"
                  checked={editingCommand.case_sensitive ?? false}
                  onChange={v => setEditingCommand(prev => prev ? { ...prev, case_sensitive: v } : prev)} />
                <Toggle label="Trigger on Message Edits" description="Fire when a message is edited"
                  checked={editingCommand.trigger_on_edit ?? false}
                  onChange={v => setEditingCommand(prev => prev ? { ...prev, trigger_on_edit: v } : prev)} />
                <Toggle label="Delete Trigger Message" description="Delete the user's message on trigger"
                  checked={editingCommand.delete_command ?? false}
                  onChange={v => setEditingCommand(prev => prev ? { ...prev, delete_command: v } : prev)} />
              </>
            )}
          </div>
        </div>

        {/* Save actions */}
        <div className="space-y-2">
          <div className="flex gap-3">
            <button onClick={() => { setEditingCommand(null); setSaveError(null); }} className="btn btn-secondary">Cancel</button>
            <button
              onClick={saveCommand}
              disabled={!editingCommand.name || !(editingCommand.responses?.some(r => r.trim())) || isSaving}
              className="btn btn-primary flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving…' : 'Save Command'}
            </button>
          </div>
          {saveError && <p className="text-sm text-red-400">{saveError}</p>}
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: group editor
  // ─────────────────────────────────────────────────────────────────────────────

  const renderGroupEditor = () => {
    if (!editingGroup) return null;
    const isNew = editingGroupId === 'new';
    const saving = createGroup.isPending || updateGroup.isPending;

    return (
      <div className="card mt-2 space-y-3 border border-discord-blurple/30">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-sm">{isNew ? 'New Group' : 'Edit Group'}</h4>
          <button onClick={() => { setEditingGroup(null); setEditingGroupId(null); }} className="text-discord-light hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Name</label>
          <input type="text" value={editingGroup.name ?? ''} onChange={e => setEditingGroup(prev => prev ? { ...prev, name: e.target.value } : prev)} className="input w-full" placeholder="My Group" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Description</label>
          <input type="text" value={editingGroup.description ?? ''} onChange={e => setEditingGroup(prev => prev ? { ...prev, description: e.target.value } : prev)} className="input w-full" placeholder="Optional description" />
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setEditingGroup(null); setEditingGroupId(null); }} className="btn btn-secondary text-sm">Cancel</button>
          <button onClick={saveGroup} disabled={!editingGroup.name || saving} className="btn btn-primary text-sm disabled:opacity-50">
            {saving ? 'Saving…' : isNew ? 'Create Group' : 'Save'}
          </button>
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: command row
  // ─────────────────────────────────────────────────────────────────────────────

  const renderCommandRow = (cmd: CustomCommand) => (
    <div key={cmd.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-discord-dark/50 ${editingCommand && (editingCommand as CustomCommand).id === cmd.id ? 'bg-discord-blurple/10 border border-discord-blurple/30' : ''}`}>
      <button
        onClick={() => toggleCmd.mutate({ id: cmd.id, enabled: !cmd.enabled })}
        className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${cmd.enabled ? 'bg-green-500' : 'bg-discord-dark'}`}
      >
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${cmd.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <TriggerBadge type={cmd.trigger_type} />
          <span className="text-sm font-mono font-medium truncate">
            {cmd.trigger_type === 'command' ? `${generalConfig?.prefix ?? '!'}${cmd.name}` : cmd.name}
          </span>
          {cmd.uses > 0 && <span className="text-xs text-discord-light">{cmd.uses}×</span>}
        </div>
        <p className="text-xs text-discord-light truncate">
          {cmd.responses?.[0]?.slice(0, 60)}{(cmd.responses?.[0]?.length ?? 0) > 60 ? '…' : ''}
          {(cmd.responses?.length ?? 0) > 1 && <span className="ml-1 text-discord-blurple">+{cmd.responses.length - 1} more</span>}
        </p>
      </div>
      <div className="flex gap-1 shrink-0">
        <button onClick={() => openEditCommand(cmd)} className="btn btn-secondary p-1.5"><Edit className="w-3.5 h-3.5" /></button>
        <button
          onClick={() => window.confirm(`Delete "${cmd.name}"?`) && deleteCmd.mutate(cmd.id)}
          className="btn bg-red-500/20 text-red-400 hover:bg-red-500/30 p-1.5"
        ><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: left panel
  // ─────────────────────────────────────────────────────────────────────────────

  const renderLeft = () => (
    <div className="flex flex-col h-full">
      {/* Prefix + search */}
      <div className="p-3 border-b border-discord-dark space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-discord-light">Prefix:</span>
          <input type="text" value={prefixInput} onChange={e => setPrefixInput(e.target.value.slice(0, 5))}
            className="input w-16 text-center font-mono text-sm py-1" maxLength={5} placeholder="!" />
          <button onClick={() => savePrefix.mutate(prefixInput)}
            disabled={savePrefix.isPending || !prefixInput || prefixInput === generalConfig?.prefix}
            className="btn btn-primary text-xs py-1 px-2 disabled:opacity-50">
            {prefixSaved ? '✓' : 'Save'}
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-discord-light" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search commands…" className="input w-full pl-7 text-sm py-1.5" />
        </div>
      </div>

      {/* Command list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading ? (
          <div className="text-center py-8 text-discord-light text-sm">Loading…</div>
        ) : (
          <>
            {/* Groups */}
            {groups.map(group => {
              const groupCmds = commandsByGroup(group.id);
              const isExpanded = expandedGroups.has(group.id);
              return (
                <div key={group.id}>
                  <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-discord-dark/50 group">
                    <button onClick={() => toggleGroup(group.id)} className="flex items-center gap-1.5 flex-1 min-w-0">
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-discord-light shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-discord-light shrink-0" />}
                      <Folder className="w-3.5 h-3.5 text-discord-blurple shrink-0" />
                      <span className="text-sm font-medium truncate">{group.name}</span>
                      <span className="text-xs text-discord-light ml-1">({groupCmds.length})</span>
                    </button>
                    <div className="hidden group-hover:flex gap-1">
                      <button onClick={() => openNewCommand(group.id)} title="Add command" className="text-discord-light hover:text-white p-0.5"><Plus className="w-3.5 h-3.5" /></button>
                      <button onClick={() => { setEditingGroup({ ...group }); setEditingGroupId(group.id); }} title="Edit group" className="text-discord-light hover:text-white p-0.5"><Edit className="w-3.5 h-3.5" /></button>
                      <button onClick={() => window.confirm(`Delete group "${group.name}"?`) && deleteGroup.mutate(group.id)} title="Delete group" className="text-red-400 hover:text-red-300 p-0.5"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  {editingGroupId === group.id && renderGroupEditor()}
                  {isExpanded && (
                    <div className="ml-4 mt-1 space-y-0.5">
                      {groupCmds.map(renderCommandRow)}
                      {groupCmds.length === 0 && !searchQuery && (
                        <p className="text-xs text-discord-light px-3 py-2">No commands in this group</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Ungrouped */}
            {(() => {
              const ungrouped = commandsByGroup(null);
              return ungrouped.length > 0 || !searchQuery ? (
                <div>
                  <p className="text-xs text-discord-light px-2 py-1 uppercase tracking-wider font-semibold">
                    Ungrouped
                  </p>
                  <div className="space-y-0.5">
                    {ungrouped.map(renderCommandRow)}
                  </div>
                </div>
              ) : null;
            })()}

            {commands.length === 0 && !isLoading && (
              <div className="text-center py-8">
                <Terminal className="w-10 h-10 mx-auto text-discord-light opacity-40 mb-2" />
                <p className="text-sm text-discord-light">No commands yet</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom actions */}
      <div className="p-2 border-t border-discord-dark flex gap-2">
        <button onClick={() => openNewCommand()} className="btn btn-primary flex-1 flex items-center justify-center gap-1.5 text-sm py-2">
          <Plus className="w-4 h-4" /> New Command
        </button>
        <button
          onClick={() => { setEditingGroup(emptyGroup()); setEditingGroupId('new'); }}
          className="btn btn-secondary flex items-center gap-1 text-sm py-2 px-3" title="New Group"
        >
          <FolderPlus className="w-4 h-4" />
        </button>
      </div>
      {editingGroupId === 'new' && <div className="px-2 pb-2">{renderGroupEditor()}</div>}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-130px)] gap-0 -m-4 md:-m-6 overflow-hidden">
      {/* Left panel — command/group list */}
      <div className={`
        ${editingCommand && !isMobile ? 'w-72 border-r border-discord-dark' : 'flex-1'}
        ${editingCommand && isMobile ? 'hidden' : ''}
        flex flex-col bg-discord-darker
      `}>
        {renderLeft()}
      </div>

      {/* Right panel — editor */}
      {editingCommand && (
        <div className={`
          ${isMobile ? 'flex-1' : 'flex-1'}
          flex flex-col overflow-hidden bg-discord-dark
        `}>
          {renderEditor()}
        </div>
      )}
    </div>
  );
}
```

**Step 2: TypeScript check**

```bash
cd dashboard/frontend && node_modules/.bin/tsc --noEmit
```

Fix any errors. Common issues:
- `CodeMirrorEditor` ref type mismatch — ensure `editorRefs.current` is initialized: `const editorRefs = useRef<(CMHandle | null)[]>([]);`

**Step 3: Commit**

```bash
git add dashboard/frontend/src/pages/guild/CustomCommandsPage.tsx
git commit -m "feat: redesign CustomCommandsPage as two-panel YAGPDB-style UI with all trigger types"
```

---

### Task 11: Build, migrate, deploy

**Step 1: Full TypeScript build check across all packages**

```bash
# From repo root
cd bot && node_modules/.bin/tsc --noEmit && echo "bot OK"
cd ../dashboard/backend && node_modules/.bin/tsc --noEmit && echo "backend OK"
cd ../dashboard/frontend && node_modules/.bin/tsc --noEmit && echo "frontend OK"
```

**Step 2: Push and deploy**

```bash
git push origin main
```

On VPS:
```bash
cd /opt/wall-e-bot
git pull
docker compose -f docker/docker-compose.yml build --no-cache
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml exec backend node dist/db/migrate.js
```

**Step 3: Verify**

- Open the dashboard → Custom Commands page
- Confirm two-panel layout loads
- Create a `command` type command with two responses — verify it fires randomly in Discord
- Create a `contains` type command — verify it fires when any message contains the trigger text
- Create a `regex` type — verify live validation in the editor
- Create a group — verify commands can be assigned to it
- Create an `interval` type with a short cron (e.g. `* * * * *`) and valid channel ID — verify it fires within 1 minute
