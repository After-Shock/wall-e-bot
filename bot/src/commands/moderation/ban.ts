import { SlashCommandBuilder, PermissionFlagsBits, GuildMember } from 'discord.js';
import type { Command } from '../../structures/Command.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to ban')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the ban')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('delete_days')
        .setDescription('Number of days of messages to delete (0-7)')
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  
  permissions: [PermissionFlagsBits.BanMembers],
  guildOnly: true,

  async execute(client, interaction) {
    const target = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const deleteDays = interaction.options.getInteger('delete_days') || 0;

    if (target.id === interaction.user.id) {
      await interaction.reply({ embeds: [errorEmbed('Error', 'You cannot ban yourself.')], ephemeral: true });
      return;
    }

    if (target.id === client.user?.id) {
      await interaction.reply({ embeds: [errorEmbed('Error', 'I cannot ban myself.')], ephemeral: true });
      return;
    }

    const member = await interaction.guild!.members.fetch(target.id).catch(() => null);

    const result = await client.moderation.ban(
      interaction.guild!,
      member || target,
      interaction.member as GuildMember,
      reason,
      deleteDays
    );

    if (result.success) {
      await interaction.reply({ embeds: [successEmbed('User Banned', `**${target.tag}** has been banned.\n**Reason:** ${reason}`)] });
    } else {
      await interaction.reply({ embeds: [errorEmbed('Error', result.error || 'Failed to ban user.')], ephemeral: true });
    }
  },
};

export default command;
