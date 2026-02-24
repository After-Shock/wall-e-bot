import { Events, Message } from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.MessageCreate,
  once: false,
  async execute(client: WallEClient, message: Message) {
    if (message.author.bot) return;

    try {
      // Run automod first - if it triggers, don't process further
      const automodTriggered = await client.automod.handleMessage(message);
      if (automodTriggered) return;

      // Handle leveling
      await client.leveling.handleMessage(message);
    } catch (error) {
      logger.error('Error in messageCreate handler:', error);
    }

    // Update ticket last_activity if message is in a ticket channel
    if (message.guild) {
      // Fire-and-forget — don't await to avoid slowing message handling
      client.db.pool.query(
        `UPDATE tickets SET last_activity = NOW(), warned_inactive = FALSE
         WHERE channel_id = $1 AND guild_id = $2 AND status IN ('open','claimed')`,
        [message.channel.id, message.guild.id]
      ).catch(() => {}); // ignore errors
    }
  },
};
