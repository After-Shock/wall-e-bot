/**
 * Rate Limiting Middleware
 * 
 * Redis-backed rate limiting for API endpoints.
 *
 * Fixed window, not sliding: a caller can send up to `max` at the end of one
 * window and `max` again at the start of the next, so the real worst case is
 * 2x over a window boundary. That is fine for what these limits are for; if a
 * hard bound is ever needed, switch to a sorted-set sliding log.
 * 
 * @module middleware/rateLimit
 */

import { Request, Response, NextFunction } from 'express';
import { redis } from '../redis.js';
import { logger } from '../utils/logger.js';
import { withTimeout } from '../utils/withTimeout.js';

/**
 * INCR then EXPIRE is not atomic: if the process dies between them the key has
 * no TTL and never expires, permanently rate-limiting that caller. One script
 * does both under Redis' single-threaded execution.
 */
/** A rate-limit check must never outlive this; see utils/withTimeout.ts. */
const REDIS_TIMEOUT_MS = 500;

const INCR_WITH_TTL = `
  local n = redis.call('INCR', KEYS[1])
  if n == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return {n, redis.call('TTL', KEYS[1])}
`;

interface RedisWithScripts {
  incrWithTtl(key: string, ttlSeconds: number): Promise<[number, number]>;
}

redis.defineCommand('incrWithTtl', { numberOfKeys: 1, lua: INCR_WITH_TTL });
const scripted = redis as unknown as RedisWithScripts;

/**
 * Bucket requests by route *pattern*, not resolved path.
 *
 * `req.path` embeds every path parameter, so `/guilds/<snowflake>/...` minted a
 * fresh Redis key per guild per route — unbounded key cardinality, and a limit
 * that never actually bound anything shared. `req.route.path` is the pattern.
 */
function routeKey(req: Request): string {
  return `${req.baseUrl}${req.route?.path ?? req.path}`;
}

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
  /**
   * What to do when Redis is unreachable. Default false (allow the request, so
   * a cache outage doesn't take the whole API down). Set true on anything
   * security-relevant, where losing the limit is worse than losing the endpoint.
   */
  failClosed?: boolean;
}

/**
 * Default rate limit configurations for different endpoint types.
 */
export const RateLimitPresets = {
  /** Standard API endpoints: 100 requests per minute */
  standard: { max: 100, windowSeconds: 60 },
  
  /**
   * Authentication endpoints: 10 requests per minute.
   * failClosed: an attacker who can knock Redis over must not thereby remove
   * the limit that protects the login path.
   */
  auth: { max: 10, windowSeconds: 60, failClosed: true },
  
  /** Sensitive operations: 5 requests per minute. Fails closed, as above. */
  sensitive: { max: 5, windowSeconds: 60, failClosed: true },
  
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
    keyGenerator = (req) => req.ip || req.socket.remoteAddress || 'unknown',
    skip = () => false,
    failClosed = false,
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

    const key = `ratelimit:${routeKey(req)}:${keyGenerator(req)}`;

    let count: number;
    let ttl: number;
    try {
      [count, ttl] = await withTimeout(scripted.incrWithTtl(key, windowSeconds), REDIS_TIMEOUT_MS);
    } catch (error) {
      logger.error(`Rate limit check failed for ${key}:`, error);
      if (failClosed) {
        res.status(503).json({
          error: 'Service Unavailable',
          message: 'Rate limiting is temporarily unavailable. Please try again.',
        });
        return;
      }
      return next();
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
      return req.ip || req.socket.remoteAddress || 'unknown';
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
      return req.ip || req.socket.remoteAddress || 'unknown';
    },
  });
}
