# Ticket System Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single-panel ticket system with a full multi-panel, per-category ticketing system supporting custom forms, closed-category archiving, transcripts, DM notifications, and auto-close.

**Architecture:** Hybrid approach — extend `ticket_config` for global server settings, add `ticket_panels` → `ticket_categories` → `ticket_form_fields` relational tables. The bot handles all Discord interactions; the dashboard backend exposes REST endpoints for dashboard management.

**Tech Stack:** TypeScript, Discord.js v14, PostgreSQL (pg), Express, React + Vite, Zod

---

## Context for Implementer

- Bot entry: `bot/src/index.ts`, commands in `bot/src/commands/admin/ticket.ts`
- Button interactions: `bot/src/events/buttonInteraction.ts`
- DB service: `bot/src/services/DatabaseService.ts` — use `client.db.pool.query()`
- Scheduler: `bot/src/services/SchedulerService.ts` — polls every 60s
- Migration file: `dashboard/backend/src/db/migrate.ts` — append to `schema` string
- Backend routes: `dashboard/backend/src/routes/guilds.ts` — add to `guildsRouter`
- Frontend page: `dashboard/frontend/src/pages/guild/TicketsPage.tsx` — full rewrite
- Frontend API helper: `dashboard/frontend/src/services/api.ts` — add ticket functions
- Shared types: `shared/src/types/guild.ts` — add ticket types
- Run bot tests: `cd bot && npx jest --testPathPattern=<file> --no-coverage`
- Run bot all tests: `cd bot && npx jest --no-coverage`

---

## Task 1: Database Migration

**Files:**
- Modify: `dashboard/backend/src/db/migrate.ts`

### Step 1: Add new tables to the schema string

Find the line `-- Ticket config table` in `migrate.ts` and replace the entire ticket section (lines 165–191) with:

