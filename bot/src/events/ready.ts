import { Events, ActivityType } from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client: WallEClient) {
    logger.info(`Ready! Logged in as ${client.user?.tag}`);
    logger.info(`Serving ${client.guilds.cache.size} guilds`);

    // Set presence
    client.user?.setPresence({
      activities: [{ name: `/help | ${client.guilds.cache.size} servers`, type: ActivityType.Watching }],
      status: 'online',
    });

    // Update presence periodically
    setInterval(() => {
      client.user?.setPresence({
        activities: [{ name: `/help | ${client.guilds.cache.size} servers`, type: ActivityType.Watching }],
        status: 'online',
      });
    }, 5 * 60 * 1000); // Every 5 minutes

    // Sync all current guilds into whitelist as 'approved'
    // (these were added before whitelist existed so we trust them)
    for (const [, guild] of client.guilds.cache) {
      await client.db.pool.query(
        `INSERT INTO guild_whitelist (guild_id, guild_name, guild_icon, member_count, status)
         VALUES ($1, $2, $3, $4, 'approved')
         ON CONFLICT (guild_id) DO UPDATE SET
           guild_name = EXCLUDED.guild_name,
           guild_icon = EXCLUDED.guild_icon,
           member_count = EXCLUDED.member_count,
           left_at = NULL`,
        [guild.id, guild.name, guild.icon, guild.memberCount]
      ).catch(e => logger.error('Failed to sync guild to whitelist:', e));
    }
    logger.info('Guild whitelist synced');
  },
};
