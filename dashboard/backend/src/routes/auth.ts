import { Router } from 'express';
import passport from 'passport';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export const authRouter = Router();

authRouter.get('/login', passport.authenticate('discord'));

authRouter.get('/callback',
  passport.authenticate('discord', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect(process.env.DASHBOARD_URL || 'http://localhost:3000');
  }
);

authRouter.get('/logout', (req: AuthenticatedRequest, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.redirect(process.env.DASHBOARD_URL || 'http://localhost:3000');
  });
});

authRouter.get('/me', (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  res.json({
    id: req.user.id,
    username: req.user.username,
    discriminator: req.user.discriminator,
    avatar: req.user.avatar,
    email: req.user.email,
  });
});
