import { Events, GuildMember, EmbedBuilder, TextChannel, PartialGuildMember } from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { COLORS } from '@wall-e/shared';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildMemberRemove,
  once: false,
  async execute(client: WallEClient, member: GuildMember | PartialGuildMember) {
    try {
      const config = await client.db.getGuildConfig(member.guild.id);
      if (!config?.modules?.welcome || !config.welcome?.leaveEnabled) return;

      const { welcome } = config;
      const channelId = welcome.leaveChannelId || welcome.channelId;
      if (!channelId || !welcome.leaveMessage) return;

      const channel = member.guild.channels.cache.get(channelId) as TextChannel;
      if (!channel) return;

      const message = welcome.leaveMessage
        .replace(/{user}/g, member.user?.username || 'Unknown')
        .replace(/{username}/g, member.user?.username || 'Unknown')
        .replace(/{server}/g, member.guild.name)
        .replace(/{memberCount}/g, member.guild.memberCount.toString());

      const embed = new EmbedBuilder()
        .setColor(COLORS.MUTED)
        .setDescription(message)
        .setTimestamp();

      await channel.send({ embeds: [embed] });
    } catch (error) {
      logger.error('Error in guildMemberRemove handler:', error);
    }
  },
};
