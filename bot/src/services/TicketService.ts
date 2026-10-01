import {
  ChannelType,
  EmbedBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildBasedChannel,
  type TextChannel,
} from 'discord.js';
import { COLORS } from '@wall-e/shared';
import type { PoolClient } from 'pg';
import type { WallEClient } from '../structures/Client.js';
import { buildTranscript, resolveChannelName } from '../utils/ticketUtils.js';
import { logger } from '../utils/logger.js';

type TicketInteraction = ButtonInteraction | ChatInputCommandInteraction | any;

export interface TicketCreationInput {
  panel: any;
  category: any | null;
  config: any;
  formAnswers: Record<string, string> | null;
}

export interface TicketReservation {
  ticketNumber: number;
  existingChannelId?: string;
}

export interface ManagedTicketRecord {
  id: number;
  channel_id: string;
  user_id: string;
  created_at: Date;
  category_closed_id?: string | null;
  transcript_channel_id?: string | null;
}

export interface CloseTicketResult {
  closed: boolean;
  error?: string;
  transcriptMessageId?: string;
}

export const TRANSCRIPT_REQUIRED_MESSAGE = 'Transcript channel missing — set it in the dashboard.';
export const TRANSCRIPT_UNREACHABLE_MESSAGE =
  "Wall-E can't post in the transcript channel. Give Wall-E's role View Channel, Send Messages and Attach Files there, then close again.";
/** Only Administrators or members holding one of the ticket category's support roles may close it. */
export function canCloseTicket(memberRoleIds: string[], supportRoleIds: string[], isAdministrator: boolean): boolean {
  return isAdministrator || memberRoleIds.some(roleId => supportRoleIds.includes(roleId));
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

export function buildSupportRoleSets(category: any | null): {
  supportRoleIds: string[];
  observerRoleIds: string[];
} {
  const supportRoleIds = uniqueIds(category?.support_role_ids || []);
  const observerRoleIds = uniqueIds((category?.observer_role_ids || []).filter(
    (roleId: string) => !supportRoleIds.includes(roleId),
  ));

  return { supportRoleIds, observerRoleIds };
}

export function buildTicketPermissionOverwrites(
  client: WallEClient,
  interaction: TicketInteraction,
  category: any | null,
) {
  const { supportRoleIds, observerRoleIds } = buildSupportRoleSets(category);

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
        PermissionsBitField.Flags.ReadMessageHistory,
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

  return { permissionOverwrites, supportRoleIds, observerRoleIds };
}

async function reserveTicketNumber(
  dbClient: PoolClient,
  guildId: string,
  userId: string,
  maxTicketsPerUser: number,
): Promise<TicketReservation> {
  await dbClient.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [guildId, userId]);

  const openTicketResult = await dbClient.query(
    `SELECT channel_id
     FROM tickets
     WHERE guild_id = $1 AND user_id = $2 AND status IN ('open', 'claimed')
     ORDER BY created_at DESC`,
    [guildId, userId],
  );

  if (openTicketResult.rows.length >= maxTicketsPerUser) {
    return {
      ticketNumber: 0,
      existingChannelId: openTicketResult.rows[0]?.channel_id,
    };
  }

  const counterResult = await dbClient.query(
    `INSERT INTO ticket_counters (guild_id, next_ticket_number)
     VALUES ($1, 2)
     ON CONFLICT (guild_id)
     DO UPDATE SET next_ticket_number = ticket_counters.next_ticket_number + 1
     RETURNING next_ticket_number - 1 AS ticket_number`,
    [guildId],
  );

  return { ticketNumber: counterResult.rows[0].ticket_number };
}

async function finalizeTicketRecord(
  dbClient: PoolClient,
  guildId: string,
  panelId: number,
  categoryId: number | null,
  channelId: string,
  userId: string,
  ticketNumber: number,
  topic: string | null,
) {
  const insertResult = await dbClient.query(
    `INSERT INTO tickets (guild_id, panel_id, category_id, channel_id, user_id, ticket_number, topic, last_activity)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     RETURNING id`,
    [guildId, panelId, categoryId, channelId, userId, ticketNumber, topic],
  );

  return insertResult.rows[0].id as number;
}

