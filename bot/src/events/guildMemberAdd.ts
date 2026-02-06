import { Events, GuildMember, EmbedBuilder, TextChannel } from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { COLORS } from '@wall-e/shared';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildMemberAdd,
  once: false,
  async execute(client: WallEClient, member: GuildMember) {
    try {
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
