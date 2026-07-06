/**
 * Guild Whitelist Check
 *
 * Single source of truth for "is this guild allowed to use the bot".
 * Previously this query was copy-pasted into every event handler and hit
 * Postgres on every message/reaction/interaction. Results are now cached
 * in Redis for a short TTL so hot paths stay off the database.
 *
 * @module utils/whitelist
 */

import type { WallEClient } from '../structures/Client.js';
import { logger } from './logger.js';

export type WhitelistStatus = 'approved' | 'expired' | 'not_approved';

/** Seconds to cache a whitelist decision. Dashboard approvals take effect within this window. */
const CACHE_TTL = 60;

/**
 * Resolve a guild's whitelist status, using Redis as a read-through cache.
 * On DB failure we deny (fail closed) but log the error loudly so an outage
 * isn't mistaken for "guild not approved".
 */
export async function getWhitelistStatus(client: WallEClient, guildId: string): Promise<WhitelistStatus> {
  const cacheKey = `whitelist:${guildId}`;

  try {
    const cached = await client.cache.redisClient.get(cacheKey);
    if (cached === 'approved' || cached === 'expired' || cached === 'not_approved') {
      return cached;
    }
  } catch {
    // Redis unavailable — fall through to the database
  }

  let status: WhitelistStatus = 'not_approved';
  try {
    const result = await client.db.pool.query(
      'SELECT status, permanent, expires_at FROM guild_whitelist WHERE guild_id = $1',
      [guildId],
    );
    const row = result.rows[0];
    if (row?.status === 'approved') {
      const expired = !row.permanent && row.expires_at && new Date(row.expires_at) < new Date();
      status = expired ? 'expired' : 'approved';
    }
  } catch (error) {
    logger.error(`Whitelist lookup failed for guild ${guildId} — denying access this event:`, error);
    return 'not_approved';
  }

  try {
    await client.cache.redisClient.setex(cacheKey, CACHE_TTL, status);
  } catch {
    // Cache write failure is non-fatal
  }

  return status;
}

/** True if the guild may use the bot, with a bot-owner bypass. */
export async function isGuildAllowed(client: WallEClient, guildId: string, userId?: string): Promise<boolean> {
  if (userId && userId === process.env.BOT_OWNER_ID) return true;
  return (await getWhitelistStatus(client, guildId)) === 'approved';
}
