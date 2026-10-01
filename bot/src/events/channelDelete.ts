import { Events, type DMChannel, type GuildChannel } from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { logger } from '../utils/logger.js';

// A ticket channel deleted by hand in Discord would otherwise stay "open" forever,
// using up the opener's ticket limit. Bot-closed tickets are already closed, so this is a no-op for them.
export default {
  name: Events.ChannelDelete,
  once: false,
  async execute(client: WallEClient, channel: DMChannel | GuildChannel) {
    if (!('guildId' in channel) || !channel.guildId) return;
    try {
      const result = await client.db.pool.query(
        `UPDATE tickets SET status = 'closed', closed_at = NOW(), close_reason = 'Channel deleted in Discord'
         WHERE guild_id = $1 AND channel_id = $2 AND status IN ('open', 'claimed')`,
        [channel.guildId, channel.id],
      );
      if (result.rowCount) logger.info(`Closed ticket for deleted channel ${channel.id} in ${channel.guildId}`);
    } catch (error) {
      logger.error('Failed to close ticket for deleted channel:', error);
    }
  },
};
