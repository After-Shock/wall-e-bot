import { Events, Message } from 'discord.js';
import { canExecuteCustomCommand, isSafeCustomCommandRegex } from '@wall-e/shared';
import type { WallEClient } from '../structures/Client.js';
import { logger } from '../utils/logger.js';
import { sendLong } from '../utils/sendLong.js';
import { parseCembed } from '../utils/parseCembed.js';
import { isGuildAllowed } from '../utils/whitelist.js';

/** Seconds to cache a guild's custom command list (dashboard/bot edits apply within this window). */
const CUSTOM_COMMANDS_CACHE_TTL = 60;

interface MessageCustomCommand {
  id: number;
  name: string;
  trigger_type: string;
  responses: string[];
  embed_response: boolean;
  cembed_response: boolean;
  embed_color: string | null;
  delete_command: boolean;
  case_sensitive: boolean;
  allowed_roles: string[] | null;
  allowed_channels: string[] | null;
}

/** Load message-triggered custom commands for a guild, cached in Redis. */
async function getMessageCommands(client: WallEClient, guildId: string): Promise<MessageCustomCommand[]> {
  const cacheKey = `guild:${guildId}:customcommands:message`;

  try {
    const cached = await client.cache.getJson<MessageCustomCommand[]>(cacheKey);
    if (cached) return cached;
  } catch {
    // Redis unavailable — fall through to the database
  }

  const result = await client.db.pool.query(
    `SELECT id, name, trigger_type, responses, embed_response, cembed_response, embed_color,
            delete_command, case_sensitive, allowed_roles, allowed_channels
     FROM custom_commands
     WHERE guild_id = $1
       AND enabled = TRUE
       AND trigger_type IN ('command', 'starts_with', 'contains', 'exact_match', 'regex')`,
    [guildId],
  );

  client.cache.setJson(cacheKey, result.rows, CUSTOM_COMMANDS_CACHE_TTL).catch(() => {});
  return result.rows as MessageCustomCommand[];
}

async function handleCustomCommands(
  client: WallEClient,
  message: import('discord.js').Message,
) {
  const guild = message.guild!;
  const content = message.content;
  const contentLower = content.toLowerCase();

  // Load all active message-type commands for this guild (Redis-cached)
  const commands = await getMessageCommands(client, guild.id);
  if (commands.length === 0) return;

  const config = await client.db.getGuildConfig(guild.id);
  const prefix = config?.prefix ?? '!';
  const channel = message.channel as import('discord.js').TextChannel;
  const memberRoleIds = message.member?.roles.cache.map((role) => role.id) ?? [];

  for (const cmd of commands) {
    if (!canExecuteCustomCommand({
      allowedChannels: cmd.allowed_channels,
      allowedRoles: cmd.allowed_roles,
      channelId: message.channel.id,
      memberRoleIds,
    })) {
      continue;
    }

    const nameLower = cmd.name.toLowerCase();
    const checkContent = cmd.case_sensitive ? content : contentLower;
    const checkName = cmd.case_sensitive ? cmd.name : nameLower;

    let matched = false;
    let args: string[] = [];

    switch (cmd.trigger_type) {
      case 'command': {
        const prefixedTrigger = prefix + checkName;
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
        if (!isSafeCustomCommandRegex(cmd.name)) {
          continue;
        }
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
    if (!Array.isArray(responses) || responses.length === 0) continue;
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

    if (cmd.cembed_response) {
      const embedData = parseCembed(rendered);
      if (!embedData) {
        await channel.send('⚠️ Failed to parse embed.');
      } else {
        const { EmbedBuilder } = await import('discord.js');
        const embed = new EmbedBuilder();
        if (embedData.title) embed.setTitle(embedData.title);
        if (embedData.description) embed.setDescription(embedData.description);
        if (embedData.color !== undefined) embed.setColor(embedData.color);
        if (embedData.url) embed.setURL(embedData.url);
        if (embedData.author?.name) embed.setAuthor({ name: embedData.author.name, iconURL: embedData.author.icon_url, url: embedData.author.url });
        if (embedData.footer?.text) embed.setFooter({ text: embedData.footer.text, iconURL: embedData.footer.icon_url });
        if (embedData.thumbnail) embed.setThumbnail(embedData.thumbnail);
        if (embedData.image) embed.setImage(embedData.image);
        if (embedData.fields?.length) embed.addFields(embedData.fields.map(f => ({ name: f.name, value: f.value, inline: f.inline ?? false })));
        await channel.send({ embeds: [embed] });
      }
    } else if (cmd.embed_response) {
      const { EmbedBuilder } = await import('discord.js');
      const embed = new EmbedBuilder()
        .setDescription(rendered)
        .setColor((cmd.embed_color ?? '#5865F2') as `#${string}`);
      await channel.send({ embeds: [embed] });
    } else {
      await sendLong(channel, rendered);
    }

    client.db.pool.query(
      'UPDATE custom_commands SET uses = uses + 1 WHERE id = $1',
      [cmd.id],
    ).catch(() => {});

    // Only one custom command fires per message — otherwise a broad
    // 'contains' trigger stacks with every other match and spams the channel.
    break;
  }
}

export default {
  name: Events.MessageCreate,
  once: false,
  async execute(client: WallEClient, message: Message) {
    if (message.author.bot) return;

    // Whitelist check (Redis-cached — no longer a DB query per message)
    if (message.guild && !(await isGuildAllowed(client, message.guild.id, message.author.id))) {
      return;
    }

    try {
      // Run automod first - if it triggers, don't process further
      const automodTriggered = await client.automod.handleMessage(message);
      if (automodTriggered) return;

      // Handle leveling
      await client.leveling.handleMessage(message);

      // Handle custom commands (guild only)
      if (message.guild && message.channel.isTextBased() && 'send' in message.channel) {
        await handleCustomCommands(client, message);
      }
    } catch (error) {
      logger.error('Error in messageCreate handler:', error);
    }

    if (message.guild) {
      const guildId = message.guild.id;
      const channelId = message.channel.id;
      const channelName = message.channel.isTextBased() && 'name' in message.channel
        ? message.channel.name : null;

      // Log message for analytics (fire-and-forget)
      client.db.pool.query(
        `INSERT INTO message_logs (guild_id, channel_id, channel_name, user_id, username)
         VALUES ($1, $2, $3, $4, $5)`,
        [guildId, channelId, channelName, message.author.id, message.author.username],
      ).catch((e) => logger.debug('message_logs insert failed:', e));

      // Update ticket last_activity (fire-and-forget)
      client.db.pool.query(
        `UPDATE tickets SET last_activity = NOW(), warned_inactive = FALSE
         WHERE channel_id = $1 AND guild_id = $2 AND status IN ('open','claimed')`,
        [channelId, guildId],
      ).catch((e) => logger.debug('ticket activity update failed:', e));
    }
  },
};
