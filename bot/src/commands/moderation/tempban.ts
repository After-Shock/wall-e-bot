import { SlashCommandBuilder, PermissionFlagsBits, GuildMember, EmbedBuilder } from 'discord.js';
import type { Command } from '../../structures/Command.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { parseDuration, formatDuration, COLORS } from '@wall-e/shared';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('tempban')
    .setDescription('Temporarily ban a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to ban')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('Ban duration (e.g., 1d, 1w, 30d)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the ban')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('delete_days')
        .setDescription('Days of messages to delete (0-7)')
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  permissions: [PermissionFlagsBits.BanMembers],
  guildOnly: true,

  async execute(client, interaction) {
    const target = interaction.options.getUser('user', true);
    const durationStr = interaction.options.getString('duration', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const deleteDays = interaction.options.getInteger('delete_days') || 0;

    const duration = parseDuration(durationStr);
    if (!duration) {
      await interaction.reply({
        embeds: [errorEmbed('Error', 'Invalid duration format. Use formats like: 1d, 1w, 30d')],
        ephemeral: true
      });
      return;
    }

    // Max 1 year
    if (duration > 365 * 24 * 60 * 60 * 1000) {
      await interaction.reply({
        embeds: [errorEmbed('Error', 'Ban duration cannot exceed 1 year.')],
        ephemeral: true
      });
      return;
    }

    if (target.id === interaction.user.id) {
      await interaction.reply({
        embeds: [errorEmbed('Error', 'You cannot ban yourself.')],
        ephemeral: true
      });
      return;
    }

    if (target.id === client.user?.id) {
      await interaction.reply({
        embeds: [errorEmbed('Error', 'I cannot ban myself.')],
        ephemeral: true
      });
      return;
    }

    const member = await interaction.guild!.members.fetch(target.id).catch(() => null);
    if (member && !member.bannable) {
      await interaction.reply({
        embeds: [errorEmbed('Error', 'I cannot ban this user.')],
        ephemeral: true
      });
      return;
    }

    // DM the user
    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(COLORS.ERROR)
        .setTitle(`🔨 Temporarily Banned from ${interaction.guild!.name}`)
        .addFields(
          { name: 'Reason', value: reason },
          { name: 'Duration', value: formatDuration(duration) },
          { name: 'Expires', value: `<t:${Math.floor((Date.now() + duration) / 1000)}:R>` }
        )
        .setTimestamp();

      await target.send({ embeds: [dmEmbed] });
    } catch {
      // User has DMs disabled
    }

    // Ban the user
    await interaction.guild!.members.ban(target, {
      reason: `[Tempban: ${formatDuration(duration)}] ${reason}`,
      deleteMessageSeconds: deleteDays * 24 * 60 * 60
    });

    // Schedule unban
    const unbanAt = new Date(Date.now() + duration);
    await client.db.pool.query(
      `INSERT INTO temp_bans (guild_id, user_id, moderator_id, reason, duration, unban_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [interaction.guild!.id, target.id, interaction.user.id, reason, duration, unbanAt]
    );

    // Log the action
    await client.db.logModAction(
      interaction.guild!.id,
      target.id,
      interaction.user.id,
      'tempban',
      reason,
      duration
    );

    const embed = new EmbedBuilder()
      .setColor(COLORS.SUCCESS)
      .setTitle('🔨 User Temporarily Banned')
      .addFields(
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Duration', value: formatDuration(duration), inline: true },
        { name: 'Expires', value: `<t:${Math.floor(unbanAt.getTime() / 1000)}:R>`, inline: true },
        { name: 'Reason', value: reason }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