```sql
-- Ticket config table (global server settings)
CREATE TABLE IF NOT EXISTS ticket_config (
  id SERIAL PRIMARY KEY,
  guild_id VARCHAR(20) UNIQUE NOT NULL,
  transcript_channel_id VARCHAR(20),
  max_tickets_per_user INTEGER DEFAULT 1,
  auto_close_hours INTEGER DEFAULT 0,
  welcome_message TEXT DEFAULT 'Welcome! Please describe your issue and a staff member will assist you shortly.',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Ticket panels (one per panel message; a guild can have many)
CREATE TABLE IF NOT EXISTS ticket_panels (
  id SERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  style VARCHAR(20) DEFAULT 'channel',
  panel_type VARCHAR(20) DEFAULT 'buttons',
  panel_channel_id VARCHAR(20),
  panel_message_id VARCHAR(20),
  category_open_id VARCHAR(20),
  category_closed_id VARCHAR(20),
  overflow_category_id VARCHAR(20),
  channel_name_template VARCHAR(100) DEFAULT '{type}-{number}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Ticket categories (buttons or dropdown options within a panel)
CREATE TABLE IF NOT EXISTS ticket_categories (
  id SERIAL PRIMARY KEY,
  panel_id INTEGER REFERENCES ticket_panels(id) ON DELETE CASCADE,
  guild_id VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  emoji VARCHAR(10),
  description VARCHAR(200),
  support_role_ids TEXT[] DEFAULT '{}',
  observer_role_ids TEXT[] DEFAULT '{}',
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Form fields per category (up to 5 — Discord modal limit)
CREATE TABLE IF NOT EXISTS ticket_form_fields (
  id SERIAL PRIMARY KEY,
  category_id INTEGER REFERENCES ticket_categories(id) ON DELETE CASCADE,
  label VARCHAR(45) NOT NULL,
  placeholder VARCHAR(100),
  min_length INTEGER DEFAULT 0,
  max_length INTEGER DEFAULT 1024,
  style VARCHAR(10) DEFAULT 'short',
  required BOOLEAN DEFAULT TRUE,
  position INTEGER DEFAULT 0
);

-- Tickets table
CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  panel_id INTEGER REFERENCES ticket_panels(id),
  category_id INTEGER REFERENCES ticket_categories(id),
  channel_id VARCHAR(20) NOT NULL,
  thread_id VARCHAR(20),
  user_id VARCHAR(20) NOT NULL,
  ticket_number INTEGER NOT NULL,
  topic TEXT,
  status VARCHAR(20) DEFAULT 'open',
  claimed_by VARCHAR(20),
  closed_by VARCHAR(20),
  closed_at TIMESTAMP,
  close_reason TEXT,
  transcript_message_id VARCHAR(20),
  last_activity TIMESTAMP DEFAULT NOW(),
  warned_inactive BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

Also add these indexes after the existing index block:

```sql
CREATE INDEX IF NOT EXISTS idx_ticket_panels_guild ON ticket_panels(guild_id);
CREATE INDEX IF NOT EXISTS idx_ticket_categories_panel ON ticket_categories(panel_id);
CREATE INDEX IF NOT EXISTS idx_ticket_form_fields_category ON ticket_form_fields(category_id);
CREATE INDEX IF NOT EXISTS idx_tickets_guild_user ON tickets(guild_id, user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(guild_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_last_activity ON tickets(last_activity) WHERE status = 'open';
```

### Step 2: Run the migration

```bash
cd /home/plex/wall-e-bot && DATABASE_URL=postgresql://localhost/wallebot npx ts-node dashboard/backend/src/db/migrate.ts
```

Expected: `Migrations completed successfully!`

_(If no DB is running locally yet, skip — migration will run in Docker on deploy. Continue to next task.)_

### Step 3: Commit

```bash
git add dashboard/backend/src/db/migrate.ts
git commit -m "feat: add multi-panel ticket schema migration"
```

---

## Task 2: Shared Types

**Files:**
- Modify: `shared/src/types/guild.ts`

### Step 1: Add ticket types at the end of the file

```typescript
export interface TicketPanel {
  id: number;
  guildId: string;
  name: string;
  style: 'channel' | 'thread';
  panelType: 'buttons' | 'dropdown';
  panelChannelId?: string;
  panelMessageId?: string;
  categoryOpenId?: string;
  categoryClosedId?: string;
  overflowCategoryId?: string;
  channelNameTemplate: string;
  categories?: TicketCategory[];
  createdAt: Date;
}

export interface TicketCategory {
  id: number;
  panelId: number;
  guildId: string;
  name: string;
  emoji?: string;
  description?: string;
  supportRoleIds: string[];
  observerRoleIds: string[];
  position: number;
  formFields?: TicketFormField[];
  createdAt: Date;
}

export interface TicketFormField {
  id: number;
  categoryId: number;
  label: string;
  placeholder?: string;
  minLength: number;
  maxLength: number;
  style: 'short' | 'paragraph';
  required: boolean;
  position: number;
}

export interface TicketConfig {
  guildId: string;
  transcriptChannelId?: string;
  maxTicketsPerUser: number;
  autoCloseHours: number;
  welcomeMessage: string;
}

export interface Ticket {
  id: number;
  guildId: string;
  panelId?: number;
  categoryId?: number;
  channelId: string;
  threadId?: string;
  userId: string;
  ticketNumber: number;
  topic?: string;
  status: 'open' | 'claimed' | 'closed';
  claimedBy?: string;
  closedBy?: string;
  closedAt?: Date;
  closeReason?: string;
  transcriptMessageId?: string;
  lastActivity: Date;
  createdAt: Date;
}
```

### Step 2: Export from shared index

Open `shared/src/types/index.ts` and verify `export * from './guild.js'` is present (it already exports everything from guild.ts — no change needed if that line exists).

### Step 3: Commit

```bash
git add shared/src/types/guild.ts
git commit -m "feat: add ticket system shared types"
```

---

## Task 3: Bot — Ticket Utility Functions (TDD)

**Files:**
- Create: `bot/src/utils/ticketUtils.ts`
- Create: `bot/tests/utils/ticketUtils.test.ts`

### Step 1: Write the failing tests

Create `bot/tests/utils/ticketUtils.test.ts`:

```typescript
import { describe, it, expect } from '@jest/globals';
import { resolveChannelName, buildTranscript } from '../../src/utils/ticketUtils.js';

describe('resolveChannelName', () => {
  it('replaces {type} with lowercased hyphenated category name', () => {
    const result = resolveChannelName('{type}-{number}', {
      type: 'General Support',
      number: 1,
      username: 'testuser',
      userid: '123',
    });
    expect(result).toBe('general-support-0001');
  });

  it('replaces {number} zero-padded to 4 digits', () => {
    const result = resolveChannelName('ticket-{number}', {
      type: 'support',
      number: 42,
      username: 'user',
      userid: '456',
    });
    expect(result).toBe('ticket-0042');
  });

  it('replaces {username}', () => {
    const result = resolveChannelName('{username}-ticket', {
      type: 'support',
      number: 1,
      username: 'JohnDoe',
      userid: '789',
    });
    expect(result).toBe('johndoe-ticket');
  });

  it('replaces {userid}', () => {
    const result = resolveChannelName('{userid}-support', {
      type: 'support',
      number: 1,
      username: 'user',
      userid: '999',
    });
    expect(result).toBe('999-support');
  });

  it('truncates result to 100 characters', () => {
    const result = resolveChannelName('{type}-{number}', {
      type: 'a'.repeat(200),
      number: 1,
      username: 'user',
      userid: '1',
    });
    expect(result.length).toBeLessThanOrEqual(100);
  });

  it('sanitizes special characters for Discord channel names', () => {
    const result = resolveChannelName('{username}-ticket', {
      type: 'support',
      number: 1,
      username: 'John Doe!',
      userid: '1',
    });
    expect(result).toBe('john-doe-ticket');
  });
});

describe('buildTranscript', () => {
  it('generates header with ticket info', () => {
    const messages = [
      { author: { tag: 'User#1234' }, content: 'Hello', createdAt: new Date('2026-01-01'), attachments: { size: 0 } },
    ];
    const result = buildTranscript('ticket-0001', 'user-123', new Date('2026-01-01'), messages as any);
    expect(result).toContain('Ticket Transcript - ticket-0001');
    expect(result).toContain('user-123');
  });

  it('includes all messages in chronological order', () => {
    const messages = [
      { author: { tag: 'User#1' }, content: 'First', createdAt: new Date('2026-01-01T10:00:00Z'), attachments: { size: 0 } },
      { author: { tag: 'Staff#2' }, content: 'Second', createdAt: new Date('2026-01-01T10:05:00Z'), attachments: { size: 0 } },
    ];
    const result = buildTranscript('ticket-0001', 'u1', new Date(), messages as any);
    const firstIdx = result.indexOf('First');
    const secondIdx = result.indexOf('Second');
    expect(firstIdx).toBeLessThan(secondIdx);
  });

  it('includes attachment URLs', () => {
    const messages = [
      {
        author: { tag: 'User#1' },
        content: 'See attached',
        createdAt: new Date(),
        attachments: { size: 1, map: (fn: any) => fn({ url: 'https://cdn.discord.com/file.png' }) },
      },
    ];
    const result = buildTranscript('ticket-0001', 'u1', new Date(), messages as any);
    expect(result).toContain('https://cdn.discord.com/file.png');
  });
});
```

### Step 2: Run to verify failure

```bash
cd /home/plex/wall-e-bot && npx jest --testPathPattern=ticketUtils --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `ticketUtils.js` not found

### Step 3: Implement the utility

Create `bot/src/utils/ticketUtils.ts`:

```typescript
/**
 * Resolve a channel name template with ticket variables.
 * Variables: {type}, {number}, {username}, {userid}
 * Discord channel names: lowercase, no spaces, max 100 chars
 */
export function resolveChannelName(
  template: string,
  vars: { type: string; number: number; username: string; userid: string }
): string {
  const sanitize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  const result = template
    .replace(/{type}/g, sanitize(vars.type))
    .replace(/{number}/g, vars.number.toString().padStart(4, '0'))
    .replace(/{username}/g, sanitize(vars.username))
    .replace(/{userid}/g, vars.userid);

  return result.substring(0, 100);
}

interface TranscriptMessage {
  author: { tag: string };
  content: string;
  createdAt: Date;
  attachments: { size: number; map?: (fn: (a: { url: string }) => string) => string[] };
}

/**
 * Build a plain-text transcript from a list of messages.
 */
export function buildTranscript(
  channelName: string,
  userId: string,
  createdAt: Date,
  messages: TranscriptMessage[]
): string {
  let transcript = `Ticket Transcript - ${channelName}\n`;
  transcript += `Created: ${createdAt.toISOString()}\n`;
  transcript += `User ID: ${userId}\n\n`;
  transcript += '='.repeat(50) + '\n\n';

  for (const msg of messages) {
    const time = msg.createdAt.toISOString();
    transcript += `[${time}] ${msg.author.tag}: ${msg.content}\n`;
    if (msg.attachments.size > 0 && msg.attachments.map) {
      const urls = msg.attachments.map(a => a.url);
      transcript += `  Attachments: ${urls.join(', ')}\n`;
    }
  }

  return transcript;
}
```

### Step 4: Run tests to verify pass

```bash
cd /home/plex/wall-e-bot && npx jest --testPathPattern=ticketUtils --no-coverage
```

Expected: All tests PASS

### Step 5: Commit

```bash
git add bot/src/utils/ticketUtils.ts bot/tests/utils/ticketUtils.test.ts
git commit -m "feat: add ticket utility functions with tests"
```

---

## Task 4: Bot — Rewrite ticket.ts Command

**Files:**
- Modify: `bot/src/commands/admin/ticket.ts`

Replace the entire file with a command that manages panels. The old single-panel `setup` subcommand is replaced by `panel` subcommands. Keep `close`, `add`, `remove`, `rename`, `transcript`, `claim` subcommands as-is but update their DB queries to use the new `tickets` schema (same column names, backward compatible).

```typescript
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextChannel,
  CategoryChannel,
} from 'discord.js';
import type { Command } from '../../structures/Command.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { COLORS } from '@wall-e/shared';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket system management')

    // panel subcommand group
    .addSubcommandGroup(group =>
      group.setName('panel').setDescription('Manage ticket panels')
        .addSubcommand(sub =>
          sub.setName('create')
            .setDescription('Create a new ticket panel')
            .addStringOption(opt =>
              opt.setName('name').setDescription('Panel name').setRequired(true))
            .addStringOption(opt =>
              opt.setName('style')
                .setDescription('Channel or thread tickets')
                .addChoices(
                  { name: 'Channel (default)', value: 'channel' },
                  { name: 'Thread', value: 'thread' }
                ))
            .addStringOption(opt =>
              opt.setName('type')
                .setDescription('Buttons or dropdown selector')
                .addChoices(
                  { name: 'Buttons (default)', value: 'buttons' },
                  { name: 'Dropdown', value: 'dropdown' }
                )))
        .addSubcommand(sub =>
          sub.setName('send')
            .setDescription('Send panel message to a channel')
            .addIntegerOption(opt =>
              opt.setName('panel_id').setDescription('Panel ID from /ticket panel list').setRequired(true))
            .addChannelOption(opt =>
              opt.setName('channel')
                .setDescription('Channel to send the panel to')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)))
        .addSubcommand(sub =>
          sub.setName('list')
            .setDescription('List all panels in this server'))
        .addSubcommand(sub =>
          sub.setName('delete')
            .setDescription('Delete a panel')
            .addIntegerOption(opt =>
              opt.setName('panel_id').setDescription('Panel ID to delete').setRequired(true))))

    // category subcommand group
    .addSubcommandGroup(group =>
      group.setName('category').setDescription('Manage ticket categories within a panel')
        .addSubcommand(sub =>
          sub.setName('add')
            .setDescription('Add a category to a panel')
            .addIntegerOption(opt =>
              opt.setName('panel_id').setDescription('Panel ID').setRequired(true))
            .addStringOption(opt =>
              opt.setName('name').setDescription('Category name').setRequired(true))
            .addStringOption(opt =>
              opt.setName('emoji').setDescription('Emoji for this category'))
            .addStringOption(opt =>
              opt.setName('description').setDescription('Short description'))
            .addRoleOption(opt =>
              opt.setName('support_role').setDescription('Role that handles this category').setRequired(true)))
        .addSubcommand(sub =>
          sub.setName('list')
            .setDescription('List categories for a panel')
            .addIntegerOption(opt =>
              opt.setName('panel_id').setDescription('Panel ID').setRequired(true))))

    // ticket management subcommands
    .addSubcommand(sub =>
      sub.setName('close')
        .setDescription('Close the current ticket')
        .addStringOption(opt =>
          opt.setName('reason').setDescription('Reason for closing')))
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a user to the current ticket')
        .addUserOption(opt =>
          opt.setName('user').setDescription('User to add').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a user from the current ticket')
        .addUserOption(opt =>
          opt.setName('user').setDescription('User to remove').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('rename')
        .setDescription('Rename the current ticket')
        .addStringOption(opt =>
          opt.setName('name').setDescription('New ticket name').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('transcript')
        .setDescription('Save a transcript of the current ticket'))
    .addSubcommand(sub =>
      sub.setName('claim')
        .setDescription('Claim the current ticket as yours'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  guildOnly: true,

  async execute(client, interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand();

    if (group === 'panel') {
      switch (subcommand) {
        case 'create': {
          const name = interaction.options.getString('name', true);
          const style = interaction.options.getString('style') || 'channel';
          const panelType = interaction.options.getString('type') || 'buttons';

          const result = await client.db.pool.query(
            `INSERT INTO ticket_panels (guild_id, name, style, panel_type)
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [interaction.guild!.id, name, style, panelType]
          );

          const panelId = result.rows[0].id;
          await interaction.reply({
            embeds: [successEmbed('Panel Created',
              `Panel **${name}** created (ID: ${panelId}).\n\n` +
              `Next steps:\n` +
              `1. Add categories: \`/ticket category add panel_id:${panelId} name:...\`\n` +
              `2. Configure in dashboard\n` +
              `3. Send panel: \`/ticket panel send panel_id:${panelId} #channel\``
            )],
            ephemeral: true,
          });
          break;
        }

        case 'send': {
          const panelId = interaction.options.getInteger('panel_id', true);
          const channel = interaction.options.getChannel('channel', true) as TextChannel;

          const panelResult = await client.db.pool.query(
            'SELECT * FROM ticket_panels WHERE id = $1 AND guild_id = $2',
            [panelId, interaction.guild!.id]
          );

          if (panelResult.rows.length === 0) {
            await interaction.reply({ embeds: [errorEmbed('Error', 'Panel not found.')], ephemeral: true });
            return;
          }

          const panel = panelResult.rows[0];

          // Get categories
          const catResult = await client.db.pool.query(
            'SELECT * FROM ticket_categories WHERE panel_id = $1 ORDER BY position',
            [panelId]
          );
          const categories = catResult.rows;

          const embed = new EmbedBuilder()
            .setColor(COLORS.PRIMARY)
            .setTitle(`🎫 ${panel.name}`)
            .setDescription(
              categories.length > 0
                ? `Select a category below to open a ticket.\n\n${categories.map((c: any) => `${c.emoji || '📋'} **${c.name}** — ${c.description || ''}`).join('\n')}`
                : 'Click the button below to open a support ticket.'
            )
            .setFooter({ text: 'Wall-E Ticket System' });

          let components: ActionRowBuilder<any>[] = [];

          if (categories.length === 0) {
            // No categories yet — single generic button
            const btn = new ButtonBuilder()
              .setCustomId(`ticket_open:${panelId}:0`)
              .setLabel('Open Ticket')
              .setEmoji('🎫')
              .setStyle(ButtonStyle.Primary);
            components = [new ActionRowBuilder<ButtonBuilder>().addComponents(btn)];
          } else if (panel.panel_type === 'dropdown') {
            const select = new StringSelectMenuBuilder()
              .setCustomId(`ticket_select:${panelId}`)
              .setPlaceholder('Select ticket type...')
              .addOptions(categories.map((c: any) =>
                new StringSelectMenuOptionBuilder()
                  .setLabel(c.name)
                  .setValue(c.id.toString())
                  .setDescription(c.description || c.name)
                  .setEmoji(c.emoji || '📋')
              ));
            components = [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)];
          } else {
            // Buttons — max 5 per row, Discord allows up to 5 buttons per action row
            const buttons = categories.slice(0, 5).map((c: any) =>
              new ButtonBuilder()
                .setCustomId(`ticket_open:${panelId}:${c.id}`)
                .setLabel(c.name)
                .setEmoji(c.emoji || '🎫')
                .setStyle(ButtonStyle.Primary)
            );
            components = [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)];
          }

          const msg = await channel.send({ embeds: [embed], components });

          await client.db.pool.query(
            'UPDATE ticket_panels SET panel_channel_id = $1, panel_message_id = $2 WHERE id = $3',
            [channel.id, msg.id, panelId]
          );

          await interaction.reply({
            embeds: [successEmbed('Panel Sent', `Panel sent to ${channel}.`)],
            ephemeral: true,
          });
          break;
        }

        case 'list': {
          const panels = await client.db.pool.query(
            'SELECT * FROM ticket_panels WHERE guild_id = $1 ORDER BY id',
            [interaction.guild!.id]
          );

          if (panels.rows.length === 0) {
            await interaction.reply({
              embeds: [errorEmbed('No Panels', 'No ticket panels configured. Use `/ticket panel create` to get started.')],
              ephemeral: true,
            });
            return;
          }

          const embed = new EmbedBuilder()
            .setColor(COLORS.PRIMARY)
            .setTitle('Ticket Panels')
            .setDescription(panels.rows.map((p: any) =>
              `**ID ${p.id}** — ${p.name} (${p.style}/${p.panel_type})`
            ).join('\n'));

          await interaction.reply({ embeds: [embed], ephemeral: true });
          break;
        }

        case 'delete': {
          const panelId = interaction.options.getInteger('panel_id', true);
          const result = await client.db.pool.query(
            'DELETE FROM ticket_panels WHERE id = $1 AND guild_id = $2 RETURNING name',
            [panelId, interaction.guild!.id]
          );

          if (result.rowCount === 0) {
            await interaction.reply({ embeds: [errorEmbed('Error', 'Panel not found.')], ephemeral: true });
            return;
          }

          await interaction.reply({
            embeds: [successEmbed('Panel Deleted', `Panel **${result.rows[0].name}** has been deleted.`)],
            ephemeral: true,
          });
          break;
        }
      }
      return;
    }

    if (group === 'category') {
      switch (subcommand) {
        case 'add': {
          const panelId = interaction.options.getInteger('panel_id', true);
          const name = interaction.options.getString('name', true);
          const emoji = interaction.options.getString('emoji') || '🎫';
          const description = interaction.options.getString('description') || '';
          const supportRole = interaction.options.getRole('support_role', true);

          // Verify panel belongs to this guild
          const panelCheck = await client.db.pool.query(
            'SELECT id FROM ticket_panels WHERE id = $1 AND guild_id = $2',
            [panelId, interaction.guild!.id]
          );
          if (panelCheck.rows.length === 0) {
            await interaction.reply({ embeds: [errorEmbed('Error', 'Panel not found.')], ephemeral: true });
            return;
          }

          // Get current max position
          const posResult = await client.db.pool.query(
            'SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM ticket_categories WHERE panel_id = $1',
            [panelId]
          );
          const position = posResult.rows[0].next_pos;

          await client.db.pool.query(
            `INSERT INTO ticket_categories (panel_id, guild_id, name, emoji, description, support_role_ids, position)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [panelId, interaction.guild!.id, name, emoji, description, [supportRole.id], position]
          );

          await interaction.reply({
            embeds: [successEmbed('Category Added',
              `Category **${emoji} ${name}** added to panel ${panelId}.\n` +
              `Re-send the panel with \`/ticket panel send\` to update the Discord message.`
            )],
            ephemeral: true,
          });
          break;
        }

        case 'list': {
          const panelId = interaction.options.getInteger('panel_id', true);
          const cats = await client.db.pool.query(
            'SELECT * FROM ticket_categories WHERE panel_id = $1 AND guild_id = $2 ORDER BY position',
            [panelId, interaction.guild!.id]
          );

          if (cats.rows.length === 0) {
            await interaction.reply({
              embeds: [errorEmbed('No Categories', `No categories in panel ${panelId}. Add with \`/ticket category add\`.`)],
              ephemeral: true,
            });
            return;
          }

          const embed = new EmbedBuilder()
            .setColor(COLORS.PRIMARY)
            .setTitle(`Categories in Panel ${panelId}`)
            .setDescription(cats.rows.map((c: any) =>
              `**ID ${c.id}** — ${c.emoji || ''} ${c.name}: ${c.description || '(no description)'}`
            ).join('\n'));

          await interaction.reply({ embeds: [embed], ephemeral: true });
          break;
        }
      }
      return;
    }

    // ---- Ticket management subcommands ----
    switch (subcommand) {
      case 'close': {
        const ticket = await client.db.pool.query(
          `SELECT * FROM tickets WHERE guild_id = $1 AND channel_id = $2 AND status = 'open'`,
          [interaction.guild!.id, interaction.channel!.id]
        );
        if (ticket.rows.length === 0) {
          await interaction.reply({ embeds: [errorEmbed('Error', 'This is not an open ticket channel.')], ephemeral: true });
          return;
        }

        const reason = interaction.options.getString('reason') || 'No reason provided';

        // Two-step: send confirm embed with buttons
        const { ActionRowBuilder: ARB, ButtonBuilder: BB, ButtonStyle: BS } = await import('discord.js');
        const confirmBtn = new BB()
          .setCustomId(`ticket_close_confirm:${ticket.rows[0].id}:${encodeURIComponent(reason)}`)
          .setLabel('Confirm Close')
          .setEmoji('🔒')
          .setStyle(BS.Danger);
        const cancelBtn = new BB()
          .setCustomId('ticket_close_cancel')
          .setLabel('Cancel')
          .setStyle(BS.Secondary);

        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setTitle('🔒 Close Ticket?')
            .setDescription(`**Reason:** ${reason}\n\nClick confirm to close this ticket.`)
          ],
          components: [new ARB<typeof confirmBtn>().addComponents(confirmBtn, cancelBtn)],
        });
        break;
      }

      case 'add': {
        const ticket = await client.db.pool.query(
          `SELECT * FROM tickets WHERE guild_id = $1 AND channel_id = $2 AND status = 'open'`,
          [interaction.guild!.id, interaction.channel!.id]
        );
        if (ticket.rows.length === 0) {
          await interaction.reply({ embeds: [errorEmbed('Error', 'This is not an open ticket channel.')], ephemeral: true });
          return;
        }
        const user = interaction.options.getUser('user', true);
        const ch = interaction.channel as TextChannel;
        await ch.permissionOverwrites.create(user, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        });
        await interaction.reply({ embeds: [successEmbed('User Added', `${user} has been added to this ticket.`)] });
        break;
      }

      case 'remove': {
        const ticket = await client.db.pool.query(
          `SELECT * FROM tickets WHERE guild_id = $1 AND channel_id = $2 AND status = 'open'`,
          [interaction.guild!.id, interaction.channel!.id]
        );
        if (ticket.rows.length === 0) {
          await interaction.reply({ embeds: [errorEmbed('Error', 'This is not an open ticket channel.')], ephemeral: true });
          return;
        }
        const user = interaction.options.getUser('user', true);
        await (interaction.channel as TextChannel).permissionOverwrites.delete(user);
        await interaction.reply({ embeds: [successEmbed('User Removed', `${user} has been removed from this ticket.`)] });
        break;
      }

      case 'rename': {
        const ticket = await client.db.pool.query(
          `SELECT * FROM tickets WHERE guild_id = $1 AND channel_id = $2 AND status = 'open'`,
          [interaction.guild!.id, interaction.channel!.id]
        );
        if (ticket.rows.length === 0) {
          await interaction.reply({ embeds: [errorEmbed('Error', 'This is not an open ticket channel.')], ephemeral: true });
          return;
        }
        const name = interaction.options.getString('name', true);
        await (interaction.channel as TextChannel).setName(`ticket-${name}`);
        await interaction.reply({ embeds: [successEmbed('Ticket Renamed', `Renamed to \`ticket-${name}\`.`)] });
        break;
      }

      case 'transcript': {
        const ticket = await client.db.pool.query(
          'SELECT * FROM tickets WHERE guild_id = $1 AND channel_id = $2',
          [interaction.guild!.id, interaction.channel!.id]
        );
        if (ticket.rows.length === 0) {
          await interaction.reply({ embeds: [errorEmbed('Error', 'This is not a ticket channel.')], ephemeral: true });
          return;
        }

        await interaction.deferReply();
        const ch = interaction.channel as TextChannel;

        // Paginate to get all messages (not just last 100)
        const allMessages: any[] = [];
        let lastId: string | undefined;
        while (true) {
          const batch = await ch.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) });
          if (batch.size === 0) break;
          allMessages.push(...batch.values());
          lastId = batch.last()?.id;
          if (batch.size < 100) break;
        }
        allMessages.reverse();

        const { buildTranscript } = await import('../utils/ticketUtils.js');
        const text = buildTranscript(ch.name, ticket.rows[0].user_id, ticket.rows[0].created_at, allMessages);

        await interaction.editReply({
          content: '📝 Ticket transcript:',
          files: [{ attachment: Buffer.from(text, 'utf-8'), name: `transcript-${ch.name}.txt` }],
        });
        break;
      }

      case 'claim': {
        const ticket = await client.db.pool.query(
          `SELECT * FROM tickets WHERE guild_id = $1 AND channel_id = $2 AND status = 'open'`,
          [interaction.guild!.id, interaction.channel!.id]
        );
        if (ticket.rows.length === 0) {
          await interaction.reply({ embeds: [errorEmbed('Error', 'This is not an open ticket channel.')], ephemeral: true });
          return;
        }
        await client.db.pool.query(
          `UPDATE tickets SET claimed_by = $3, status = 'claimed' WHERE id = $1 AND guild_id = $2`,
          [ticket.rows[0].id, interaction.guild!.id, interaction.user.id]
        );
        await interaction.reply({ embeds: [successEmbed('Ticket Claimed', `${interaction.user} has claimed this ticket.`)] });
        break;
      }
    }
  },
};

