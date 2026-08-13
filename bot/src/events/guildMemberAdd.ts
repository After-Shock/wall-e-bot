import { Events, GuildMember, EmbedBuilder, TextChannel } from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { COLORS } from '@wall-e/shared';
import { logger } from '../utils/logger.js';

async function applyAutoRoles(client: WallEClient, member: GuildMember): Promise<void> {
  try {
    const { rows } = await client.db.pool.query(
      'SELECT role_id, delay_minutes, include_bots FROM auto_roles WHERE guild_id = $1',
      [member.guild.id],
    );
    for (const r of rows as { role_id: string; delay_minutes: number; include_bots: boolean }[]) {
      if (member.user.bot && !r.include_bots) continue;

      const add = async () => {
        // Re-check membership: on a delayed add the member may have left.
        if (!member.guild.members.cache.has(member.id) &&
            !(await member.guild.members.fetch(member.id).catch(() => null))) return;
        await member.roles.add(r.role_id).catch(err =>
          logger.error(`Failed to add auto role ${r.role_id} in ${member.guild.id}:`, err),
        );
      };

      if (r.delay_minutes > 0) {
        // ponytail: in-process timer, lost on restart. A pending_role_assignments
        // table polled by SchedulerService would make delays durable if it matters.
        setTimeout(() => { add(); }, r.delay_minutes * 60 * 1000);
      } else {
        await add();
      }
    }
  } catch (error) {
    logger.error('Error applying auto roles:', error);
  }
}

export default {
  name: Events.GuildMemberAdd,
  once: false,
  async execute(client: WallEClient, member: GuildMember) {
    try {
      // Track join for analytics (fire-and-forget)
      client.db.pool.query(
        `INSERT INTO guild_members (guild_id, user_id, joined_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (guild_id, user_id) DO UPDATE SET joined_at = NOW(), left_at = NULL`,
        [member.guild.id, member.id],
      ).catch(() => {});

      // Auto roles from the auto_roles table (separate from welcome.autoRole below,
      // which only fires when the welcome module is on). These apply unconditionally.
      await applyAutoRoles(client, member);

      const config = await client.db.getGuildConfig(member.guild.id);
      if (!config?.modules?.welcome || !config.welcome?.enabled) return;

      const { welcome } = config;

      // Auto roles
      if (welcome.autoRole?.length) {
        for (const roleId of welcome.autoRole) {
          try {
            await member.roles.add(roleId);
          } catch (error) {
            logger.error(`Failed to add auto role ${roleId}:`, error);
          }
        }
      }

      // Welcome message
      if (welcome.channelId) {
        const channel = member.guild.channels.cache.get(welcome.channelId) as TextChannel;
        if (!channel) return;

        const message = welcome.message
          .replace(/{user}/g, member.toString())
          .replace(/{username}/g, member.user.username)
          .replace(/{server}/g, member.guild.name)
          .replace(/{memberCount}/g, member.guild.memberCount.toString());

        if (welcome.embedEnabled) {
          const embed = new EmbedBuilder()
            .setColor(welcome.embedColor ? parseInt(welcome.embedColor.replace('#', ''), 16) : COLORS.SUCCESS)
            .setDescription(message)
            .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
            .setTimestamp();

          if (welcome.embedImage) {
            embed.setImage(welcome.embedImage);
          }

          await channel.send({ embeds: [embed] });
        } else {
          await channel.send(message);
        }
      }

      // DM welcome
      if (welcome.dmEnabled && welcome.dmMessage) {
        try {
          const dmMessage = welcome.dmMessage
            .replace(/{user}/g, member.toString())
            .replace(/{username}/g, member.user.username)
            .replace(/{server}/g, member.guild.name);

          await member.send(dmMessage);
        } catch {
          // User has DMs disabled
        }
      }
    } catch (error) {
      logger.error('Error in guildMemberAdd handler:', error);
    }
  },
};
