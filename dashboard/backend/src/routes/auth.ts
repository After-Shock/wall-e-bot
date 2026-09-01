import { Router, Request, Response, RequestHandler } from 'express';
import crypto from 'node:crypto';
import passport from 'passport';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { isSafeDiscordOAuthRedirect } from '../utils/security.js';
import { rateLimitByUser, RateLimitPresets } from '../middleware/rateLimit.js';

type PassportLike = Pick<typeof passport, 'authenticate'>;

interface AuthRouterOptions {
  dashboardUrl?: string;
  generateState?: () => string;
  passportInstance?: PassportLike;
  authRateLimit?: RequestHandler;
  readRateLimit?: RequestHandler;
}

export function createAuthRouter(options: AuthRouterOptions = {}) {
  const authRouter = Router();
  const dashboardUrl = options.dashboardUrl || process.env.DASHBOARD_URL || 'http://localhost:3000';
  const generateState = options.generateState || (() => crypto.randomBytes(16).toString('hex'));
  const passportInstance = options.passportInstance || passport;
  // Keyed by authenticated user, falling back to IP — NOT by session id.
  //
  // req.sessionID looked like a sensible key but is worthless for exactly the
  // callers that matter: with saveUninitialized: false an anonymous request
  // never gets a cookie, so express-session mints a fresh id every time and
  // each request landed in its own bucket. Measured on the deployed API: 26
  // requests created 39 distinct Redis keys and never once returned 429, so
  // login and the OAuth callback were effectively unlimited.
  //
  // rateLimitByUser already implements user-or-IP keying; reuse it. This
  // depends on `trust proxy` being set to the real hop count (see index.ts) —
  // otherwise req.ip is the proxy's address and every caller shares a bucket.
  const authRateLimit = options.authRateLimit || rateLimitByUser(RateLimitPresets.auth);

  // /me and /logout are session reads, not credential paths, and the dashboard
  // polls /me on load. Keep them limited but well clear of normal use — the
  // strict budget belongs on /login and /callback.
  const readRateLimit = options.readRateLimit || rateLimitByUser(RateLimitPresets.standard);

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

  authRouter.post('/logout', readRateLimit, (req: Request, res: Response) => {
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

  authRouter.get('/me', readRateLimit, (req: Request, res: Response) => {
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
