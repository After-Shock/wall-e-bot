import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { Command } from '../../structures/Command.js';
import { COLORS } from '@wall-e/shared';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Get help with Wall-E Bot commands')
    .addStringOption(option =>
      option.setName('command')
        .setDescription('Specific command to get help for')
        .setRequired(false)),

  async execute(client, interaction) {
    const commandName = interaction.options.getString('command');

    if (commandName) {
      const command = client.commands.get(commandName);
      
      if (!command) {
        await interaction.reply({
          content: `Command \`${commandName}\` not found.`,
          ephemeral: true,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setTitle(`📖 Command: /${command.data.name}`)
        .setDescription(command.data.description)
        .addFields(
          { name: 'Cooldown', value: `${command.cooldown || 0} seconds`, inline: true },
          { name: 'Guild Only', value: command.guildOnly ? 'Yes' : 'No', inline: true }
        );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    const categories: Record<string, string[]> = {
      '🛡️ Moderation': ['kick', 'ban', 'warn', 'timeout'],
      '⭐ Levels': ['rank', 'leaderboard'],
      '🔧 Utility': ['help', 'serverinfo', 'userinfo', 'ping'],
      '⚙️ Admin': ['setup'],
    };

    const embed = new EmbedBuilder()
      .setColor(COLORS.PRIMARY)
      .setTitle('🤖 Wall-E Bot Help')
      .setDescription('A feature-rich Discord bot with moderation, leveling, and more!')
      .setThumbnail(client.user!.displayAvatarURL())
      .setFooter({ text: 'Use /help <command> for more info on a specific command' });

    for (const [category, commands] of Object.entries(categories)) {
      const availableCommands = commands.filter(cmd => client.commands.has(cmd));
      if (availableCommands.length > 0) {
        embed.addFields({
          name: category,
          value: availableCommands.map(cmd => `\`/${cmd}\``).join(' '),
        });
      }
    }

    embed.addFields({
      name: '🔗 Links',
      value: '[Dashboard](http://localhost:3000) • [Support Server](https://discord.gg/example) • [Invite Bot](https://discord.com/oauth2/authorize)',
    });

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
