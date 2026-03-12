import {
  Events,
  ButtonInteraction,
  StringSelectMenuInteraction,
  EmbedBuilder,
  TextChannel,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { COLORS } from '@wall-e/shared';
import { logger } from '../utils/logger.js';
import { buildTranscript } from '../utils/ticketUtils.js';
import { createManagedTicket } from '../services/TicketService.js';

export default {
  name: Events.InteractionCreate,
  once: false,
  async execute(client: WallEClient, interaction: ButtonInteraction | StringSelectMenuInteraction) {
    if (interaction.isButton()) {
      await handleButton(client, interaction);
    }
    if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(client, interaction);
    }
  },
};

async function handleButton(client: WallEClient, interaction: ButtonInteraction) {
  const id = interaction.customId;

  if (id.startsWith('rr_')) {
    await handleReactionRoleButton(client, interaction);
    return;
  }
  if (id.startsWith('ticket_open:')) {
    const parts = id.split(':');
    const panelId = parseInt(parts[1], 10);
    const categoryId = parseInt(parts[2], 10) || 0;
    await handleTicketOpen(client, interaction, panelId, categoryId);
    return;
  }
  if (id.startsWith('ticket_close_confirm:')) {
    const parts = id.split(':');
    const ticketId = parseInt(parts[1], 10);
    const reason = decodeURIComponent(parts.slice(2).join(':'));
    await handleTicketCloseConfirm(client, interaction, ticketId, reason);
    return;
  }
  if (id === 'ticket_close_cancel') {
    await interaction.update({ components: [] });
    return;
  }
  if (id === 'ticket_create') {
    await interaction.reply({
      content: 'This panel is outdated. Please ask an admin to re-create it with `/ticket panel send`.',
      ephemeral: true,
    });
    return;
  }
  if (id === 'ticket_close') {
    await handleLegacyTicketClose(client, interaction);
  }
}

async function handleSelectMenu(client: WallEClient, interaction: StringSelectMenuInteraction) {
  const id = interaction.customId;

  if (id === 'rr_select') {
    await handleReactionRoleSelect(client, interaction);
    return;
  }
  if (id.startsWith('ticket_select:')) {
    const panelId = parseInt(id.split(':')[1], 10);
    const categoryId = parseInt(interaction.values[0], 10);
    await handleTicketOpen(client, interaction as unknown as ButtonInteraction, panelId, categoryId);
  }
}

async function handleTicketOpen(
  client: WallEClient,
  interaction: ButtonInteraction,
  panelId: number,
  categoryId: number,
) {
  const panelResult = await client.db.pool.query(
    'SELECT * FROM ticket_panels WHERE id = $1 AND guild_id = $2',
    [panelId, interaction.guild!.id],
  );
  if (panelResult.rows.length === 0) {
    await interaction.reply({ content: 'Panel not found.', ephemeral: true });
    return;
  }
  const panel = panelResult.rows[0];

  let category: any = null;
  if (categoryId > 0) {
    const catResult = await client.db.pool.query(
      'SELECT * FROM ticket_categories WHERE id = $1 AND panel_id = $2',
      [categoryId, panelId],
    );
    category = catResult.rows[0] || null;
  }

  const configResult = await client.db.pool.query(
    'SELECT * FROM ticket_config WHERE guild_id = $1',
    [interaction.guild!.id],
  );
  const config = configResult.rows[0] || { max_tickets_per_user: 1, welcome_message: '' };

  if (category) {
    const fieldsResult = await client.db.pool.query(
      'SELECT * FROM ticket_form_fields WHERE category_id = $1 ORDER BY position LIMIT 5',
      [categoryId],
    );
    const fields = fieldsResult.rows;

    if (fields.length > 0) {
      const modal = new ModalBuilder()
        .setCustomId(`ticket_modal:${panelId}:${categoryId}`)
        .setTitle(`${category.emoji || 'Ticket'} ${category.name}`.substring(0, 45));

      for (const field of fields) {
        const input = new TextInputBuilder()
          .setCustomId(`field_${field.id}`)
          .setLabel(field.label)
          .setStyle(field.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setRequired(field.required)
          .setMinLength(field.min_length)
          .setMaxLength(field.max_length);
        if (field.placeholder) input.setPlaceholder(field.placeholder);
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
      }

      await interaction.showModal(modal);
      return;
    }
  }

  await createTicketChannel(client, interaction, panel, category, config, null);
}

export async function createTicketChannel(
  client: WallEClient,
  interaction: ButtonInteraction | any,
  panel: any,
  category: any | null,
  config: any,
  formAnswers: Record<string, string> | null,
) {
  try {
    await createManagedTicket(client, interaction, { panel, category, config, formAnswers });
  } catch (error) {
    logger.error('Error creating ticket channel:', error);
    const message = error instanceof Error ? error.message : 'Failed to create ticket. Please contact an administrator.';
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: message });
    } else {
      await interaction.reply({ content: message, ephemeral: true });
    }
  }
}

