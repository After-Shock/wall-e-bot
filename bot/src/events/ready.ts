import { Events, ActivityType } from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { logger } from '../utils/logger.js';

const ACTIVITY_TYPE_MAP: Record<string, ActivityType> = {
  PLAYING: ActivityType.Playing,
  WATCHING: ActivityType.Watching,
  LISTENING: ActivityType.Listening,
  COMPETING: ActivityType.Competing,
};

async function applyActivity(client: WallEClient) {
  try {
    const result = await client.db.pool.query("SELECT value FROM bot_settings WHERE key = 'activity'");
    const setting = result.rows[0]?.value;
    if (setting?.text) {
      client.user?.setPresence({
        activities: [{ name: setting.text, type: ACTIVITY_TYPE_MAP[setting.type] ?? ActivityType.Playing }],
        status: 'online',
      });
      return;
    }
  } catch {
    // fall through to default
  }
  // Default: show server count
  client.user?.setPresence({
    activities: [{ name: `/help | ${client.guilds.cache.size} servers`, type: ActivityType.Watching }],
    status: 'online',
  });
}

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client: WallEClient) {
    logger.info(`Ready! Logged in as ${client.user?.tag}`);
    logger.info(`Serving ${client.guilds.cache.size} guilds`);

    await applyActivity(client);

    // Refresh presence every 5 minutes (picks up DB changes and keeps server count current)
    setInterval(() => applyActivity(client), 5 * 60 * 1000);

    // Sync all current guilds into whitelist as 'approved'
    // (these were added before whitelist existed so we trust them)
    for (const [, guild] of client.guilds.cache) {
      await client.db.pool.query(
        `INSERT INTO guild_whitelist (guild_id, guild_name, guild_icon, member_count, status, expires_at)
         VALUES ($1, $2, $3, $4, 'approved', NOW() + INTERVAL '1 year')
         ON CONFLICT (guild_id) DO UPDATE SET
           guild_name = EXCLUDED.guild_name,
           guild_icon = EXCLUDED.guild_icon,
           member_count = EXCLUDED.member_count,
           expires_at = COALESCE(guild_whitelist.expires_at, NOW() + INTERVAL '1 year'),
           left_at = NULL`,
        [guild.id, guild.name, guild.icon, guild.memberCount],
      ).catch(e => logger.error('Failed to sync guild to whitelist:', e));
    }
    logger.info('Guild whitelist synced');

    // Start the scheduler now that the guild cache is populated
    client.scheduler.start();
  },
};
