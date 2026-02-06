import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } from 'discord.js';
import type { Command } from '../../structures/Command.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { COLORS, formatDuration, parseDuration } from '@wall-e/shared';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Schedule automated messages')
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('Create a scheduled message')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('Channel to send the message')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('message')
            .setDescription('Message to send (supports {server}, {memberCount}, {date}, {time})')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('interval')
            .setDescription('Repeat interval (e.g., 1h, 30m, 1d) - leave empty for one-time')
            .setRequired(false))
        .addStringOption(opt =>
          opt.setName('start_in')
            .setDescription('When to start (e.g., 10m, 1h)')
            .setRequired(false))
        .addBooleanOption(opt =>
          opt.setName('embed')
            .setDescription('Send as embed?')
            .setRequired(false))
        .addStringOption(opt =>
          opt.setName('embed_color')
            .setDescription('Embed color (hex)')
            .setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all scheduled messages'))
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Delete a scheduled message')
        .addIntegerOption(opt =>
          opt.setName('id')
            .setDescription('ID of the scheduled message')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('toggle')
        .setDescription('Enable/disable a scheduled message')
        .addIntegerOption(opt =>
          opt.setName('id')
            .setDescription('ID of the scheduled message')
            .setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  permissions: [PermissionFlagsBits.ManageGuild],
  guildOnly: true,

  async execute(client, interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'create': {
        const channel = interaction.options.getChannel('channel', true);
        const message = interaction.options.getString('message', true);
        const intervalStr = interaction.options.getString('interval');
        const startInStr = interaction.options.getString('start_in');
        const embed = interaction.options.getBoolean('embed') ?? false;
        const embedColor = interaction.options.getString('embed_color');

        let intervalMinutes: number | undefined;
        if (intervalStr) {
          const intervalMs = parseDuration(intervalStr);
          if (!intervalMs) {
            await interaction.reply({
              embeds: [errorEmbed('Error', 'Invalid interval format. Use formats like: 10m, 1h, 1d')],
              ephemeral: true
            });
            return;
          }
          intervalMinutes = Math.floor(intervalMs / 60000);
        }

        let nextRun = new Date();
        if (startInStr) {
          const startInMs = parseDuration(startInStr);
          if (startInMs) {
            nextRun = new Date(Date.now() + startInMs);
          }
        } else if (intervalMinutes) {
          nextRun = new Date(Date.now() + intervalMinutes * 60000);
        }

        const result = await client.db.pool.query(
          `INSERT INTO scheduled_messages 
           (guild_id, channel_id, message, embed, embed_color, interval_minutes, next_run, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [
            interaction.guild!.id,
            channel.id,
            message,
            embed,
            embedColor,
            intervalMinutes,
            nextRun,
            interaction.user.id
          ]
        );

        const scheduleEmbed = new EmbedBuilder()
          .setColor(COLORS.SUCCESS)
          .setTitle('✅ Scheduled Message Created')
          .addFields(
            { name: 'Channel', value: `${channel}`, inline: true },
            { name: 'ID', value: result.rows[0].id.toString(), inline: true },
            { name: 'First Run', value: `<t:${Math.floor(nextRun.getTime() / 1000)}:R>`, inline: true }
          );

        if (intervalMinutes) {
          scheduleEmbed.addFields({ 
            name: 'Repeat', 
            value: `Every ${formatDuration(intervalMinutes * 60000)}`, 
            inline: true 
          });
        } else {
          scheduleEmbed.addFields({ name: 'Repeat', value: 'One-time', inline: true });
        }

        scheduleEmbed.addFields({ name: 'Message Preview', value: message.substring(0, 1000) });

        await interaction.reply({ embeds: [scheduleEmbed] });
        break;
      }

      case 'list': {
        const result = await client.db.pool.query(
          `SELECT * FROM scheduled_messages 
           WHERE guild_id = $1 
           ORDER BY next_run`,
          [interaction.guild!.id]
        );

        if (result.rows.length === 0) {
          await interaction.reply({
            embeds: [errorEmbed('No Scheduled Messages', 'No scheduled messages found.')],
            ephemeral: true
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(COLORS.PRIMARY)
          .setTitle('📅 Scheduled Messages')
          .setDescription(result.rows.map(s => {
            const status = s.enabled ? '✅' : '❌';
            const repeat = s.interval_minutes 
              ? `Every ${formatDuration(s.interval_minutes * 60000)}` 
              : 'One-time';
            return `${status} **#${s.id}** - <#${s.channel_id}>\n` +
              `Next: <t:${Math.floor(new Date(s.next_run).getTime() / 1000)}:R> | ${repeat}\n` +
              `Message: ${s.message.substring(0, 50)}...`;
          }).join('\n\n'));

        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'delete': {
        const id = interaction.options.getInteger('id', true);

        const result = await client.db.pool.query(
          'DELETE FROM scheduled_messages WHERE id = $1 AND guild_id = $2 RETURNING id',
          [id, interaction.guild!.id]
        );

        if (result.rowCount === 0) {
          await interaction.reply({
            embeds: [errorEmbed('Error', 'Scheduled message not found.')],
            ephemeral: true
          });
          return;
        }

        await interaction.reply({
          embeds: [successEmbed('Deleted', `Scheduled message #${id} has been deleted.`)]
        });
        break;
      }

      case 'toggle': {
        const id = interaction.options.getInteger('id', true);

        const result = await client.db.pool.query(
          `UPDATE scheduled_messages 
           SET enabled = NOT enabled 
           WHERE id = $1 AND guild_id = $2 
           RETURNING enabled`,
          [id, interaction.guild!.id]
        );

        if (result.rowCount === 0) {
          await interaction.reply({
            embeds: [errorEmbed('Error', 'Scheduled message not found.')],
            ephemeral: true
          });
          return;
        }

        const enabled = result.rows[0].enabled;
        await interaction.reply({
          embeds: [successEmbed('Toggled', `Scheduled message #${id} is now **${enabled ? 'enabled' : 'disabled'}**.`)]
        });
        break;
      }
    }
  },
};

export default command;
