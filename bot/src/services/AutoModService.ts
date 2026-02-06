import { Message, GuildMember, TextChannel, EmbedBuilder } from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import type { AutoModConfig } from '@wall-e/shared';
import { COLORS } from '@wall-e/shared';
import { logger } from '../utils/logger.js';

export class AutoModService {
  constructor(private client: WallEClient) {}

  async handleMessage(message: Message): Promise<boolean> {
    if (!message.guild || message.author.bot) return false;
    if (!message.member) return false;

    const config = await this.getAutoModConfig(message.guild.id);
    if (!config?.enabled) return false;

    // Check if user/channel is ignored
    if (config.ignoredChannels?.includes(message.channel.id)) return false;
    
    const hasIgnoredRole = config.ignoredRoles?.some(roleId => 
      message.member!.roles.cache.has(roleId)
    );
    if (hasIgnoredRole) return false;

    // Run all checks
    const checks = [
      this.checkSpam(message, config),
      this.checkWordFilter(message, config),
      this.checkLinkFilter(message, config),
      this.checkCapsFilter(message, config),
    ];

    const results = await Promise.all(checks);
    return results.some(r => r);
  }

  private async checkSpam(message: Message, config: AutoModConfig): Promise<boolean> {
    if (!config.antiSpam?.enabled) return false;

    const { maxMessages, interval, action, muteDuration } = config.antiSpam;
    const count = await this.client.cache.incrementSpamTracker(
      message.guild!.id,
      message.author.id,
      interval
    );

    if (count > maxMessages) {
      await this.takeAction(message, action, 'Spam detected', muteDuration);
      return true;
    }

    return false;
  }

  private async checkWordFilter(message: Message, config: AutoModConfig): Promise<boolean> {
    if (!config.wordFilter?.enabled || !config.wordFilter.words.length) return false;

    const content = message.content.toLowerCase();
    const hasBlockedWord = config.wordFilter.words.some(word => 
      content.includes(word.toLowerCase())
    );

    if (hasBlockedWord) {
      await this.takeAction(
        message, 
        config.wordFilter.action, 
        'Blocked word detected',
        config.wordFilter.muteDuration
      );
      return true;
    }

    return false;
  }

  private async checkLinkFilter(message: Message, config: AutoModConfig): Promise<boolean> {
    if (!config.linkFilter?.enabled) return false;

    const urlRegex = /https?:\/\/[^\s]+/gi;
    const urls = message.content.match(urlRegex);

    if (!urls) return false;

    const hasBlockedLink = urls.some(url => {
      try {
        const domain = new URL(url).hostname;
        return !config.linkFilter!.allowedDomains.some(allowed => 
          domain.endsWith(allowed)
        );
      } catch {
        return true;
      }
    });

    if (hasBlockedLink) {
      await this.takeAction(message, config.linkFilter.action, 'Unapproved link detected');
      return true;
    }

    return false;
  }

  private async checkCapsFilter(message: Message, config: AutoModConfig): Promise<boolean> {
    if (!config.capsFilter?.enabled) return false;

    const content = message.content;
    if (content.length < config.capsFilter.minLength) return false;

    const uppercaseChars = content.replace(/[^A-Z]/g, '').length;
    const letterChars = content.replace(/[^A-Za-z]/g, '').length;

    if (letterChars === 0) return false;

    const capsPercentage = (uppercaseChars / letterChars) * 100;

    if (capsPercentage > config.capsFilter.threshold) {
      await this.takeAction(message, config.capsFilter.action, 'Excessive caps detected');
      return true;
    }

    return false;
  }

  private async takeAction(
    message: Message,
    action: string,
    reason: string,
    muteDuration?: number
  ): Promise<void> {
    try {
      // Always try to delete the message first
      if (action === 'delete' || action === 'warn' || action === 'mute') {
        await message.delete().catch(() => {});
      }

      if (action === 'warn') {
        await this.client.moderation.warn(
          message.guild!,
          message.member!,
          message.guild!.members.me!,
          `[AutoMod] ${reason}`
        );
      } else if (action === 'mute' && muteDuration) {
        await this.client.moderation.timeout(
          message.guild!,
          message.member!,
          message.guild!.members.me!,
          muteDuration * 60 * 1000, // Convert minutes to ms
          `[AutoMod] ${reason}`
        );
      }

      // Log the action
      await this.logAutoModAction(message, action, reason);
    } catch (error) {
      logger.error('AutoMod action failed:', error);
    }
  }

  private async logAutoModAction(
    message: Message,
    action: string,
    reason: string
  ): Promise<void> {
    const config = await this.client.db.getGuildConfig(message.guild!.id);
    if (!config?.moderation?.modLogChannelId) return;

    const channel = message.guild!.channels.cache.get(
      config.moderation.modLogChannelId
    ) as TextChannel;
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(COLORS.WARNING)
      .setTitle('🤖 AutoMod Action')
      .addFields(
        { name: 'User', value: message.author.toString(), inline: true },
        { name: 'Channel', value: message.channel.toString(), inline: true },
        { name: 'Action', value: action, inline: true },
        { name: 'Reason', value: reason },
        { name: 'Message Content', value: message.content.substring(0, 1000) || 'N/A' }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  }

  private async getAutoModConfig(guildId: string): Promise<AutoModConfig | null> {
    let config = await this.client.cache.getGuildConfig(guildId);
    
    if (!config) {
      config = await this.client.db.getGuildConfig(guildId);
      if (config) {
        await this.client.cache.setGuildConfig(guildId, config);
      }
    }

    return config?.automod ?? null;
  }
}
