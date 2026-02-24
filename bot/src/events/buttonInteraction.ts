import {
  Events,
  ButtonInteraction,
  StringSelectMenuInteraction,
  EmbedBuilder,
  ChannelType,
  PermissionsBitField,
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
import { resolveChannelName, buildTranscript } from '../utils/ticketUtils.js';

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

// ─── Button Routing ───────────────────────────────────────────────────────────

async function handleButton(client: WallEClient, interaction: ButtonInteraction) {
  const id = interaction.customId;

  if (id.startsWith('rr_')) {
    await handleReactionRoleButton(client, interaction);
    return;
  }
  if (id.startsWith('ticket_open:')) {
    const parts = id.split(':');
    const panelId = parseInt(parts[1]);
    const categoryId = parseInt(parts[2]) || 0;
    await handleTicketOpen(client, interaction, panelId, categoryId);
    return;
  }
  if (id.startsWith('ticket_close_confirm:')) {
    const parts = id.split(':');
    const ticketId = parseInt(parts[1]);
    const reason = decodeURIComponent(parts.slice(2).join(':'));
    await handleTicketCloseConfirm(client, interaction, ticketId, reason);
    return;
  }
  if (id === 'ticket_close_cancel') {
    await interaction.update({ components: [] });
    return;
  }
  // Legacy single-button support
  if (id === 'ticket_create') {
    await interaction.reply({
      content: '❌ This panel is outdated. Please ask an admin to re-create it with `/ticket panel send`.',
      ephemeral: true,
    });
    return;
  }
  if (id === 'ticket_close') {
    await handleLegacyTicketClose(client, interaction);
    return;
  }
}

// ─── Select Menu Routing ──────────────────────────────────────────────────────

async function handleSelectMenu(client: WallEClient, interaction: StringSelectMenuInteraction) {
  const id = interaction.customId;

  if (id === 'rr_select') {
    await handleReactionRoleSelect(client, interaction);
    return;
  }
  if (id.startsWith('ticket_select:')) {
    const panelId = parseInt(id.split(':')[1]);
    const categoryId = parseInt(interaction.values[0]);
    await handleTicketOpen(client, interaction as unknown as ButtonInteraction, panelId, categoryId);
    return;
  }
}

// ─── Ticket Open ──────────────────────────────────────────────────────────────

async function handleTicketOpen(
  client: WallEClient,
  interaction: ButtonInteraction,
  panelId: number,
  categoryId: number
) {
  const panelResult = await client.db.pool.query(
    'SELECT * FROM ticket_panels WHERE id = $1 AND guild_id = $2',
    [panelId, interaction.guild!.id]
  );
  if (panelResult.rows.length === 0) {
    await interaction.reply({ content: '❌ Panel not found.', ephemeral: true });
    return;
  }
  const panel = panelResult.rows[0];

  let category: any = null;
  if (categoryId > 0) {
    const catResult = await client.db.pool.query(
      'SELECT * FROM ticket_categories WHERE id = $1 AND panel_id = $2',
      [categoryId, panelId]
    );
    category = catResult.rows[0] || null;
  }

  const configResult = await client.db.pool.query(
    'SELECT * FROM ticket_config WHERE guild_id = $1',
    [interaction.guild!.id]
  );
  const config = configResult.rows[0] || { max_tickets_per_user: 1, welcome_message: '' };

  const openTickets = await client.db.pool.query(
    `SELECT id, channel_id FROM tickets WHERE guild_id = $1 AND user_id = $2 AND status IN ('open', 'claimed')`,
    [interaction.guild!.id, interaction.user.id]
  );
  if (openTickets.rows.length >= (config.max_tickets_per_user || 1)) {
    await interaction.reply({
      content: `❌ You already have an open ticket: <#${openTickets.rows[0].channel_id}>`,
      ephemeral: true,
    });
    return;
  }

  // Check for form fields
  if (category) {
    const fieldsResult = await client.db.pool.query(
      'SELECT * FROM ticket_form_fields WHERE category_id = $1 ORDER BY position LIMIT 5',
      [categoryId]
    );
    const fields = fieldsResult.rows;

    if (fields.length > 0) {
      const modal = new ModalBuilder()
        .setCustomId(`ticket_modal:${panelId}:${categoryId}`)
        .setTitle(`${category.emoji || '🎫'} ${category.name}`.substring(0, 45));

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

// ─── Create Ticket Channel (exported for modal handler) ──────────────────────

export async function createTicketChannel(
  client: WallEClient,
  interaction: ButtonInteraction | any,
  panel: any,
  category: any | null,
  config: any,
  formAnswers: Record<string, string> | null
) {
  await interaction.deferReply({ ephemeral: true });

  const numResult = await client.db.pool.query(
    'SELECT COALESCE(MAX(ticket_number), 0) + 1 as next FROM tickets WHERE guild_id = $1',
    [interaction.guild!.id]
  );
  const ticketNumber = numResult.rows[0].next;

  const channelName = resolveChannelName(panel.channel_name_template || '{type}-{number}', {
    type: category?.name || 'ticket',
    number: ticketNumber,
    username: interaction.user.username,
    userid: interaction.user.id,
  });

  const supportRoleIds: string[] = category?.support_role_ids || [];
  const observerRoleIds: string[] = category?.observer_role_ids || [];

  const permissionOverwrites: any[] = [
    { id: interaction.guild!.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    {
      id: interaction.user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    },
    {
      id: client.user!.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ManageMessages,
      ],
    },
  ];

  for (const roleId of supportRoleIds) {
    permissionOverwrites.push({
      id: roleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages,
      ],
    });
  }

  for (const roleId of observerRoleIds) {
    permissionOverwrites.push({
      id: roleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
      deny: [PermissionsBitField.Flags.SendMessages],
    });
  }

  try {
    const channelOptions: any = {
      name: channelName,
      type: ChannelType.GuildText,
      permissionOverwrites,
    };

    if (panel.category_open_id) {
      const channelCount = interaction.guild!.channels.cache.filter(
        (c: any) => c.parentId === panel.category_open_id
      ).size;
      if (channelCount >= 50 && panel.overflow_category_id) {
        channelOptions.parent = panel.overflow_category_id;
      } else {
        channelOptions.parent = panel.category_open_id;
      }
    }

    const ticketChannel = await interaction.guild!.channels.create(channelOptions);

    const insertResult = await client.db.pool.query(
      `INSERT INTO tickets (guild_id, panel_id, category_id, channel_id, user_id, ticket_number, topic, last_activity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING id`,
      [
        interaction.guild!.id,
        panel.id,
        category?.id || null,
        ticketChannel.id,
        interaction.user.id,
        ticketNumber,
        formAnswers ? JSON.stringify(formAnswers) : null,
      ]
    );
    const ticketId = insertResult.rows[0].id;

    const welcomeEmbed = new EmbedBuilder()
      .setColor(COLORS.PRIMARY)
      .setTitle(`🎫 Ticket #${ticketNumber.toString().padStart(4, '0')}${category ? ` — ${category.name}` : ''}`)
      .setDescription(
        `Hello ${interaction.user}!\n\n` +
        (config.welcome_message || 'A staff member will be with you shortly.\nPlease describe your issue in detail.')
      )
      .setTimestamp();

    if (formAnswers && Object.keys(formAnswers).length > 0) {
      for (const [label, value] of Object.entries(formAnswers)) {
        welcomeEmbed.addFields({ name: label, value: value || '(no answer)', inline: false });
      }
    }

    const closeBtn = new ButtonBuilder()
      .setCustomId(`ticket_close_confirm:${ticketId}:No%20reason%20provided`)
      .setLabel('Close Ticket')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(closeBtn);

    const pings = supportRoleIds.map((id: string) => `<@&${id}>`).join(' ');
    await ticketChannel.send({
      content: `${interaction.user}${pings ? ` | ${pings}` : ''}`,
      embeds: [welcomeEmbed],
      components: [row],
    });

    await interaction.editReply({ content: `✅ Your ticket has been created: ${ticketChannel}` });

    try {
      await interaction.user.send(
        `🎫 **Ticket Created**\nYour support ticket has been opened in **${interaction.guild!.name}**: **${ticketChannel.name}**`
      );
    } catch {
      // User has DMs disabled
    }
  } catch (error) {
    logger.error('Error creating ticket channel:', error);
    await interaction.editReply({ content: '❌ Failed to create ticket. Please contact an administrator.' });
  }
}

// ─── Close Confirm ────────────────────────────────────────────────────────────

async function handleTicketCloseConfirm(
  client: WallEClient,
  interaction: ButtonInteraction,
  ticketId: number,
  reason: string
) {
  const ticketResult = await client.db.pool.query(
    `SELECT t.*, tp.category_closed_id, tc.transcript_channel_id
     FROM tickets t
     LEFT JOIN ticket_panels tp ON t.panel_id = tp.id
     LEFT JOIN ticket_config tc ON t.guild_id = tc.guild_id
     WHERE t.id = $1 AND t.guild_id = $2 AND t.status IN ('open','claimed')`,
    [ticketId, interaction.guild!.id]
  );

  if (ticketResult.rows.length === 0) {
    await interaction.update({ content: '❌ Ticket not found or already closed.', components: [] });
    return;
  }

  const t = ticketResult.rows[0];
  await interaction.update({
    embeds: [new EmbedBuilder()
      .setColor(COLORS.WARNING)
      .setTitle('🔒 Closing Ticket...')
      .setDescription(`Reason: ${reason}`)
    ],
    components: [],
  });

  const channel = interaction.channel as TextChannel;

  try {
    // Paginate all messages for transcript
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

    const transcriptText = buildTranscript(channel.name, t.user_id, t.created_at, allMessages);
    const transcriptBuffer = Buffer.from(transcriptText, 'utf-8');

    let transcriptMsgId: string | null = null;
    if (t.transcript_channel_id) {
      const transcriptChannel = interaction.guild!.channels.cache.get(t.transcript_channel_id) as TextChannel | undefined;
      if (transcriptChannel) {
        const transcriptEmbed = new EmbedBuilder()
          .setColor(COLORS.MUTED)
          .setTitle(`📝 Ticket Transcript — ${channel.name}`)
          .addFields(
            { name: 'User', value: `<@${t.user_id}>`, inline: true },
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
      [ticketId, interaction.user.id, reason, transcriptMsgId]
    );

    // DM the user
    try {
      const ticketUser = await client.users.fetch(t.user_id);
      await ticketUser.send(
        `🔒 **Ticket Closed**\nYour ticket **${channel.name}** in **${interaction.guild!.name}** has been closed.\n**Reason:** ${reason}`
      );
    } catch {
      // User has DMs disabled
    }

    // Move to closed category or delete
    if (t.category_closed_id) {
      await channel.setParent(t.category_closed_id, { lockPermissions: false });
      await channel.setName(`closed-${channel.name}`.substring(0, 100));
    } else {
      setTimeout(async () => {
        try { await channel.delete(); } catch { /* already deleted */ }
      }, 5000);
    }
  } catch (error) {
    logger.error('Error closing ticket:', error);
  }
}

// ─── Reaction Role Button ─────────────────────────────────────────────────────

async function handleReactionRoleButton(client: WallEClient, interaction: ButtonInteraction) {
  const roleId = interaction.customId.replace('rr_', '');
  try {
    const member = await interaction.guild!.members.fetch(interaction.user.id);
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId);
      await interaction.reply({ content: `✅ Removed <@&${roleId}>`, ephemeral: true });
    } else {
      await member.roles.add(roleId);
      await interaction.reply({ content: `✅ Added <@&${roleId}>`, ephemeral: true });
    }
  } catch (error) {
    logger.error('Error handling reaction role button:', error);
    await interaction.reply({ content: '❌ Failed to update your roles.', ephemeral: true });
  }
}

// ─── Reaction Role Select ─────────────────────────────────────────────────────

async function handleReactionRoleSelect(client: WallEClient, interaction: StringSelectMenuInteraction) {
  try {
    const member = await interaction.guild!.members.fetch(interaction.user.id);
    const selectedRoles = interaction.values;
    const allRoles = await client.db.pool.query(
      'SELECT role_id FROM reaction_roles WHERE message_id = $1',
      [interaction.message.id]
    );
    const allRoleIds = allRoles.rows.map((r: any) => r.role_id);
    for (const roleId of allRoleIds) {
      if (!selectedRoles.includes(roleId) && member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId);
      }
    }
    for (const roleId of selectedRoles) {
      if (!member.roles.cache.has(roleId)) await member.roles.add(roleId);
    }
    await interaction.reply({ content: '✅ Your roles have been updated!', ephemeral: true });
  } catch (error) {
    logger.error('Error handling reaction role select:', error);
    await interaction.reply({ content: '❌ Failed to update your roles.', ephemeral: true });
  }
}

// ─── Legacy Close Handler ─────────────────────────────────────────────────────

async function handleLegacyTicketClose(client: WallEClient, interaction: ButtonInteraction) {
  const ticket = await client.db.pool.query(
    `SELECT * FROM tickets WHERE guild_id = $1 AND channel_id = $2 AND status IN ('open', 'claimed')`,
    [interaction.guild!.id, interaction.channel!.id]
  );
  if (ticket.rows.length === 0) {
    await interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });
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
      .setTitle('🔒 Close Ticket?')
      .setDescription('Click confirm to close this ticket.')
    ],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(confirmBtn, cancelBtn)],
  });
}
