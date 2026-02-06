import { 
  Events, 
  ButtonInteraction, 
  StringSelectMenuInteraction, 
  EmbedBuilder,
  ChannelType,
  PermissionsBitField,
  TextChannel
} from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { COLORS } from '@wall-e/shared';
import { logger } from '../utils/logger.js';

export default {
  name: Events.InteractionCreate,
  once: false,
  async execute(client: WallEClient, interaction: ButtonInteraction | StringSelectMenuInteraction) {
    // Handle button interactions
    if (interaction.isButton()) {
      await handleButton(client, interaction);
    }
    
    // Handle select menu interactions
    if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(client, interaction);
    }
  },
};

async function handleButton(client: WallEClient, interaction: ButtonInteraction) {
  const customId = interaction.customId;

  // Reaction role buttons
  if (customId.startsWith('rr_')) {
    const roleId = customId.replace('rr_', '');
    
    try {
      const member = await interaction.guild!.members.fetch(interaction.user.id);
      
      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId);
        await interaction.reply({
          content: `✅ Removed <@&${roleId}>`,
          ephemeral: true
        });
      } else {
        await member.roles.add(roleId);
        await interaction.reply({
          content: `✅ Added <@&${roleId}>`,
          ephemeral: true
        });
      }
    } catch (error) {
      logger.error('Error handling reaction role button:', error);
      await interaction.reply({
        content: '❌ Failed to update your roles. Please contact an administrator.',
        ephemeral: true
      });
    }
    return;
  }

  // Ticket create button
  if (customId === 'ticket_create') {
    await handleTicketCreate(client, interaction);
    return;
  }

  // Ticket close button
  if (customId === 'ticket_close') {
    await handleTicketClose(client, interaction);
    return;
  }
}

async function handleSelectMenu(client: WallEClient, interaction: StringSelectMenuInteraction) {
  const customId = interaction.customId;

  // Reaction role dropdown
  if (customId === 'rr_select') {
    try {
      const member = await interaction.guild!.members.fetch(interaction.user.id);
      const selectedRoles = interaction.values;

      // Get all roles from this message
      const allRoles = await client.db.pool.query(
        'SELECT role_id FROM reaction_roles WHERE message_id = $1',
        [interaction.message.id]
      );

      const allRoleIds = allRoles.rows.map(r => r.role_id);

      // Remove roles not selected
      for (const roleId of allRoleIds) {
        if (!selectedRoles.includes(roleId) && member.roles.cache.has(roleId)) {
          await member.roles.remove(roleId);
        }
      }

      // Add selected roles
      for (const roleId of selectedRoles) {
        if (!member.roles.cache.has(roleId)) {
          await member.roles.add(roleId);
        }
      }

      await interaction.reply({
        content: `✅ Your roles have been updated!`,
        ephemeral: true
      });
    } catch (error) {
      logger.error('Error handling reaction role select:', error);
      await interaction.reply({
        content: '❌ Failed to update your roles. Please contact an administrator.',
        ephemeral: true
      });
    }
  }
}

async function handleTicketCreate(client: WallEClient, interaction: ButtonInteraction) {
  // Get ticket config
  const config = await client.db.pool.query(
    'SELECT * FROM ticket_config WHERE guild_id = $1',
    [interaction.guild!.id]
  );

  if (config.rows.length === 0) {
    await interaction.reply({
      content: '❌ Ticket system is not configured.',
      ephemeral: true
    });
    return;
  }

  const ticketConfig = config.rows[0];

  // Check if user already has an open ticket
  const existingTicket = await client.db.pool.query(
    `SELECT * FROM tickets WHERE guild_id = $1 AND user_id = $2 AND status = 'open'`,
    [interaction.guild!.id, interaction.user.id]
  );

  if (existingTicket.rows.length > 0) {
    await interaction.reply({
      content: `❌ You already have an open ticket: <#${existingTicket.rows[0].channel_id}>`,
      ephemeral: true
    });
    return;
  }

  // Create ticket channel
  const ticketNumber = await getNextTicketNumber(client, interaction.guild!.id);
  const channelName = `ticket-${ticketNumber.toString().padStart(4, '0')}`;

  try {
    const channel = await interaction.guild!.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: ticketConfig.category_id,
      permissionOverwrites: [
        {
          id: interaction.guild!.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        },
        {
          id: ticketConfig.support_role_id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.ManageMessages,
          ],
        },
        {
          id: client.user!.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ManageChannels,
          ],
        },
      ],
    });

    // Save ticket to database
    await client.db.pool.query(
      `INSERT INTO tickets (guild_id, channel_id, user_id, ticket_number)
       VALUES ($1, $2, $3, $4)`,
      [interaction.guild!.id, channel.id, interaction.user.id, ticketNumber]
    );

    // Send welcome message
    const embed = new EmbedBuilder()
      .setColor(COLORS.PRIMARY)
      .setTitle(`🎫 Ticket #${ticketNumber.toString().padStart(4, '0')}`)
      .setDescription(
        `Hello ${interaction.user}!\n\n` +
        `A staff member will be with you shortly.\n` +
        `Please describe your issue in detail.\n\n` +
        `Use \`/ticket close\` to close this ticket.`
      )
      .setTimestamp();

    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
    
    const closeButton = new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Close Ticket')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<typeof closeButton>().addComponents(closeButton);

    await channel.send({ 
      content: `${interaction.user} | <@&${ticketConfig.support_role_id}>`,
      embeds: [embed], 
      components: [row] 
    });

    await interaction.reply({
      content: `✅ Your ticket has been created: ${channel}`,
      ephemeral: true
    });
  } catch (error) {
    logger.error('Error creating ticket:', error);
    await interaction.reply({
      content: '❌ Failed to create ticket. Please contact an administrator.',
      ephemeral: true
    });
  }
}

async function handleTicketClose(client: WallEClient, interaction: ButtonInteraction) {
  const ticket = await client.db.pool.query(
    `SELECT * FROM tickets WHERE guild_id = $1 AND channel_id = $2 AND status = 'open'`,
    [interaction.guild!.id, interaction.channel!.id]
  );

  if (ticket.rows.length === 0) {
    await interaction.reply({
      content: '❌ This is not a ticket channel.',
      ephemeral: true
    });
    return;
  }

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(COLORS.WARNING)
      .setTitle('🔒 Ticket Closing')
      .setDescription('This ticket will be closed in 5 seconds...')
    ]
  });

  // Update ticket status
  await client.db.pool.query(
    `UPDATE tickets SET status = 'closed', closed_by = $3, closed_at = NOW()
     WHERE id = $1 AND guild_id = $2`,
    [ticket.rows[0].id, interaction.guild!.id, interaction.user.id]
  );

  // Delete channel after delay
  setTimeout(async () => {
    try {
      await (interaction.channel as TextChannel).delete();
    } catch {
      // Channel may already be deleted
    }
  }, 5000);
}

async function getNextTicketNumber(client: WallEClient, guildId: string): Promise<number> {
  const result = await client.db.pool.query(
    'SELECT COALESCE(MAX(ticket_number), 0) + 1 as next FROM tickets WHERE guild_id = $1',
    [guildId]
  );
  return result.rows[0].next;
}
