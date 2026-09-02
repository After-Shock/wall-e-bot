/**
 * Operational status, for the monitor that already exists.
 *
 * There is no Prometheus on this host — there is uptime-kuma, which polls HTTP
 * and alerts on the response. So rather than exporting metrics nothing scrapes,
 * this endpoint makes a judgement and encodes it in the status code:
 *
 *   200 ok        everything within thresholds
 *   200 degraded  something needs attention but the service works
 *   503 down      a dependency is gone, or the bot has stopped working
 *
 * Point an uptime-kuma HTTP monitor at /health/status for outages. For the
 * softer signals, add a second monitor with the keyword `"status":"ok"`, which
 * fails on `degraded` too.
 *
 * The checks are deliberately the failure modes that were silent before: a
 * scheduler that stopped ticking, tasks overdue or auto-disabled, jobs failing,
 * and Discord throttling.
 *
 * @module routes/status
 */

import { Router, Request, Response } from 'express';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { withTimeout } from '../utils/withTimeout.js';
import { logger } from '../utils/logger.js';

const router = Router();

let dbPool: Pool | null = null;
let redisClient: Redis | null = null;

export function initStatus(pool: Pool, redis: Redis): void {
  dbPool = pool;
  redisClient = redis;
}

/** The bot writes these; see bot/src/utils/heartbeat.ts. */
const KEY_LAST_TICK = 'health:bot:last_tick';
const KEY_READY = 'health:bot:ready';
const KEY_RATE_LIMITED = 'health:bot:rate_limited';

/**
 * The scheduler ticks every 60s. Three missed ticks is a stall, not a blip —
 * tight enough to notice, loose enough not to page on a slow tick.
 */
const TICK_STALE_MS = 3 * 60 * 1000;

/** A task still due this long after its slot is lagging, not merely late. */
const OVERDUE_MINUTES = 10;

/** No check may hang the endpoint; a monitor that never answers is not a monitor. */
const CHECK_TIMEOUT_MS = 2000;

type Level = 'ok' | 'degraded' | 'down';

interface Check {
  status: Level;
  detail?: string;
  value?: number;
}

const worst = (levels: Level[]): Level =>
  levels.includes('down') ? 'down' : levels.includes('degraded') ? 'degraded' : 'ok';

async function checkDatabase(): Promise<Check> {
  if (!dbPool) return { status: 'down', detail: 'not configured' };
  try {
    const start = Date.now();
    await withTimeout(dbPool.query('SELECT 1'), CHECK_TIMEOUT_MS);
    return { status: 'ok', value: Date.now() - start };
  } catch (err) {
    return { status: 'down', detail: (err as Error).message };
  }
}

async function checkRedis(): Promise<Check> {
  if (!redisClient) return { status: 'down', detail: 'not configured' };
  try {
    const start = Date.now();
    await withTimeout(redisClient.ping(), CHECK_TIMEOUT_MS);
    return { status: 'ok', value: Date.now() - start };
  } catch (err) {
    return { status: 'down', detail: (err as Error).message };
  }
}

/**
 * Is the bot's scheduler still running?
 *
 * A missing key is 'down', not 'unknown': the bot refreshes it every tick with
 * a TTL far longer than the interval, so absence means it has not ticked in a
 * long time — or was never up.
 */
async function checkScheduler(): Promise<Check> {
  if (!redisClient) return { status: 'down', detail: 'no redis' };
  try {
    const raw = await withTimeout(redisClient.get(KEY_LAST_TICK), CHECK_TIMEOUT_MS);
    if (!raw) return { status: 'down', detail: 'no scheduler heartbeat — bot down or never started' };

    const age = Date.now() - Number(raw);
    if (age > TICK_STALE_MS) {
      return { status: 'down', detail: `last tick ${Math.round(age / 1000)}s ago`, value: age };
    }
    return { status: 'ok', value: age };
  } catch (err) {
    return { status: 'down', detail: (err as Error).message };
  }
}