function buildTicketWelcomeEmbed(
  interaction: TicketInteraction,
  ticketNumber: number,
  category: any | null,
  config: any,
  formAnswers: Record<string, string> | null,
) {
  const welcomeEmbed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle(`Ticket #${ticketNumber.toString().padStart(4, '0')}${category ? ` - ${category.name}` : ''}`)
    .setDescription(
      `Hello ${interaction.user}!\n\n` +
      (config.welcome_message || 'A staff member will be with you shortly.\nPlease describe your issue in detail.'),
    )
    .setTimestamp();

  if (formAnswers && Object.keys(formAnswers).length > 0) {
    for (const [label, value] of Object.entries(formAnswers)) {
      welcomeEmbed.addFields({ name: label, value: value || '(no answer)', inline: false });
    }
  }

  return welcomeEmbed;
}

async function resolveOpenCategoryParent(
  interaction: TicketInteraction,
  panel: any,
): Promise<string | undefined> {
  if (!panel.category_open_id) return undefined;

  const channelCount = interaction.guild!.channels.cache.filter(
    (channel: GuildBasedChannel) => channel.parentId === panel.category_open_id,
  ).size;

  if (channelCount >= 50 && panel.overflow_category_id) {
    return panel.overflow_category_id;
  }

  return panel.category_open_id;
}

export async function createManagedTicket(
  client: WallEClient,
  interaction: TicketInteraction,
  input: TicketCreationInput,
) {
  const { panel, category, config, formAnswers } = input;

  await interaction.deferReply({ ephemeral: true });

  const reservation = await client.db.transaction(async dbClient =>
    reserveTicketNumber(
      dbClient,
      interaction.guild!.id,
      interaction.user.id,
      config.max_tickets_per_user || 1,
    ),
  );

  if (reservation.existingChannelId) {
    await interaction.editReply({
      content: `You already have an open ticket: <#${reservation.existingChannelId}>`,
    });
    return null;
  }

  const ticketNumber = reservation.ticketNumber;
  const channelName = resolveChannelName(panel.channel_name_template || '{type}-{number}', {
    type: category?.name || 'ticket',
    number: ticketNumber,
    username: interaction.user.username,
    userid: interaction.user.id,
  });

  const { permissionOverwrites, supportRoleIds } = buildTicketPermissionOverwrites(client, interaction, category);

  let ticketChannel: TextChannel | null = null;

  try {
    ticketChannel = await interaction.guild!.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: await resolveOpenCategoryParent(interaction, panel),
      permissionOverwrites,
    }) as TextChannel;

    const ticketId = await client.db.transaction(async dbClient =>
      finalizeTicketRecord(
        dbClient,
        interaction.guild!.id,
        panel.id,
        category?.id || null,
        ticketChannel!.id,
        interaction.user.id,
        ticketNumber,
        formAnswers ? JSON.stringify(formAnswers) : null,
      ),
    );

    const closeBtn = new ButtonBuilder()
      .setCustomId(`ticket_close_confirm:${ticketId}:`)
      .setLabel('Close Ticket')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(closeBtn);
    const welcomeEmbed = buildTicketWelcomeEmbed(interaction, ticketNumber, category, config, formAnswers);
    const pings = supportRoleIds.map(roleId => `<@&${roleId}>`).join(' ');

    await ticketChannel.send({
      content: `${interaction.user}${pings ? ` | ${pings}` : ''}`,
      embeds: [welcomeEmbed],
      components: [row],
    });

    await interaction.editReply({ content: `Your ticket has been created: ${ticketChannel}` });

    return { ticketChannel, ticketId, ticketNumber };
  } catch (error) {
    if (ticketChannel) {
      try {
        await ticketChannel.delete('Cleaning up failed ticket creation');
      } catch {
        // Best-effort cleanup only.
      }
    }

    throw error;
  }
}

