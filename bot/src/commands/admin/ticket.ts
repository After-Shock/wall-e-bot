import { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  EmbedBuilder, 
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  TextChannel,
  CategoryChannel
} from 'discord.js';
import type { Command } from '../../structures/Command.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { COLORS } from '@wall-e/shared';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket system management')
    .addSubcommand(sub =>
      sub.setName('setup')
        .setDescription('Set up the ticket system')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('Channel where the ticket panel will be sent')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true))
        .addChannelOption(opt =>
          opt.setName('category')
            .setDescription('Category where tickets will be created')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true))
        .addRoleOption(opt =>
          opt.setName('support_role')
            .setDescription('Role that can see and manage tickets')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('title')
            .setDescription('Panel title')
            .setRequired(false))
        .addStringOption(opt =>
          opt.setName('description')
            .setDescription('Panel description')
            .setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('close')
        .setDescription('Close the current ticket')
        .addStringOption(opt =>
          opt.setName('reason')
            .setDescription('Reason for closing')
            .setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a user to the current ticket')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('User to add')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a user from the current ticket')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('User to remove')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('rename')
        .setDescription('Rename the current ticket')
        .addStringOption(opt =>
          opt.setName('name')
            .setDescription('New ticket name')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('transcript')
        .setDescription('Save a transcript of the current ticket'))
    .addSubcommand(sub =>
      sub.setName('claim')
        .setDescription('Claim the current ticket as yours'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  guildOnly: true,

  async execute(client, interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'setup': {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
          await interaction.reply({
            embeds: [errorEmbed('Error', 'You need Manage Channels permission.')],
            ephemeral: true
          });
          return;
        }

        const channel = interaction.options.getChannel('channel', true) as TextChannel;
        const category = interaction.options.getChannel('category', true) as CategoryChannel;
        const supportRole = interaction.options.getRole('support_role', true);
        const title = interaction.options.getString('title') || '🎫 Support Tickets';
        const description = interaction.options.getString('description') || 
          'Click the button below to create a support ticket.\n\n' +
          '**Please describe your issue clearly when opening a ticket.**';

        // Save config
        await client.db.pool.query(
          `INSERT INTO ticket_config (guild_id, channel_id, category_id, support_role_id, panel_title, panel_description)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (guild_id) DO UPDATE SET
             channel_id = $2, category_id = $3, support_role_id = $4, panel_title = $5, panel_description = $6`,
          [interaction.guild!.id, channel.id, category.id, supportRole.id, title, description]
        );

        // Create the panel
        const embed = new EmbedBuilder()
          .setColor(COLORS.PRIMARY)
          .setTitle(title)
          .setDescription(description)
          .setFooter({ text: 'Wall-E Ticket System' });

        const button = new ButtonBuilder()
          .setCustomId('ticket_create')
          .setLabel('Create Ticket')
          .setEmoji('🎫')
          .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

        await channel.send({ embeds: [embed], components: [row] });

        await interaction.reply({
          embeds: [successEmbed('Ticket System Setup', `Ticket panel sent to ${channel}.\n\nSupport role: ${supportRole}\nTicket category: ${category.name}`)],
          ephemeral: true
        });
        break;
      }

      case 'close': {
        // Check if this is a ticket channel
        const ticket = await client.db.pool.query(
          'SELECT * FROM tickets WHERE guild_id = $1 AND channel_id = $2 AND status = $3',
          [interaction.guild!.id, interaction.channel!.id, 'open']
        );

        if (ticket.rows.length === 0) {
          await interaction.reply({
            embeds: [errorEmbed('Error', 'This is not a ticket channel.')],
            ephemeral: true
          });
          return;
        }

        const reason = interaction.options.getString('reason') || 'No reason provided';

        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setTitle('🔒 Ticket Closing')
            .setDescription(`This ticket will be closed in 5 seconds...\n**Reason:** ${reason}`)
          ]
        });

        // Update ticket status
        await client.db.pool.query(
          `UPDATE tickets SET status = 'closed', closed_by = $3, closed_at = NOW(), close_reason = $4
           WHERE id = $1 AND guild_id = $2`,
          [ticket.rows[0].id, interaction.guild!.id, interaction.user.id, reason]
        );

        // Delete channel after delay
        setTimeout(async () => {
          try {
            await (interaction.channel as TextChannel).delete();
          } catch {
            // Channel may already be deleted
          }
        }, 5000);
        break;
      }

      case 'add': {
        const ticket = await client.db.pool.query(
          'SELECT * FROM tickets WHERE guild_id = $1 AND channel_id = $2 AND status = $3',
          [interaction.guild!.id, interaction.channel!.id, 'open']
        );

        if (ticket.rows.length === 0) {
          await interaction.reply({
            embeds: [errorEmbed('Error', 'This is not a ticket channel.')],
            ephemeral: true
          });
          return;
        }

        const user = interaction.options.getUser('user', true);
        const channel = interaction.channel as TextChannel;

        await channel.permissionOverwrites.create(user, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        });

        await interaction.reply({
          embeds: [successEmbed('User Added', `${user} has been added to this ticket.`)]
        });
        break;
      }

      case 'remove': {
        const ticket = await client.db.pool.query(
          'SELECT * FROM tickets WHERE guild_id = $1 AND channel_id = $2 AND status = $3',
          [interaction.guild!.id, interaction.channel!.id, 'open']
        );

        if (ticket.rows.length === 0) {
          await interaction.reply({
            embeds: [errorEmbed('Error', 'This is not a ticket channel.')],
            ephemeral: true
          });
          return;
        }

        const user = interaction.options.getUser('user', true);
        const channel = interaction.channel as TextChannel;

        await channel.permissionOverwrites.delete(user);

        await interaction.reply({
          embeds: [successEmbed('User Removed', `${user} has been removed from this ticket.`)]
        });
        break;
      }

      case 'rename': {
        const ticket = await client.db.pool.query(
          'SELECT * FROM tickets WHERE guild_id = $1 AND channel_id = $2 AND status = $3',
          [interaction.guild!.id, interaction.channel!.id, 'open']
        );

        if (ticket.rows.length === 0) {
          await interaction.reply({
            embeds: [errorEmbed('Error', 'This is not a ticket channel.')],
            ephemeral: true
          });
          return;
        }

        const name = interaction.options.getString('name', true);
        const channel = interaction.channel as TextChannel;

        await channel.setName(`ticket-${name}`);

        await interaction.reply({
          embeds: [successEmbed('Ticket Renamed', `Ticket renamed to \`ticket-${name}\`.`)]
        });
        break;
      }

      case 'transcript': {
        const ticket = await client.db.pool.query(
          'SELECT * FROM tickets WHERE guild_id = $1 AND channel_id = $2',
          [interaction.guild!.id, interaction.channel!.id]
        );

        if (ticket.rows.length === 0) {
          await interaction.reply({
            embeds: [errorEmbed('Error', 'This is not a ticket channel.')],
            ephemeral: true
          });
          return;
        }

        await interaction.deferReply();

        // Fetch messages
        const channel = interaction.channel as TextChannel;
        const messages = await channel.messages.fetch({ limit: 100 });
        
        let transcript = `Ticket Transcript - ${channel.name}\n`;
        transcript += `Created: ${ticket.rows[0].created_at}\n`;
        transcript += `User: ${ticket.rows[0].user_id}\n\n`;
        transcript += '='.repeat(50) + '\n\n';

        const sortedMessages = [...messages.values()].reverse();
        for (const msg of sortedMessages) {
          const time = msg.createdAt.toISOString();
          transcript += `[${time}] ${msg.author.tag}: ${msg.content}\n`;
          if (msg.attachments.size > 0) {
            transcript += `  Attachments: ${msg.attachments.map(a => a.url).join(', ')}\n`;
          }
        }

        const buffer = Buffer.from(transcript, 'utf-8');

        await interaction.editReply({
          content: '📝 Ticket transcript generated:',
          files: [{
            attachment: buffer,
            name: `transcript-${channel.name}.txt`
          }]
        });
        break;
      }

      case 'claim': {
        const ticket = await client.db.pool.query(
          'SELECT * FROM tickets WHERE guild_id = $1 AND channel_id = $2 AND status = $3',
          [interaction.guild!.id, interaction.channel!.id, 'open']
        );

        if (ticket.rows.length === 0) {
          await interaction.reply({
            embeds: [errorEmbed('Error', 'This is not a ticket channel.')],
            ephemeral: true
          });
          return;
        }

        await client.db.pool.query(
          'UPDATE tickets SET claimed_by = $3 WHERE id = $1 AND guild_id = $2',
          [ticket.rows[0].id, interaction.guild!.id, interaction.user.id]
        );

        await interaction.reply({
          embeds: [successEmbed('Ticket Claimed', `${interaction.user} has claimed this ticket.`)]
        });
        break;
      }
    }
  },
};

export default command;
