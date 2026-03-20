import { Router, Request, Response, RequestHandler } from 'express';
import crypto from 'node:crypto';
import passport from 'passport';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { isSafeDiscordOAuthRedirect } from '../utils/security.js';
import { rateLimit, RateLimitPresets } from '../middleware/rateLimit.js';

type PassportLike = Pick<typeof passport, 'authenticate'>;

interface AuthRouterOptions {
  dashboardUrl?: string;
  generateState?: () => string;
  passportInstance?: PassportLike;
  authRateLimit?: RequestHandler;
}

export function createAuthRouter(options: AuthRouterOptions = {}) {
  const authRouter = Router();
  const dashboardUrl = options.dashboardUrl || process.env.DASHBOARD_URL || 'http://localhost:3000';
  const generateState = options.generateState || (() => crypto.randomBytes(16).toString('hex'));
  const passportInstance = options.passportInstance || passport;
  const authRateLimit = options.authRateLimit || rateLimit({
    ...RateLimitPresets.auth,
    keyGenerator: (req) => req.sessionID || req.ip || 'unknown',
  });

  authRouter.get('/login', authRateLimit, (req: Request, res: Response, next) => {
    const state = generateState();
    req.session.oauthState = state;
    passportInstance.authenticate('discord', { state })(req, res, next);
  });

  authRouter.get('/callback',
    authRateLimit,
    (req: Request, res: Response, next) => {
      const expectedState = req.session.oauthState;
      delete req.session.oauthState;

      if (
        typeof req.query.state !== 'string' ||
        !expectedState ||
        req.query.state !== expectedState
      ) {
        res.status(403).json({ error: 'Invalid OAuth state' });
        return;
      }

      next();
    },
    passportInstance.authenticate('discord', { failureRedirect: '/' }),
    (req: Request, res: Response) => {
      const target = '/dashboard';
      if (!isSafeDiscordOAuthRedirect(dashboardUrl, target)) {
        res.status(500).json({ error: 'Invalid dashboard redirect configuration' });
        return;
      }
      res.redirect(new URL(target, dashboardUrl).toString());
    },
  );

  authRouter.post('/logout', authRateLimit, (req: Request, res: Response) => {
    req.logout((err) => {
      if (err) {
        res.status(500).json({ error: 'Failed to logout' });
        return;
      }
      req.session.destroy((destroyErr) => {
        if (destroyErr) {
          res.status(500).json({ error: 'Failed to destroy session' });
          return;
        }
        res.clearCookie('connect.sid');
        res.status(204).end();
      });
    });
  });

  authRouter.get('/me', authRateLimit, (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    res.json({
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar,
      email: user.email,
    });
  });

  return authRouter;
}

export const authRouter = createAuthRouter();
