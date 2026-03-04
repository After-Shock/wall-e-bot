import { Events, Message } from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { logger } from '../utils/logger.js';
import { sendLong } from '../utils/sendLong.js';

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
      await sendLong(channel, rendered);
    }

    client.db.pool.query(
      'UPDATE custom_commands SET uses = uses + 1 WHERE id = $1',
      [cmd.id],
    ).catch(() => {});
  }
}

export default {
  name: Events.MessageCreate,
  once: false,
  async execute(client: WallEClient, message: Message) {
    if (message.author.bot) return;

    // Whitelist check
    if (message.guild) {
      const wl = await client.db.pool.query(
        'SELECT status, permanent, expires_at FROM guild_whitelist WHERE guild_id = $1',
        [message.guild.id],
      ).catch(() => null);
      const wlRow = wl?.rows[0];
      const expired = !wlRow?.permanent && wlRow?.expires_at && new Date(wlRow.expires_at) < new Date();
      if ((wlRow?.status !== 'approved' || expired) && message.author.id !== process.env.BOT_OWNER_ID) return;
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
