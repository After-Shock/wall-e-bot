import Redis from 'ioredis';
import { logger } from '../utils/logger.js';
import type { GuildConfig } from '@wall-e/shared';

export class CacheService {
  private redis!: Redis;
  private readonly TTL = 300; // 5 minutes

  async connect() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    
    this.redis.on('connect', () => {
      logger.info('Connected to Redis');
    });

    this.redis.on('error', (err) => {
      logger.error('Redis error:', err);
    });
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

  async canGainXp(guildId: string, odiscordId: string, cooldown: number): Promise<boolean> {
    const key = `xp:${guildId}:${odiscordId}`;
    const exists = await this.redis.exists(key);
    
    if (exists) {
      return false;
    }

    await this.redis.setex(key, cooldown, '1');
    return true;
  }

  async getRateLimit(key: string, limit: number, window: number): Promise<boolean> {
    const current = await this.redis.incr(key);
    
    if (current === 1) {
      await this.redis.expire(key, window);
    }

    return current <= limit;
  }

  async getSpamTracker(guildId: string, odiscordId: string): Promise<number> {
    const key = `spam:${guildId}:${odiscordId}`;
    const count = await this.redis.get(key);
    return count ? parseInt(count) : 0;
  }

  async incrementSpamTracker(guildId: string, odiscordId: string, ttl: number): Promise<number> {
    const key = `spam:${guildId}:${odiscordId}`;
    const count = await this.redis.incr(key);
    
    if (count === 1) {
      await this.redis.expire(key, ttl);
    }

    return count;
  }

  async close() {
    await this.redis.quit();
  }
}
