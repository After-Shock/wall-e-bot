import { Router, Request, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const botRouter = Router();

// Get bot info
botRouter.get('/info', asyncHandler(async (req, res) => {
  try {
    // This would typically fetch from the bot via IPC or a shared database
    res.json({
      name: 'Wall-E Bot',
      version: '1.0.0',
      description: 'A feature-rich Discord bot with moderation, leveling, and more!',
      inviteUrl: `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&permissions=8&scope=bot%20applications.commands`,
    });
  } catch (error) {
    logger.error('Error fetching bot info:', error);
    res.status(500).json({ error: 'Failed to fetch bot info' });
  }
}));

// Get bot stats
botRouter.get('/stats', asyncHandler(async (req, res) => {
  try {
    // In production, this would query the actual bot stats
    res.json({
      guilds: 0,
      users: 0,
      commands: 12,
      uptime: Date.now(),
    });
  } catch (error) {
    logger.error('Error fetching bot stats:', error);
    res.status(500).json({ error: 'Failed to fetch bot stats' });
  }
}));

// Update bot nickname for a guild
botRouter.patch('/guilds/:guildId/nickname', requireAuth, asyncHandler(async (req, res) => {
  try {
    const { guildId } = req.params;
    const { nickname } = req.body;

    // This would use the Discord API to update the bot's nickname
    // For now, we'll just acknowledge the request
    res.json({ success: true, nickname });
  } catch (error) {
    logger.error('Error updating nickname:', error);
    res.status(500).json({ error: 'Failed to update nickname' });
  }
}));
