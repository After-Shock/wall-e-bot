import { SlashCommandBuilder, PermissionFlagsBits, GuildMember, EmbedBuilder } from 'discord.js';
import type { Command } from '../../structures/Command.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { COLORS } from '@wall-e/shared';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warning management commands')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Warn a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('The user to warn')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('reason')
            .setDescription('Reason for the warning')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('View warnings for a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('The user to check')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('clear')
        .setDescription('Clear all warnings for a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('The user to clear warnings for')
            .setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  
  permissions: [PermissionFlagsBits.ModerateMembers],
  guildOnly: true,

  async execute(client, interaction) {
    const subcommand = interaction.options.getSubcommand();
    const target = interaction.options.getUser('user', true);

    switch (subcommand) {
      case 'add': {
        const reason = interaction.options.getString('reason', true);
        const member = await interaction.guild!.members.fetch(target.id).catch(() => null);

        const result = await client.moderation.warn(
          interaction.guild!,
          member || target,
          interaction.member as GuildMember,
          reason
        );

        if (result.success) {
          await interaction.reply({
            embeds: [successEmbed('User Warned', `**${target.tag}** has been warned.\n**Reason:** ${reason}\n**Total Warnings:** ${result.warningCount}`)]
          });
        } else {
          await interaction.reply({ embeds: [errorEmbed('Error', result.error || 'Failed to warn user.')], ephemeral: true });
        }
        break;
      }

      case 'list': {
        const warnings = await client.db.getWarnings(interaction.guild!.id, target.id);

        if (warnings.length === 0) {
          await interaction.reply({ embeds: [successEmbed('No Warnings', `**${target.tag}** has no active warnings.`)] });
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(COLORS.WARNING)
          .setTitle(`⚠️ Warnings for ${target.tag}`)
          .setDescription(`Total: **${warnings.length}** active warning(s)`)
          .setThumbnail(target.displayAvatarURL());

        for (const warning of warnings.slice(0, 10)) {
          embed.addFields({
            name: `Warning #${warning.id}`,
            value: `**Reason:** ${warning.reason}\n**Moderator:** <@${warning.moderator_id}>\n**Date:** <t:${Math.floor(new Date(warning.created_at).getTime() / 1000)}:R>`,
          });
        }

        if (warnings.length > 10) {
          embed.setFooter({ text: `Showing 10 of ${warnings.length} warnings` });
        }

        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'clear': {
        await client.db.clearWarnings(interaction.guild!.id, target.id);
        await interaction.reply({ embeds: [successEmbed('Warnings Cleared', `All warnings for **${target.tag}** have been cleared.`)] });
        break;
      }
    }
  },
};

export default command;
