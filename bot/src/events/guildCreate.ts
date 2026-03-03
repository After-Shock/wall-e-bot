import { Events, Guild } from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildCreate,
  once: false,
  async execute(client: WallEClient, guild: Guild) {
    logger.info(`Joined new guild: ${guild.name} (${guild.id})`);

    // Fetch guild owner for added_by tracking
    const guildOwner = await client.users.fetch(guild.ownerId).catch(() => null);

    // Add to whitelist as pending — owner must approve via admin panel
    await client.db.pool.query(
      `INSERT INTO guild_whitelist (guild_id, guild_name, guild_icon, member_count, status, added_by, added_by_username, expires_at)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6, NOW() + INTERVAL '1 year')
       ON CONFLICT (guild_id) DO UPDATE SET
         guild_name = EXCLUDED.guild_name,
         guild_icon = EXCLUDED.guild_icon,
         member_count = EXCLUDED.member_count,
         status = CASE WHEN guild_whitelist.status = 'blacklisted' THEN 'blacklisted' ELSE 'pending' END,
         added_by = COALESCE(guild_whitelist.added_by, EXCLUDED.added_by),
         added_by_username = COALESCE(guild_whitelist.added_by_username, EXCLUDED.added_by_username),
         expires_at = COALESCE(guild_whitelist.expires_at, EXCLUDED.expires_at),
         left_at = NULL`,
      [guild.id, guild.name, guild.icon, guild.memberCount, guild.ownerId, guildOwner?.username ?? null],
    ).catch(e => logger.error('Failed to add guild to whitelist:', e));

    // DM the bot owner about the new pending guild
    const ownerId = process.env.BOT_OWNER_ID;
    if (ownerId) {
      try {
        const owner = await client.users.fetch(ownerId);
        await owner.send(
          `📥 **New server added bot:** ${guild.name} (${guild.id})\n` +
          `Members: ${guild.memberCount}\n` +
          'Status: **pending** — approve or blacklist in the admin panel.',
        );
      } catch {
        // Owner has DMs disabled
      }
    }

    // If blacklisted, leave immediately
    const result = await client.db.pool.query(
      'SELECT status FROM guild_whitelist WHERE guild_id = $1',
      [guild.id],
    ).catch(() => null);

    if (result?.rows[0]?.status === 'blacklisted') {
      await guild.leave();
      logger.info(`Left blacklisted guild: ${guild.name}`);
    }
  },
};
