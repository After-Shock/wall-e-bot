import { EmbedBuilder, Events, Message, PermissionFlagsBits, type User } from 'discord.js';
import { canExecuteCustomCommand, isSafeCustomCommandRegex } from '@wall-e/shared';
import type { WallEClient } from '../structures/Client.js';
import { logger } from '../utils/logger.js';
import { CUSTOM_COMMAND_MENTIONS, sendLong } from '../utils/sendLong.js';
import { parseCembed } from '../utils/parseCembed.js';
import { isGuildAllowed } from '../utils/whitelist.js';
import { escalationFor } from '../utils/replyEscalation.js';

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
  reply_moderation: boolean;
  reply_log_channel_id: string | null;
  reply_dm_failed_notice: string | null;
  reply_escalation: boolean;
  reply_escalation_channel_id: string | null;
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
            delete_command, reply_moderation, reply_log_channel_id, reply_dm_failed_notice,
            reply_escalation, reply_escalation_channel_id, case_sensitive, allowed_roles, allowed_channels
     FROM custom_commands
     WHERE guild_id = $1
       AND enabled = TRUE
       AND trigger_type IN ('command', 'starts_with', 'contains', 'exact_match', 'regex')`,
    [guildId],
  );

  client.cache.setJson(cacheKey, result.rows, CUSTOM_COMMANDS_CACHE_TTL).catch(() => {});
  return result.rows as MessageCustomCommand[];
}

/** Record a reply-moderation offense; returns the user's active and all-time counts for the command. */
async function recordOffense(client: WallEClient, cmd: MessageCustomCommand, message: Message, target: Message) {
  await client.db.pool.query(
    `INSERT INTO custom_command_actions (guild_id, command_id, target_id, moderator_id, message_content)
     VALUES ($1, $2, $3, $4, $5)`,
    [message.guild!.id, cmd.id, target.author.id, message.author.id, target.content],
  );
  const { rows } = await client.db.pool.query<{ active: number; total: number }>(
    `SELECT COUNT(*) FILTER (WHERE active)::int AS active, COUNT(*)::int AS total
     FROM custom_command_actions WHERE command_id = $1 AND target_id = $2`,
    [cmd.id, target.author.id],
  );
  return rows[0];
}

/** Time the user out for their offense step; returns a line describing what happened. */
async function escalate(
  client: WallEClient,
  cmd: MessageCustomCommand,
  message: Message,
  target: Message,
  active: number,
): Promise<{ text: string; duration: string; timedOut: boolean; needsManualAction: boolean }> {
  const { ms, label: duration, needsManualAction } = escalationFor(active);
  const reason = `${cmd.name} offense #${active} (by ${message.author.tag})`;
  const member = target.member ?? await message.guild!.members.fetch(target.author.id).catch(() => null);
  const timedOut = !!member && await member.timeout(ms, reason).then(() => true, () => false);
  if (timedOut) {
    client.db.logModAction(message.guild!.id, target.author.id, message.author.id, 'timeout', reason, ms).catch(() => {});
  }
  return {
    text: timedOut ? `⏱️ Timed out for ${duration}` : `❌ ${duration} timeout failed (Wall-E needs Timeout Members and a role above the user)`,
    duration,
    timedOut,
    needsManualAction,
  };
}

