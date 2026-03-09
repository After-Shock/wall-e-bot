# Auto-Delete Slash Command Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a top-level `/auto-delete` slash command with `add`, `edit`, `remove`, `toggle`, and `list` subcommands so guild admins can manage auto-delete channel configs without the dashboard.

**Architecture:** Single new file `bot/src/commands/admin/autodelete.ts`. Direct PostgreSQL queries via `client.db.pool.query()` — same pattern as `SchedulerService`. No new services or abstractions. Command is auto-discovered and registered by the existing dynamic loader in `Client.ts`.

**Tech Stack:** discord.js 14, TypeScript, PostgreSQL (pg)

---

### Task 1: Create `bot/src/commands/admin/autodelete.ts`

**Files:**
- Create: `bot/src/commands/admin/autodelete.ts`

**Reference files to understand patterns:**
- `bot/src/commands/admin/setup.ts` — subcommand builder and execute switch pattern
- `bot/src/utils/embeds.ts` — `successEmbed`, `errorEmbed`, `infoEmbed` helpers
- `bot/src/services/SchedulerService.ts:472-485` — `client.db.pool.query()` pattern

**Step 1: Create the file**

```typescript
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } from 'discord.js';
import type { Command } from '../../structures/Command.js';
import { successEmbed, errorEmbed, infoEmbed } from '../../utils/embeds.js';
import { COLORS } from '@wall-e/shared';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('auto-delete')
    .setDescription('Manage auto-delete configurations for channels')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Configure auto-delete for a channel')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel to configure')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true))
        .addIntegerOption(option =>
          option.setName('max-age-hours')
            .setDescription('Delete messages older than this many hours (1–8760)')
            .setMinValue(1)
            .setMaxValue(8760)
            .setRequired(false))
        .addIntegerOption(option =>
          option.setName('max-messages')
            .setDescription('Keep only this many recent messages (1–10000)')
            .setMinValue(1)
            .setMaxValue(10000)
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('edit')
        .setDescription('Update auto-delete settings for a channel')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel to update')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true))
        .addIntegerOption(option =>
          option.setName('max-age-hours')
            .setDescription('New max age in hours (1–8760)')
            .setMinValue(1)
            .setMaxValue(8760)
            .setRequired(false))
        .addIntegerOption(option =>
          option.setName('max-messages')
            .setDescription('New max messages to keep (1–10000)')
            .setMinValue(1)
            .setMaxValue(10000)
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove auto-delete configuration for a channel')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel to remove')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('toggle')
        .setDescription('Enable or disable auto-delete for a channel')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel to toggle')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all auto-delete configurations for this server'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  permissions: [PermissionFlagsBits.ManageGuild],
  guildOnly: true,

  async execute(client, interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild!.id;

    switch (subcommand) {
      case 'add': {
        const channel = interaction.options.getChannel('channel', true);
        const maxAgeHours = interaction.options.getInteger('max-age-hours');
        const maxMessages = interaction.options.getInteger('max-messages');

        if (maxAgeHours == null && maxMessages == null) {
          return interaction.reply({
            embeds: [errorEmbed('Missing Limits', 'Provide at least one of `max-age-hours` or `max-messages`.')],
            ephemeral: true,
          });
        }

        const existing = await client.db.pool.query(
          'SELECT id FROM auto_delete_channels WHERE guild_id = $1 AND channel_id = $2',
          [guildId, channel.id],
        );

        if (existing.rowCount! > 0) {
          return interaction.reply({
            embeds: [errorEmbed('Already Configured', `Channel already configured. Use \`/auto-delete edit\` to update it.`)],
            ephemeral: true,
          });
        }

        await client.db.pool.query(
          `INSERT INTO auto_delete_channels (guild_id, channel_id, max_age_hours, max_messages)
           VALUES ($1, $2, $3, $4)`,
          [guildId, channel.id, maxAgeHours ?? null, maxMessages ?? null],
        );

        const details: string[] = [];
        if (maxAgeHours != null) details.push(`Max age: **${maxAgeHours}h**`);
        if (maxMessages != null) details.push(`Max messages: **${maxMessages}**`);

        return interaction.reply({
          embeds: [successEmbed('Auto-Delete Configured', `${channel} will be cleaned up automatically.\n${details.join(' | ')}`)],
          ephemeral: true,
        });
      }

      case 'edit': {
        const channel = interaction.options.getChannel('channel', true);
        const maxAgeHours = interaction.options.getInteger('max-age-hours');
        const maxMessages = interaction.options.getInteger('max-messages');

        if (maxAgeHours == null && maxMessages == null) {
          return interaction.reply({
            embeds: [errorEmbed('No Fields Provided', 'Provide at least one field to update.')],
            ephemeral: true,
          });
        }

        const setClauses: string[] = [];
        const values: unknown[] = [guildId, channel.id];

        if (maxAgeHours != null) {
          values.push(maxAgeHours);
          setClauses.push(`max_age_hours = $${values.length}`);
        }
        if (maxMessages != null) {
          values.push(maxMessages);
          setClauses.push(`max_messages = $${values.length}`);
        }

        const result = await client.db.pool.query(
          `UPDATE auto_delete_channels SET ${setClauses.join(', ')} WHERE guild_id = $1 AND channel_id = $2`,
          values,
        );

        if (result.rowCount === 0) {
          return interaction.reply({
            embeds: [errorEmbed('Not Found', 'No auto-delete config found for that channel.')],
            ephemeral: true,
          });
        }

        return interaction.reply({
          embeds: [successEmbed('Auto-Delete Updated', `Configuration for ${channel} has been updated.`)],
          ephemeral: true,
        });
      }

      case 'remove': {
        const channel = interaction.options.getChannel('channel', true);

        const result = await client.db.pool.query(
          'DELETE FROM auto_delete_channels WHERE guild_id = $1 AND channel_id = $2',
          [guildId, channel.id],
        );

        if (result.rowCount === 0) {
          return interaction.reply({
            embeds: [errorEmbed('Not Found', 'No auto-delete config found for that channel.')],
            ephemeral: true,
          });
        }

        return interaction.reply({
          embeds: [successEmbed('Auto-Delete Removed', `Auto-delete configuration for ${channel} has been removed.`)],
          ephemeral: true,
        });
      }

      case 'toggle': {
        const channel = interaction.options.getChannel('channel', true);

        const result = await client.db.pool.query(
          `UPDATE auto_delete_channels
           SET enabled = NOT enabled
           WHERE guild_id = $1 AND channel_id = $2
           RETURNING enabled`,
          [guildId, channel.id],
        );

        if (result.rowCount === 0) {
          return interaction.reply({
            embeds: [errorEmbed('Not Found', 'No auto-delete config found for that channel.')],
            ephemeral: true,
          });
        }

        const newState = result.rows[0].enabled as boolean;
        return interaction.reply({
          embeds: [successEmbed('Auto-Delete Toggled', `Auto-delete for ${channel} is now **${newState ? 'enabled' : 'disabled'}**.`)],
          ephemeral: true,
        });
      }

      case 'list': {
        const result = await client.db.pool.query(
          'SELECT * FROM auto_delete_channels WHERE guild_id = $1 ORDER BY created_at',
          [guildId],
        );

        if (result.rows.length === 0) {
          return interaction.reply({
            embeds: [infoEmbed('Auto-Delete Channels', 'No auto-delete channels configured. Use `/auto-delete add` to get started.')],
            ephemeral: true,
          });
        }

        const lines = result.rows.map((row: {
          channel_id: string;
          max_age_hours: number | null;
          max_messages: number | null;
          enabled: boolean;
        }) => {
          const age = row.max_age_hours != null ? `Age: ${row.max_age_hours}h` : 'Age: —';
          const msgs = row.max_messages != null ? `Messages: ${row.max_messages}` : 'Messages: —';
          const status = row.enabled ? '✅ Enabled' : '❌ Disabled';
          return `<#${row.channel_id}> — ${age} | ${msgs} | ${status}`;
        });

        const embed = new EmbedBuilder()
          .setColor(COLORS.PRIMARY)
          .setTitle('🗑️ Auto-Delete Channels')
          .setDescription(lines.join('\n'))
          .setFooter({ text: 'Exempt roles are managed via the dashboard.' });

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }
  },
};

