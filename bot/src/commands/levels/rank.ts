import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { Command } from '../../structures/Command.js';
import { errorEmbed } from '../../utils/embeds.js';
import { COLORS, ordinal, formatNumber } from '@wall-e/shared';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Check your or another user\'s rank')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to check')
        .setRequired(false)),
  
  guildOnly: true,
  cooldown: 5,

  async execute(client, interaction) {
    const target = interaction.options.getUser('user') || interaction.user;

    const rankData = await client.leveling.getRank(interaction.guild!.id, target.id);

    if (!rankData) {
      await interaction.reply({
        embeds: [errorEmbed('No Data', `${target.id === interaction.user.id ? 'You have' : `${target.tag} has`} no XP yet. Start chatting to earn XP!`)],
        ephemeral: true,
      });
      return;
    }

    const { xp, level, rank, xpForNext } = rankData;
    const progress = Math.round((xp / xpForNext) * 100);
    const progressBar = createProgressBar(progress);

    const embed = new EmbedBuilder()
      .setColor(COLORS.PRIMARY)
      .setAuthor({ name: target.tag, iconURL: target.displayAvatarURL() })
      .setThumbnail(target.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: '🏆 Rank', value: `#${rank}`, inline: true },
        { name: '⭐ Level', value: level.toString(), inline: true },
        { name: '✨ Total XP', value: formatNumber(xp), inline: true },
        { name: 'Progress to Next Level', value: `${progressBar} ${progress}%\n${formatNumber(xp)} / ${formatNumber(xpForNext)} XP` }
      )
      .setFooter({ text: `${ordinal(rank)} place on the leaderboard` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

function createProgressBar(percentage: number): string {
  const filled = Math.round(percentage / 10);
  const empty = 10 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

export default command;
