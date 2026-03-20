import { Events } from 'discord.js';
import { canExecuteCustomCommand } from '@wall-e/shared';
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
      [newMessage.guild.id],
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
        `SELECT response, embed_response, embed_color, delete_command, case_sensitive,
                allowed_roles, allowed_channels
         FROM custom_commands
         WHERE guild_id = $1
           AND enabled = TRUE
           AND trigger_on_edit = TRUE
           AND (CASE WHEN case_sensitive THEN name = $2 ELSE name = lower($2) END)`,
        [newMessage.guild.id, rawName],
      );
      if (result.rows.length === 0) return;

      const cmd = result.rows[0];
      const member = await newMessage.guild.members.fetch(newMessage.author.id).catch(() => null);
      const memberRoleIds = member?.roles.cache.map((role: { id: string }) => role.id) ?? [];

      if (!canExecuteCustomCommand({
        allowedChannels: cmd.allowed_channels,
        allowedRoles: cmd.allowed_roles,
        channelId: newMessage.channel.id,
        memberRoleIds,
      })) {
        return;
      }

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
        [newMessage.guild.id, rawName],
      ).catch(() => {});
    } catch (error) {
      logger.error('Error in messageUpdate custom command handler:', error);
    }
  },
};
