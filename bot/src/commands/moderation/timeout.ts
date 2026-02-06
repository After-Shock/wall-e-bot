import { SlashCommandBuilder, PermissionFlagsBits, GuildMember } from 'discord.js';
import type { Command } from '../../structures/Command.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { parseDuration, formatDuration } from '@wall-e/shared';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout (mute) a member')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to timeout')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('Duration (e.g., 10m, 1h, 1d)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the timeout')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  
  permissions: [PermissionFlagsBits.ModerateMembers],
  guildOnly: true,

  async execute(client, interaction) {
    const target = interaction.options.getMember('user') as GuildMember | null;
    const durationStr = interaction.options.getString('duration', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (!target) {
      await interaction.reply({ embeds: [errorEmbed('Error', 'User not found or not in this server.')], ephemeral: true });
      return;
    }

    const duration = parseDuration(durationStr);
    if (!duration) {
      await interaction.reply({ embeds: [errorEmbed('Error', 'Invalid duration format. Use formats like: 10m, 1h, 1d, 1w')], ephemeral: true });
      return;
    }

    // Discord timeout limit is 28 days
    if (duration > 28 * 24 * 60 * 60 * 1000) {
      await interaction.reply({ embeds: [errorEmbed('Error', 'Timeout duration cannot exceed 28 days.')], ephemeral: true });
      return;
    }

    const result = await client.moderation.timeout(
      interaction.guild!,
      target,
      interaction.member as GuildMember,
      duration,
      reason
    );

    if (result.success) {
      await interaction.reply({
        embeds: [successEmbed('User Timed Out', `**${target.user.tag}** has been timed out for **${formatDuration(duration)}**.\n**Reason:** ${reason}`)]
      });
    } else {
      await interaction.reply({ embeds: [errorEmbed('Error', result.error || 'Failed to timeout user.')], ephemeral: true });
    }
  },
};

export default command;