export default command;
```

### Step 2: Commit

```bash
git add bot/src/commands/admin/ticket.ts
git commit -m "feat: rewrite ticket command with multi-panel and category support"
```

---

## Task 5: Bot — Rewrite buttonInteraction.ts

**Files:**
- Modify: `bot/src/events/buttonInteraction.ts`

This is the most complex piece. It handles:
- `ticket_open:<panelId>:<categoryId>` buttons
- `ticket_select:<panelId>` dropdown selections
- `ticket_close_confirm:<ticketId>:<reason>` confirm close
- `ticket_close_cancel` cancel close
- `rr_*` reaction role buttons (keep unchanged)
- `rr_select` reaction role dropdowns (keep unchanged)

Replace the entire file:

```typescript
import {
  Events,
  ButtonInteraction,
  StringSelectMenuInteraction,
  EmbedBuilder,
  ChannelType,
  PermissionsBitField,
  TextChannel,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { COLORS } from '@wall-e/shared';
import { logger } from '../utils/logger.js';
import { resolveChannelName, buildTranscript } from '../utils/ticketUtils.js';

export default {
  name: Events.InteractionCreate,
  once: false,
  async execute(client: WallEClient, interaction: ButtonInteraction | StringSelectMenuInteraction) {
    if (interaction.isButton()) {
      await handleButton(client, interaction);
    }
    if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(client, interaction);
    }
  },
};

// ─── Button Routing ──────────────────────────────────────────────────────────

async function handleButton(client: WallEClient, interaction: ButtonInteraction) {
  const id = interaction.customId;

  if (id.startsWith('rr_')) {
    await handleReactionRoleButton(client, interaction);
    return;
  }
  if (id.startsWith('ticket_open:')) {
    const [, panelId, categoryId] = id.split(':');
    await handleTicketOpen(client, interaction, parseInt(panelId), parseInt(categoryId) || 0);
    return;
  }
  if (id.startsWith('ticket_close_confirm:')) {
    const parts = id.split(':');
    const ticketId = parseInt(parts[1]);
    const reason = decodeURIComponent(parts.slice(2).join(':'));
    await handleTicketCloseConfirm(client, interaction, ticketId, reason);
    return;
  }
  if (id === 'ticket_close_cancel') {
    await interaction.update({ components: [] });
    return;
  }
  // Legacy single-button support (panels created before the redesign)
  if (id === 'ticket_create') {
    await handleLegacyTicketCreate(client, interaction);
    return;
  }
  if (id === 'ticket_close') {
    await handleLegacyTicketClose(client, interaction);
    return;
  }
}

// ─── Select Menu Routing ─────────────────────────────────────────────────────

