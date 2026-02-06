import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

export const usersRouter = Router();

// Get user profile
usersRouter.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await db.query(
      'SELECT discord_id, username, discriminator, avatar, created_at FROM users WHERE discord_id = $1',
      [req.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Get user's stats across all guilds
usersRouter.get('/me/stats', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await db.query(
      `SELECT 
        COUNT(DISTINCT guild_id) as guilds_count,
        SUM(total_xp) as total_xp,
        SUM(message_count) as total_messages,
        MAX(level) as highest_level
       FROM guild_members 
       WHERE user_id = $1`,
      [req.user!.id]
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
});
