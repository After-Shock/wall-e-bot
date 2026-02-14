import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { requireAuth, requireGuildAccess, AuthenticatedRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { rateLimitByGuild, RateLimitPresets } from '../middleware/rateLimit.js';
import { guildConfigService, validationService } from '../services/index.js';
import * as analyticsService from '../services/analyticsService.js';
import * as backupService from '../services/backupService.js';
import { z } from 'zod';

export const guildsRouter = Router();

interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

// Get user's guilds
guildsRouter.get('/', requireAuth, asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  try {
    // Fetch user's guilds from Discord API
    const response = await fetch('https://discord.com/api/v10/users/@me/guilds', {
      headers: {
        Authorization: `Bearer ${authReq.user!.accessToken}`,
      },
    });

    if (!response.ok) {
      res.status(response.status).json({ error: 'Failed to fetch guilds' });
      return;
    }

    const guilds = await response.json() as DiscordGuild[];
    
    // Filter to guilds where user has MANAGE_GUILD or is owner
    const manageableGuilds = guilds.filter((guild) => {
      const permissions = BigInt(guild.permissions);
      const MANAGE_GUILD = BigInt(0x20);
      const ADMINISTRATOR = BigInt(0x8);
      return guild.owner || (permissions & MANAGE_GUILD) === MANAGE_GUILD || (permissions & ADMINISTRATOR) === ADMINISTRATOR;
    });

    // Store guilds in session for permission checking
    (authReq.user as any).guilds = guilds;

    // Get bot's guilds to check where bot is present
    const botGuildsResult = await db.query('SELECT guild_id FROM guild_configs');
    const botGuildIds = new Set(botGuildsResult.rows.map(r => r.guild_id));

    const guildsWithBotStatus = manageableGuilds.map((guild) => ({
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      owner: guild.owner,
      botPresent: botGuildIds.has(guild.id),
    }));

    res.json(guildsWithBotStatus);
  } catch (error) {
    logger.error('Error fetching guilds:', error);
    res.status(500).json({ error: 'Failed to fetch guilds' });
  }
}));