/** Post a reply-moderation action to the command's mod log channel. */
async function logReplyModeration(
  cmd: MessageCustomCommand,
  message: Message,
  target: Message,
  details: { dmed: boolean; active: number; total: number; action: string | null },
) {
  if (!cmd.reply_log_channel_id) return;
  const logChannel = await message.guild!.channels.fetch(cmd.reply_log_channel_id).catch(() => null);
  if (!logChannel?.isTextBased()) return;

  const attachments = [...target.attachments.values()].map((a) => a.url).join('\n');
  const embed = new EmbedBuilder()
    .setColor(0xE74C3C)
    .setTitle(`🛡️ ${cmd.name} used`)
    .setDescription((target.content || '*(no text)*').slice(0, 4000))
    .addFields(
      { name: 'User', value: `${target.author} (${target.author.id})`, inline: true },
      { name: 'Moderator', value: `${message.author}`, inline: true },
      { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
      { name: `Active ${cmd.name} offenses`, value: String(details.active), inline: true },
      { name: 'All-time', value: String(details.total), inline: true },
    )
    .setTimestamp();
  if (details.action) embed.addFields({ name: 'Action', value: details.action });
  embed.addFields({ name: 'DM', value: details.dmed ? '✅ Delivered' : '❌ Failed (user has DMs closed); short notice posted in channel' });
  if (attachments) embed.addFields({ name: 'Attachments', value: attachments.slice(0, 1024) });
  await logChannel.send({ embeds: [embed] });
}

/** Tell mods a user has hit the top of the ladder and needs a human decision. */
async function alertManualAction(cmd: MessageCustomCommand, message: Message, target: Message, active: number, action: string) {
  if (!cmd.reply_escalation_channel_id) return;
  const alertChannel = await message.guild!.channels.fetch(cmd.reply_escalation_channel_id).catch(() => null);
  if (!alertChannel?.isTextBased()) return;
  const embed = new EmbedBuilder()
    .setColor(0xE74C3C)
    .setTitle('🚨 Manual action needed')
    .setDescription(`${target.author} (${target.author.id}) has **${active}** active ${cmd.name} offenses.\n${action}\n\nPlease review for further action.`)
    .addFields(
      { name: 'Latest offense', value: `<#${message.channel.id}>, actioned by ${message.author}` },
      ...(cmd.reply_log_channel_id ? [{ name: 'History', value: `<#${cmd.reply_log_channel_id}> or \`/offenses view\`` }] : []),
    )
    .setTimestamp();
  await alertChannel.send({ embeds: [embed] });
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

    // Reply moderation: a moderator replying with the command deletes the
    // replied-to message and DMs its author the response instead.
    const target = cmd.reply_moderation && message.reference?.messageId &&
      message.member?.permissionsIn(channel).has(PermissionFlagsBits.ManageMessages)
      ? await message.fetchReference().catch(() => null)
      : null;
    const subject = target?.author ?? message.author;
    const subjectMember = target ? target.member : message.member;

    // Embed responses are YAGPDB-style templates that parseCembed reads; Handlebars
    // can't parse them and only logged a warning before falling back to the raw text.
    const rendered = cmd.cembed_response
      ? raw.replace(/\.User\.Mention\b/g, JSON.stringify(`<@${subject.id}>`))
      : client.template.render(raw, {
        user: `<@${subject.id}>`,
        username: subjectMember?.displayName ?? subject.username,
        userId: subject.id,
        server: guild.name,
        memberCount: guild.memberCount,
        channel: `#${'name' in message.channel ? (message.channel as { name: string }).name : ''}`,
        channelId: message.channel.id,
        args,
      });

    const deliver = async (dest: User | import('discord.js').TextChannel, extra: EmbedBuilder[] = []) => {
      if (cmd.cembed_response) {
        const embedData = parseCembed(rendered);
        if (!embedData) {
          await dest.send('⚠️ Failed to parse embed.');
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
          await dest.send({ embeds: [embed, ...extra] });
        }
      } else if (cmd.embed_response) {
        const { EmbedBuilder } = await import('discord.js');
        const embed = new EmbedBuilder()
          .setDescription(rendered)
          .setColor((cmd.embed_color ?? '#5865F2') as `#${string}`);
        await dest.send({ embeds: [embed, ...extra] });
      } else {
        await sendLong(dest, rendered, CUSTOM_COMMAND_MENTIONS);
        if (extra.length) await dest.send({ embeds: extra });
      }
    };

    if (target) {
      await target.delete().catch(() => {});
      await message.delete().catch(() => {});
      // Show them what was removed. DM only: the channel fallback must not repost it.
      const files = [...target.attachments.values()].map((a) => a.name).join(', ');
      const original = new EmbedBuilder()
        .setColor(0x99AAB5)
        .setTitle('Your removed message')
        .setDescription((target.content || '*(no text)*').slice(0, 4000))
        .addFields({ name: 'Channel', value: `<#${channel.id}> in ${guild.name}` })
        .setTimestamp(target.createdAt);
      if (files) original.addFields({ name: 'Attachments', value: files.slice(0, 1024) });

      const counts = await recordOffense(client, cmd, message, target)
        .catch((e) => { logger.warn('Recording reply moderation offense failed:', e); return null; });
      const escalation = cmd.reply_escalation && counts
        ? await escalate(client, cmd, message, target, counts.active)
        : null;
      if (escalation?.timedOut) {
        original.addFields({ name: 'Action taken', value: `You have been timed out for ${escalation.duration}.` });
      }

      const dmed = await deliver(target.author, [original]).then(() => true, () => false);
      // DMs closed — short public notice only; the full warning stays private
      if (!dmed) {
        await channel.send({
          content: `${target.author}, ${cmd.reply_dm_failed_notice || 'a moderator removed your message.'}`,
          allowedMentions: { users: [target.author.id] },
        });
      }
      if (counts) {
        await logReplyModeration(cmd, message, target, { dmed, ...counts, action: escalation?.text ?? null })
          .catch((e) => logger.warn('Reply moderation log failed:', e));
      }
      if (escalation?.needsManualAction && counts) {
        await alertManualAction(cmd, message, target, counts.active, escalation.text)
          .catch((e) => logger.warn('Manual action alert failed:', e));
      }
    } else {
      if (cmd.delete_command) await message.delete().catch(() => {});
      await deliver(channel);
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
