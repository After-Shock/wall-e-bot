import { Request, Response, NextFunction, RequestHandler } from 'express';
import { db } from '../db/index.js';

export interface AuthenticatedUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email: string | null;
  accessToken: string;
  refreshToken: string;
  guilds?: Array<{
    id: string;
    name: string;
    icon: string | null;
    owner: boolean;
    permissions: string;
  }>;
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

export const requireGuildAccess: RequestHandler = async (req, res, next) => {
  try {
    const guildId = req.params.guildId;
    const user = (req as AuthenticatedRequest).user;

    if (!user || !user.guilds) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Fast path: user has MANAGE_GUILD / ADMINISTRATOR / is owner
    const guild = user.guilds.find(g => g.id === guildId);
    if (guild) {
      const permissions = BigInt(guild.permissions);
      const MANAGE_GUILD = BigInt(0x20);
      const ADMINISTRATOR = BigInt(0x8);
      if (
        guild.owner ||
        (permissions & MANAGE_GUILD) === MANAGE_GUILD ||
        (permissions & ADMINISTRATOR) === ADMINISTRATOR
      ) {
        next();
        return;
      }
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
export const requireGuildAdmin: RequestHandler = (req, res, next) => {
  const guildId = req.params.guildId;
  const user = (req as AuthenticatedRequest).user;

  if (!user || !user.guilds) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const guild = user.guilds.find(g => g.id === guildId);
  if (!guild) {
    res.status(403).json({ error: 'No access to this guild' });
    return;
  }

  const permissions = BigInt(guild.permissions);
  const MANAGE_GUILD = BigInt(0x20);
  const ADMINISTRATOR = BigInt(0x8);

  if (
    !guild.owner &&
    (permissions & MANAGE_GUILD) !== MANAGE_GUILD &&
    (permissions & ADMINISTRATOR) !== ADMINISTRATOR
  ) {
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
  const ownerIds = (process.env.BOT_OWNER_ID || '').split(',').map(s => s.trim());
  if (!ownerIds.includes(user.id)) {
    res.status(403).json({ error: 'Bot owner only' });
    return;
  }
  next();
};