// Get guild config
guildsRouter.get('/:guildId', requireAuth, requireGuildAccess, asyncHandler(async (req, res) => {
  try {
    const { guildId } = req.params;
    
    const result = await db.query(
      'SELECT * FROM guild_configs WHERE guild_id = $1',
      [guildId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error fetching guild config:', error);
    res.status(500).json({ error: 'Failed to fetch guild config' });
  }
}));

// Update guild config (legacy endpoint - now with validation)
// NOTE: Prefer using feature-specific endpoints (e.g., /config/welcome) for better validation
guildsRouter.patch(
  '/:guildId',
  requireAuth,
  requireGuildAccess,
  rateLimitByGuild({ max: 20, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    try {
      const { guildId } = req.params;
      const updates = req.body;

      // Basic validation: ensure updates is an object
      if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
        res.status(400).json({
          error: 'Validation failed',
          message: 'Request body must be a valid JSON object'
        });
        return;
      }

      // Validate the full config structure if provided
      const validationResult = validationService.safeValidateConfig(
        validationService.GuildConfigSchema,
        updates
      );

      if (!validationResult.success) {
        res.status(400).json({
          error: 'Validation failed',
          message: 'Invalid configuration data',
          details: validationResult.error.errors
        });
        return;
      }

      await db.query(
        `INSERT INTO guild_configs (guild_id, config)
         VALUES ($1, $2)
         ON CONFLICT (guild_id) DO UPDATE SET config = $2, updated_at = NOW()`,
        [guildId, JSON.stringify(validationResult.data)]
      );

      res.json({ success: true, data: validationResult.data });
    } catch (error) {
      logger.error('Error updating guild config:', error);
      res.status(500).json({ error: 'Failed to update guild config' });
    }
  })
);

// Get guild leaderboard
guildsRouter.get('/:guildId/leaderboard', requireAuth, asyncHandler(async (req, res) => {
  try {
    const { guildId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = (page - 1) * limit;

    const result = await db.query(
      `SELECT user_id, xp, level, total_xp, message_count
       FROM guild_members
       WHERE guild_id = $1
       ORDER BY total_xp DESC
       LIMIT $2 OFFSET $3`,
      [guildId, limit, offset]
    );

    const countResult = await db.query(
      'SELECT COUNT(*) FROM guild_members WHERE guild_id = $1',
      [guildId]
    );

    res.json({
      data: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
    });
  } catch (error) {
    logger.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
}));

// Get guild warnings
guildsRouter.get('/:guildId/warnings', requireAuth, requireGuildAccess, asyncHandler(async (req, res) => {
  try {
    const { guildId } = req.params;
    const userId = req.query.userId as string;

    let query = 'SELECT * FROM warnings WHERE guild_id = $1';
    const params: any[] = [guildId];

    if (userId) {
      query += ' AND user_id = $2';
      params.push(userId);
    }

    query += ' ORDER BY created_at DESC LIMIT 100';

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching warnings:', error);
    res.status(500).json({ error: 'Failed to fetch warnings' });
  }
}));

// ============================================================================
// Feature-Specific Config Endpoints (with granular validation)
// ============================================================================

/**
 * Helper function to handle config section GET requests
 */
async function handleGetConfigSection(
  req: Request,
  res: Response,
  section: string,
  defaultData: any
) {
  const { guildId } = req.params;

  try {
    let data = await guildConfigService.getConfigSection(guildId, section);

    // If config doesn't exist, return defaults instead of 404
    if (!data) {
      await guildConfigService.initializeConfig(guildId);
      data = defaultData;
    }

    res.json(data);
  } catch (error) {
    logger.error(`Error fetching ${section} config:`, { guildId, error });
    res.status(500).json({ error: `Failed to fetch ${section} configuration` });
  }
}

/**
 * Helper function to handle config section PATCH requests
 */
async function handlePatchConfigSection(
  req: Request,
  res: Response,
  section: string,
  schema: z.ZodTypeAny
) {
  const { guildId } = req.params;
  const updates = req.body;

  try {
    // Validate the request body
    const validationResult = validationService.safeValidateConfig(schema, updates);

    if (!validationResult.success) {
      res.status(400).json({
        error: 'Validation failed',
        message: `Invalid ${section} configuration data`,
        details: validationResult.error.errors
      });
      return;
    }

    // Update the config section
    const updated = await guildConfigService.updateConfigSection(
      guildId,
      section,
      validationResult.data
    );

    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    logger.error(`Error updating ${section} config:`, { guildId, error });
    res.status(500).json({ error: `Failed to update ${section} configuration` });
  }
}

// Welcome Messages Configuration
guildsRouter.get(
  '/:guildId/config/welcome',
  requireAuth,
  requireGuildAccess,
  asyncHandler(async (req, res) => {
    await handleGetConfigSection(req, res, 'welcome', {
      enabled: false,
      message: 'Welcome {user} to {server}!',
      embedEnabled: false,
      dmEnabled: false,
      leaveEnabled: false,
    });
  })
);

guildsRouter.patch(
  '/:guildId/config/welcome',
  requireAuth,
  requireGuildAccess,
  rateLimitByGuild({ max: 10, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    await handlePatchConfigSection(
      req,
      res,
      'welcome',
      validationService.WelcomeConfigSchema
    );
  })
);

// Leveling Configuration
guildsRouter.get(
  '/:guildId/config/leveling',
  requireAuth,
  requireGuildAccess,
  asyncHandler(async (req, res) => {
    await handleGetConfigSection(req, res, 'leveling', {
      enabled: true,
      xpPerMessage: { min: 15, max: 25 },
      xpCooldown: 60,
      levelUpMessage: 'Congratulations {user}! You reached level {level}!',
      roleRewards: [],
      ignoredChannels: [],
      ignoredRoles: [],
      xpMultipliers: [],
    });
  })
);

guildsRouter.patch(
  '/:guildId/config/leveling',
  requireAuth,
  requireGuildAccess,
  rateLimitByGuild({ max: 10, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    await handlePatchConfigSection(
      req,
      res,
      'leveling',
      validationService.LevelingConfigSchema
    );
  })
);

// Moderation Configuration
guildsRouter.get(
  '/:guildId/config/moderation',
  requireAuth,
  requireGuildAccess,
  asyncHandler(async (req, res) => {
    await handleGetConfigSection(req, res, 'moderation', {
      warnThresholds: {
        kick: 3,
        ban: 5,
      },
      autoDeleteModCommands: false,
      dmOnAction: true,
    });
  })
);

guildsRouter.patch(
  '/:guildId/config/moderation',
  requireAuth,
  requireGuildAccess,
  rateLimitByGuild({ max: 10, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    await handlePatchConfigSection(
      req,
      res,
      'moderation',
      validationService.ModerationConfigSchema
    );
  })
);

// Auto-Moderation Configuration
guildsRouter.get(
  '/:guildId/config/automod',
  requireAuth,
  requireGuildAccess,
  asyncHandler(async (req, res) => {
    await handleGetConfigSection(req, res, 'automod', {
      enabled: false,
      antiSpam: {
        enabled: false,
        maxMessages: 5,
        interval: 5,
        action: 'warn',
      },
      wordFilter: {
        enabled: false,
        words: [],
        action: 'delete',
      },
      linkFilter: {
        enabled: false,
        allowedDomains: [],
        action: 'delete',
      },
      capsFilter: {
        enabled: false,
        threshold: 70,
        minLength: 10,
        action: 'delete',
      },
      ignoredChannels: [],
      ignoredRoles: [],
    });
  })
);

guildsRouter.patch(
  '/:guildId/config/automod',
  requireAuth,
  requireGuildAccess,
  rateLimitByGuild({ max: 10, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    await handlePatchConfigSection(
      req,
      res,
      'automod',
      validationService.AutoModConfigSchema
    );
  })
);

// Logging Configuration
guildsRouter.get(
  '/:guildId/config/logging',
  requireAuth,
  requireGuildAccess,
  asyncHandler(async (req, res) => {
    await handleGetConfigSection(req, res, 'logging', {
      enabled: false,
      events: {
        messageDelete: false,
        messageEdit: false,
        memberJoin: false,
        memberLeave: false,
        memberBan: false,
        memberUnban: false,
        roleCreate: false,
        roleDelete: false,
        channelCreate: false,
        channelDelete: false,
        voiceStateUpdate: false,
        nicknameChange: false,
        usernameChange: false,
      },
      ignoredChannels: [],
    });
  })
);

guildsRouter.patch(
  '/:guildId/config/logging',
  requireAuth,
  requireGuildAccess,
  rateLimitByGuild({ max: 10, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    await handlePatchConfigSection(
      req,
      res,
      'logging',
      validationService.LoggingConfigSchema
    );
  })
);

// Starboard Configuration
guildsRouter.get(
  '/:guildId/config/starboard',
  requireAuth,
  requireGuildAccess,
  asyncHandler(async (req, res) => {
    await handleGetConfigSection(req, res, 'starboard', {
      enabled: false,
      threshold: 3,
      emoji: '⭐',
      selfStar: false,
      ignoredChannels: [],
    });
  })
);

guildsRouter.patch(
  '/:guildId/config/starboard',
  requireAuth,
  requireGuildAccess,
  rateLimitByGuild({ max: 10, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    await handlePatchConfigSection(
      req,
      res,
      'starboard',
      validationService.StarboardConfigSchema
    );
  })
);

// ============================================================================
// Analytics Endpoints (Premium Feature)
// ============================================================================

/**
 * Get analytics overview for a guild
 * Shows summary metrics including totals and growth rates
 */
guildsRouter.get(
  '/:guildId/analytics/overview',
  requireAuth,
  requireGuildAccess,
  rateLimitByGuild({ max: 30, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    const { guildId } = req.params;

    try {
      const overview = await analyticsService.getOverview(guildId);
      res.json(overview);
    } catch (error) {
      logger.error('Error fetching analytics overview:', { guildId, error });
      res.status(500).json({ error: 'Failed to fetch analytics overview' });
    }
  })
);

/**
 * Get growth metrics over time
 * Query params: period=day|week|month
 */
guildsRouter.get(
  '/:guildId/analytics/growth',
  requireAuth,
  requireGuildAccess,
  rateLimitByGuild({ max: 20, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    const { guildId } = req.params;
    const period = (req.query.period as string) || 'day';

    if (!['day', 'week', 'month'].includes(period)) {
      res.status(400).json({ error: 'Invalid period. Must be day, week, or month' });
      return;
    }

    try {
      const growth = await analyticsService.getGrowthMetrics(
        guildId,
        period as 'day' | 'week' | 'month'
      );
      res.json(growth);
    } catch (error) {
      logger.error('Error fetching growth metrics:', { guildId, error });
      res.status(500).json({ error: 'Failed to fetch growth metrics' });
    }
  })
);

/**
 * Get content insights
 * Query params: days=number (default 30)
 */
guildsRouter.get(
  '/:guildId/analytics/insights',
  requireAuth,
  requireGuildAccess,
  rateLimitByGuild({ max: 20, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    const { guildId } = req.params;
    const days = parseInt(req.query.days as string) || 30;

    if (days < 1 || days > 365) {
      res.status(400).json({ error: 'Days must be between 1 and 365' });
      return;
    }

    try {
      const insights = await analyticsService.getContentInsights(guildId, days);
      res.json(insights);
    } catch (error) {
      logger.error('Error fetching content insights:', { guildId, error });
      res.status(500).json({ error: 'Failed to fetch content insights' });
    }
  })
);

// ============================================================================
// Backup & Restore Endpoints (Premium Feature)
// ============================================================================

/**
 * Get backup configuration
 */
guildsRouter.get(
  '/:guildId/backups/config',
  requireAuth,
  requireGuildAccess,
  asyncHandler(async (req, res) => {
    const { guildId } = req.params;

    try {
      const config = await backupService.getBackupConfig(guildId);
      res.json(config);
    } catch (error) {
      logger.error('Error fetching backup config:', { guildId, error });
      res.status(500).json({ error: 'Failed to fetch backup configuration' });
    }
  })
);

/**
 * Update backup configuration
 */
guildsRouter.patch(
  '/:guildId/backups/config',
  requireAuth,
  requireGuildAccess,
  rateLimitByGuild({ max: 10, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    const { guildId } = req.params;
    const updates = req.body;

    try {
      // Validate the request body
      const validationResult = validationService.safeValidateConfig(
        validationService.BackupConfigSchema,
        updates
      );

      if (!validationResult.success) {
        res.status(400).json({
          error: 'Validation failed',
          message: 'Invalid backup configuration data',
          details: validationResult.error.errors,
        });
        return;
      }

      const updated = await backupService.updateBackupConfig(
        guildId,
        validationResult.data
      );

      res.json({ success: true, data: updated });
    } catch (error) {
      logger.error('Error updating backup config:', { guildId, error });
      res.status(500).json({ error: 'Failed to update backup configuration' });
    }
  })
);

/**
 * List all backups for a guild
 */
guildsRouter.get(
  '/:guildId/backups',
  requireAuth,
  requireGuildAccess,
  asyncHandler(async (req, res) => {
    const { guildId } = req.params;

    try {
      const backups = await backupService.listBackups(guildId);
      res.json(backups);
    } catch (error) {
      logger.error('Error listing backups:', { guildId, error });
      res.status(500).json({ error: 'Failed to list backups' });
    }
  })
);

/**
 * Create a new manual backup
 */
guildsRouter.post(
  '/:guildId/backups',
  requireAuth,
  requireGuildAccess,
  rateLimitByGuild({ max: 5, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { guildId } = req.params;
    const { name, includeRoles, includeChannels, includeMembers } = req.body;

    if (!name || typeof name !== 'string' || name.length < 1 || name.length > 100) {
      res.status(400).json({ error: 'Invalid backup name (1-100 characters required)' });
      return;
    }

    try {
      const backup = await backupService.createBackup(
        guildId,
        name,
        authReq.user?.id,
        {
          includeRoles: !!includeRoles,
          includeChannels: !!includeChannels,
          includeMembers: !!includeMembers,
        }
      );

      res.json({ success: true, data: backup });
    } catch (error) {
      logger.error('Error creating backup:', { guildId, error });
      res.status(500).json({ error: 'Failed to create backup' });
    }
  })
);

/**
 * Get a specific backup
 */
guildsRouter.get(
  '/:guildId/backups/:backupId',
  requireAuth,
  requireGuildAccess,
  asyncHandler(async (req, res) => {
    const { guildId, backupId } = req.params;

    try {
      const backup = await backupService.getBackup(backupId, guildId);

      if (!backup) {
        res.status(404).json({ error: 'Backup not found' });
        return;
      }

      res.json(backup);
    } catch (error) {
      logger.error('Error fetching backup:', { guildId, backupId, error });
      res.status(500).json({ error: 'Failed to fetch backup' });
    }
  })
);

/**
 * Restore from a backup
 */
guildsRouter.post(
  '/:guildId/backups/:backupId/restore',
  requireAuth,
  requireGuildAccess,
  rateLimitByGuild({ max: 3, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    const { guildId, backupId } = req.params;

    try {
      await backupService.restoreBackup(backupId, guildId);
      res.json({ success: true, message: 'Backup restored successfully' });
    } catch (error) {
      logger.error('Error restoring backup:', { guildId, backupId, error });
      res.status(500).json({ error: 'Failed to restore backup' });
    }
  })
);

/**
 * Delete a backup
 */
guildsRouter.delete(
  '/:guildId/backups/:backupId',
  requireAuth,
  requireGuildAccess,
  rateLimitByGuild({ max: 10, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    const { guildId, backupId } = req.params;

    try {
      await backupService.deleteBackup(backupId, guildId);
      res.json({ success: true, message: 'Backup deleted successfully' });
    } catch (error) {
      logger.error('Error deleting backup:', { guildId, backupId, error });
      res.status(500).json({ error: 'Failed to delete backup' });
    }
  })
);
