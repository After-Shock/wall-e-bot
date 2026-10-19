import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../../structures/Command.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { COLORS } from '@wall-e/shared';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('offenses')
    .setDescription('Reply-moderation offense history')
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('Show reply-moderation actions taken against a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('The user to check')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('reset')
        .setDescription("Clear a user's offense count (admins only)")
        .addUserOption(option =>
          option.setName('user')
            .setDescription('The user to reset')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('command')
            .setDescription('Only reset this command (e.g. rule2); default is all')))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  permissions: [PermissionFlagsBits.ManageMessages],
  guildOnly: true,

  async execute(client, interaction) {
    const guildId = interaction.guild!.id;

    // Offense history stays in mod channels: only runs where a reply-moderation
    // command posts its log (e.g. #mod-transcripts).
    const logChannel = await client.db.pool.query(
      'SELECT 1 FROM custom_commands WHERE guild_id = $1 AND reply_log_channel_id = $2 LIMIT 1',
      [guildId, interaction.channelId],
    );
    if (!logChannel.rowCount) {
      await interaction.reply({ embeds: [errorEmbed('Wrong Channel', 'Use this command in the mod log channel.')], ephemeral: true });
      return;
    }

    const target = interaction.options.getUser('user', true);

    if (interaction.options.getSubcommand() === 'reset') {
      // Discord can't gate a single subcommand, so admin-only is checked here
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ embeds: [errorEmbed('Missing Permissions', 'Only admins can reset offenses.')], ephemeral: true });
        return;
      }
      const only = interaction.options.getString('command')?.replace(/^!/, '') ?? null;
      const { rowCount } = await client.db.pool.query(
        `DELETE FROM custom_command_actions a
         USING custom_commands c
         WHERE c.id = a.command_id AND a.guild_id = $1 AND a.target_id = $2
           AND ($3::text IS NULL OR LOWER(c.name) = LOWER($3))`,
        [guildId, target.id, only],
      );
      // Public reply so other mods in the log channel see who reset what
      await interaction.reply({
        embeds: [successEmbed('Offenses Reset', `${interaction.user} cleared **${rowCount ?? 0}** ${only ? `**${only}** ` : ''}offense(s) for ${target} (${target.id}).`)],
      });
      return;
    }

    const { rows } = await client.db.pool.query<{ name: string; moderator_id: string; message_content: string | null; created_at: Date }>(
      `SELECT c.name, a.moderator_id, a.message_content, a.created_at
       FROM custom_command_actions a
       JOIN custom_commands c ON c.id = a.command_id
       WHERE a.guild_id = $1 AND a.target_id = $2
       ORDER BY a.created_at DESC`,
      [guildId, target.id],
    );

    if (rows.length === 0) {
      await interaction.reply({ embeds: [successEmbed('No Offenses', `**${target.tag}** has no recorded offenses.`)] });
      return;
    }

    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.name, (counts.get(row.name) ?? 0) + 1);

    const embed = new EmbedBuilder()
      .setColor(COLORS.WARNING)
      .setTitle(`🛡️ Offenses for ${target.tag}`)
      .setDescription(`Total: **${rows.length}**\n${[...counts].map(([name, n]) => `**${name}**: ${n}`).join('\n')}`)
      .setThumbnail(target.displayAvatarURL());

    for (const row of rows.slice(0, 10)) {
      const snippet = (row.message_content || '(no text)').replace(/\s+/g, ' ').slice(0, 200);
      embed.addFields({
        name: row.name,
        value: `<t:${Math.floor(new Date(row.created_at).getTime() / 1000)}:R> by <@${row.moderator_id}>\n> ${snippet}`,
      });
    }
    if (rows.length > 10) embed.setFooter({ text: `Showing 10 most recent of ${rows.length}` });

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
