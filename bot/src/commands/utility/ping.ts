import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { Command } from '../../structures/Command.js';
import { COLORS } from '@wall-e/shared';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check the bot\'s latency'),

  async execute(client, interaction) {
    const sent = await interaction.reply({ content: '🏓 Pinging...', fetchReply: true });
    
    const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
    const wsLatency = client.ws.ping;

    const embed = new EmbedBuilder()
      .setColor(COLORS.PRIMARY)
      .setTitle('🏓 Pong!')
      .addFields(
        { name: '📡 Roundtrip', value: `${roundtrip}ms`, inline: true },
        { name: '💓 WebSocket', value: `${wsLatency}ms`, inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ content: null, embeds: [embed] });
  },
};

export default command;
