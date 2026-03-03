import { Events, Message } from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.MessageCreate,
  once: false,
  async execute(client: WallEClient, message: Message) {
    if (message.author.bot) return;

    // Whitelist check
    if (message.guild) {
      const wl = await client.db.pool.query(
        'SELECT status, permanent, expires_at FROM guild_whitelist WHERE guild_id = $1',
        [message.guild.id]
      ).catch(() => null);
      const wlRow = wl?.rows[0];
      const expired = !wlRow?.permanent && wlRow?.expires_at && new Date(wlRow.expires_at) < new Date();
      if ((wlRow?.status !== 'approved' || expired) && message.author.id !== process.env.BOT_OWNER_ID) return;
    }

    try {
      // Run automod first - if it triggers, don't process further
      const automodTriggered = await client.automod.handleMessage(message);
      if (automodTriggered) return;

      // Handle leveling
      await client.leveling.handleMessage(message);
    } catch (error) {
      logger.error('Error in messageCreate handler:', error);
    }

    if (message.guild) {
      const guildId = message.guild.id;
      const channelId = message.channel.id;
      const channelName = message.channel.isTextBased() && 'name' in message.channel
        ? message.channel.name : null;

      // Log message for analytics (fire-and-forget)
      client.db.pool.query(
        `INSERT INTO message_logs (guild_id, channel_id, channel_name, user_id, username)
         VALUES ($1, $2, $3, $4, $5)`,
        [guildId, channelId, channelName, message.author.id, message.author.username]
      ).catch((e) => logger.debug('message_logs insert failed:', e));

      // Update ticket last_activity (fire-and-forget)
      client.db.pool.query(
        `UPDATE tickets SET last_activity = NOW(), warned_inactive = FALSE
         WHERE channel_id = $1 AND guild_id = $2 AND status IN ('open','claimed')`,
        [channelId, guildId]
      ).catch((e) => logger.debug('ticket activity update failed:', e));
    }
  },
};
