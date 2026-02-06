import { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  EmbedBuilder, 
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ComponentType
} from 'discord.js';
import type { Command } from '../../structures/Command.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { COLORS } from '@wall-e/shared';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('Manage reaction roles')
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('Create a reaction role message')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('Channel to send the message')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('title')
            .setDescription('Title of the reaction role message')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('description')
            .setDescription('Description/instructions')
            .setRequired(false))
        .addStringOption(opt =>
          opt.setName('type')
            .setDescription('Type of reaction role')
            .setRequired(false)
            .addChoices(
              { name: 'Buttons', value: 'buttons' },
              { name: 'Dropdown Menu', value: 'dropdown' },
              { name: 'Reactions', value: 'reactions' }
            )))
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a role to a reaction role message')
        .addStringOption(opt =>
          opt.setName('message_id')
            .setDescription('Message ID of the reaction role message')
            .setRequired(true))
        .addRoleOption(opt =>
          opt.setName('role')
            .setDescription('Role to add')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('emoji')
            .setDescription('Emoji for the role')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('label')
            .setDescription('Button/dropdown label')
            .setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a role from a reaction role message')
        .addStringOption(opt =>
          opt.setName('message_id')
            .setDescription('Message ID')
            .setRequired(true))
        .addRoleOption(opt =>
          opt.setName('role')
            .setDescription('Role to remove')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all reaction role messages'))
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Delete a reaction role message')
        .addStringOption(opt =>
          opt.setName('message_id')
            .setDescription('Message ID to delete')
            .setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  permissions: [PermissionFlagsBits.ManageRoles],
  guildOnly: true,

  async execute(client, interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'create': {
        const channel = interaction.options.getChannel('channel', true);
        const title = interaction.options.getString('title', true);
        const description = interaction.options.getString('description') || 'React to get your roles!';
        const type = interaction.options.getString('type') || 'buttons';

        const embed = new EmbedBuilder()
          .setColor(COLORS.PRIMARY)
          .setTitle(`🎭 ${title}`)
          .setDescription(description)
          .setFooter({ text: 'Click a button or react to get a role!' });

        const textChannel = channel as any;
        const message = await textChannel.send({ embeds: [embed] });

        // Store in database
        await client.db.pool.query(
          `INSERT INTO reaction_role_messages (guild_id, channel_id, message_id, title, type)
           VALUES ($1, $2, $3, $4, $5)`,
          [interaction.guild!.id, channel.id, message.id, title, type]
        );

        await interaction.reply({
          embeds: [successEmbed('Reaction Role Created', 
            `Created reaction role message in ${channel}.\n\nNow use \`/reactionrole add\` to add roles to it.\nMessage ID: \`${message.id}\``
          )],
          ephemeral: true
        });
        break;
      }

      case 'add': {
        const messageId = interaction.options.getString('message_id', true);
        const role = interaction.options.getRole('role', true);
        const emoji = interaction.options.getString('emoji', true);
        const label = interaction.options.getString('label') || role.name;

        // Get the reaction role message
        const rrMessage = await client.db.pool.query(
          'SELECT * FROM reaction_role_messages WHERE guild_id = $1 AND message_id = $2',
          [interaction.guild!.id, messageId]
        );

        if (rrMessage.rows.length === 0) {
          await interaction.reply({
            embeds: [errorEmbed('Error', 'Reaction role message not found.')],
            ephemeral: true
          });
          return;
        }

        const rr = rrMessage.rows[0];

        // Check role hierarchy
        if (role.position >= interaction.guild!.members.me!.roles.highest.position) {
          await interaction.reply({
            embeds: [errorEmbed('Error', 'I cannot assign this role as it is higher than my highest role.')],
            ephemeral: true
          });
          return;
        }

        // Add to database
        await client.db.pool.query(
          `INSERT INTO reaction_roles (guild_id, channel_id, message_id, emoji, role_id, label)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (message_id, emoji) DO UPDATE SET role_id = $5, label = $6`,
          [interaction.guild!.id, rr.channel_id, messageId, emoji, role.id, label]
        );

        // Get all roles for this message
        const allRoles = await client.db.pool.query(
          'SELECT * FROM reaction_roles WHERE message_id = $1',
          [messageId]
        );

        // Update the message
        const channel = await interaction.guild!.channels.fetch(rr.channel_id);
        if (channel?.isTextBased()) {
          const message = await channel.messages.fetch(messageId);
          
          if (rr.type === 'buttons') {
            const rows: ActionRowBuilder<ButtonBuilder>[] = [];
            let currentRow = new ActionRowBuilder<ButtonBuilder>();
            
            for (const r of allRoles.rows) {
              if (currentRow.components.length >= 5) {
                rows.push(currentRow);
                currentRow = new ActionRowBuilder<ButtonBuilder>();
              }
              
              currentRow.addComponents(
                new ButtonBuilder()
                  .setCustomId(`rr_${r.role_id}`)
                  .setLabel(r.label)
                  .setEmoji(r.emoji)
                  .setStyle(ButtonStyle.Secondary)
              );
            }
            
            if (currentRow.components.length > 0) {
              rows.push(currentRow);
            }

            await message.edit({ components: rows });
          } else if (rr.type === 'dropdown') {
            const select = new StringSelectMenuBuilder()
              .setCustomId('rr_select')
              .setPlaceholder('Select roles...')
              .setMinValues(0)
              .setMaxValues(allRoles.rows.length)
              .addOptions(allRoles.rows.map(r => ({
                label: r.label,
                value: r.role_id,
                emoji: r.emoji,
              })));

            const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
            await message.edit({ components: [row] });
          } else {
            // Add reaction
            await message.react(emoji);
          }
        }

        await interaction.reply({
          embeds: [successEmbed('Role Added', `Added ${role} with ${emoji} to the reaction role message.`)],
          ephemeral: true
        });
        break;
      }

      case 'remove': {
        const messageId = interaction.options.getString('message_id', true);
        const role = interaction.options.getRole('role', true);

        const result = await client.db.pool.query(
          'DELETE FROM reaction_roles WHERE guild_id = $1 AND message_id = $2 AND role_id = $3 RETURNING emoji',
          [interaction.guild!.id, messageId, role.id]
        );

        if (result.rowCount === 0) {
          await interaction.reply({
            embeds: [errorEmbed('Error', 'Role not found on this message.')],
            ephemeral: true
          });
          return;
        }

        await interaction.reply({
          embeds: [successEmbed('Role Removed', `Removed ${role} from the reaction role message.`)],
          ephemeral: true
        });
        break;
      }

      case 'list': {
        const messages = await client.db.pool.query(
          `SELECT rrm.*, COUNT(rr.id) as role_count
           FROM reaction_role_messages rrm
           LEFT JOIN reaction_roles rr ON rrm.message_id = rr.message_id
           WHERE rrm.guild_id = $1
           GROUP BY rrm.id`,
          [interaction.guild!.id]
        );

        if (messages.rows.length === 0) {
          await interaction.reply({
            embeds: [errorEmbed('No Reaction Roles', 'No reaction role messages found.')],
            ephemeral: true
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(COLORS.PRIMARY)
          .setTitle('🎭 Reaction Role Messages')
          .setDescription(messages.rows.map(m => 
            `**${m.title}**\nChannel: <#${m.channel_id}>\nMessage ID: \`${m.message_id}\`\nRoles: ${m.role_count}\nType: ${m.type}`
          ).join('\n\n'));

        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }

      case 'delete': {
        const messageId = interaction.options.getString('message_id', true);

        // Get message info
        const rrMessage = await client.db.pool.query(
          'SELECT * FROM reaction_role_messages WHERE guild_id = $1 AND message_id = $2',
          [interaction.guild!.id, messageId]
        );

        if (rrMessage.rows.length === 0) {
          await interaction.reply({
            embeds: [errorEmbed('Error', 'Reaction role message not found.')],
            ephemeral: true
          });
          return;
        }

        // Delete from database
        await client.db.pool.query(
          'DELETE FROM reaction_roles WHERE message_id = $1',
          [messageId]
        );
        await client.db.pool.query(
          'DELETE FROM reaction_role_messages WHERE message_id = $1',
          [messageId]
        );

        // Try to delete the actual message
        try {
          const channel = await interaction.guild!.channels.fetch(rrMessage.rows[0].channel_id);
          if (channel?.isTextBased()) {
            const message = await channel.messages.fetch(messageId);
            await message.delete();
          }
        } catch {
          // Message may already be deleted
        }

        await interaction.reply({
          embeds: [successEmbed('Deleted', 'Reaction role message has been deleted.')],
          ephemeral: true
        });
        break;
      }
    }
  },
};

export default command;
