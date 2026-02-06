import { Router, Request, Response } from 'express';
import passport from 'passport';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export const authRouter = Router();

authRouter.get('/login', passport.authenticate('discord'));

authRouter.get('/callback',
  passport.authenticate('discord', { failureRedirect: '/' }),
  (req: Request, res: Response) => {
    res.redirect(process.env.DASHBOARD_URL || 'http://localhost:3000');
  }
);

authRouter.get('/logout', (req: Request, res: Response) => {
  req.logout((err) => {
    if (err) {
      res.status(500).json({ error: 'Failed to logout' });
      return;
    }
    res.redirect(process.env.DASHBOARD_URL || 'http://localhost:3000');
  });
});

authRouter.get('/me', (req: Request, res: Response) => {
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