async function handleSelectMenu(client: WallEClient, interaction: StringSelectMenuInteraction) {
  const id = interaction.customId;

  if (id === 'rr_select') {
    await handleReactionRoleSelect(client, interaction);
    return;
  }
  if (id.startsWith('ticket_select:')) {
    const panelId = parseInt(id.split(':')[1]);
    const categoryId = parseInt(interaction.values[0]);
    await handleTicketOpen(client, interaction as any, panelId, categoryId);
    return;
  }
}

// ─── Ticket Open ─────────────────────────────────────────────────────────────

async function handleTicketOpen(
  client: WallEClient,
  interaction: ButtonInteraction,
  panelId: number,
  categoryId: number
) {
  // Load panel
  const panelResult = await client.db.pool.query(
    'SELECT * FROM ticket_panels WHERE id = $1 AND guild_id = $2',
    [panelId, interaction.guild!.id]
  );
  if (panelResult.rows.length === 0) {
    await interaction.reply({ content: '❌ Panel not found.', ephemeral: true });
    return;
  }
  const panel = panelResult.rows[0];

  // Load category (if specified)
  let category: any = null;
  if (categoryId > 0) {
    const catResult = await client.db.pool.query(
      'SELECT * FROM ticket_categories WHERE id = $1 AND panel_id = $2',
      [categoryId, panelId]
    );
    category = catResult.rows[0] || null;
  }

  // Load global config
  const configResult = await client.db.pool.query(
    'SELECT * FROM ticket_config WHERE guild_id = $1',
    [interaction.guild!.id]
  );
  const config = configResult.rows[0] || { max_tickets_per_user: 1, welcome_message: '' };

  // Check existing open tickets for this user
  const openTickets = await client.db.pool.query(
    `SELECT id, channel_id FROM tickets WHERE guild_id = $1 AND user_id = $2 AND status IN ('open', 'claimed')`,
    [interaction.guild!.id, interaction.user.id]
  );
  if (openTickets.rows.length >= (config.max_tickets_per_user || 1)) {
    await interaction.reply({
      content: `❌ You already have an open ticket: <#${openTickets.rows[0].channel_id}>`,
      ephemeral: true,
    });
    return;
  }

  // Check if category has form fields
  if (category) {
    const fieldsResult = await client.db.pool.query(
      'SELECT * FROM ticket_form_fields WHERE category_id = $1 ORDER BY position LIMIT 5',
      [categoryId]
    );
    const fields = fieldsResult.rows;

    if (fields.length > 0) {
      // Show modal
      const modal = new ModalBuilder()
        .setCustomId(`ticket_modal:${panelId}:${categoryId}`)
        .setTitle(`${category.emoji || '🎫'} ${category.name}`);

      for (const field of fields) {
        const input = new TextInputBuilder()
          .setCustomId(`field_${field.id}`)
          .setLabel(field.label)
          .setStyle(field.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setRequired(field.required)
          .setMinLength(field.min_length)
          .setMaxLength(field.max_length);
        if (field.placeholder) input.setPlaceholder(field.placeholder);
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
      }

      await interaction.showModal(modal);
      return;
    }
  }

  // No form — create ticket directly
  await createTicketChannel(client, interaction, panel, category, config, null);
}

// ─── Create Ticket Channel ────────────────────────────────────────────────────

export async function createTicketChannel(
  client: WallEClient,
  interaction: ButtonInteraction | any,
  panel: any,
  category: any | null,
  config: any,
  formAnswers: Record<string, string> | null
) {
  await interaction.deferReply({ ephemeral: true });

  // Get next ticket number (per guild)
  const numResult = await client.db.pool.query(
    'SELECT COALESCE(MAX(ticket_number), 0) + 1 as next FROM tickets WHERE guild_id = $1',
    [interaction.guild!.id]
  );
  const ticketNumber = numResult.rows[0].next;

  // Resolve channel name
  const channelName = resolveChannelName(panel.channel_name_template || '{type}-{number}', {
    type: category?.name || 'ticket',
    number: ticketNumber,
    username: interaction.user.username,
    userid: interaction.user.id,
  });

  // Permission overwrites
  const supportRoleIds: string[] = category?.support_role_ids || [];
  const observerRoleIds: string[] = category?.observer_role_ids || [];

  const permissionOverwrites: any[] = [
    { id: interaction.guild!.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    {
      id: interaction.user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    },
    {
      id: client.user!.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ManageMessages,
      ],
    },
  ];

  for (const roleId of supportRoleIds) {
    permissionOverwrites.push({
      id: roleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages,
      ],
    });
  }

  for (const roleId of observerRoleIds) {
    permissionOverwrites.push({
      id: roleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
      deny: [PermissionsBitField.Flags.SendMessages],
    });
  }

  try {
    const channelOptions: any = {
      name: channelName,
      type: ChannelType.GuildText,
      permissionOverwrites,
    };

    // Select category — check overflow if category_open_id is set
    if (panel.category_open_id) {
      const openCat = interaction.guild!.channels.cache.get(panel.category_open_id);
      if (openCat) {
        const channelCount = interaction.guild!.channels.cache.filter(
          (c: any) => c.parentId === panel.category_open_id
        ).size;
        if (channelCount >= 50 && panel.overflow_category_id) {
          channelOptions.parent = panel.overflow_category_id;
        } else {
          channelOptions.parent = panel.category_open_id;
        }
      }
    }

    const ticketChannel = await interaction.guild!.channels.create(channelOptions);

    // Save ticket to DB
    const insertResult = await client.db.pool.query(
      `INSERT INTO tickets (guild_id, panel_id, category_id, channel_id, user_id, ticket_number, topic, last_activity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING id`,
      [
        interaction.guild!.id,
        panel.id,
        category?.id || null,
        ticketChannel.id,
        interaction.user.id,
        ticketNumber,
        formAnswers ? JSON.stringify(formAnswers) : null,
      ]
    );
    const ticketId = insertResult.rows[0].id;

    // Build welcome embed
    const welcomeEmbed = new EmbedBuilder()
      .setColor(COLORS.PRIMARY)
      .setTitle(`🎫 Ticket #${ticketNumber.toString().padStart(4, '0')}${category ? ` — ${category.name}` : ''}`)
      .setDescription(
        `Hello ${interaction.user}!\n\n` +
        (config.welcome_message || 'A staff member will be with you shortly.\nPlease describe your issue in detail.')
      )
      .setTimestamp();

    // Add form answers to embed
    if (formAnswers && Object.keys(formAnswers).length > 0) {
      for (const [label, value] of Object.entries(formAnswers)) {
        welcomeEmbed.addFields({ name: label, value: value || '(no answer)', inline: false });
      }
    }

    const closeBtn = new ButtonBuilder()
      .setCustomId(`ticket_close_confirm:${ticketId}:No reason provided`)
      .setLabel('Close Ticket')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(closeBtn);

    // Ping support roles
    const pings = supportRoleIds.map((id: string) => `<@&${id}>`).join(' ');
    await ticketChannel.send({
      content: `${interaction.user}${pings ? ` | ${pings}` : ''}`,
      embeds: [welcomeEmbed],
      components: [row],
    });

    await interaction.editReply({ content: `✅ Your ticket has been created: ${ticketChannel}` });

    // DM the user
    try {
      await interaction.user.send(
        `🎫 **Ticket Created**\nYour support ticket has been opened: **${ticketChannel.name}** in **${interaction.guild!.name}**`
      );
    } catch {
      // User has DMs disabled — that's fine
    }
  } catch (error) {
    logger.error('Error creating ticket channel:', error);
    await interaction.editReply({ content: '❌ Failed to create ticket. Please contact an administrator.' });
  }
}

// ─── Close Confirm ────────────────────────────────────────────────────────────

async function handleTicketCloseConfirm(
  client: WallEClient,
  interaction: ButtonInteraction,
  ticketId: number,
  reason: string
) {
  const ticket = await client.db.pool.query(
    `SELECT t.*, tp.category_closed_id, tp.channel_name_template,
            tc.transcript_channel_id
     FROM tickets t
     LEFT JOIN ticket_panels tp ON t.panel_id = tp.id
     LEFT JOIN ticket_config tc ON t.guild_id = tc.guild_id
     WHERE t.id = $1 AND t.guild_id = $2 AND t.status IN ('open','claimed')`,
    [ticketId, interaction.guild!.id]
  );

  if (ticket.rows.length === 0) {
    await interaction.update({ content: '❌ Ticket not found or already closed.', components: [] });
    return;
  }

  const t = ticket.rows[0];
  await interaction.update({
    embeds: [new EmbedBuilder()
      .setColor(COLORS.WARNING)
      .setTitle('🔒 Closing Ticket...')
      .setDescription(`Reason: ${reason}`)
    ],
    components: [],
  });

  const channel = interaction.channel as TextChannel;

  // Generate and save transcript
  try {
    const allMessages: any[] = [];
    let lastId: string | undefined;
    while (true) {
      const batch = await channel.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) });
      if (batch.size === 0) break;
      allMessages.push(...batch.values());
      lastId = batch.last()?.id;
      if (batch.size < 100) break;
    }
    allMessages.reverse();

    const transcriptText = buildTranscript(channel.name, t.user_id, t.created_at, allMessages);
    const transcriptBuffer = Buffer.from(transcriptText, 'utf-8');

    let transcriptMsgId: string | null = null;
    if (t.transcript_channel_id) {
      const transcriptChannel = interaction.guild!.channels.cache.get(t.transcript_channel_id) as TextChannel;
      if (transcriptChannel) {
        const transcriptEmbed = new EmbedBuilder()
          .setColor(COLORS.MUTED)
          .setTitle(`📝 Ticket Transcript — ${channel.name}`)
          .addFields(
            { name: 'User', value: `<@${t.user_id}>`, inline: true },
            { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Reason', value: reason, inline: false },
          )
          .setTimestamp();

        const msg = await transcriptChannel.send({
          embeds: [transcriptEmbed],
          files: [{ attachment: transcriptBuffer, name: `transcript-${channel.name}.txt` }],
        });
        transcriptMsgId = msg.id;
      }
    }

    // Update DB
    await client.db.pool.query(
      `UPDATE tickets SET status = 'closed', closed_by = $2, closed_at = NOW(),
       close_reason = $3, transcript_message_id = $4 WHERE id = $1`,
      [ticketId, interaction.user.id, reason, transcriptMsgId]
    );

    // DM user
    try {
      const ticketUser = await client.users.fetch(t.user_id);
      await ticketUser.send(
        `🔒 **Ticket Closed**\nYour ticket **${channel.name}** in **${interaction.guild!.name}** has been closed.\n**Reason:** ${reason}`
      );
    } catch {
      // User has DMs disabled
    }

    // Move to closed category or delete
    if (t.category_closed_id) {
      await channel.setParent(t.category_closed_id, { lockPermissions: false });
      await channel.setName(`closed-${channel.name}`);
    } else {
      setTimeout(async () => {
        try { await channel.delete(); } catch { /* already deleted */ }
      }, 5000);
    }
  } catch (error) {
    logger.error('Error closing ticket:', error);
  }
}

// ─── Reaction Role Handlers (unchanged) ──────────────────────────────────────

