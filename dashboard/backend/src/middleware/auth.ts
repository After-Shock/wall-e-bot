import { Request, Response, NextFunction, RequestHandler } from 'express';
import { db } from '../db/index.js';
import { isBotOwner } from '@wall-e/shared';
import { getUserGuilds, isGuildAdmin, GuildResolutionError } from '../utils/userGuilds.js';

export interface AuthenticatedUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email: string | null;
  accessToken: string;
  refreshToken: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  next();
};

/**
 * Map a failed guild resolution to a response. Never falls through to "allowed":
 * a dead token means log in again, an unreachable Discord means try later.
 */
function respondToGuildResolutionError(res: Response, error: unknown): void {
  if (error instanceof GuildResolutionError && error.kind === 'reauth') {
    res.status(401).json({ error: 'Session expired, please log in again' });
    return;
  }
  res.status(503).json({ error: 'Could not verify permissions, please try again' });
}

export const requireGuildAccess: RequestHandler = async (req, res, next) => {
  try {
    const guildId = req.params.guildId;
    const user = (req as AuthenticatedRequest).user;

    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Fast path: user has MANAGE_GUILD / ADMINISTRATOR / is owner.
    // Resolved live (Redis-cached, 5 min) rather than from the session, so a
    // demotion in Discord takes effect in minutes instead of at next login.
    let guilds;
    try {
      guilds = await getUserGuilds(user);
    } catch (error) {
      respondToGuildResolutionError(res, error);
      return;
    }

    if (isGuildAdmin(guilds, guildId)) {
      next();
      return;
    }

    // Slow path: check if guild has configured dashboard roles
    const rolesResult = await db.query(
      'SELECT role_id FROM dashboard_roles WHERE guild_id = $1',
      [guildId],
    );

    if (rolesResult.rows.length === 0) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    // Call Discord API with bot token to get user's guild member roles
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
      res.status(500).json({ error: 'Bot token not configured' });
      return;
    }

    const memberResponse = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${user.id}`,
      { headers: { Authorization: `Bot ${token}` } },
    );

    if (!memberResponse.ok) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const member = await memberResponse.json() as { roles: string[] };
    const allowedRoleIds = new Set<string>(rolesResult.rows.map((r: { role_id: string }) => r.role_id));
    const hasRole = member.roles.some(roleId => allowedRoleIds.has(roleId));

    if (!hasRole) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Like requireGuildAccess but only allows MANAGE_GUILD/ADMINISTRATOR/owner — no role fallback.
// Used for routes that edit the dashboard access list itself.
export const requireGuildAdmin: RequestHandler = async (req, res, next) => {
  const guildId = req.params.guildId;
  const user = (req as AuthenticatedRequest).user;

  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  let guilds;
  try {
    guilds = await getUserGuilds(user);
  } catch (error) {
    respondToGuildResolutionError(res, error);
    return;
  }

  if (!isGuildAdmin(guilds, guildId)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  next();
};

export const requireBotOwner: RequestHandler = (req, res, next) => {
  const user = (req as AuthenticatedRequest).user;
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  if (!isBotOwner(user.id, process.env.BOT_OWNER_ID)) {
    res.status(403).json({ error: 'Bot owner only' });
    return;
  }
  next();
};
