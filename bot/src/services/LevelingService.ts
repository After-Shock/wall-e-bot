import { Message, GuildMember, EmbedBuilder, TextChannel } from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { COLORS, XP_PER_MESSAGE, XP_COOLDOWN, randomInt, calculateXpForNextLevel } from '@wall-e/shared';
import { logger } from '../utils/logger.js';

export class LevelingService {
  constructor(private client: WallEClient) {}

  async handleMessage(message: Message): Promise<void> {
    if (!message.guild || message.author.bot) return;

    const guildConfig = await this.getGuildConfig(message.guild.id);
    if (!guildConfig?.modules?.leveling) return;

    const levelingConfig = guildConfig.leveling;
    if (!levelingConfig?.enabled) return;

    // Check if channel/role is ignored
    if (levelingConfig.ignoredChannels?.includes(message.channel.id)) return;
    
    const member = message.member;
    if (!member) return;

    const hasIgnoredRole = levelingConfig.ignoredRoles?.some(roleId => 
      member.roles.cache.has(roleId)
    );
    if (hasIgnoredRole) return;

    // Check XP cooldown
    const canGain = await this.client.cache.canGainXp(
      message.guild.id, 
      message.author.id, 
      levelingConfig.xpCooldown || XP_COOLDOWN
    );
    
    if (!canGain) return;

    // Calculate XP with multipliers
    let xp = randomInt(
      levelingConfig.xpPerMessage?.min || XP_PER_MESSAGE.min,
      levelingConfig.xpPerMessage?.max || XP_PER_MESSAGE.max
    );

    // Apply role multipliers
    for (const multiplier of levelingConfig.xpMultipliers || []) {
      if (member.roles.cache.has(multiplier.roleId)) {
        xp = Math.floor(xp * multiplier.multiplier);
        break;
      }
    }

    // Add XP
    const result = await this.client.db.addXp(message.guild.id, message.author.id, xp);

    if (result.leveledUp) {
      await this.handleLevelUp(message, member, result.newLevel, levelingConfig);
    }
  }

  private async handleLevelUp(
    message: Message, 
    member: GuildMember, 
    newLevel: number, 
    config: { levelUpChannel?: string; levelUpMessage?: string; roleRewards?: Array<{ level: number; roleId: string; removeOnHigherLevel: boolean }> }
  ): Promise<void> {
    // Handle role rewards
    for (const reward of config.roleRewards || []) {
      if (reward.level === newLevel) {
        try {
          await member.roles.add(reward.roleId);
        } catch (error) {
          logger.error(`Failed to add role reward: ${error}`);
        }
      }
      
      // Remove lower level roles if configured
      if (reward.removeOnHigherLevel && reward.level < newLevel) {
        try {
          await member.roles.remove(reward.roleId);
        } catch (error) {
          logger.error(`Failed to remove role reward: ${error}`);
        }
      }
    }

    // Send level up message
    const levelUpMessage = (config.levelUpMessage || 'Congratulations {user}! You reached level **{level}**!')
      .replace('{user}', member.toString())
      .replace('{level}', newLevel.toString())
      .replace('{username}', member.user.username);

    const embed = new EmbedBuilder()
      .setColor(COLORS.SUCCESS)
      .setTitle('🎉 Level Up!')
      .setDescription(levelUpMessage)
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp();

    let targetChannel: TextChannel | null = null;

    if (config.levelUpChannel === 'dm') {
      try {
        await member.send({ embeds: [embed] });
      } catch {
        // User has DMs disabled
      }
      return;
    }

    if (config.levelUpChannel && config.levelUpChannel !== 'current') {
      targetChannel = message.guild?.channels.cache.get(config.levelUpChannel) as TextChannel;
    } else {
      targetChannel = message.channel as TextChannel;
    }

    if (targetChannel) {
      await targetChannel.send({ embeds: [embed] });
    }
  }

  async getRank(guildId: string, odiscordId: string): Promise<{ xp: number; level: number; rank: number; xpForNext: number } | null> {
    const member = await this.client.db.getMember(guildId, odiscordId);
    if (!member) return null;

    const leaderboard = await this.client.db.getLeaderboard(guildId, 1000);
    const rank = leaderboard.findIndex(m => m.odiscordId === odiscordId) + 1;

    return {
      xp: member.xp,
      level: member.level,
      rank: rank || leaderboard.length + 1,
      xpForNext: calculateXpForNextLevel(member.level),
    };
  }

  private async getGuildConfig(guildId: string) {
    let config = await this.client.cache.getGuildConfig(guildId);
    
    if (!config) {
      config = await this.client.db.getGuildConfig(guildId);
      if (config) {
        await this.client.cache.setGuildConfig(guildId, config);
      }
    }

    return config;
  }
}
