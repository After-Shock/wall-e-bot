import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../../structures/Command.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { COLORS } from '@wall-e/shared';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('Manage auto-assigned roles for new members')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a role to be auto-assigned')
        .addRoleOption(opt =>
          opt.setName('role')
            .setDescription('Role to auto-assign')
            .setRequired(true))
        .addIntegerOption(opt =>
          opt.setName('delay')
            .setDescription('Delay in minutes before assigning (0 for immediate)')
            .setMinValue(0)
            .setMaxValue(10080) // 1 week max
            .setRequired(false))
        .addBooleanOption(opt =>
          opt.setName('bots')
            .setDescription('Also assign to bots?')
            .setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a role from auto-assignment')
        .addRoleOption(opt =>
          opt.setName('role')
            .setDescription('Role to remove')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all auto-assigned roles'))
    .addSubcommand(sub =>
      sub.setName('clear')
        .setDescription('Remove all auto-assigned roles'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  permissions: [PermissionFlagsBits.ManageRoles],
  guildOnly: true,

  async execute(client, interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'add': {
        const role = interaction.options.getRole('role', true);
        const delay = interaction.options.getInteger('delay') ?? 0;
        const includeBots = interaction.options.getBoolean('bots') ?? false;

        // Check role hierarchy
        if (role.position >= interaction.guild!.members.me!.roles.highest.position) {
          await interaction.reply({
            embeds: [errorEmbed('Error', 'I cannot assign this role as it is higher than or equal to my highest role.')],
            ephemeral: true
          });
          return;
        }

        if (role.managed) {
          await interaction.reply({
            embeds: [errorEmbed('Error', 'This role is managed by an integration and cannot be assigned.')],
            ephemeral: true
          });
          return;
        }

        await client.db.pool.query(
          `INSERT INTO auto_roles (guild_id, role_id, delay_minutes, include_bots)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (guild_id, role_id) DO UPDATE SET delay_minutes = $3, include_bots = $4`,
          [interaction.guild!.id, role.id, delay, includeBots]
        );

        await interaction.reply({
          embeds: [successEmbed('Auto-Role Added', 
            `${role} will be auto-assigned to new members${delay > 0 ? ` after ${delay} minute(s)` : ' immediately'}.${includeBots ? ' (Including bots)' : ''}`
          )]
        });
        break;
      }

      case 'remove': {
        const role = interaction.options.getRole('role', true);

        const result = await client.db.pool.query(
          'DELETE FROM auto_roles WHERE guild_id = $1 AND role_id = $2 RETURNING id',
          [interaction.guild!.id, role.id]
        );

        if (result.rowCount === 0) {
          await interaction.reply({
            embeds: [errorEmbed('Error', 'This role is not set as an auto-role.')],
            ephemeral: true
          });
          return;
        }

        await interaction.reply({
          embeds: [successEmbed('Auto-Role Removed', `${role} will no longer be auto-assigned.`)]
        });
        break;
      }

      case 'list': {
        const result = await client.db.pool.query(
          'SELECT * FROM auto_roles WHERE guild_id = $1',
          [interaction.guild!.id]
        );

        if (result.rows.length === 0) {
          await interaction.reply({
            embeds: [errorEmbed('No Auto-Roles', 'No auto-roles have been configured.')],
            ephemeral: true
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(COLORS.PRIMARY)
          .setTitle('🎭 Auto-Roles')
          .setDescription(result.rows.map(r => {
            const delay = r.delay_minutes > 0 ? `(${r.delay_minutes}m delay)` : '(immediate)';
            const bots = r.include_bots ? '🤖' : '';
            return `<@&${r.role_id}> ${delay} ${bots}`;
          }).join('\n'))
          .setFooter({ text: '🤖 = also assigned to bots' });

        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'clear': {
        await client.db.pool.query(
          'DELETE FROM auto_roles WHERE guild_id = $1',
          [interaction.guild!.id]
        );

        await interaction.reply({
          embeds: [successEmbed('Auto-Roles Cleared', 'All auto-roles have been removed.')]
        });
        break;
      }
    }
  },
};

export default command;
