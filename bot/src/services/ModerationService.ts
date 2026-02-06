import { 
  Guild, 
  GuildMember, 
  User, 
  TextChannel, 
  EmbedBuilder,
  PermissionFlagsBits 
} from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { COLORS, formatDuration } from '@wall-e/shared';
import { logger } from '../utils/logger.js';

export class ModerationService {
  constructor(private client: WallEClient) {}

  async warn(
    guild: Guild,
    target: GuildMember | User,
    moderator: GuildMember,
    reason: string
  ): Promise<{ success: boolean; warningCount: number; error?: string }> {
    try {
      const warningCount = await this.client.db.addWarning(
        guild.id,
        target.id,
        moderator.id,
        reason
      );

      await this.client.db.logModAction(
        guild.id,
        target.id,
        moderator.id,
        'warn',
        reason
      );

      // Check for auto-punishment thresholds
      const config = await this.client.db.getGuildConfig(guild.id);
      if (config?.moderation?.warnThresholds) {
        const { kick, ban } = config.moderation.warnThresholds;
        
        if (ban > 0 && warningCount >= ban) {
          const member = target instanceof GuildMember ? target : await guild.members.fetch(target.id).catch(() => null);
          if (member && member.bannable) {
            await member.ban({ reason: `Reached ${ban} warnings` });
          }
        } else if (kick > 0 && warningCount >= kick) {
          const member = target instanceof GuildMember ? target : await guild.members.fetch(target.id).catch(() => null);
          if (member && member.kickable) {
            await member.kick(`Reached ${kick} warnings`);
          }
        }
      }

      // DM the user
      if (config?.moderation?.dmOnAction) {
        try {
          const dmEmbed = new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setTitle(`⚠️ Warning in ${guild.name}`)
            .setDescription(`You have been warned by a moderator.`)
            .addFields(
              { name: 'Reason', value: reason },
              { name: 'Total Warnings', value: warningCount.toString() }
            )
            .setTimestamp();

          await target.send({ embeds: [dmEmbed] });
        } catch {
          // User has DMs disabled
        }
      }

      await this.logToModChannel(guild, 'warn', target, moderator, reason);

      return { success: true, warningCount };
    } catch (error) {
      logger.error('Failed to warn user:', error);
      return { success: false, warningCount: 0, error: String(error) };
    }
  }

  async kick(
    guild: Guild,
    target: GuildMember,
    moderator: GuildMember,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!target.kickable) {
      return { success: false, error: 'Cannot kick this user' };
    }

