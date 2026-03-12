import {
  ChannelType,
  EmbedBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildBasedChannel,
  type TextChannel,
} from 'discord.js';
import { COLORS } from '@wall-e/shared';
import type { PoolClient } from 'pg';
import type { WallEClient } from '../structures/Client.js';
import { resolveChannelName } from '../utils/ticketUtils.js';

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

  if (panel.style !== 'channel') {
    throw new Error('Thread-style tickets are not supported yet. Please switch this panel to channel tickets.');
  }

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
      .setCustomId(`ticket_close_confirm:${ticketId}:No%20reason%20provided`)
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

    try {
      await interaction.user.send(
        `Ticket Created\nYour support ticket has been opened in ${interaction.guild!.name}: ${ticketChannel.name}`,
      );
    } catch {
      // DMs disabled.
    }

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