async function handleReactionRoleButton(client: WallEClient, interaction: ButtonInteraction) {
  const roleId = interaction.customId.replace('rr_', '');
  try {
    const member = await interaction.guild!.members.fetch(interaction.user.id);
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId);
      await interaction.reply({ content: `✅ Removed <@&${roleId}>`, ephemeral: true });
    } else {
      await member.roles.add(roleId);
      await interaction.reply({ content: `✅ Added <@&${roleId}>`, ephemeral: true });
    }
  } catch (error) {
    logger.error('Error handling reaction role button:', error);
    await interaction.reply({ content: '❌ Failed to update your roles.', ephemeral: true });
  }
}

async function handleReactionRoleSelect(client: WallEClient, interaction: StringSelectMenuInteraction) {
  try {
    const member = await interaction.guild!.members.fetch(interaction.user.id);
    const selectedRoles = interaction.values;
    const allRoles = await client.db.pool.query(
      'SELECT role_id FROM reaction_roles WHERE message_id = $1',
      [interaction.message.id]
    );
    const allRoleIds = allRoles.rows.map((r: any) => r.role_id);
    for (const roleId of allRoleIds) {
      if (!selectedRoles.includes(roleId) && member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId);
      }
    }
    for (const roleId of selectedRoles) {
      if (!member.roles.cache.has(roleId)) await member.roles.add(roleId);
    }
    await interaction.reply({ content: `✅ Your roles have been updated!`, ephemeral: true });
  } catch (error) {
    logger.error('Error handling reaction role select:', error);
    await interaction.reply({ content: '❌ Failed to update your roles.', ephemeral: true });
  }
}

// ─── Legacy Handlers (single-panel old config) ───────────────────────────────

async function handleLegacyTicketCreate(client: WallEClient, interaction: ButtonInteraction) {
  const config = await client.db.pool.query(
    'SELECT * FROM ticket_config WHERE guild_id = $1',
    [interaction.guild!.id]
  );
  if (config.rows.length === 0) {
    await interaction.reply({ content: '❌ Ticket system is not configured.', ephemeral: true });
    return;
  }
  // Redirect to new flow with no panel — will use defaults
  await interaction.reply({ content: '❌ This panel is outdated. Please ask an admin to re-create it with `/ticket panel send`.', ephemeral: true });
}

async function handleLegacyTicketClose(client: WallEClient, interaction: ButtonInteraction) {
  const ticket = await client.db.pool.query(
    `SELECT * FROM tickets WHERE guild_id = $1 AND channel_id = $2 AND status = 'open'`,
    [interaction.guild!.id, interaction.channel!.id]
  );
  if (ticket.rows.length === 0) {
    await interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });
    return;
  }
  // Redirect to new two-step confirm
  const confirmBtn = new ButtonBuilder()
    .setCustomId(`ticket_close_confirm:${ticket.rows[0].id}:No reason provided`)
    .setLabel('Confirm Close')
    .setEmoji('🔒')
    .setStyle(ButtonStyle.Danger);
  const cancelBtn = new ButtonBuilder()
    .setCustomId('ticket_close_cancel')
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Secondary);
  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(COLORS.WARNING)
      .setTitle('🔒 Close Ticket?')
      .setDescription('Click confirm to close this ticket.')
    ],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(confirmBtn, cancelBtn)],
  });
}
```

### Step 2: Commit

```bash
git add bot/src/events/buttonInteraction.ts
git commit -m "feat: rewrite button/select handler for multi-panel tickets with two-step close"
```

---

## Task 6: Bot — Handle Modal Submissions

**Files:**
- Modify: `bot/src/events/interactionCreate.ts`

The modal submit for ticket forms (`ticket_modal:<panelId>:<categoryId>`) needs to be handled in the interactionCreate event.

Open `bot/src/events/interactionCreate.ts` and add modal handling. Find the end of the execute function (around line where it handles slash commands) and add:

```typescript
// Add to the top of the file imports:
// import { createTicketChannel } from './buttonInteraction.js';

// In the execute function, before or after slash command handling, add:
if (interaction.isModalSubmit()) {
  const customId = interaction.customId;
  if (customId.startsWith('ticket_modal:')) {
    const [, panelId, categoryId] = customId.split(':');

    // Gather form answers
    const formAnswers: Record<string, string> = {};
    for (const row of interaction.components) {
      for (const component of row.components) {
        formAnswers[component.customId] = (component as any).value;
      }
    }

    const panelResult = await client.db.pool.query(
      'SELECT * FROM ticket_panels WHERE id = $1 AND guild_id = $2',
      [parseInt(panelId), interaction.guild!.id]
    );
    if (panelResult.rows.length === 0) {
      await interaction.reply({ content: '❌ Panel not found.', ephemeral: true });
      return;
    }

    const catResult = await client.db.pool.query(
      'SELECT * FROM ticket_categories WHERE id = $1',
      [parseInt(categoryId)]
    );

    const configResult = await client.db.pool.query(
      'SELECT * FROM ticket_config WHERE guild_id = $1',
      [interaction.guild!.id]
    );

    // Resolve field labels from DB
    const fieldsResult = await client.db.pool.query(
      'SELECT * FROM ticket_form_fields WHERE category_id = $1 ORDER BY position',
      [parseInt(categoryId)]
    );
    const labeledAnswers: Record<string, string> = {};
    for (const field of fieldsResult.rows) {
      const val = formAnswers[`field_${field.id}`];
      if (val !== undefined) labeledAnswers[field.label] = val;
    }

    const { createTicketChannel } = await import('./buttonInteraction.js');
    await createTicketChannel(
      client,
      interaction as any,
      panelResult.rows[0],
      catResult.rows[0] || null,
      configResult.rows[0] || { max_tickets_per_user: 1, welcome_message: '' },
      labeledAnswers
    );
  }
}
```

Read `bot/src/events/interactionCreate.ts` first to find the exact insertion point and make a targeted edit.

### Step 2: Commit

```bash
git add bot/src/events/interactionCreate.ts
git commit -m "feat: handle ticket modal submissions in interactionCreate"
```

---

## Task 7: Bot — Auto-Close in SchedulerService

**Files:**
- Modify: `bot/src/services/SchedulerService.ts`

Add a new method `checkAutoClose()` called from `start()` on its own interval (every 60 minutes).

Add after the `checkScheduledTasks` call in `start()`:

```typescript
// Check for inactive tickets every hour
setInterval(() => { this.checkAutoClose(); }, 60 * 60 * 1000);
this.checkAutoClose(); // run on start too
```

Add the new method to the class:

```typescript
private async checkAutoClose() {
  try {
    // Get global config for all guilds with auto-close enabled
    const configs = await this.client.db.pool.query(
      `SELECT guild_id, auto_close_hours FROM ticket_config
       WHERE auto_close_hours > 0`
    );

    for (const config of configs.rows) {
      const { guild_id, auto_close_hours } = config;

      // Find tickets inactive for longer than auto_close_hours
      const staleTickets = await this.client.db.pool.query(
        `SELECT t.id, t.channel_id, t.user_id, t.warned_inactive
         FROM tickets t
         WHERE t.guild_id = $1
           AND t.status IN ('open', 'claimed')
           AND t.last_activity < NOW() - INTERVAL '1 hour' * $2`,
        [guild_id, auto_close_hours]
      );

      const guild = this.client.guilds.cache.get(guild_id);
      if (!guild) continue;

      for (const ticket of staleTickets.rows) {
        const channel = guild.channels.cache.get(ticket.channel_id) as TextChannel | undefined;
        if (!channel) continue;

        if (ticket.warned_inactive) {
          // Already warned — close it now
          await channel.send({
            embeds: [new EmbedBuilder()
              .setColor(COLORS.ERROR)
              .setTitle('🔒 Ticket Auto-Closed')
              .setDescription('This ticket has been automatically closed due to inactivity.')
            ],
          });

          await this.client.db.pool.query(
            `UPDATE tickets SET status = 'closed', closed_by = $2, closed_at = NOW(),
             close_reason = 'Auto-closed due to inactivity' WHERE id = $1`,
            [ticket.id, this.client.user!.id]
          );

          // Try to move to closed category
          const panelData = await this.client.db.pool.query(
            `SELECT tp.category_closed_id FROM tickets t
             JOIN ticket_panels tp ON t.panel_id = tp.id
             WHERE t.id = $1`,
            [ticket.id]
          );
          if (panelData.rows[0]?.category_closed_id) {
            try {
              await channel.setParent(panelData.rows[0].category_closed_id, { lockPermissions: false });
              await channel.setName(`closed-${channel.name}`);
            } catch { /* Ignore if already closed */ }
          } else {
            setTimeout(async () => {
              try { await channel.delete(); } catch { /* already deleted */ }
            }, 5000);
          }
        } else {
          // First warning
          await channel.send({
            embeds: [new EmbedBuilder()
              .setColor(COLORS.WARNING)
              .setTitle('⚠️ Inactivity Warning')
              .setDescription(
                `This ticket will be automatically closed in **1 hour** due to inactivity.\n` +
                `Send a message to keep it open.`
              )
            ],
          });
          await this.client.db.pool.query(
            'UPDATE tickets SET warned_inactive = TRUE WHERE id = $1',
            [ticket.id]
          );
        }
      }
    }
  } catch (error) {
    logger.error('Error in auto-close check:', error);
  }
}
```

Also add `last_activity` update whenever a message is sent in a ticket channel. In `bot/src/events/messageCreate.ts`, add a DB update if the message is in a ticket channel:

```typescript
// At end of messageCreate handler, after existing logic:
// Update ticket last_activity if message is in a ticket channel
if (message.guild) {
  // Fire-and-forget — don't await to avoid slowing message handling
  client.db.pool.query(
    `UPDATE tickets SET last_activity = NOW(), warned_inactive = FALSE
     WHERE channel_id = $1 AND guild_id = $2 AND status IN ('open','claimed')`,
    [message.channel.id, message.guild.id]
  ).catch(() => {}); // ignore errors
}
```

### Step 2: Commit

```bash
git add bot/src/services/SchedulerService.ts bot/src/events/messageCreate.ts
git commit -m "feat: add auto-close for inactive tickets"
```

---

## Task 8: Backend API Routes

**Files:**
- Modify: `dashboard/backend/src/routes/guilds.ts`

Add ticket routes at the end of `guilds.ts`, before the final closing of the file. These follow the same pattern as existing routes (asyncHandler, requireAuth, requireGuildAccess).

```typescript
// ============================================================================
// Ticket System Endpoints
// ============================================================================

// GET /guilds/:guildId/ticket-config
guildsRouter.get('/:guildId/ticket-config', requireAuth, requireGuildAccess, asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const result = await db.query('SELECT * FROM ticket_config WHERE guild_id = $1', [guildId]);
  res.json(result.rows[0] || {
    guild_id: guildId, transcript_channel_id: null,
    max_tickets_per_user: 1, auto_close_hours: 0,
    welcome_message: 'Welcome! Please describe your issue and a staff member will assist you shortly.',
  });
}));