    try {
      const config = await this.client.db.getGuildConfig(guild.id);

      // DM the user before kicking
      if (config?.moderation?.dmOnAction) {
        try {
          const dmEmbed = new EmbedBuilder()
            .setColor(COLORS.ERROR)
            .setTitle(`👢 Kicked from ${guild.name}`)
            .addFields({ name: 'Reason', value: reason })
            .setTimestamp();

          await target.send({ embeds: [dmEmbed] });
        } catch {
          // User has DMs disabled
        }
      }

      await target.kick(reason);

      await this.client.db.logModAction(guild.id, target.id, moderator.id, 'kick', reason);
      await this.logToModChannel(guild, 'kick', target, moderator, reason);

      return { success: true };
    } catch (error) {
      logger.error('Failed to kick user:', error);
      return { success: false, error: String(error) };
    }
  }

  async ban(
    guild: Guild,
    target: GuildMember | User,
    moderator: GuildMember,
    reason: string,
    deleteMessageDays = 0
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const member = target instanceof GuildMember ? target : null;
      
      if (member && !member.bannable) {
        return { success: false, error: 'Cannot ban this user' };
      }

      const config = await this.client.db.getGuildConfig(guild.id);

      // DM the user before banning
      if (config?.moderation?.dmOnAction) {
        try {
          const dmEmbed = new EmbedBuilder()
            .setColor(COLORS.ERROR)
            .setTitle(`🔨 Banned from ${guild.name}`)
            .addFields({ name: 'Reason', value: reason })
            .setTimestamp();

          await target.send({ embeds: [dmEmbed] });
        } catch {
          // User has DMs disabled
        }
      }

      await guild.members.ban(target, { 
        reason, 
        deleteMessageSeconds: deleteMessageDays * 24 * 60 * 60 
      });

      await this.client.db.logModAction(guild.id, target.id, moderator.id, 'ban', reason);
      await this.logToModChannel(guild, 'ban', target, moderator, reason);

      return { success: true };
    } catch (error) {
      logger.error('Failed to ban user:', error);
      return { success: false, error: String(error) };
    }
  }

  async unban(
    guild: Guild,
    userId: string,
    moderator: GuildMember,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await guild.members.unban(userId, reason);

      await this.client.db.logModAction(guild.id, userId, moderator.id, 'unban', reason);

      return { success: true };
    } catch (error) {
      logger.error('Failed to unban user:', error);
      return { success: false, error: String(error) };
    }
  }

  async timeout(
    guild: Guild,
    target: GuildMember,
    moderator: GuildMember,
    duration: number, // milliseconds
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!target.moderatable) {
      return { success: false, error: 'Cannot timeout this user' };
    }

    try {
      const config = await this.client.db.getGuildConfig(guild.id);

      // DM the user
      if (config?.moderation?.dmOnAction) {
        try {
          const dmEmbed = new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setTitle(`🔇 Timed out in ${guild.name}`)
            .addFields(
              { name: 'Reason', value: reason },
              { name: 'Duration', value: formatDuration(duration) }
            )
            .setTimestamp();

          await target.send({ embeds: [dmEmbed] });
        } catch {
          // User has DMs disabled
        }
      }

      await target.timeout(duration, reason);

      await this.client.db.logModAction(guild.id, target.id, moderator.id, 'timeout', reason, duration);
      await this.logToModChannel(guild, 'timeout', target, moderator, reason, duration);

      return { success: true };
    } catch (error) {
      logger.error('Failed to timeout user:', error);
      return { success: false, error: String(error) };
    }
  }

  async removeTimeout(
    guild: Guild,
    target: GuildMember,
    moderator: GuildMember,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await target.timeout(null, reason);

      await this.client.db.logModAction(guild.id, target.id, moderator.id, 'unmute', reason);

      return { success: true };
    } catch (error) {
      logger.error('Failed to remove timeout:', error);
      return { success: false, error: String(error) };
    }
  }

  private async logToModChannel(
    guild: Guild,
    action: string,
    target: GuildMember | User,
    moderator: GuildMember,
    reason: string,
    duration?: number
  ): Promise<void> {
    const config = await this.client.db.getGuildConfig(guild.id);
    if (!config?.moderation?.modLogChannelId) return;

    const channel = guild.channels.cache.get(config.moderation.modLogChannelId) as TextChannel;
    if (!channel) return;

    const actionEmojis: Record<string, string> = {
      warn: '⚠️',
      kick: '👢',
      ban: '🔨',
      unban: '🔓',
      timeout: '🔇',
      unmute: '🔊',
    };

    const embed = new EmbedBuilder()
      .setColor(action === 'unban' || action === 'unmute' ? COLORS.SUCCESS : COLORS.WARNING)
      .setTitle(`${actionEmojis[action] || '🛡️'} ${action.charAt(0).toUpperCase() + action.slice(1)}`)
      .addFields(
        { name: 'User', value: `${target.toString()} (${target.id})`, inline: true },
        { name: 'Moderator', value: moderator.toString(), inline: true },
        { name: 'Reason', value: reason }
      )
      .setTimestamp();

    if (duration) {
      embed.addFields({ name: 'Duration', value: formatDuration(duration), inline: true });
    }

    await channel.send({ embeds: [embed] });
  }
}
