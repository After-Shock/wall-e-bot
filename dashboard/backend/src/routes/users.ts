import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const usersRouter = Router();

// Get user profile
usersRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const result = await db.query(
      'SELECT discord_id, username, discriminator, avatar, created_at FROM users WHERE discord_id = $1',
      [authReq.user!.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
}));

// Get user's stats across all guilds
usersRouter.get('/me/stats', requireAuth, asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const result = await db.query(
      `SELECT 
        COUNT(DISTINCT guild_id) as guilds_count,
        SUM(total_xp) as total_xp,
        SUM(message_count) as total_messages,
        MAX(level) as highest_level
       FROM guild_members 
       WHERE user_id = $1`,
      [authReq.user!.id],
    );

    res.json(result.rows[0] || {
      guilds_count: 0,
      total_xp: 0,
      total_messages: 0,
      highest_level: 0,
    });
  } catch (error) {
    logger.error('Error fetching user stats:', error);
    res.status(500).json({ error: 'Failed to fetch user stats' });
  }
}));

// Get user preferences
usersRouter.get('/me/preferences', requireAuth, asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const result = await db.query(
      'SELECT preferences FROM users WHERE discord_id = $1',
      [authReq.user!.id],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(result.rows[0].preferences);
  } catch (error) {
    logger.error('Error fetching preferences:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
}));

// Update user preferences (partial merge)
usersRouter.patch('/me/preferences', requireAuth, asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { hidden_nav } = req.body as { hidden_nav?: string[] };

    if (!Array.isArray(hidden_nav) || !hidden_nav.every(x => typeof x === 'string')) {
      res.status(400).json({ error: 'hidden_nav must be an array of strings' });
      return;
    }

    const result = await db.query(
      `UPDATE users
       SET preferences = preferences || $1::jsonb, updated_at = NOW()
       WHERE discord_id = $2
       RETURNING preferences`,
      [JSON.stringify({ hidden_nav }), authReq.user!.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(result.rows[0].preferences);
  } catch (error) {
    logger.error('Error updating preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
}));
