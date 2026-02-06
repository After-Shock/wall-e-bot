import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } from 'discord.js';
import type { Command } from '../../structures/Command.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { COLORS } from '@wall-e/shared';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('customcommand')
    .setDescription('Manage custom commands')
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('Create a custom command')
        .addStringOption(opt =>
          opt.setName('name')
            .setDescription('Command name (without prefix)')
            .setRequired(true)
            .setMaxLength(32))
        .addStringOption(opt =>
          opt.setName('response')
            .setDescription('Response message (use {user}, {server}, {channel}, {args})')
            .setRequired(true))
        .addBooleanOption(opt =>
          opt.setName('embed')
            .setDescription('Send response as embed?')
            .setRequired(false))
        .addStringOption(opt =>
          opt.setName('embed_color')
            .setDescription('Embed color (hex, e.g. #5865F2)')
            .setRequired(false))
        .addIntegerOption(opt =>
          opt.setName('cooldown')
            .setDescription('Cooldown in seconds')
            .setMinValue(0)
            .setMaxValue(3600)
            .setRequired(false))
        .addBooleanOption(opt =>
          opt.setName('delete_trigger')
            .setDescription('Delete the command message?')
            .setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Delete a custom command')
        .addStringOption(opt =>
          opt.setName('name')
            .setDescription('Command name to delete')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all custom commands'))
    .addSubcommand(sub =>
      sub.setName('info')
        .setDescription('Get info about a custom command')
        .addStringOption(opt =>
          opt.setName('name')
            .setDescription('Command name')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('edit')
        .setDescription('Edit a custom command')
        .addStringOption(opt =>
          opt.setName('name')
            .setDescription('Command name to edit')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('response')
            .setDescription('New response message')
            .setRequired(false))
        .addBooleanOption(opt =>
          opt.setName('embed')
            .setDescription('Send as embed?')
            .setRequired(false))
        .addIntegerOption(opt =>
          opt.setName('cooldown')
            .setDescription('New cooldown')
            .setRequired(false)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  permissions: [PermissionFlagsBits.ManageGuild],
  guildOnly: true,

  async execute(client, interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'create': {
        const name = interaction.options.getString('name', true).toLowerCase();
        const response = interaction.options.getString('response', true);
        const embed = interaction.options.getBoolean('embed') ?? false;
        const embedColor = interaction.options.getString('embed_color');
        const cooldown = interaction.options.getInteger('cooldown') ?? 0;
        const deleteTrigger = interaction.options.getBoolean('delete_trigger') ?? false;

        // Check if command already exists
        const existing = await client.db.pool.query(
          'SELECT id FROM custom_commands WHERE guild_id = $1 AND name = $2',
          [interaction.guild!.id, name]
        );

        if (existing.rows.length > 0) {
          await interaction.reply({
            embeds: [errorEmbed('Error', `Command \`${name}\` already exists. Use \`/customcommand edit\` to modify it.`)],
            ephemeral: true
          });
          return;
        }

        await client.db.pool.query(
          `INSERT INTO custom_commands (guild_id, name, response, embed_response, embed_color, cooldown, delete_command, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [interaction.guild!.id, name, response, embed, embedColor, cooldown, deleteTrigger, interaction.user.id]
        );

        await interaction.reply({
          embeds: [successEmbed('Command Created', `Custom command \`${name}\` has been created!\n\nUse it with your prefix: \`!${name}\``)]
        });
        break;
      }

      case 'delete': {
        const name = interaction.options.getString('name', true).toLowerCase();

        const result = await client.db.pool.query(
          'DELETE FROM custom_commands WHERE guild_id = $1 AND name = $2 RETURNING id',
          [interaction.guild!.id, name]
        );

        if (result.rowCount === 0) {
          await interaction.reply({
            embeds: [errorEmbed('Error', `Command \`${name}\` not found.`)],
            ephemeral: true
          });
          return;
        }

        await interaction.reply({
          embeds: [successEmbed('Command Deleted', `Custom command \`${name}\` has been deleted.`)]
        });
        break;
      }

      case 'list': {
        const result = await client.db.pool.query(
          'SELECT name, uses, created_at FROM custom_commands WHERE guild_id = $1 ORDER BY uses DESC',
          [interaction.guild!.id]
        );

        if (result.rows.length === 0) {
          await interaction.reply({
            embeds: [errorEmbed('No Commands', 'No custom commands have been created yet.')],
            ephemeral: true
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(COLORS.PRIMARY)
          .setTitle('📝 Custom Commands')
          .setDescription(result.rows.map((cmd, i) => 
            `**${i + 1}.** \`${cmd.name}\` - ${cmd.uses} uses`
          ).join('\n'))
          .setFooter({ text: `${result.rows.length} command(s)` });

        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'info': {
        const name = interaction.options.getString('name', true).toLowerCase();

        const result = await client.db.pool.query(
          'SELECT * FROM custom_commands WHERE guild_id = $1 AND name = $2',
          [interaction.guild!.id, name]
        );

        if (result.rows.length === 0) {
          await interaction.reply({
            embeds: [errorEmbed('Error', `Command \`${name}\` not found.`)],
            ephemeral: true
          });
          return;
        }

        const cmd = result.rows[0];
        const embed = new EmbedBuilder()
          .setColor(COLORS.PRIMARY)
          .setTitle(`📝 Command: ${cmd.name}`)
          .addFields(
            { name: 'Response', value: cmd.response.substring(0, 1024) },
            { name: 'Uses', value: cmd.uses.toString(), inline: true },
            { name: 'Cooldown', value: `${cmd.cooldown}s`, inline: true },
            { name: 'Embed', value: cmd.embed_response ? 'Yes' : 'No', inline: true },
            { name: 'Created By', value: `<@${cmd.created_by}>`, inline: true },
            { name: 'Created', value: `<t:${Math.floor(new Date(cmd.created_at).getTime() / 1000)}:R>`, inline: true }
          );

        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'edit': {
        const name = interaction.options.getString('name', true).toLowerCase();
        const response = interaction.options.getString('response');
        const embed = interaction.options.getBoolean('embed');
        const cooldown = interaction.options.getInteger('cooldown');

        const updates: string[] = [];
        const values: any[] = [interaction.guild!.id, name];
        let paramCount = 2;

        if (response !== null) {
          paramCount++;
          updates.push(`response = $${paramCount}`);
          values.push(response);
        }
        if (embed !== null) {
          paramCount++;
          updates.push(`embed_response = $${paramCount}`);
          values.push(embed);
        }
        if (cooldown !== null) {
          paramCount++;
          updates.push(`cooldown = $${paramCount}`);
          values.push(cooldown);
        }

        if (updates.length === 0) {
          await interaction.reply({
            embeds: [errorEmbed('Error', 'No changes specified.')],
            ephemeral: true
          });
          return;
        }

        const result = await client.db.pool.query(
          `UPDATE custom_commands SET ${updates.join(', ')}, updated_at = NOW() 
           WHERE guild_id = $1 AND name = $2 RETURNING id`,
          values
        );

        if (result.rowCount === 0) {
          await interaction.reply({
            embeds: [errorEmbed('Error', `Command \`${name}\` not found.`)],
            ephemeral: true
          });
          return;
        }

        await interaction.reply({
          embeds: [successEmbed('Command Updated', `Custom command \`${name}\` has been updated.`)]
        });
        break;
      }
    }
  },
};

export default command;
