/**
 * Interaction Create Event Handler
 * 
 * Handles all slash command interactions with:
 * - Permission checking
 * - Cooldown enforcement (Redis-backed for cross-shard support)
 * - Error handling
 * 
 * @module events/interactionCreate
 */

import { Events, ChatInputCommandInteraction, Collection } from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { errorEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';

/** Default cooldown in seconds if not specified by command */
const DEFAULT_COOLDOWN = 3;

/** Cooldown categories by command type */
const COOLDOWN_CATEGORIES: Record<string, number> = {
  // Moderation commands - shorter cooldown for rapid response
  'ban': 2,
  'kick': 2,
  'timeout': 2,
  'warn': 2,
  
  // Admin commands - prevent spam
  'setup': 10,
  'customcommand': 5,
  'reactionrole': 5,
  
  // Utility commands - standard cooldown
  'rank': 5,
  'leaderboard': 10,
};

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

    // =========================================================================
    // Cooldown Enforcement (Redis-backed for cross-shard support)
    // =========================================================================
    
    // Get cooldown duration (command-specific > category > default)
    const cooldownSeconds = 
      command.cooldown ?? 
      COOLDOWN_CATEGORIES[interaction.commandName] ?? 
      DEFAULT_COOLDOWN;
    
    // Use Redis for cross-shard cooldowns (production)
    // Fall back to in-memory for local development
    const cooldownKey = `cooldown:${interaction.commandName}:${interaction.user.id}`;
    
    try {
      // Try Redis-based cooldown first
      const isAllowed = await client.cache.getRateLimit(
        cooldownKey,
        1, // Allow 1 request
        cooldownSeconds
      );
      
      if (!isAllowed) {
        await interaction.reply({
          embeds: [errorEmbed(
            '⏱️ Cooldown', 
            `Please wait **${cooldownSeconds}** seconds before using this command again.`
          )],
          ephemeral: true,
        });
        return;
      }
    } catch {
      // Redis unavailable, fall back to in-memory cooldowns
      if (!client.cooldowns.has(command.data.name)) {
        client.cooldowns.set(command.data.name, new Collection());
      }

      const now = Date.now();
      const timestamps = client.cooldowns.get(command.data.name)!;
      const cooldownMs = cooldownSeconds * 1000;

      if (timestamps.has(interaction.user.id)) {
        const expirationTime = timestamps.get(interaction.user.id)! + cooldownMs;

        if (now < expirationTime) {
          const timeLeft = (expirationTime - now) / 1000;
          await interaction.reply({
            embeds: [errorEmbed(
              '⏱️ Cooldown', 
              `Please wait **${timeLeft.toFixed(1)}** seconds before using this command again.`
            )],
            ephemeral: true,
          });
          return;
        }
      }

      timestamps.set(interaction.user.id, now);
      setTimeout(() => timestamps.delete(interaction.user.id), cooldownMs);
    }

    // =========================================================================
    // Execute Command
    // =========================================================================
    
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
