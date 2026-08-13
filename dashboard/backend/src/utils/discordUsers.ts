import { redis } from '../redis.js';
import { logger } from './logger.js';

export interface ResolvedUser {
  id: string;
  username: string;
  avatar: string; // CDN URL, always resolvable (falls back to Discord's default avatar)
  bot: boolean;
}

const TTL_SECONDS = 3600;
const CHUNK = 10; // keep well under Discord's global REST rate limit

export function avatarUrl(id: string, hash: string | null): string {
  if (hash) {
    const ext = hash.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${id}/${hash}.${ext}?size=64`;
  }
  // Default avatar index for post-migration usernames: (id >> 22) % 6
  const index = Number((BigInt(id) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

async function fetchOne(id: string): Promise<ResolvedUser> {
  const res = await fetch(`https://discord.com/api/v10/users/${id}`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  });
  if (!res.ok) {
    // Deleted account or transient error — degrade to the ID, don't cache.
    throw new Error(`Discord user ${id}: ${res.status}`);
  }
  const u = await res.json() as { id: string; username: string; avatar: string | null; bot?: boolean };
  return {
    id: u.id,
    username: u.username,
    avatar: avatarUrl(u.id, u.avatar),
    bot: !!u.bot,
  };
}

/**
 * Resolve Discord user IDs to display info, cached in Redis. Unknown/deleted
 * users fall back to a placeholder so the caller always gets an entry per ID.
 */
export async function resolveUsers(userIds: string[]): Promise<Record<string, ResolvedUser>> {
  const unique = [...new Set(userIds)];
  const out: Record<string, ResolvedUser> = {};
  const misses: string[] = [];

  // Cache lookup (best-effort; Redis down => treat all as misses)
  try {
    if (unique.length) {
      const cached = await redis.mget(unique.map(id => `duser:${id}`));
      unique.forEach((id, i) => {
        const raw = cached[i];
        if (raw) out[id] = JSON.parse(raw) as ResolvedUser;
        else misses.push(id);
      });
    }
  } catch {
    misses.push(...unique.filter(id => !out[id]));
  }

  for (let i = 0; i < misses.length; i += CHUNK) {
    const batch = misses.slice(i, i + CHUNK);
    const results = await Promise.allSettled(batch.map(fetchOne));
    await Promise.all(results.map(async (r, j) => {
      const id = batch[j];
      if (r.status === 'fulfilled') {
        out[id] = r.value;
        redis.set(`duser:${id}`, JSON.stringify(r.value), 'EX', TTL_SECONDS).catch(() => {});
      } else {
        logger.debug(`user resolve miss ${id}: ${r.reason}`);
        out[id] = { id, username: `Unknown (${id})`, avatar: avatarUrl(id, null), bot: false };
      }
    }));
  }

  return out;
}
