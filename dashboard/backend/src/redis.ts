import { Redis } from 'ioredis';

export const redis = new Redis(
  process.env.REDIS_URL || 'redis://redis:6379',
  { lazyConnect: process.env.NODE_ENV === 'test' },
);

// Avoid unhandled emitter noise if Redis is temporarily unavailable.
redis.on('error', () => {});
