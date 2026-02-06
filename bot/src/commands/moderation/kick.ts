import { SlashCommandBuilder, PermissionFlagsBits, GuildMember } from 'discord.js';
import type { Command } from '../../structures/Command.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to kick')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the kick')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  
  permissions: [PermissionFlagsBits.KickMembers],
  guildOnly: true,

  async execute(client, interaction) {
    const target = interaction.options.getMember('user') as GuildMember | null;
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (!target) {
      await interaction.reply({ embeds: [errorEmbed('Error', 'User not found or not in this server.')], ephemeral: true });
      return;
    }

    if (target.id === interaction.user.id) {
      await interaction.reply({ embeds: [errorEmbed('Error', 'You cannot kick yourself.')], ephemeral: true });
      return;
    }

    if (target.id === client.user?.id) {
      await interaction.reply({ embeds: [errorEmbed('Error', 'I cannot kick myself.')], ephemeral: true });
      return;
    }

    const result = await client.moderation.kick(
      interaction.guild!,
      target,
      interaction.member as GuildMember,
      reason
    );

    if (result.success) {
      await interaction.reply({ embeds: [successEmbed('User Kicked', `**${target.user.tag}** has been kicked.\n**Reason:** ${reason}`)] });
    } else {
      await interaction.reply({ embeds: [errorEmbed('Error', result.error || 'Failed to kick user.')], ephemeral: true });
    }
  },
};

export default command;