export default command;
```

**Step 2: Commit**

```bash
git add bot/src/commands/admin/autodelete.ts
git commit -m "feat: add /auto-delete slash command (add, edit, remove, toggle, list)"
```

---

### Task 2: TypeScript Build Check

**Files:** None — verification only.

**Step 1: Run tsc --noEmit from the bot directory**

```bash
cd /home/plex/wall-e-bot/bot && node_modules/.bin/tsc --noEmit
```

Expected: no errors.

If errors appear, fix them in `autodelete.ts` before proceeding.

**Step 2: Commit fix if needed**

```bash
git add bot/src/commands/admin/autodelete.ts
git commit -m "fix: resolve TypeScript errors in auto-delete command"
```

---

### Task 3: Deploy to VPS

**Step 1: Push to remote**

```bash
git push origin main
```

**Step 2: Deploy on VPS**

```bash
cd /opt/wall-e-bot && git pull && docker compose -f docker/docker-compose.yml build --no-cache && docker compose -f docker/docker-compose.yml up -d
```

No migrate step needed — no DB schema changes.

**Step 3: Verify command registered**

After the bot restarts (~30 seconds), run `/auto-delete list` in a Discord server where the bot is present. Expected: ephemeral embed saying no channels configured.

Note: Discord slash command registration is global and may take up to 1 hour to propagate to all servers, but is typically instant.
