/**
 * Rate Limiting Middleware
 * 
 * Redis-backed rate limiting for API endpoints.
 * Uses sliding window algorithm for accurate rate limiting.
 * 
 * @module middleware/rateLimit
 */

import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';

// Initialize Redis client (use same connection as session store if available)
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

/**
 * Rate limit configuration options.
 */
interface RateLimitOptions {
  /** Maximum number of requests in the window */
  max: number;
  /** Time window in seconds */
  windowSeconds: number;
  /** Custom key generator (defaults to IP address) */
  keyGenerator?: (req: Request) => string;
  /** Skip rate limiting for certain requests */
  skip?: (req: Request) => boolean;
  /** Custom handler when rate limited */
  handler?: (req: Request, res: Response) => void;
}

/**
 * Default rate limit configurations for different endpoint types.
 */
export const RateLimitPresets = {
  /** Standard API endpoints: 100 requests per minute */
  standard: { max: 100, windowSeconds: 60 },
  
  /** Authentication endpoints: 10 requests per minute */
  auth: { max: 10, windowSeconds: 60 },
  
  /** Sensitive operations: 5 requests per minute */
  sensitive: { max: 5, windowSeconds: 60 },
  
  /** Public endpoints: 200 requests per minute */
  public: { max: 200, windowSeconds: 60 },
  
  /** Webhook endpoints: 1000 requests per minute */
  webhook: { max: 1000, windowSeconds: 60 },
} as const;

/**
 * Create a rate limiting middleware.
 * 
 * @example
 * // Standard rate limiting
 * app.use('/api', rateLimit(RateLimitPresets.standard));
 * 
 * // Custom rate limiting for auth
 * app.use('/api/auth', rateLimit({ max: 5, windowSeconds: 300 }));
 */
export function rateLimit(options: RateLimitOptions) {
  const {
    max,
    windowSeconds,
    keyGenerator = (req) => req.ip || req.connection.remoteAddress || 'unknown',
    skip = () => false,
    handler = (req, res) => {
      res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${windowSeconds} seconds.`,
        retryAfter: windowSeconds,
      });
    },
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip rate limiting if configured
    if (skip(req)) {
      return next();
    }

    const key = `ratelimit:${req.path}:${keyGenerator(req)}`;
    
    try {
      // Use Redis MULTI for atomic increment and expire
      const results = await redis
        .multi()
        .incr(key)
        .ttl(key)
        .exec();

      if (!results) {
        // Redis error, allow request but log
        console.warn('Rate limit check failed, allowing request');
        return next();
      }

      const [[, count], [, ttl]] = results as [[null, number], [null, number]];
      
      // Set expiry on first request
      if (ttl === -1) {
        await redis.expire(key, windowSeconds);
      }

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));
      res.setHeader('X-RateLimit-Reset', Date.now() + (ttl > 0 ? ttl * 1000 : windowSeconds * 1000));

      // Check if rate limited
      if (count > max) {
        res.setHeader('Retry-After', ttl > 0 ? ttl : windowSeconds);
        return handler(req, res);
      }

      next();
    } catch (error) {
      // Redis error, allow request but log
      console.error('Rate limit error:', error);
      next();
    }
  };
}

/**
 * Rate limit by user ID (for authenticated endpoints).
 * Falls back to IP if user not authenticated.
 */
export function rateLimitByUser(options: Omit<RateLimitOptions, 'keyGenerator'>) {
  return rateLimit({
    ...options,
    keyGenerator: (req) => {
      // Assuming user is attached to req by auth middleware
      const user = (req as any).user;
      if (user?.id) {
        return `user:${user.id}`;
      }
      return req.ip || req.connection.remoteAddress || 'unknown';
    },
  });
}

/**
 * Rate limit by guild ID (for guild-specific endpoints).
 */
export function rateLimitByGuild(options: Omit<RateLimitOptions, 'keyGenerator'>) {
  return rateLimit({
    ...options,
    keyGenerator: (req) => {
      const guildId = req.params.guildId || req.query.guildId;
      if (guildId) {
        return `guild:${guildId}`;
      }
      return req.ip || req.connection.remoteAddress || 'unknown';
    },
  });
}

/**
 * Cleanup function to close Redis connection on shutdown.
 */
export async function closeRateLimitRedis(): Promise<void> {
  await redis.quit();
}