/**
 * Close a ticket only after its transcript has been delivered successfully.
 * This is the single close path for both user actions and automatic closure.
 */
export async function closeTicket(
  client: WallEClient,
  guild: Guild,
  ticket: ManagedTicketRecord,
  closedBy: string,
  reason: string,
): Promise<CloseTicketResult> {
  const channel = (guild.channels.cache.get(ticket.channel_id)
    ?? await guild.channels.fetch(ticket.channel_id).catch(() => null)) as TextChannel | null;

  if (!channel || !channel.isTextBased()) {
    return { closed: false, error: 'Ticket channel not found.' };
  }

  if (!ticket.transcript_channel_id) {
    return { closed: false, error: TRANSCRIPT_REQUIRED_MESSAGE };
  }

  try {
    const transcriptChannel = (guild.channels.cache.get(ticket.transcript_channel_id)
      ?? await guild.channels.fetch(ticket.transcript_channel_id).catch(() => null));
    if (!transcriptChannel?.isTextBased() || !('send' in transcriptChannel)) {
      return { closed: false, error: TRANSCRIPT_REQUIRED_MESSAGE };
    }

    const allMessages: any[] = [];
    let lastId: string | undefined;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const batch = await channel.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) });
      if (batch.size === 0) break;
      allMessages.push(...batch.values());
      lastId = batch.last()?.id;
      if (batch.size < 100) break;
    }
    allMessages.reverse();

    const transcriptText = buildTranscript(channel.name, ticket.user_id, ticket.created_at, allMessages);
    const transcriptEmbed = new EmbedBuilder()
      .setColor(COLORS.MUTED)
      .setTitle(`Ticket Transcript - ${channel.name}`)
      .addFields(
        { name: 'User', value: `<@${ticket.user_id}>`, inline: true },
        { name: 'Closed By', value: `<@${closedBy}>`, inline: true },
      )
      .setTimestamp();
    if (reason) transcriptEmbed.addFields({ name: 'Reason', value: reason, inline: false });

    const transcriptFile = () => ({
      attachment: Buffer.from(transcriptText, 'utf-8'),
      name: `transcript-${channel.name}.txt`,
    });

    let transcriptMessage: { id: string };
    try {
      transcriptMessage = await transcriptChannel.send({
        embeds: [transcriptEmbed],
        files: [transcriptFile()],
      });
    } catch (error) {
      logger.error(`Failed to post transcript for ticket ${ticket.id}:`, error);
      return { closed: false, error: TRANSCRIPT_UNREACHABLE_MESSAGE };
    }

    await client.db.pool.query(
      `UPDATE tickets SET status = 'closed', closed_by = $2, closed_at = NOW(),
       close_reason = $3, transcript_message_id = $4 WHERE id = $1`,
      [ticket.id, closedBy, reason || null, transcriptMessage.id],
    );

    // Best-effort copy for the requestor; the transcript channel is the record.
    try {
      const ticketUser = await client.users.fetch(ticket.user_id);
      await ticketUser.send({
        content: `Your ticket ${channel.name} in ${guild.name} has been closed.${reason ? `\nReason: ${reason}` : ''}`,
        files: [transcriptFile()],
      });
    } catch {
      // User has DMs disabled.
    }

    if (ticket.category_closed_id) {
      try {
        await channel.setParent(ticket.category_closed_id, { lockPermissions: false });
        await channel.setName(`closed-${channel.name}`.substring(0, 100));
      } catch (error) {
        logger.error(`Ticket ${ticket.id} was closed but could not be moved to its archive category:`, error);
      }
    } else {
      setTimeout(async () => {
        try {
          await channel.delete();
        } catch {
          // Already deleted.
        }
      }, 5000);
    }

    return { closed: true, transcriptMessageId: transcriptMessage.id };
  } catch (error) {
    logger.error(`Error closing ticket ${ticket.id}:`, error);
    return { closed: false, error: 'Failed to close ticket. Please try again.' };
  }
}