// PUT /guilds/:guildId/ticket-config
guildsRouter.put('/:guildId/ticket-config', requireAuth, requireGuildAccess,
  rateLimitByGuild({ max: 10, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    const { guildId } = req.params;
    const { transcript_channel_id, max_tickets_per_user, auto_close_hours, welcome_message } = req.body;
    await db.query(
      `INSERT INTO ticket_config (guild_id, transcript_channel_id, max_tickets_per_user, auto_close_hours, welcome_message)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (guild_id) DO UPDATE SET
         transcript_channel_id=$2, max_tickets_per_user=$3,
         auto_close_hours=$4, welcome_message=$5, updated_at=NOW()`,
      [guildId, transcript_channel_id||null, max_tickets_per_user||1, auto_close_hours||0, welcome_message||'']
    );
    res.json({ success: true });
  })
);

// GET /guilds/:guildId/ticket-panels
guildsRouter.get('/:guildId/ticket-panels', requireAuth, requireGuildAccess, asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const panels = await db.query('SELECT * FROM ticket_panels WHERE guild_id = $1 ORDER BY id', [guildId]);
  // Attach categories to each panel
  const result = [];
  for (const panel of panels.rows) {
    const cats = await db.query(
      'SELECT * FROM ticket_categories WHERE panel_id = $1 ORDER BY position',
      [panel.id]
    );
    result.push({ ...panel, categories: cats.rows });
  }
  res.json(result);
}));

// POST /guilds/:guildId/ticket-panels
guildsRouter.post('/:guildId/ticket-panels', requireAuth, requireGuildAccess,
  rateLimitByGuild({ max: 10, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    const { guildId } = req.params;
    const { name, style = 'channel', panel_type = 'buttons', category_open_id, category_closed_id,
            overflow_category_id, channel_name_template = '{type}-{number}' } = req.body;
    if (!name) { res.status(400).json({ error: 'name is required' }); return; }
    const r = await db.query(
      `INSERT INTO ticket_panels (guild_id,name,style,panel_type,category_open_id,category_closed_id,overflow_category_id,channel_name_template)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [guildId, name, style, panel_type, category_open_id||null, category_closed_id||null, overflow_category_id||null, channel_name_template]
    );
    res.json(r.rows[0]);
  })
);

// GET /guilds/:guildId/ticket-panels/:panelId
guildsRouter.get('/:guildId/ticket-panels/:panelId', requireAuth, requireGuildAccess, asyncHandler(async (req, res) => {
  const { guildId, panelId } = req.params;
  const panel = await db.query('SELECT * FROM ticket_panels WHERE id=$1 AND guild_id=$2', [panelId, guildId]);
  if (!panel.rows[0]) { res.status(404).json({ error: 'Panel not found' }); return; }
  const cats = await db.query('SELECT * FROM ticket_categories WHERE panel_id=$1 ORDER BY position', [panelId]);
  const categoriesWithFields = [];
  for (const cat of cats.rows) {
    const fields = await db.query('SELECT * FROM ticket_form_fields WHERE category_id=$1 ORDER BY position', [cat.id]);
    categoriesWithFields.push({ ...cat, form_fields: fields.rows });
  }
  res.json({ ...panel.rows[0], categories: categoriesWithFields });
}));

// PUT /guilds/:guildId/ticket-panels/:panelId
guildsRouter.put('/:guildId/ticket-panels/:panelId', requireAuth, requireGuildAccess,
  rateLimitByGuild({ max: 20, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    const { guildId, panelId } = req.params;
    const { name, style, panel_type, category_open_id, category_closed_id, overflow_category_id, channel_name_template } = req.body;
    const r = await db.query(
      `UPDATE ticket_panels SET
         name=COALESCE($3,name), style=COALESCE($4,style), panel_type=COALESCE($5,panel_type),
         category_open_id=$6, category_closed_id=$7, overflow_category_id=$8,
         channel_name_template=COALESCE($9,channel_name_template)
       WHERE id=$1 AND guild_id=$2 RETURNING *`,
      [panelId, guildId, name, style, panel_type, category_open_id||null, category_closed_id||null, overflow_category_id||null, channel_name_template]
    );
    if (!r.rows[0]) { res.status(404).json({ error: 'Panel not found' }); return; }
    res.json(r.rows[0]);
  })
);

// DELETE /guilds/:guildId/ticket-panels/:panelId
guildsRouter.delete('/:guildId/ticket-panels/:panelId', requireAuth, requireGuildAccess, asyncHandler(async (req, res) => {
  const { guildId, panelId } = req.params;
  const r = await db.query('DELETE FROM ticket_panels WHERE id=$1 AND guild_id=$2 RETURNING id', [panelId, guildId]);
  if (!r.rows[0]) { res.status(404).json({ error: 'Panel not found' }); return; }
  res.json({ success: true });
}));

// POST /guilds/:guildId/ticket-panels/:panelId/categories
guildsRouter.post('/:guildId/ticket-panels/:panelId/categories', requireAuth, requireGuildAccess,
  rateLimitByGuild({ max: 20, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    const { guildId, panelId } = req.params;
    const { name, emoji, description, support_role_ids = [], observer_role_ids = [] } = req.body;
    if (!name) { res.status(400).json({ error: 'name is required' }); return; }
    const posResult = await db.query(
      'SELECT COALESCE(MAX(position),-1)+1 as next FROM ticket_categories WHERE panel_id=$1',
      [panelId]
    );
    const r = await db.query(
      `INSERT INTO ticket_categories (panel_id,guild_id,name,emoji,description,support_role_ids,observer_role_ids,position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [panelId, guildId, name, emoji||null, description||null, support_role_ids, observer_role_ids, posResult.rows[0].next]
    );
    res.json(r.rows[0]);
  })
);

// PUT /guilds/:guildId/ticket-categories/:categoryId
guildsRouter.put('/:guildId/ticket-categories/:categoryId', requireAuth, requireGuildAccess,
  rateLimitByGuild({ max: 20, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    const { guildId, categoryId } = req.params;
    const { name, emoji, description, support_role_ids, observer_role_ids, position } = req.body;
    const r = await db.query(
      `UPDATE ticket_categories SET
         name=COALESCE($3,name), emoji=$4, description=$5,
         support_role_ids=COALESCE($6,support_role_ids),
         observer_role_ids=COALESCE($7,observer_role_ids),
         position=COALESCE($8,position)
       WHERE id=$1 AND guild_id=$2 RETURNING *`,
      [categoryId, guildId, name, emoji||null, description||null, support_role_ids, observer_role_ids, position]
    );
    if (!r.rows[0]) { res.status(404).json({ error: 'Category not found' }); return; }
    res.json(r.rows[0]);
  })
);

// DELETE /guilds/:guildId/ticket-categories/:categoryId
guildsRouter.delete('/:guildId/ticket-categories/:categoryId', requireAuth, requireGuildAccess, asyncHandler(async (req, res) => {
  const { guildId, categoryId } = req.params;
  const r = await db.query('DELETE FROM ticket_categories WHERE id=$1 AND guild_id=$2 RETURNING id', [categoryId, guildId]);
  if (!r.rows[0]) { res.status(404).json({ error: 'Category not found' }); return; }
  res.json({ success: true });
}));

// GET /guilds/:guildId/ticket-categories/:categoryId/form-fields
guildsRouter.get('/:guildId/ticket-categories/:categoryId/form-fields', requireAuth, requireGuildAccess,
  asyncHandler(async (req, res) => {
    const { categoryId } = req.params;
    const r = await db.query('SELECT * FROM ticket_form_fields WHERE category_id=$1 ORDER BY position', [categoryId]);
    res.json(r.rows);
  })
);

// POST /guilds/:guildId/ticket-categories/:categoryId/form-fields
guildsRouter.post('/:guildId/ticket-categories/:categoryId/form-fields', requireAuth, requireGuildAccess,
  rateLimitByGuild({ max: 20, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    const { categoryId } = req.params;
    // Check count limit
    const countResult = await db.query('SELECT COUNT(*) FROM ticket_form_fields WHERE category_id=$1', [categoryId]);
    if (parseInt(countResult.rows[0].count) >= 5) {
      res.status(400).json({ error: 'Maximum 5 form fields per category (Discord modal limit)' });
      return;
    }
    const { label, placeholder, min_length = 0, max_length = 1024, style = 'short', required = true } = req.body;
    if (!label) { res.status(400).json({ error: 'label is required' }); return; }
    const posResult = await db.query(
      'SELECT COALESCE(MAX(position),-1)+1 as next FROM ticket_form_fields WHERE category_id=$1',
      [categoryId]
    );
    const r = await db.query(
      `INSERT INTO ticket_form_fields (category_id,label,placeholder,min_length,max_length,style,required,position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [categoryId, label, placeholder||null, min_length, max_length, style, required, posResult.rows[0].next]
    );
    res.json(r.rows[0]);
  })
);

// PUT /guilds/:guildId/ticket-form-fields/:fieldId
guildsRouter.put('/:guildId/ticket-form-fields/:fieldId', requireAuth, requireGuildAccess,
  rateLimitByGuild({ max: 20, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    const { fieldId } = req.params;
    const { label, placeholder, min_length, max_length, style, required, position } = req.body;
    const r = await db.query(
      `UPDATE ticket_form_fields SET
         label=COALESCE($2,label), placeholder=$3,
         min_length=COALESCE($4,min_length), max_length=COALESCE($5,max_length),
         style=COALESCE($6,style), required=COALESCE($7,required), position=COALESCE($8,position)
       WHERE id=$1 RETURNING *`,
      [fieldId, label, placeholder||null, min_length, max_length, style, required, position]
    );
    if (!r.rows[0]) { res.status(404).json({ error: 'Field not found' }); return; }
    res.json(r.rows[0]);
  })
);

// DELETE /guilds/:guildId/ticket-form-fields/:fieldId
guildsRouter.delete('/:guildId/ticket-form-fields/:fieldId', requireAuth, requireGuildAccess, asyncHandler(async (req, res) => {
  const { fieldId } = req.params;
  const r = await db.query('DELETE FROM ticket_form_fields WHERE id=$1 RETURNING id', [fieldId]);
  if (!r.rows[0]) { res.status(404).json({ error: 'Field not found' }); return; }
  res.json({ success: true });
}));

// GET /guilds/:guildId/tickets
guildsRouter.get('/:guildId/tickets', requireAuth, requireGuildAccess, asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const status = req.query.status as string || 'open,claimed';
  const statuses = status.split(',').filter(s => ['open','claimed','closed'].includes(s));
  const panelId = req.query.panel_id;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

  let query = `SELECT t.*, tc.name as category_name, tp.name as panel_name
               FROM tickets t
               LEFT JOIN ticket_categories tc ON t.category_id = tc.id
               LEFT JOIN ticket_panels tp ON t.panel_id = tp.id
               WHERE t.guild_id = $1 AND t.status = ANY($2::text[])`;
  const params: any[] = [guildId, statuses];

  if (panelId) {
    query += ` AND t.panel_id = $${params.length + 1}`;
    params.push(panelId);
  }

  query += ` ORDER BY t.created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const r = await db.query(query, params);
  res.json(r.rows);
}));
```

### Step 2: Commit

```bash
git add dashboard/backend/src/routes/guilds.ts
git commit -m "feat: add ticket system REST API endpoints"
```

---

## Task 9: Frontend — TicketsPage Rewrite

**Files:**
- Modify: `dashboard/frontend/src/pages/guild/TicketsPage.tsx`
- Modify: `dashboard/frontend/src/services/api.ts`

### Step 1: Add API functions to api.ts

Append to `dashboard/frontend/src/services/api.ts`:

```typescript
// ─── Ticket System API ────────────────────────────────────────────────────────

export const ticketApi = {
  getConfig: (guildId: string) =>
    api.get(`/api/guilds/${guildId}/ticket-config`).then(r => r.data),

  updateConfig: (guildId: string, data: any) =>
    api.put(`/api/guilds/${guildId}/ticket-config`, data).then(r => r.data),

  getPanels: (guildId: string) =>
    api.get(`/api/guilds/${guildId}/ticket-panels`).then(r => r.data),

  createPanel: (guildId: string, data: any) =>
    api.post(`/api/guilds/${guildId}/ticket-panels`, data).then(r => r.data),

  updatePanel: (guildId: string, panelId: number, data: any) =>
    api.put(`/api/guilds/${guildId}/ticket-panels/${panelId}`, data).then(r => r.data),

  deletePanel: (guildId: string, panelId: number) =>
    api.delete(`/api/guilds/${guildId}/ticket-panels/${panelId}`).then(r => r.data),

  createCategory: (guildId: string, panelId: number, data: any) =>
    api.post(`/api/guilds/${guildId}/ticket-panels/${panelId}/categories`, data).then(r => r.data),

  updateCategory: (guildId: string, categoryId: number, data: any) =>
    api.put(`/api/guilds/${guildId}/ticket-categories/${categoryId}`, data).then(r => r.data),

  deleteCategory: (guildId: string, categoryId: number) =>
    api.delete(`/api/guilds/${guildId}/ticket-categories/${categoryId}`).then(r => r.data),

  getFormFields: (guildId: string, categoryId: number) =>
    api.get(`/api/guilds/${guildId}/ticket-categories/${categoryId}/form-fields`).then(r => r.data),

  createFormField: (guildId: string, categoryId: number, data: any) =>
    api.post(`/api/guilds/${guildId}/ticket-categories/${categoryId}/form-fields`, data).then(r => r.data),

  updateFormField: (guildId: string, fieldId: number, data: any) =>
    api.put(`/api/guilds/${guildId}/ticket-form-fields/${fieldId}`, data).then(r => r.data),

  deleteFormField: (guildId: string, fieldId: number) =>
    api.delete(`/api/guilds/${guildId}/ticket-form-fields/${fieldId}`).then(r => r.data),

  getTickets: (guildId: string, params?: { status?: string; panel_id?: number }) =>
    api.get(`/api/guilds/${guildId}/tickets`, { params }).then(r => r.data),
};
```

### Step 2: Rewrite TicketsPage.tsx

Replace the entire file content:

```tsx
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Ticket, Save, Plus, Trash2, Hash, Users, Clock,
  Archive, Settings, ChevronDown, ChevronRight, FileText, Loader2
} from 'lucide-react';
import { ticketApi } from '../../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormField {
  id?: number;
  label: string;
  placeholder: string;
  style: 'short' | 'paragraph';
  required: boolean;
  min_length: number;
  max_length: number;
  position: number;
}

