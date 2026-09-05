import { Message, GuildMember, TextChannel, EmbedBuilder } from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { COLORS, normalizeHostname, type AutoModConfig } from '@wall-e/shared';
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
      message.member!.roles.cache.has(roleId),
    );
    if (hasIgnoredRole) return false;

    // A message receives at most one action. Order is spam, words, links, caps.
    if (await this.checkSpam(message, config)) return true;
    if (await this.checkWordFilter(message, config)) return true;
    if (await this.checkLinkFilter(message, config)) return true;
    return this.checkCapsFilter(message, config);
  }

  private async checkSpam(message: Message, config: AutoModConfig): Promise<boolean> {
    if (!config.antiSpam?.enabled) return false;

    const { maxMessages, interval, action, muteDuration } = config.antiSpam;
    const count = await this.client.cache.incrementSpamTracker(
      message.guild!.id,
      message.author.id,
      interval,
    );

    if (count > maxMessages) {
      return this.takeAction(message, action, 'Spam detected', muteDuration);
    }

    return false;
  }

  private async checkWordFilter(message: Message, config: AutoModConfig): Promise<boolean> {
    if (!config.wordFilter?.enabled || !config.wordFilter.words.length) return false;

    const content = message.content.toLowerCase();
    const hasBlockedWord = config.wordFilter.words.some(word => 
      content.includes(word.toLowerCase()),
    );

    if (hasBlockedWord) {
      return this.takeAction(
        message, 
        config.wordFilter.action, 
        'Blocked word detected',
        config.wordFilter.muteDuration,
      );
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
        const host = normalizeHostname(new URL(url).hostname);
        if (!host) return true;

        return !config.linkFilter!.allowedDomains.some(value => {
          if (typeof value !== 'string') return false;
          const allowed = normalizeHostname(value);
          return allowed !== null && (host === allowed || host.endsWith(`.${allowed}`));
        });
      } catch {
        return true;
      }
    });

    if (hasBlockedLink) {
      return this.takeAction(message, config.linkFilter.action, 'Unapproved link detected');
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
      return this.takeAction(message, config.capsFilter.action, 'Excessive caps detected');
    }

    return false;
  }

  private async takeAction(
    message: Message,
    action: string,
    reason: string,
    muteDuration?: number,
  ): Promise<boolean> {
    if (action !== 'delete' && action !== 'warn' && action !== 'mute') {
      logger.warn(`[AutoMod] Skipping unsupported action "${action}" for guild ${message.guild?.id ?? 'unknown'}`);
      return false;
    }
    if (action === 'mute' && (!Number.isFinite(muteDuration) || (muteDuration ?? 0) <= 0)) {
      logger.warn(`[AutoMod] Skipping mute without a positive mute duration for guild ${message.guild?.id ?? 'unknown'}`);
      return false;
    }

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
          `[AutoMod] ${reason}`,
        );
      } else if (action === 'mute') {
        await this.client.moderation.timeout(
          message.guild!,
          message.member!,
          message.guild!.members.me!,
          muteDuration! * 60 * 1000, // Convert minutes to ms
          `[AutoMod] ${reason}`,
        );
      }

      // Log the action
      await this.logAutoModAction(message, action, reason);
      return true;
    } catch (error) {
      logger.error('AutoMod action failed:', error);
      // A supported action may already have partially completed; do not punish twice.
      return true;
    }
  }

  private async logAutoModAction(
    message: Message,
    action: string,
    reason: string,
  ): Promise<void> {
    const config = await this.client.db.getGuildConfig(message.guild!.id);
    if (!config?.moderation?.modLogChannelId) return;

    const channel = message.guild!.channels.cache.get(
      config.moderation.modLogChannelId,
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
        { name: 'Message Content', value: message.content.substring(0, 1000) || 'N/A' },
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
