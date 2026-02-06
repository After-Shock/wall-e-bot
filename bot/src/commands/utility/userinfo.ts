import { SlashCommandBuilder, EmbedBuilder, GuildMember } from 'discord.js';
import type { Command } from '../../structures/Command.js';
import { COLORS } from '@wall-e/shared';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Get information about a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to get info for')
        .setRequired(false)),

  async execute(client, interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const member = interaction.guild?.members.cache.get(user.id) as GuildMember | undefined;

    const embed = new EmbedBuilder()
      .setColor(member?.displayColor || COLORS.PRIMARY)
      .setTitle(user.tag)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: '🆔 User ID', value: user.id, inline: true },
        { name: '📅 Account Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: '🤖 Bot', value: user.bot ? 'Yes' : 'No', inline: true }
      );

    if (member) {
      embed.addFields(
        { name: '📥 Joined Server', value: `<t:${Math.floor(member.joinedTimestamp! / 1000)}:R>`, inline: true },
        { name: '🎨 Display Color', value: member.displayHexColor, inline: true },
        { name: '📛 Nickname', value: member.nickname || 'None', inline: true }
      );

      const roles = member.roles.cache
        .filter(role => role.id !== interaction.guild!.id)
        .sort((a, b) => b.position - a.position)
        .map(role => role.toString())
        .slice(0, 20);

      if (roles.length > 0) {
        embed.addFields({
          name: `🎭 Roles (${member.roles.cache.size - 1})`,
          value: roles.join(', ') + (member.roles.cache.size - 1 > 20 ? '...' : ''),
        });
      }

      // Key permissions
      const permissions = [];
      if (member.permissions.has('Administrator')) permissions.push('Administrator');
      else {
        if (member.permissions.has('ManageGuild')) permissions.push('Manage Server');
        if (member.permissions.has('ManageMessages')) permissions.push('Manage Messages');
        if (member.permissions.has('BanMembers')) permissions.push('Ban Members');
        if (member.permissions.has('KickMembers')) permissions.push('Kick Members');
      }

      if (permissions.length > 0) {
        embed.addFields({
          name: '🔑 Key Permissions',
          value: permissions.join(', '),
        });
      }
    }

    if (user.bannerURL()) {
      embed.setImage(user.bannerURL({ size: 512 }));
    }

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
