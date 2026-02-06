import { Events, ChatInputCommandInteraction, Collection, PermissionFlagsBits } from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { errorEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.InteractionCreate,
  once: false,
  async execute(client: WallEClient, interaction: ChatInputCommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
      logger.warn(`Unknown command: ${interaction.commandName}`);
      return;
    }

    // Check if command is guild-only
    if (command.guildOnly && !interaction.guild) {
      await interaction.reply({
        embeds: [errorEmbed('Error', 'This command can only be used in a server.')],
        ephemeral: true,
      });
      return;
    }

    // Check if command is owner-only
    if (command.ownerOnly && interaction.user.id !== process.env.BOT_OWNER_ID) {
      await interaction.reply({
        embeds: [errorEmbed('Error', 'This command is owner-only.')],
        ephemeral: true,
      });
      return;
    }

    // Check permissions
    if (command.permissions && interaction.guild) {
      const member = interaction.member;
      if (member && 'permissions' in member) {
        const missingPerms = command.permissions.filter(
          perm => !member.permissions.has(perm)
        );

        if (missingPerms.length > 0) {
          await interaction.reply({
            embeds: [errorEmbed('Missing Permissions', `You need the following permissions: ${missingPerms.join(', ')}`)],
            ephemeral: true,
          });
          return;
        }
      }
    }

    // Check cooldowns
    if (command.cooldown) {
      if (!client.cooldowns.has(command.data.name)) {
        client.cooldowns.set(command.data.name, new Collection());
      }

      const now = Date.now();
      const timestamps = client.cooldowns.get(command.data.name)!;
      const cooldownAmount = command.cooldown * 1000;

      if (timestamps.has(interaction.user.id)) {
        const expirationTime = timestamps.get(interaction.user.id)! + cooldownAmount;

        if (now < expirationTime) {
          const timeLeft = (expirationTime - now) / 1000;
          await interaction.reply({
            embeds: [errorEmbed('Cooldown', `Please wait ${timeLeft.toFixed(1)} seconds before using this command again.`)],
            ephemeral: true,
          });
          return;
        }
      }

      timestamps.set(interaction.user.id, now);
      setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);
    }

    // Execute command
    try {
      await command.execute(client, interaction);
    } catch (error) {
      logger.error(`Error executing command ${interaction.commandName}:`, error);

      const errorResponse = {
        embeds: [errorEmbed('Error', 'An error occurred while executing this command.')],
        ephemeral: true,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorResponse);
      } else {
        await interaction.reply(errorResponse);
      }
    }
  },
};
