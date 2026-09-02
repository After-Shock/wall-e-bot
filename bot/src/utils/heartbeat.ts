/**
 * Bot liveness signals, published to Redis for the dashboard API to read.
 *
 * The bot and the API are separate processes, so "is the bot healthy" cannot be
 * answered by the API on its own — and the bot has no HTTP surface for a
 * monitor to poll. It writes a few small keys here instead, and
 * /health/status on the API reports on them.
 *
 * This exists because nearly every bug found in the September review failed
 * silently: a scheduled task retried forever against a deleted channel, temp
 * bans marked lifted without being lifted, a pub/sub subscriber that never
 * connected. None of them raised anything. These keys make the conditions
 * observable without needing a metrics stack.
 *
 * Every write is best-effort: a monitoring signal must never be able to break
 * the thing it is monitoring.
 *
 * @module utils/heartbeat
 */

import type { WallEClient } from '../structures/Client.js';
import { logger } from './logger.js';

/** Prefix for every key written here, so they are easy to find and expire. */
const PREFIX = 'health:bot';

/** Heartbeats outlive several missed ticks, so a stall is visible rather than absent. */
const TICK_TTL_SECONDS = 900;

/** Discord 429 counter window. */
const RATE_LIMIT_WINDOW_SECONDS = 3600;

export const HEARTBEAT_KEYS = {
  lastTick: `${PREFIX}:last_tick`,
  ready: `${PREFIX}:ready`,
  rateLimited: `${PREFIX}:rate_limited`,
} as const;

/** Record that the scheduler tick ran. Called once per 60s tick. */
export async function recordSchedulerTick(client: WallEClient): Promise<void> {
  try {
    await client.cache.redisClient.setex(
      HEARTBEAT_KEYS.lastTick,
      TICK_TTL_SECONDS,
      Date.now().toString(),
    );
  } catch {
    // Best effort — a missing heartbeat shows up as a stall, which is the
    // correct signal when Redis is the thing that is broken.
  }
}

/** Record that the bot connected to Discord, and how many guilds it serves. */
export async function recordReady(client: WallEClient): Promise<void> {
  try {
    await client.cache.redisClient.set(
      HEARTBEAT_KEYS.ready,
      JSON.stringify({
        at: Date.now(),
        guilds: client.guilds.cache.size,
        tag: client.user?.tag ?? null,
      }),
    );
  } catch {
    // best effort
  }
}

/**
 * Count Discord rate limits in a rolling window.
 *
 * A bot that is being throttled looks fine from the outside — commands just get
 * slow — so this is otherwise invisible until users complain.
 */
export function trackRateLimits(client: WallEClient): void {
  client.rest.on('rateLimited', (info) => {
    logger.warn(`Discord rate limit: ${info.method} ${info.route} for ${info.timeToReset}ms`);
    client.cache.redisClient
      .incr(HEARTBEAT_KEYS.rateLimited)
      .then(async (n) => {
        if (n === 1) await client.cache.redisClient.expire(HEARTBEAT_KEYS.rateLimited, RATE_LIMIT_WINDOW_SECONDS);
      })
      .catch(() => { /* best effort */ });
  });
}