interface Category {
  id?: number;
  panel_id?: number;
  name: string;
  emoji: string;
  description: string;
  support_role_ids: string[];
  observer_role_ids: string[];
  position: number;
  form_fields?: FormField[];
  _expanded?: boolean;
}

interface Panel {
  id?: number;
  name: string;
  style: 'channel' | 'thread';
  panel_type: 'buttons' | 'dropdown';
  category_open_id: string;
  category_closed_id: string;
  overflow_category_id: string;
  channel_name_template: string;
  categories?: Category[];
  _expanded?: boolean;
}

interface TicketConfig {
  transcript_channel_id: string;
  max_tickets_per_user: number;
  auto_close_hours: number;
  welcome_message: string;
}

interface ActiveTicket {
  id: number;
  channel_id: string;
  user_id: string;
  ticket_number: number;
  category_name?: string;
  panel_name?: string;
  status: 'open' | 'claimed' | 'closed';
  claimed_by?: string;
  created_at: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

type Tab = 'panels' | 'settings' | 'tickets';

export default function TicketsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('panels');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [panels, setPanels] = useState<Panel[]>([]);
  const [config, setConfig] = useState<TicketConfig>({
    transcript_channel_id: '',
    max_tickets_per_user: 1,
    auto_close_hours: 0,
    welcome_message: 'Welcome! Please describe your issue and a staff member will assist you shortly.',
  });
  const [activeTickets, setActiveTickets] = useState<ActiveTicket[]>([]);

  const [showNewPanel, setShowNewPanel] = useState(false);
  const [newPanelName, setNewPanelName] = useState('');

