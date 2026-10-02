/**
 * User guild list, fetched from Discord and cached briefly in Redis.
 *
 * This used to live in the session: passport serialized the entire Discord
 * profile, guilds included, and every authorization decision read that snapshot
 * for the 7-day life of the session. A user demoted in Discord kept dashboard
 * write access for a week, and a user in many guilds carried a ~100 KB session
 * that was rewritten on every request.
 *
 * Now the session holds identity only and the guild list is resolved here, with
 * a short TTL so a permission change takes effect in minutes rather than days.
 *
 * @module utils/userGuilds
 */

import { redis } from '../redis.js';
import { logger } from './logger.js';
import { withTimeout } from './withTimeout.js';

/** Seconds a user's guild list is cached. Permission changes apply within this window. */
const CACHE_TTL = 300;

/**
 * Milliseconds to wait on the cache before giving up and asking Discord.
 * The cache is an optimization; it is never worth blocking an authorization
 * decision on. See utils/withTimeout.ts for why this is needed at all.
 */
const CACHE_TIMEOUT_MS = 500;

const MANAGE_GUILD = BigInt(0x20);
const ADMINISTRATOR = BigInt(0x8);

export interface UserGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

/**
 * Why a guild list could not be resolved. Callers map this to a status code:
 * `reauth` means the Discord token is dead and the user must log in again,
 * `unavailable` means Discord is down and we refuse rather than guess.
 */
export class GuildResolutionError extends Error {
  constructor(public readonly kind: 'reauth' | 'unavailable', message: string) {
    super(message);
    this.name = 'GuildResolutionError';
  }
}

// Concurrent requests for the same user share one Discord call. A page load fires
// several API requests at once; when the cache had just expired each one asked
// Discord separately and this endpoint's rate limit turned the extras into 503s.
// ponytail: in-process only (one backend container); use a Redis lock if the API is scaled out.
const inflight = new Map<string, Promise<UserGuild[]>>();

/** Longest Discord-requested wait we'll sit through before retrying a 429 once. */
const MAX_RETRY_WAIT_MS = 2000;

/**
 * Resolve the guilds a user is in.
 *
 * Throws rather than returning an empty list: an empty list is a legitimate
 * answer ("this user is in no guilds") and must never be produced by a failure,
 * or an outage silently becomes "access denied to everything" — or worse, is
 * mistaken for a valid state by a caller that only checks for absence.
 */
export async function getUserGuilds(user: { id: string; accessToken: string }): Promise<UserGuild[]> {
  const cacheKey = `userguilds:${user.id}`;

  try {
    const cached = await withTimeout(redis.get(cacheKey), CACHE_TIMEOUT_MS);
    if (cached) return JSON.parse(cached) as UserGuild[];
  } catch {
    // Redis unavailable — fall through to Discord.
  }

  const pending = inflight.get(user.id);
  if (pending) return pending;
  const request = fetchUserGuilds(user, cacheKey).finally(() => inflight.delete(user.id));
  inflight.set(user.id, request);
  return request;
}

async function fetchUserGuilds(user: { id: string; accessToken: string }, cacheKey: string): Promise<UserGuild[]> {
  let response: Response;
  for (let attempt = 0; ; attempt++) {
    try {
      response = await fetch('https://discord.com/api/v10/users/@me/guilds', {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });
    } catch (error) {
      logger.error(`Discord guild fetch failed for user ${user.id}:`, error);
      throw new GuildResolutionError('unavailable', 'Could not reach Discord');
    }
    if (response.status !== 429 || attempt > 0) break;
    const waitMs = Math.ceil(Number(response.headers.get('retry-after') ?? 1) * 1000);
    if (!(waitMs >= 0 && waitMs <= MAX_RETRY_WAIT_MS)) break;
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }

  if (response.status === 401) {
    throw new GuildResolutionError('reauth', 'Discord token rejected');
  }
  if (!response.ok) {
    logger.error(`Discord guild fetch returned ${response.status} for user ${user.id}`);
    throw new GuildResolutionError('unavailable', `Discord returned ${response.status}`);
  }

  const guilds = await response.json() as UserGuild[];

  try {
    await withTimeout(redis.setex(cacheKey, CACHE_TTL, JSON.stringify(guilds)), CACHE_TIMEOUT_MS);
  } catch {
    // Cache write failure is non-fatal.
  }

  return guilds;
}

/** Drop a user's cached guild list, so the next request re-reads it from Discord. */
export async function invalidateUserGuilds(userId: string): Promise<void> {
  await redis.del(`userguilds:${userId}`).catch(() => {});
}

/** True if the user owns the guild or holds MANAGE_GUILD / ADMINISTRATOR in it. */
export function isGuildAdmin(guilds: UserGuild[], guildId: string): boolean {
  const guild = guilds.find(g => g.id === guildId);
  if (!guild) return false;
  const permissions = BigInt(guild.permissions);
  return guild.owner ||
    (permissions & MANAGE_GUILD) === MANAGE_GUILD ||
    (permissions & ADMINISTRATOR) === ADMINISTRATOR;
}
