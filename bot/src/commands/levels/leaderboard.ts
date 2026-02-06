import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { Command } from '../../structures/Command.js';
import { errorEmbed } from '../../utils/embeds.js';
import { COLORS, formatNumber, ordinal } from '@wall-e/shared';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the server XP leaderboard')
    .addIntegerOption(option =>
      option.setName('page')
        .setDescription('Page number')
        .setMinValue(1)
        .setRequired(false)),
  
  guildOnly: true,
  cooldown: 10,

  async execute(client, interaction) {
    const page = interaction.options.getInteger('page') || 1;
    const perPage = 10;
    const offset = (page - 1) * perPage;

    const leaderboard = await client.db.getLeaderboard(interaction.guild!.id, 100);

    if (leaderboard.length === 0) {
      await interaction.reply({
        embeds: [errorEmbed('No Data', 'No one has earned XP yet. Start chatting to get on the leaderboard!')],
        ephemeral: true,
      });
      return;
    }

    const totalPages = Math.ceil(leaderboard.length / perPage);
    const pageData = leaderboard.slice(offset, offset + perPage);

    if (pageData.length === 0) {
      await interaction.reply({
        embeds: [errorEmbed('Invalid Page', `Page ${page} doesn't exist. There are only ${totalPages} pages.`)],
        ephemeral: true,
      });
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    const description = await Promise.all(pageData.map(async (entry, index) => {
      const position = offset + index + 1;
      const medal = position <= 3 ? medals[position - 1] : `**${position}.**`;
      
      try {
        const user = await client.users.fetch(entry.odiscordId);
        return `${medal} ${user.tag}\nLevel ${entry.level} • ${formatNumber(entry.xp)} XP`;
      } catch {
        return `${medal} Unknown User\nLevel ${entry.level} • ${formatNumber(entry.xp)} XP`;
      }
    }));

    const embed = new EmbedBuilder()
      .setColor(COLORS.PRIMARY)
      .setTitle(`🏆 ${interaction.guild!.name} Leaderboard`)
      .setDescription(description.join('\n\n'))
      .setFooter({ text: `Page ${page} of ${totalPages} • Total: ${leaderboard.length} members` })
      .setTimestamp();

    // Find current user's position
    const userPosition = leaderboard.findIndex(e => e.odiscordId === interaction.user.id);
    if (userPosition !== -1) {
      embed.addFields({
        name: 'Your Position',
        value: `You are ${ordinal(userPosition + 1)} with Level ${leaderboard[userPosition]!.level} and ${formatNumber(leaderboard[userPosition]!.xp)} XP`,
      });
    }

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
