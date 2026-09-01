import { Redis } from 'ioredis';
import { logger } from '../utils/logger.js';
import type { GuildConfig } from '@wall-e/shared';

/**
 * INCR followed by a separate EXPIRE is not atomic. If the process dies between
 * the two calls — or Redis drops the connection — the key is left with no TTL
 * and never expires, so the counter climbs forever and whoever it belongs to is
 * permanently rate limited until someone flushes Redis by hand. One script does
 * both under Redis' single-threaded execution.
 */
const INCR_WITH_TTL = `
  local n = redis.call('INCR', KEYS[1])
  if n == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return n
`;

/** ioredis attaches scripts registered via defineCommand onto the client. */
interface RedisWithScripts extends Redis {
  incrWithTtl(key: string, ttlSeconds: number): Promise<number>;
}

export class CacheService {
  private redis!: RedisWithScripts;
  private readonly TTL = 300; // 5 minutes

  async connect() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      // By default ioredis queues commands while disconnected instead of
      // rejecting them, so a Redis outage turns every cache read into a hang
      // rather than a fast miss — and callers that were written to fall back to
      // Postgres never get the chance. This client is pure cache: failing fast
      // and taking the fallback path is always the better trade.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    }) as RedisWithScripts;
    this.redis.defineCommand('incrWithTtl', { numberOfKeys: 1, lua: INCR_WITH_TTL });

    this.redis.on('connect', () => {
      logger.info('Connected to Redis');
    });

    this.redis.on('error', (err) => {
      logger.error('Redis error:', err);
    });

    // enableOfflineQueue: false rejects commands issued before the socket is
    // ready, so wait for it here rather than letting startup traffic fail.
    await this.redis.ping();
  }

  async getGuildConfig(guildId: string): Promise<GuildConfig | null> {
    const cached = await this.redis.get(`guild:${guildId}:config`);
    return cached ? JSON.parse(cached) : null;
  }

  async setGuildConfig(guildId: string, config: GuildConfig): Promise<void> {
    await this.redis.setex(`guild:${guildId}:config`, this.TTL, JSON.stringify(config));
  }

  async invalidateGuildConfig(guildId: string): Promise<void> {
    await this.redis.del(`guild:${guildId}:config`);
  }

  /**
   * Claim this user's XP grant for the current cooldown window.
   *
   * EXISTS-then-SETEX let two messages processed in the same tick both pass and
   * both award XP. SET NX is a single atomic claim: exactly one caller wins.
   */
  async canGainXp(guildId: string, odiscordId: string, cooldown: number): Promise<boolean> {
    const key = `xp:${guildId}:${odiscordId}`;
    const claimed = await this.redis.set(key, '1', 'EX', cooldown, 'NX');
    return claimed === 'OK';
  }

  /** Generic JSON read-through cache helpers (used for per-guild custom command lists). */
  async getJson<T>(key: string): Promise<T | null> {
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) as T : null;
  }

  async setJson(key: string, value: unknown, ttlSeconds: number = this.TTL): Promise<void> {
    await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
  }

  async getRateLimit(key: string, limit: number, window: number): Promise<boolean> {
    const current = await this.redis.incrWithTtl(key, window);
    return current <= limit;
  }

  async getSpamTracker(guildId: string, odiscordId: string): Promise<number> {
    const key = `spam:${guildId}:${odiscordId}`;
    const count = await this.redis.get(key);
    return count ? parseInt(count) : 0;
  }

  async incrementSpamTracker(guildId: string, odiscordId: string, ttl: number): Promise<number> {
    const key = `spam:${guildId}:${odiscordId}`;
    return this.redis.incrWithTtl(key, ttl);
  }

  async close() {
    await this.redis.quit();
  }

  get redisClient(): Redis {
    return this.redis;
  }
}
