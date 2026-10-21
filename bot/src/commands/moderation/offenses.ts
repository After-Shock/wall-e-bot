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
        .setName('top')
        .setDescription('Leaderboard of users with the most offenses')
        .addStringOption(option =>
          option.setName('command')
            .setDescription('Only count this command (e.g. rule2); default is all')))
    .addSubcommand(subcommand =>
      subcommand
        .setName('reset')
        .setDescription("Clear a user's offense count (admins and mods only)")
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

    if (interaction.options.getSubcommand() === 'top') {
      const only = interaction.options.getString('command')?.replace(/^!/, '') ?? null;
      const { rows } = await client.db.pool.query<{ target_id: string; active: number; total: number; last: Date }>(
        `SELECT a.target_id, COUNT(*) FILTER (WHERE a.active)::int AS active, COUNT(*)::int AS total,
                MAX(a.created_at) AS last
         FROM custom_command_actions a
         JOIN custom_commands c ON c.id = a.command_id
         WHERE a.guild_id = $1 AND ($2::text IS NULL OR LOWER(c.name) = LOWER($2))
         GROUP BY a.target_id
         ORDER BY active DESC, total DESC, last DESC
         LIMIT 10`,
        [guildId, only],
      );
      if (rows.length === 0) {
        await interaction.reply({ embeds: [successEmbed('No Offenses', 'Nobody has any recorded offenses.')] });
        return;
      }
      const embed = new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle(`🛡️ Top Offenders${only ? ` — ${only}` : ''}`)
        .setDescription(rows.map((r, i) =>
          `**${i + 1}.** <@${r.target_id}> — **${r.active}** active, ${r.total} all-time (last <t:${Math.floor(new Date(r.last).getTime() / 1000)}:R>)`,
        ).join('\n'));
      await interaction.reply({ embeds: [embed] });
      return;
    }

    const target = interaction.options.getUser('user', true);

    if (interaction.options.getSubcommand() === 'reset') {
      // Discord can't gate a single subcommand, so the mod check is here.
      // Moderate Members (timeout) is what /warn treats as "a moderator".
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
        await interaction.reply({ embeds: [errorEmbed('Missing Permissions', 'Only admins and moderators can reset offenses.')], ephemeral: true });
        return;
      }
      const only = interaction.options.getString('command')?.replace(/^!/, '') ?? null;
      const { rowCount } = await client.db.pool.query(
        `UPDATE custom_command_actions a SET active = FALSE
         FROM custom_commands c
         WHERE c.id = a.command_id AND a.active AND a.guild_id = $1 AND a.target_id = $2
           AND ($3::text IS NULL OR LOWER(c.name) = LOWER($3))`,
        [guildId, target.id, only],
      );
      // Public reply so other mods in the log channel see who reset what
      await interaction.reply({
        embeds: [successEmbed('Offenses Reset', `${interaction.user} cleared **${rowCount ?? 0}** active ${only ? `**${only}** ` : ''}offense(s) for ${target} (${target.id}). All-time history is kept.`)],
      });
      return;
    }

    const { rows } = await client.db.pool.query<{ name: string; active: boolean; moderator_id: string; message_content: string | null; created_at: Date }>(
      `SELECT c.name, a.active, a.moderator_id, a.message_content, a.created_at
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

    const counts = new Map<string, { active: number; total: number }>();
    for (const row of rows) {
      const c = counts.get(row.name) ?? { active: 0, total: 0 };
      c.total++;
      if (row.active) c.active++;
      counts.set(row.name, c);
    }
    const activeTotal = rows.filter((r) => r.active).length;

    const embed = new EmbedBuilder()
      .setColor(COLORS.WARNING)
      .setTitle(`🛡️ Offenses for ${target.tag}`)
      .setDescription(`Active: **${activeTotal}** · All-time: **${rows.length}**\n${[...counts].map(([name, c]) => `**${name}**: ${c.active} active, ${c.total} all-time`).join('\n')}`)
      .setThumbnail(target.displayAvatarURL());

    for (const row of rows.slice(0, 10)) {
      const snippet = (row.message_content || '(no text)').replace(/\s+/g, ' ').slice(0, 200);
      embed.addFields({
        name: row.active ? row.name : `${row.name} (inactive)`,
        value: `<t:${Math.floor(new Date(row.created_at).getTime() / 1000)}:R> by <@${row.moderator_id}>\n> ${snippet}`,
      });
    }
    if (rows.length > 10) embed.setFooter({ text: `Showing 10 most recent of ${rows.length}` });

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