async function handleTicketCloseConfirm(
  client: WallEClient,
  interaction: ButtonInteraction,
  ticketId: number,
  reason: string,
) {
  const ticketResult = await client.db.pool.query(
    `SELECT t.*, tp.category_closed_id, tc.transcript_channel_id
     FROM tickets t
     LEFT JOIN ticket_panels tp ON t.panel_id = tp.id
     LEFT JOIN ticket_config tc ON t.guild_id = tc.guild_id
     WHERE t.id = $1 AND t.guild_id = $2 AND t.status IN ('open','claimed')`,
    [ticketId, interaction.guild!.id],
  );

  if (ticketResult.rows.length === 0) {
    await interaction.update({ content: 'Ticket not found or already closed.', components: [] });
    return;
  }

  const ticket = ticketResult.rows[0];
  await interaction.update({
    embeds: [new EmbedBuilder()
      .setColor(COLORS.WARNING)
      .setTitle('Closing Ticket...')
      .setDescription(`Reason: ${reason}`)],
    components: [],
  });

  const channel = interaction.channel as TextChannel;

  try {
    const allMessages: any[] = [];
    let lastId: string | undefined;
    while (true) {
      const batch = await channel.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) });
      if (batch.size === 0) break;
      allMessages.push(...batch.values());
      lastId = batch.last()?.id;
      if (batch.size < 100) break;
    }
    allMessages.reverse();

    const transcriptText = buildTranscript(channel.name, ticket.user_id, ticket.created_at, allMessages);
    const transcriptBuffer = Buffer.from(transcriptText, 'utf-8');

    let transcriptMsgId: string | null = null;
    if (ticket.transcript_channel_id) {
      const transcriptChannel = interaction.guild!.channels.cache.get(ticket.transcript_channel_id) as TextChannel | undefined;
      if (transcriptChannel) {
        const transcriptEmbed = new EmbedBuilder()
          .setColor(COLORS.MUTED)
          .setTitle(`Ticket Transcript - ${channel.name}`)
          .addFields(
            { name: 'User', value: `<@${ticket.user_id}>`, inline: true },
            { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Reason', value: reason, inline: false },
          )
          .setTimestamp();

        const msg = await transcriptChannel.send({
          embeds: [transcriptEmbed],
          files: [{ attachment: transcriptBuffer, name: `transcript-${channel.name}.txt` }],
        });
        transcriptMsgId = msg.id;
      }
    }

    await client.db.pool.query(
      `UPDATE tickets SET status = 'closed', closed_by = $2, closed_at = NOW(),
       close_reason = $3, transcript_message_id = $4 WHERE id = $1`,
      [ticketId, interaction.user.id, reason, transcriptMsgId],
    );

    try {
      const ticketUser = await client.users.fetch(ticket.user_id);
      await ticketUser.send(
        `Ticket Closed\nYour ticket ${channel.name} in ${interaction.guild!.name} has been closed.\nReason: ${reason}`,
      );
    } catch {
      // User has DMs disabled.
    }

    if (ticket.category_closed_id) {
      await channel.setParent(ticket.category_closed_id, { lockPermissions: false });
      await channel.setName(`closed-${channel.name}`.substring(0, 100));
    } else {
      setTimeout(async () => {
        try {
          await channel.delete();
        } catch {
          // Already deleted.
        }
      }, 5000);
    }
  } catch (error) {
    logger.error('Error closing ticket:', error);
  }
}

async function handleReactionRoleButton(client: WallEClient, interaction: ButtonInteraction) {
  const roleId = interaction.customId.replace('rr_', '');
  try {
    const member = await interaction.guild!.members.fetch(interaction.user.id);
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId);
      await interaction.reply({ content: `Removed <@&${roleId}>`, ephemeral: true });
    } else {
      await member.roles.add(roleId);
      await interaction.reply({ content: `Added <@&${roleId}>`, ephemeral: true });
    }
  } catch (error) {
    logger.error('Error handling reaction role button:', error);
    await interaction.reply({ content: 'Failed to update your roles.', ephemeral: true });
  }
}

async function handleReactionRoleSelect(client: WallEClient, interaction: StringSelectMenuInteraction) {
  try {
    const member = await interaction.guild!.members.fetch(interaction.user.id);
    const selectedRoles = interaction.values;
    const allRoles = await client.db.pool.query(
      'SELECT role_id FROM reaction_roles WHERE message_id = $1',
      [interaction.message.id],
    );
    const allRoleIds = allRoles.rows.map((row: any) => row.role_id);
    for (const roleId of allRoleIds) {
      if (!selectedRoles.includes(roleId) && member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId);
      }
    }
    for (const roleId of selectedRoles) {
      if (!member.roles.cache.has(roleId)) await member.roles.add(roleId);
    }
    await interaction.reply({ content: 'Your roles have been updated.', ephemeral: true });
  } catch (error) {
    logger.error('Error handling reaction role select:', error);
    await interaction.reply({ content: 'Failed to update your roles.', ephemeral: true });
  }
}

async function handleLegacyTicketClose(client: WallEClient, interaction: ButtonInteraction) {
  const ticket = await client.db.pool.query(
    'SELECT * FROM tickets WHERE guild_id = $1 AND channel_id = $2 AND status IN (\'open\', \'claimed\')',
    [interaction.guild!.id, interaction.channel!.id],
  );
  if (ticket.rows.length === 0) {
    await interaction.reply({ content: 'This is not a ticket channel.', ephemeral: true });
    return;
  }
  const confirmBtn = new ButtonBuilder()
    .setCustomId(`ticket_close_confirm:${ticket.rows[0].id}:No%20reason%20provided`)
    .setLabel('Confirm Close')
    .setEmoji('🔒')
    .setStyle(ButtonStyle.Danger);
  const cancelBtn = new ButtonBuilder()
    .setCustomId('ticket_close_cancel')
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Secondary);
  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(COLORS.WARNING)
      .setTitle('Close Ticket?')
      .setDescription('Click confirm to close this ticket.')],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(confirmBtn, cancelBtn)],
  });
}
