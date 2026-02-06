import { Request, Response, NextFunction, RequestHandler } from 'express';

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

export const requireGuildAccess: RequestHandler = (req, res, next) => {
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

  // Check if user has MANAGE_GUILD permission (0x20)
  const permissions = BigInt(guild.permissions);
  const MANAGE_GUILD = BigInt(0x20);
  const ADMINISTRATOR = BigInt(0x8);

  if ((permissions & MANAGE_GUILD) !== MANAGE_GUILD && (permissions & ADMINISTRATOR) !== ADMINISTRATOR && !guild.owner) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }

  next();
};