  const fetchData = useCallback(async () => {
    if (!guildId) return;
    setLoading(true);
    setError(null);
    try {
      const [panelsData, configData, ticketsData] = await Promise.all([
        ticketApi.getPanels(guildId),
        ticketApi.getConfig(guildId),
        ticketApi.getTickets(guildId, { status: 'open,claimed' }),
      ]);
      setPanels(panelsData);
      setConfig(configData);
      setActiveTickets(ticketsData);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to load ticket data');
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const saveConfig = async () => {
    if (!guildId) return;
    setSaving(true);
    try {
      await ticketApi.updateConfig(guildId, config);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to save config');
    } finally {
      setSaving(false);
    }
  };

  const createPanel = async () => {
    if (!guildId || !newPanelName.trim()) return;
    try {
      const panel = await ticketApi.createPanel(guildId, { name: newPanelName });
      setPanels(prev => [...prev, { ...panel, categories: [] }]);
      setNewPanelName('');
      setShowNewPanel(false);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to create panel');
    }
  };

  const deletePanel = async (panelId: number) => {
    if (!guildId) return;
    if (!confirm('Delete this panel? This cannot be undone.')) return;
    try {
      await ticketApi.deletePanel(guildId, panelId);
      setPanels(prev => prev.filter(p => p.id !== panelId));
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to delete panel');
    }
  };

  const togglePanel = (panelId: number) => {
    setPanels(prev => prev.map(p => p.id === panelId ? { ...p, _expanded: !p._expanded } : p));
  };

  const addCategory = async (panelId: number) => {
    if (!guildId) return;
    const name = prompt('Category name:');
    if (!name?.trim()) return;
    try {
      const cat = await ticketApi.createCategory(guildId, panelId, { name, emoji: '🎫', description: '' });
      setPanels(prev => prev.map(p => p.id === panelId
        ? { ...p, categories: [...(p.categories || []), { ...cat, form_fields: [] }] }
        : p
      ));
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to add category');
    }
  };

  const deleteCategory = async (guildId_: string, categoryId: number, panelId: number) => {
    if (!confirm('Delete this category?')) return;
    try {
      await ticketApi.deleteCategory(guildId_, categoryId);
      setPanels(prev => prev.map(p => p.id === panelId
        ? { ...p, categories: (p.categories || []).filter(c => c.id !== categoryId) }
        : p
      ));
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to delete category');
    }
  };

  const addFormField = async (categoryId: number, panelId: number) => {
    if (!guildId) return;
    const label = prompt('Field label (e.g. "What is your issue?"):');
    if (!label?.trim()) return;
    try {
      const field = await ticketApi.createFormField(guildId, categoryId, {
        label, placeholder: '', style: 'short', required: true, min_length: 0, max_length: 1024,
      });
      setPanels(prev => prev.map(p => p.id === panelId ? {
        ...p,
        categories: (p.categories || []).map(c => c.id === categoryId
          ? { ...c, form_fields: [...(c.form_fields || []), field] }
          : c
        ),
      } : p));
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to add field');
    }
  };

  const deleteFormField = async (fieldId: number, categoryId: number, panelId: number) => {
    if (!guildId) return;
    try {
      await ticketApi.deleteFormField(guildId, fieldId);
      setPanels(prev => prev.map(p => p.id === panelId ? {
        ...p,
        categories: (p.categories || []).map(c => c.id === categoryId
          ? { ...c, form_fields: (c.form_fields || []).filter(f => f.id !== fieldId) }
          : c
        ),
      } : p));
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to delete field');
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      open: 'bg-green-500/20 text-green-400',
      claimed: 'bg-yellow-500/20 text-yellow-400',
      closed: 'bg-gray-500/20 text-gray-400',
    };
    return styles[status] || 'bg-gray-500/20 text-gray-400';
  };

  const formatTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-discord-blurple" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Ticket className="w-8 h-8 text-green-400" />
          <div>
            <h1 className="text-2xl font-bold">Tickets</h1>
            <p className="text-discord-light">Multi-panel ticket system</p>
          </div>
        </div>
        {activeTab === 'settings' && (
          <button onClick={saveConfig} disabled={saving} className="btn btn-primary flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Settings
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-discord-dark pb-0">
        {(['panels', 'settings', 'tickets'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-discord-blurple text-white'
                : 'border-transparent text-discord-light hover:text-white'
            }`}
          >
            {tab === 'tickets' ? `Active Tickets (${activeTickets.length})` : tab}
          </button>
        ))}
      </div>

      {/* ── PANELS TAB ── */}
      {activeTab === 'panels' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-discord-light">
              Each panel is a separate message sent to a channel. Users click it to open tickets.
            </p>
            <button onClick={() => setShowNewPanel(true)} className="btn btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> New Panel
            </button>
          </div>

          {showNewPanel && (
            <div className="card flex gap-3 items-center">
              <input
                value={newPanelName}
                onChange={e => setNewPanelName(e.target.value)}
                className="input flex-1"
                placeholder="Panel name (e.g. Support, Appeals, Partnerships)"
                onKeyDown={e => e.key === 'Enter' && createPanel()}
                autoFocus
              />
              <button onClick={createPanel} className="btn btn-primary">Create</button>
              <button onClick={() => setShowNewPanel(false)} className="btn btn-secondary">Cancel</button>
            </div>
          )}

          {panels.length === 0 && !showNewPanel && (
            <div className="card text-center py-12 text-discord-light">
              <Ticket className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No panels yet. Create your first panel to get started.</p>
            </div>
          )}

          {panels.map(panel => (
            <div key={panel.id} className="card">
              {/* Panel header */}
              <div className="flex items-center gap-3">
                <button onClick={() => panel.id && togglePanel(panel.id)} className="flex items-center gap-2 flex-1 text-left">
                  {panel._expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <span className="font-semibold">{panel.name}</span>
                  <span className="text-xs text-discord-light bg-discord-dark px-2 py-0.5 rounded">
                    {panel.style} / {panel.panel_type}
                  </span>
                  <span className="text-xs text-discord-light">
                    {panel.categories?.length || 0} categories
                  </span>
                </button>
                <button
                  onClick={() => panel.id && deletePanel(panel.id)}
                  className="p-2 text-discord-light hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Expanded panel editor */}
              {panel._expanded && (
                <div className="mt-4 space-y-4 border-t border-discord-dark pt-4">
                  {/* Panel settings */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <label className="block font-medium mb-1">Style</label>
                      <select
                        value={panel.style}
                        onChange={async e => {
                          if (!guildId || !panel.id) return;
                          const updated = await ticketApi.updatePanel(guildId, panel.id, { style: e.target.value });
                          setPanels(prev => prev.map(p => p.id === panel.id ? { ...p, ...updated } : p));
                        }}
                        className="input w-full"
                      >
                        <option value="channel">Channel tickets</option>
                        <option value="thread">Thread tickets</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Panel Type</label>
                      <select
                        value={panel.panel_type}
                        onChange={async e => {
                          if (!guildId || !panel.id) return;
                          const updated = await ticketApi.updatePanel(guildId, panel.id, { panel_type: e.target.value });
                          setPanels(prev => prev.map(p => p.id === panel.id ? { ...p, ...updated } : p));
                        }}
                        className="input w-full"
                      >
                        <option value="buttons">Buttons</option>
                        <option value="dropdown">Dropdown</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Channel Name Template</label>
                      <input
                        defaultValue={panel.channel_name_template}
                        onBlur={async e => {
                          if (!guildId || !panel.id) return;
                          await ticketApi.updatePanel(guildId, panel.id, { channel_name_template: e.target.value });
                        }}
                        className="input w-full"
                        placeholder="{type}-{number}"
                      />
                      <p className="text-xs text-discord-light mt-1">
                        Variables: {'{type}'} {'{number}'} {'{username}'} {'{userid}'}
                      </p>
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Open Category ID</label>
                      <input
                        defaultValue={panel.category_open_id}
                        onBlur={async e => {
                          if (!guildId || !panel.id) return;
                          await ticketApi.updatePanel(guildId, panel.id, { category_open_id: e.target.value || null });
                        }}
                        className="input w-full"
                        placeholder="Discord category ID"
                      />
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Closed Category ID</label>
                      <input
                        defaultValue={panel.category_closed_id}
                        onBlur={async e => {
                          if (!guildId || !panel.id) return;
                          await ticketApi.updatePanel(guildId, panel.id, { category_closed_id: e.target.value || null });
                        }}
                        className="input w-full"
                        placeholder="Discord category ID (for archived tickets)"
                      />
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Overflow Category ID</label>
                      <input
                        defaultValue={panel.overflow_category_id}
                        onBlur={async e => {
                          if (!guildId || !panel.id) return;
                          await ticketApi.updatePanel(guildId, panel.id, { overflow_category_id: e.target.value || null });
                        }}
                        className="input w-full"
                        placeholder="Used when open category hits 50 channels"
                      />
                    </div>
                  </div>

                  {/* Categories */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-sm">
                        Categories ({panel.categories?.length || 0}/5)
                      </h4>
                      <button
                        onClick={() => panel.id && addCategory(panel.id)}
                        className="btn btn-secondary text-xs flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Add Category
                      </button>
                    </div>

                    <div className="space-y-2">
                      {(panel.categories || []).map(cat => (
                        <div key={cat.id} className="bg-discord-dark rounded-lg">
                          {/* Category row */}
                          <div className="flex items-center gap-3 p-3">
                            <span className="text-xl">{cat.emoji || '🎫'}</span>
                            <div className="flex-1">
                              <p className="font-medium text-sm">{cat.name}</p>
                              <p className="text-xs text-discord-light">{cat.description || '(no description)'}</p>
                            </div>
                            <span className="text-xs text-discord-light flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              {cat.form_fields?.length || 0} fields
                            </span>
                            <button
                              onClick={() => {
                                if (!cat.id) return;
                                setPanels(prev => prev.map(p => p.id === panel.id ? {
                                  ...p,
                                  categories: (p.categories || []).map(c =>
                                    c.id === cat.id ? { ...c, _expanded: !c._expanded } : c
                                  ),
                                } : p));
                              }}
                              className="text-xs text-discord-light hover:text-white transition-colors px-2 py-1 rounded"
                            >
                              {(cat as any)._expanded ? 'Hide' : 'Edit Form'}
                            </button>
                            <button
                              onClick={() => guildId && cat.id && panel.id && deleteCategory(guildId, cat.id, panel.id)}
                              className="p-1 text-discord-light hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Form builder */}
                          {(cat as any)._expanded && (
                            <div className="border-t border-discord-mid px-3 pb-3 pt-2 space-y-2">
                              <p className="text-xs text-discord-light mb-2">
                                Form fields shown to users when they open this ticket type (max 5).
                              </p>
                              {(cat.form_fields || []).map(field => (
                                <div key={field.id} className="flex items-center gap-2 bg-discord-mid rounded p-2">
                                  <div className="flex-1">
                                    <span className="text-sm font-medium">{field.label}</span>
                                    <span className="text-xs text-discord-light ml-2">
                                      ({field.style}, {field.required ? 'required' : 'optional'})
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => guildId && field.id && cat.id && panel.id && deleteFormField(field.id, cat.id, panel.id)}
                                    className="text-discord-light hover:text-red-400 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                              {(cat.form_fields?.length || 0) < 5 && (
                                <button
                                  onClick={() => guildId && cat.id && panel.id && addFormField(cat.id, panel.id)}
                                  className="btn btn-secondary text-xs w-full flex items-center justify-center gap-1"
                                >
                                  <Plus className="w-3 h-3" /> Add Question
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <p className="text-xs text-discord-light">
                    After configuring, use <code className="bg-discord-dark px-1 rounded">/ticket panel send panel_id:{panel.id} #channel</code> to deploy.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── SETTINGS TAB ── */}
      {activeTab === 'settings' && (
        <div className="card space-y-4">
          <h3 className="font-semibold">Global Ticket Settings</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Transcript Channel ID</label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-discord-light" />
                <input
                  value={config.transcript_channel_id}
                  onChange={e => setConfig(c => ({ ...c, transcript_channel_id: e.target.value }))}
                  className="input w-full pl-9"
                  placeholder="Channel ID for transcripts"
                />
              </div>
              <p className="text-xs text-discord-light mt-1">Transcripts posted here when tickets close</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Max Tickets Per User</label>
              <input
                type="number"
                value={config.max_tickets_per_user}
                onChange={e => setConfig(c => ({ ...c, max_tickets_per_user: parseInt(e.target.value) || 1 }))}
                className="input w-full"
                min="1" max="10"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Auto-Close After (hours)</label>
              <input
                type="number"
                value={config.auto_close_hours}
                onChange={e => setConfig(c => ({ ...c, auto_close_hours: parseInt(e.target.value) || 0 }))}
                className="input w-full"
                min="0"
              />
              <p className="text-xs text-discord-light mt-1">0 = never auto-close</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Welcome Message</label>
            <textarea
              value={config.welcome_message}
              onChange={e => setConfig(c => ({ ...c, welcome_message: e.target.value }))}
              className="input w-full h-24 resize-none"
              placeholder="Message shown when ticket is created..."
            />
          </div>
        </div>
      )}

      {/* ── ACTIVE TICKETS TAB ── */}
      {activeTab === 'tickets' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Active Tickets</h3>
            <button onClick={fetchData} className="btn btn-secondary text-xs flex items-center gap-1">
              Refresh
            </button>
          </div>

          {activeTickets.length === 0 ? (
            <div className="text-center py-8 text-discord-light">
              <Ticket className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No active tickets</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeTickets.map(ticket => (
                <div key={ticket.id} className="flex items-center gap-4 bg-discord-dark rounded-lg p-3">
                  <Hash className="w-5 h-5 text-discord-light flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">
                        #{ticket.ticket_number.toString().padStart(4, '0')}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs capitalize ${getStatusBadge(ticket.status)}`}>
                        {ticket.status}
                      </span>
                      {ticket.panel_name && (
                        <span className="text-xs text-discord-light">{ticket.panel_name}</span>
                      )}
                      {ticket.category_name && (
                        <span className="text-xs text-discord-light">/ {ticket.category_name}</span>
                      )}
                    </div>
                    <p className="text-xs text-discord-light truncate">
                      <@{ticket.user_id}>
                      {ticket.claimed_by && ` • Claimed by <@${ticket.claimed_by}>`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-discord-light flex-shrink-0">
                    <Clock className="w-3.5 h-3.5" />
                    {formatTime(ticket.created_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

> **Note on the `<@{ticket.user_id}>` line:** In the JSX, use a template literal or expression: `{`<@${ticket.user_id}>`}` — the above is pseudocode for clarity.

### Step 3: Commit

```bash
git add dashboard/frontend/src/pages/guild/TicketsPage.tsx dashboard/frontend/src/services/api.ts
git commit -m "feat: rewrite TicketsPage with real API integration, panels, settings, active tickets"
```

---

## Task 10: Run All Tests and Final Verification

### Step 1: Run bot tests

```bash
cd /home/plex/wall-e-bot && npx jest --no-coverage 2>&1 | tail -30
```

Expected: All tests pass

### Step 2: Build TypeScript check on bot

```bash
cd /home/plex/wall-e-bot/bot && npx tsc --noEmit 2>&1 | head -40
```

Expected: No errors (or only pre-existing errors unrelated to ticket changes)

### Step 3: Build TypeScript check on dashboard backend

```bash
cd /home/plex/wall-e-bot/dashboard/backend && npx tsc --noEmit 2>&1 | head -40
```

Expected: No errors

### Step 4: Build frontend

```bash
cd /home/plex/wall-e-bot/dashboard/frontend && npm run build 2>&1 | tail -20
```

Expected: Build succeeds

### Step 5: Final commit

```bash
cd /home/plex/wall-e-bot
git add -A
git status  # verify nothing unexpected
git commit -m "chore: ticket system redesign complete — multi-panel, categories, forms, closed archiving, transcripts"
```

---

## Summary of Changes

| File | Change |
|---|---|
| `dashboard/backend/src/db/migrate.ts` | New tables: ticket_panels, ticket_categories, ticket_form_fields; extended tickets table |
| `shared/src/types/guild.ts` | Added TicketPanel, TicketCategory, TicketFormField, TicketConfig, Ticket types |
| `bot/src/utils/ticketUtils.ts` | New: resolveChannelName, buildTranscript utilities |
| `bot/tests/utils/ticketUtils.test.ts` | New: 8 unit tests for ticket utilities |
| `bot/src/commands/admin/ticket.ts` | Rewritten: panel/category management + updated ticket commands |
| `bot/src/events/buttonInteraction.ts` | Rewritten: multi-panel routing, dropdown, modal, two-step close, DMs, transcripts, closed category |
| `bot/src/events/interactionCreate.ts` | Added: modal submit handler for ticket forms |
| `bot/src/services/SchedulerService.ts` | Added: auto-close with inactivity warnings |
| `bot/src/events/messageCreate.ts` | Added: last_activity update for open tickets |
| `dashboard/backend/src/routes/guilds.ts` | Added: 15 ticket API endpoints |
| `dashboard/frontend/src/services/api.ts` | Added: ticketApi with 13 methods |
| `dashboard/frontend/src/pages/guild/TicketsPage.tsx` | Full rewrite: panels, settings, active tickets tabs |
