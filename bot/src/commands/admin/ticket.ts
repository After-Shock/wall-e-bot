import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextChannel,
} from 'discord.js';
import type { Command } from '../../structures/Command.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { COLORS } from '@wall-e/shared';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket system management')

    // panel subcommand group
    .addSubcommandGroup(group =>
      group.setName('panel').setDescription('Manage ticket panels')
        .addSubcommand(sub =>
          sub.setName('create')
            .setDescription('Create a new ticket panel')
            .addStringOption(opt =>
              opt.setName('name').setDescription('Panel name').setRequired(true))
            .addStringOption(opt =>
              opt.setName('style')
                .setDescription('Ticket creation style')
                .addChoices(
                  { name: 'Channel (default)', value: 'channel' },
                ))
            .addStringOption(opt =>
              opt.setName('type')
                .setDescription('Buttons or dropdown selector')
                .addChoices(
                  { name: 'Buttons (default)', value: 'buttons' },
                  { name: 'Dropdown', value: 'dropdown' },
                )))
        .addSubcommand(sub =>
          sub.setName('send')
            .setDescription('Send panel message to a channel')
            .addIntegerOption(opt =>
              opt.setName('panel_id').setDescription('Panel ID from /ticket panel list').setRequired(true))
            .addChannelOption(opt =>
              opt.setName('channel')
                .setDescription('Channel to send the panel to')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)))
        .addSubcommand(sub =>
          sub.setName('list')
            .setDescription('List all panels in this server'))
        .addSubcommand(sub =>
          sub.setName('delete')
            .setDescription('Delete a panel')
            .addIntegerOption(opt =>
              opt.setName('panel_id').setDescription('Panel ID to delete').setRequired(true))))

    // category subcommand group
    .addSubcommandGroup(group =>
      group.setName('category').setDescription('Manage ticket categories within a panel')
        .addSubcommand(sub =>
          sub.setName('add')
            .setDescription('Add a category to a panel')
            .addIntegerOption(opt =>
              opt.setName('panel_id').setDescription('Panel ID').setRequired(true))
            .addStringOption(opt =>
              opt.setName('name').setDescription('Category name').setRequired(true))
            .addRoleOption(opt =>
              opt.setName('support_role').setDescription('Role that handles this category').setRequired(true))
            .addRoleOption(opt =>
              opt.setName('support_role_2').setDescription('Additional support role'))
            .addRoleOption(opt =>
              opt.setName('support_role_3').setDescription('Additional support role'))
            .addRoleOption(opt =>
              opt.setName('support_role_4').setDescription('Additional support role'))
            .addRoleOption(opt =>
              opt.setName('support_role_5').setDescription('Additional support role'))
            .addStringOption(opt =>
              opt.setName('emoji').setDescription('Emoji for this category'))
            .addStringOption(opt =>
              opt.setName('description').setDescription('Short description')))
        .addSubcommand(sub =>
          sub.setName('list')
            .setDescription('List categories for a panel')
            .addIntegerOption(opt =>
              opt.setName('panel_id').setDescription('Panel ID').setRequired(true))))

    // ticket management subcommands
    .addSubcommand(sub =>
      sub.setName('close')
        .setDescription('Close the current ticket')
        .addStringOption(opt =>
          opt.setName('reason').setDescription('Reason for closing')))
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a user to the current ticket')
        .addUserOption(opt =>
          opt.setName('user').setDescription('User to add').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a user from the current ticket')
        .addUserOption(opt =>
          opt.setName('user').setDescription('User to remove').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('rename')
        .setDescription('Rename the current ticket')
        .addStringOption(opt =>
          opt.setName('name').setDescription('New ticket name').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('transcript')
        .setDescription('Save a transcript of the current ticket'))
    .addSubcommand(sub =>
      sub.setName('claim')
        .setDescription('Claim the current ticket as yours'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  guildOnly: true,

  async execute(client, interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand();

    if (group === 'panel') {
      switch (subcommand) {
        case 'create': {
          const name = interaction.options.getString('name', true);
          const style = interaction.options.getString('style') || 'channel';
          const panelType = interaction.options.getString('type') || 'buttons';

          const result = await client.db.pool.query(
            `INSERT INTO ticket_panels (guild_id, name, style, panel_type)
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [interaction.guild!.id, name, style, panelType],
          );

          const panelId = result.rows[0].id;
          await interaction.reply({
            embeds: [successEmbed('Panel Created',
              `Panel **${name}** created (ID: ${panelId}).\n\n` +
              'Next steps:\n' +
              `1. Add categories: \`/ticket category add panel_id:${panelId} name:...\`\n` +
              '2. Configure in dashboard\n' +
              `3. Send panel: \`/ticket panel send panel_id:${panelId} #channel\``,
            )],
            ephemeral: true,
          });
          break;
        }

        case 'send': {
          const panelId = interaction.options.getInteger('panel_id', true);
          const channel = interaction.options.getChannel('channel', true) as TextChannel;

          const panelResult = await client.db.pool.query(
            'SELECT * FROM ticket_panels WHERE id = $1 AND guild_id = $2',
            [panelId, interaction.guild!.id],
          );

          if (panelResult.rows.length === 0) {
            await interaction.reply({ embeds: [errorEmbed('Error', 'Panel not found.')], ephemeral: true });
            return;
          }

          const rootPanel = panelResult.rows[0];

          // Determine the set of panels to include: stack group (sorted) or just this panel
          let panelsToSend: any[];
          if (rootPanel.group_id) {
            const stackResult = await client.db.pool.query(
              'SELECT * FROM ticket_panels WHERE group_id = $1 ORDER BY stack_position, id',
              [rootPanel.group_id],
            );
            panelsToSend = stackResult.rows;
          } else {
            panelsToSend = [rootPanel];
          }

          // Fetch categories for all panels at once
          const allPanelIds = panelsToSend.map((p: any) => p.id);
          const catResult = await client.db.pool.query(
            'SELECT * FROM ticket_categories WHERE panel_id = ANY($1::int[]) ORDER BY panel_id, position',
            [allPanelIds],
          );
          const catsByPanel: Record<number, any[]> = {};
          for (const cat of catResult.rows) {
            if (!catsByPanel[cat.panel_id]) catsByPanel[cat.panel_id] = [];
            catsByPanel[cat.panel_id].push(cat);
          }

          // Build embed description across all panels
          const descParts: string[] = [];
          for (const p of panelsToSend) {
            const cats = catsByPanel[p.id] || [];
            if (cats.length > 0) {
              descParts.push(`**${p.name}**\n${cats.map((c: any) => `${c.emoji || '📋'} **${c.name}**${c.description ? ` — ${c.description}` : ''}`).join('\n')}`);
            } else {
              descParts.push(`**${p.name}**\nClick below to open a ticket.`);
            }
          }

          const embed = new EmbedBuilder()
            .setColor(COLORS.PRIMARY)
            .setTitle('🎫 Open a Ticket')
            .setDescription(descParts.join('\n\n'))
            .setFooter({ text: 'Wall-E Ticket System' });

          // Build one ActionRow per panel (Discord limit: 5 rows)
          const components: ActionRowBuilder<any>[] = [];
          for (const p of panelsToSend.slice(0, 5)) {
            const cats = catsByPanel[p.id] || [];
            if (p.panel_type === 'dropdown' && cats.length > 0) {
              const select = new StringSelectMenuBuilder()
                .setCustomId(`ticket_select:${p.id}`)
                .setPlaceholder(`${p.name} — select type...`)
                .addOptions(cats.map((c: any) =>
                  new StringSelectMenuOptionBuilder()
                    .setLabel(c.name)
                    .setValue(c.id.toString())
                    .setDescription((c.description || c.name).substring(0, 100))
                    .setEmoji(c.emoji || '📋'),
                ));
              components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
            } else if (cats.length > 0) {
              const buttons = cats.slice(0, 5).map((c: any) =>
                new ButtonBuilder()
                  .setCustomId(`ticket_open:${p.id}:${c.id}`)
                  .setLabel(c.name.substring(0, 80))
                  .setEmoji(c.emoji || '🎫')
                  .setStyle(ButtonStyle.Primary),
              );
              components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons));
            } else {
              const btn = new ButtonBuilder()
                .setCustomId(`ticket_open:${p.id}:0`)
                .setLabel(p.name.substring(0, 80))
                .setEmoji('🎫')
                .setStyle(ButtonStyle.Primary);
              components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(btn));
            }
          }

          const msg = await channel.send({ embeds: [embed], components });

          // Record message ID on all panels in the stack
          for (const p of panelsToSend) {
            await client.db.pool.query(
              'UPDATE ticket_panels SET panel_channel_id = $1, panel_message_id = $2 WHERE id = $3',
              [channel.id, msg.id, p.id],
            );
          }

          const stackNote = panelsToSend.length > 1 ? ` (${panelsToSend.length} panels stacked)` : '';
          await interaction.reply({
            embeds: [successEmbed('Panel Sent', `Panel sent to ${channel}${stackNote}.`)],
            ephemeral: true,
          });
          break;
        }

        case 'list': {
          const panels = await client.db.pool.query(
            'SELECT * FROM ticket_panels WHERE guild_id = $1 ORDER BY id',
            [interaction.guild!.id],
          );

          if (panels.rows.length === 0) {
            await interaction.reply({
              embeds: [errorEmbed('No Panels', 'No ticket panels configured. Use `/ticket panel create` to get started.')],
              ephemeral: true,
            });
            return;
          }

          const embed = new EmbedBuilder()
            .setColor(COLORS.PRIMARY)
            .setTitle('Ticket Panels')
            .setDescription(panels.rows.map((p: any) =>
              `**ID ${p.id}** — ${p.name} (${p.style}/${p.panel_type})`,
            ).join('\n'));

          await interaction.reply({ embeds: [embed], ephemeral: true });
          break;
        }

        case 'delete': {
          const panelId = interaction.options.getInteger('panel_id', true);
          const result = await client.db.pool.query(
            'DELETE FROM ticket_panels WHERE id = $1 AND guild_id = $2 RETURNING name',
            [panelId, interaction.guild!.id],
          );

          if (result.rowCount === 0) {
            await interaction.reply({ embeds: [errorEmbed('Error', 'Panel not found.')], ephemeral: true });
            return;
          }

          await interaction.reply({
            embeds: [successEmbed('Panel Deleted', `Panel **${result.rows[0].name}** has been deleted.`)],
            ephemeral: true,
          });
          break;
        }
      }
      return;
    }

    if (group === 'category') {
      switch (subcommand) {
        case 'add': {
          const panelId = interaction.options.getInteger('panel_id', true);
          const name = interaction.options.getString('name', true);
          const emoji = interaction.options.getString('emoji') || '🎫';
          const description = interaction.options.getString('description') || '';
          const supportRoles = [
            interaction.options.getRole('support_role', true),
            interaction.options.getRole('support_role_2'),
            interaction.options.getRole('support_role_3'),
            interaction.options.getRole('support_role_4'),
            interaction.options.getRole('support_role_5'),
          ]
            .filter((role): role is NonNullable<typeof role> => Boolean(role))
            .filter((role, index, roles) => roles.findIndex(candidate => candidate.id === role.id) === index);

          const panelCheck = await client.db.pool.query(
            'SELECT id FROM ticket_panels WHERE id = $1 AND guild_id = $2',
            [panelId, interaction.guild!.id],
          );
          if (panelCheck.rows.length === 0) {
            await interaction.reply({ embeds: [errorEmbed('Error', 'Panel not found.')], ephemeral: true });
            return;
          }

          const posResult = await client.db.pool.query(
            'SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM ticket_categories WHERE panel_id = $1',
            [panelId],
          );
          const position = posResult.rows[0].next_pos;

          await client.db.pool.query(
            `INSERT INTO ticket_categories (panel_id, guild_id, name, emoji, description, support_role_ids, position)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [panelId, interaction.guild!.id, name, emoji, description, supportRoles.map(role => role.id), position],
          );

          await interaction.reply({
            embeds: [successEmbed('Category Added',
              `Category **${emoji} ${name}** added to panel ${panelId} for ${supportRoles.map(role => role.toString()).join(', ')}.\n` +
              'Re-send the panel with `/ticket panel send` to update the Discord message.',
            )],
            ephemeral: true,
          });
          break;
        }

        case 'list': {
          const panelId = interaction.options.getInteger('panel_id', true);
          const cats = await client.db.pool.query(
            'SELECT * FROM ticket_categories WHERE panel_id = $1 AND guild_id = $2 ORDER BY position',
            [panelId, interaction.guild!.id],
          );

          if (cats.rows.length === 0) {
            await interaction.reply({
              embeds: [errorEmbed('No Categories', `No categories in panel ${panelId}. Add with \`/ticket category add\`.`)],
              ephemeral: true,
            });
            return;
          }

          const embed = new EmbedBuilder()
            .setColor(COLORS.PRIMARY)
            .setTitle(`Categories in Panel ${panelId}`)
            .setDescription(cats.rows.map((c: any) =>
              `**ID ${c.id}** — ${c.emoji || ''} ${c.name}: ${c.description || '(no description)'}`,
            ).join('\n'));

          await interaction.reply({ embeds: [embed], ephemeral: true });
          break;
        }
      }
      return;
    }

    // ---- Ticket management subcommands ----
    switch (subcommand) {
      case 'close': {
        const ticket = await client.db.pool.query(
          'SELECT * FROM tickets WHERE guild_id = $1 AND channel_id = $2 AND status IN (\'open\', \'claimed\')',
          [interaction.guild!.id, interaction.channel!.id],
        );
        if (ticket.rows.length === 0) {
          await interaction.reply({ embeds: [errorEmbed('Error', 'This is not an open ticket channel.')], ephemeral: true });
          return;
        }

        const reason = interaction.options.getString('reason') || 'No reason provided';
        const encodedReason = encodeURIComponent(reason).slice(0, 80);

        const confirmBtn = new ButtonBuilder()
          .setCustomId(`ticket_close_confirm:${ticket.rows[0].id}:${encodedReason}`)
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
            .setDescription(`**Reason:** ${reason}\n\nClick confirm to close this ticket.`),
          ],
          components: [new ActionRowBuilder<ButtonBuilder>().addComponents(confirmBtn, cancelBtn)],
        });
        break;
      }

      case 'add': {
        const ticket = await client.db.pool.query(
          'SELECT * FROM tickets WHERE guild_id = $1 AND channel_id = $2 AND status IN (\'open\', \'claimed\')',
          [interaction.guild!.id, interaction.channel!.id],
        );
        if (ticket.rows.length === 0) {
          await interaction.reply({ embeds: [errorEmbed('Error', 'This is not an open ticket channel.')], ephemeral: true });
          return;
        }
        const user = interaction.options.getUser('user', true);
        const ch = interaction.channel as TextChannel;
        await ch.permissionOverwrites.create(user, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        });
        await interaction.reply({ embeds: [successEmbed('User Added', `${user} has been added to this ticket.`)] });
        break;
      }

      case 'remove': {
        const ticket = await client.db.pool.query(
          'SELECT * FROM tickets WHERE guild_id = $1 AND channel_id = $2 AND status IN (\'open\', \'claimed\')',
          [interaction.guild!.id, interaction.channel!.id],
        );
        if (ticket.rows.length === 0) {
          await interaction.reply({ embeds: [errorEmbed('Error', 'This is not an open ticket channel.')], ephemeral: true });
          return;
        }
        const user = interaction.options.getUser('user', true);
        await (interaction.channel as TextChannel).permissionOverwrites.delete(user);
        await interaction.reply({ embeds: [successEmbed('User Removed', `${user} has been removed from this ticket.`)] });
        break;
      }

      case 'rename': {
        const ticket = await client.db.pool.query(
          'SELECT * FROM tickets WHERE guild_id = $1 AND channel_id = $2 AND status IN (\'open\', \'claimed\')',
          [interaction.guild!.id, interaction.channel!.id],
        );
        if (ticket.rows.length === 0) {
          await interaction.reply({ embeds: [errorEmbed('Error', 'This is not an open ticket channel.')], ephemeral: true });
          return;
        }
        const name = interaction.options.getString('name', true);
        await (interaction.channel as TextChannel).setName(`ticket-${name}`);
        await interaction.reply({ embeds: [successEmbed('Ticket Renamed', `Renamed to \`ticket-${name}\`.`)] });
        break;
      }

      case 'transcript': {
        const ticket = await client.db.pool.query(
          'SELECT * FROM tickets WHERE guild_id = $1 AND channel_id = $2',
          [interaction.guild!.id, interaction.channel!.id],
        );
        if (ticket.rows.length === 0) {
          await interaction.reply({ embeds: [errorEmbed('Error', 'This is not a ticket channel.')], ephemeral: true });
          return;
        }

        await interaction.deferReply();
        const ch = interaction.channel as TextChannel;

        // Paginate to get all messages
        const allMessages: any[] = [];
        let lastId: string | undefined;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const batch = await ch.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) });
          if (batch.size === 0) break;
          allMessages.push(...batch.values());
          lastId = batch.last()?.id;
          if (batch.size < 100) break;
        }
        allMessages.reverse();

        const { buildTranscript } = await import('../../utils/ticketUtils.js');
        const text = buildTranscript(ch.name, ticket.rows[0].user_id, ticket.rows[0].created_at, allMessages);

        await interaction.editReply({
          content: '📝 Ticket transcript:',
          files: [{ attachment: Buffer.from(text, 'utf-8'), name: `transcript-${ch.name}.txt` }],
        });
        break;
      }

      case 'claim': {
        const ticket = await client.db.pool.query(
          'SELECT * FROM tickets WHERE guild_id = $1 AND channel_id = $2 AND status IN (\'open\', \'claimed\')',
          [interaction.guild!.id, interaction.channel!.id],
        );
        if (ticket.rows.length === 0) {
          await interaction.reply({ embeds: [errorEmbed('Error', 'This is not an open ticket channel.')], ephemeral: true });
          return;
        }
        await client.db.pool.query(
          'UPDATE tickets SET claimed_by = $3, status = \'claimed\' WHERE id = $1 AND guild_id = $2',
          [ticket.rows[0].id, interaction.guild!.id, interaction.user.id],
        );
        await interaction.reply({ embeds: [successEmbed('Ticket Claimed', `${interaction.user} has claimed this ticket.`)] });
        break;
      }
    }
  },
};

export default command;
