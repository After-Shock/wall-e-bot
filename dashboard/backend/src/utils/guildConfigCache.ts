import { redis } from '../redis.js';
import { logger } from './logger.js';
import { withTimeout } from './withTimeout.js';

const CACHE_TIMEOUT_MS = 500;

export const CACHE_VISIBILITY_WARNING =
  'Settings were saved, but the bot may use its previous settings until the configuration cache expires.';

export async function invalidateGuildConfigCache(guildId: string): Promise<boolean> {
  const key = `guild:${guildId}:config`;
  try {
    await withTimeout(redis.del(key), CACHE_TIMEOUT_MS);
    return true;
  } catch (error) {
    logger.warn('Guild configuration persisted but cache invalidation failed', { guildId, key, error });
    return false;
  }
}

export function withCacheWarning<T extends object>(payload: T, cacheInvalidated: boolean): T & { warning?: string } {
  return cacheInvalidated ? payload : { ...payload, warning: CACHE_VISIBILITY_WARNING };
}
