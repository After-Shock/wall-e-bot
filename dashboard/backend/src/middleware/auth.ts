import { Request, Response, NextFunction } from 'express';

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

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

export function requireGuildAccess(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const guildId = req.params.guildId;
  const user = req.user;

  if (!user || !user.guilds) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const guild = user.guilds.find(g => g.id === guildId);
  if (!guild) {
    return res.status(403).json({ error: 'No access to this guild' });
  }

  // Check if user has MANAGE_GUILD permission (0x20)
  const permissions = BigInt(guild.permissions);
  const MANAGE_GUILD = BigInt(0x20);
  const ADMINISTRATOR = BigInt(0x8);

  if ((permissions & MANAGE_GUILD) !== MANAGE_GUILD && (permissions & ADMINISTRATOR) !== ADMINISTRATOR && !guild.owner) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  next();
}
