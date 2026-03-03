import { Events, Guild } from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildDelete,
  once: false,
  async execute(client: WallEClient, guild: Guild) {
    logger.info(`Left/removed from guild: ${guild.name} (${guild.id})`);
    await client.db.pool.query(
      `UPDATE guild_whitelist SET left_at = NOW() WHERE guild_id = $1`,
      [guild.id]
    ).catch(e => logger.error('Failed to update guild left_at:', e));
  },
};