/** Scheduled messages that are overdue, or that gave up after repeated failures. */
async function checkScheduledMessages(): Promise<Check> {
  if (!dbPool) return { status: 'down', detail: 'no database' };
  try {
    const { rows } = await withTimeout(
      dbPool.query(
        `SELECT
           count(*) FILTER (WHERE enabled AND next_run < NOW() - ($1 || ' minutes')::interval) AS overdue,
           count(*) FILTER (WHERE NOT enabled AND failure_count > 0) AS disabled_by_failure
         FROM scheduled_messages`,
        [OVERDUE_MINUTES],
      ),
      CHECK_TIMEOUT_MS,
    );
    const overdue = Number(rows[0].overdue);
    const disabled = Number(rows[0].disabled_by_failure);

    if (overdue > 0) {
      return { status: 'degraded', detail: `${overdue} scheduled message(s) overdue`, value: overdue };
    }
    if (disabled > 0) {
      return {
        status: 'degraded',
        detail: `${disabled} scheduled message(s) auto-disabled after repeated failures`,
        value: disabled,
      };
    }
    return { status: 'ok', value: 0 };
  } catch (err) {
    return { status: 'down', detail: (err as Error).message };
  }
}

/** Queue jobs that failed. Non-zero means the scheduler tick threw. */
async function checkFailedJobs(): Promise<Check> {
  if (!dbPool) return { status: 'down', detail: 'no database' };
  try {
    const { rows } = await withTimeout(
      dbPool.query("SELECT count(*) AS n FROM failed_jobs WHERE failed_at > NOW() - INTERVAL '24 hours'"),
      CHECK_TIMEOUT_MS,
    );
    const n = Number(rows[0].n);
    return n > 0
      ? { status: 'degraded', detail: `${n} job failure(s) in 24h`, value: n }
      : { status: 'ok', value: 0 };
  } catch (err) {
    return { status: 'down', detail: (err as Error).message };
  }
}

/** Discord throttling. Invisible from outside — commands just get slow. */
async function checkRateLimits(): Promise<Check> {
  if (!redisClient) return { status: 'ok', detail: 'no redis' };
  try {
    const raw = await withTimeout(redisClient.get(KEY_RATE_LIMITED), CHECK_TIMEOUT_MS);
    const n = Number(raw ?? 0);
    return n > 0
      ? { status: 'degraded', detail: `${n} Discord rate limit(s) in the last hour`, value: n }
      : { status: 'ok', value: 0 };
  } catch {
    return { status: 'ok', detail: 'unavailable' };
  }
}

router.get('/status', async (_req: Request, res: Response) => {
  const [database, redis, scheduler, scheduledMessages, failedJobs, rateLimits] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkScheduler(),
    checkScheduledMessages(),
    checkFailedJobs(),
    checkRateLimits(),
  ]);

  const checks = { database, redis, scheduler, scheduledMessages, failedJobs, rateLimits };
  const status = worst(Object.values(checks).map((c) => c.status));

  let bot: unknown = null;
  try {
    const raw = redisClient ? await withTimeout(redisClient.get(KEY_READY), CHECK_TIMEOUT_MS) : null;
    bot = raw ? JSON.parse(raw) : null;
  } catch {
    bot = null;
  }

  if (status !== 'ok') {
    const failing = Object.entries(checks)
      .filter(([, c]) => c.status !== 'ok')
      .map(([name, c]) => `${name}: ${c.detail}`)
      .join('; ');
    logger.warn(`Status ${status} — ${failing}`);
  }

  // 'degraded' stays 200 so an outage monitor is not woken by a stale task.
  // Monitor the body keyword "status":"ok" to catch degraded as well.
  res.status(status === 'down' ? 503 : 200).json({
    status,
    timestamp: new Date().toISOString(),
    bot,
    checks,
  });
});

export default router;
