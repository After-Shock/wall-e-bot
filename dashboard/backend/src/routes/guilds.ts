import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { requireAuth, requireGuildAccess, requireGuildAdmin, AuthenticatedRequest, AuthenticatedUser } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { stripServerIds } from '@wall-e/shared';
import { rateLimitByGuild, rateLimitByUser, RateLimitPresets } from '../middleware/rateLimit.js';
import { guildConfigService, validationService } from '../services/index.js';
import * as analyticsService from '../services/analyticsService.js';
import * as backupService from '../services/backupService.js';
import { z } from 'zod';

// Helper: check if user has manage access to a guild
function userHasGuildAccess(user: AuthenticatedUser, guildId: string): boolean {
  if (!user.guilds) return false;
  const guild = user.guilds.find(g => g.id === guildId);
  if (!guild) return false;
  const permissions = BigInt(guild.permissions);
  const MANAGE_GUILD = BigInt(0x20);
  const ADMINISTRATOR = BigInt(0x8);
  return guild.owner ||
    (permissions & MANAGE_GUILD) === MANAGE_GUILD ||
    (permissions & ADMINISTRATOR) === ADMINISTRATOR;
}

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
    
    // Store guilds in session for permission checking (all guilds, needed by requireGuildAccess)
    (authReq.user as any).guilds = guilds;

    const MANAGE_GUILD = BigInt(0x20);
    const ADMINISTRATOR = BigInt(0x8);

    // Fetch bot guild IDs and DB role-access guild IDs in parallel
    const [botGuildsResponse, roleGuildsResult] = await Promise.all([
      fetch('https://discord.com/api/v10/users/@me/guilds', {
        headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
      }),
      db.query('SELECT DISTINCT guild_id FROM dashboard_roles'),
    ]);

    const botGuildIds = new Set<string>(
      botGuildsResponse.ok
        ? (await botGuildsResponse.json() as { id: string }[]).map(g => g.id)
        : [],
    );
    // Guilds that have at least one dashboard role configured
    const roleAccessGuildIds = new Set<string>(
      roleGuildsResult.rows.map((r: { guild_id: string }) => r.guild_id),
    );

    // Fetch premium status for bot-present guilds
    const botGuildIdsArray = [...botGuildIds];
    const premiumResult = botGuildIdsArray.length > 0
      ? await db.query(
          `SELECT guild_id FROM guild_configs WHERE guild_id = ANY($1) AND (config->>'premium')::boolean = true`,
          [botGuildIdsArray],
        )
      : { rows: [] };
    const premiumGuildIds = new Set<string>(
      premiumResult.rows.map((r: { guild_id: string }) => r.guild_id),
    );

    // Show a guild if:
    //   (a) user is admin (MANAGE_GUILD / ADMINISTRATOR / owner) — with or without bot (to allow "Add Bot")
    //   (b) bot is present AND guild has dashboard_roles configured (role-based user may have access)
    const guildsWithBotStatus = guilds
      .filter((guild) => {
        const permissions = BigInt(guild.permissions);
        const isAdmin = guild.owner ||
          (permissions & MANAGE_GUILD) === MANAGE_GUILD ||
          (permissions & ADMINISTRATOR) === ADMINISTRATOR;
        return isAdmin || (botGuildIds.has(guild.id) && roleAccessGuildIds.has(guild.id));
      })
      .map((guild) => {
        const permissions = BigInt(guild.permissions);
        const isAdmin = guild.owner ||
          (permissions & MANAGE_GUILD) === MANAGE_GUILD ||
          (permissions & ADMINISTRATOR) === ADMINISTRATOR;
        return {
          id: guild.id,
          name: guild.name,
          icon: guild.icon,
          owner: guild.owner,
          botPresent: botGuildIds.has(guild.id),
          isAdmin,
          premium: premiumGuildIds.has(guild.id),
        };
      });

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
      [guildId],
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
          message: 'Request body must be a valid JSON object',
        });
        return;
      }

      // Validate the full config structure if provided
      const validationResult = validationService.safeValidateConfig(
        validationService.GuildConfigSchema,
        updates,
      );

      if (!validationResult.success) {
        res.status(400).json({
          error: 'Validation failed',
          message: 'Invalid configuration data',
          details: validationResult.error.errors,
        });
        return;
      }

      await db.query(
        `INSERT INTO guild_configs (guild_id, config)
         VALUES ($1, $2)
         ON CONFLICT (guild_id) DO UPDATE SET config = $2, updated_at = NOW()`,
        [guildId, JSON.stringify(validationResult.data)],
      );

      res.json({ success: true, data: validationResult.data });
    } catch (error) {
      logger.error('Error updating guild config:', error);
      res.status(500).json({ error: 'Failed to update guild config' });
    }
  }),
);

// Get guild stats from Discord API
guildsRouter.get('/:guildId/stats', requireAuth, requireGuildAccess, asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  try {
    const [guildRes, channelsRes] = await Promise.all([
      fetch(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, {
        headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
      }),
      fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
        headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
      }),
    ]);

    if (!guildRes.ok) {
      res.status(guildRes.status).json({ error: 'Failed to fetch guild from Discord' });
      return;
    }

    const guild = await guildRes.json() as any;
    const channels = channelsRes.ok ? (await channelsRes.json() as any[]) : [];

    // Channel type constants
    const TEXT = 0, VOICE = 2, CATEGORY = 4;
    const textCount = channels.filter(c => c.type === TEXT).length;
    const voiceCount = channels.filter(c => c.type === VOICE).length;
    const categoryCount = channels.filter(c => c.type === CATEGORY).length;

    // Derive creation date from snowflake
    const createdAt = new Date(Number((BigInt(guildId) >> 22n) + 1420070400000n)).toISOString();

    res.json({
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      description: guild.description || null,
      ownerId: guild.owner_id,
      memberCount: guild.approximate_member_count ?? guild.member_count ?? 0,
      onlineCount: guild.approximate_presence_count ?? 0,
      roleCount: (guild.roles as any[])?.length ?? 0,
      emojiCount: (guild.emojis as any[])?.length ?? 0,
      channels: { text: textCount, voice: voiceCount, categories: categoryCount },
      boostLevel: guild.premium_tier ?? 0,
      boostCount: guild.premium_subscription_count ?? 0,
      verificationLevel: guild.verification_level ?? 0,
      createdAt,
    });
  } catch (error) {
    logger.error('Error fetching guild stats:', error);
    res.status(500).json({ error: 'Failed to fetch guild stats' });
  }
}));

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
      [guildId, limit, offset],
    );

    const countResult = await db.query(
      'SELECT COUNT(*) FROM guild_members WHERE guild_id = $1',
      [guildId],
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
  defaultData: any,
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
  schema: z.ZodTypeAny,
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
        details: validationResult.error.errors,
      });
      return;
    }

    // Update the config section
    const updated = await guildConfigService.updateConfigSection(
      guildId,
      section,
      validationResult.data,
    );

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    logger.error(`Error updating ${section} config:`, { guildId, error });
    res.status(500).json({ error: `Failed to update ${section} configuration` });
  }
}

// General Settings (prefix, etc.)
guildsRouter.get(
  '/:guildId/config/general',
  requireAuth,
  requireGuildAccess,
  asyncHandler(async (req, res) => {
    const { guildId } = req.params;
    const result = await db.query(
      'SELECT config->>\'prefix\' AS prefix FROM guild_configs WHERE guild_id = $1',
      [guildId],
    );
    res.json({ prefix: result.rows[0]?.prefix ?? '!' });
  }),
);

guildsRouter.patch(
  '/:guildId/config/general',
  requireAuth,
  requireGuildAccess,
  asyncHandler(async (req, res) => {
    const { guildId } = req.params;
    const { prefix } = req.body;

    const parsed = z.string().min(1).max(5).safeParse(prefix);
    if (!parsed.success) {
      res.status(400).json({ error: 'Prefix must be 1–5 characters' });
      return;
    }

    await db.query(
      `INSERT INTO guild_configs (guild_id, config, updated_at)
       VALUES ($1, jsonb_build_object('prefix', $2::text), NOW())
       ON CONFLICT (guild_id) DO UPDATE
         SET config = guild_configs.config || jsonb_build_object('prefix', $2::text),
             updated_at = NOW()`,
      [guildId, parsed.data],
    );
    res.json({ prefix: parsed.data });
  }),
);

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
  }),
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
      validationService.WelcomeConfigSchema,
    );
  }),
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
  }),
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
      validationService.LevelingConfigSchema,
    );
  }),
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
  }),
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
      validationService.ModerationConfigSchema,
    );
  }),
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
  }),
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
      validationService.AutoModConfigSchema,
    );
  }),
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
  }),
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
      validationService.LoggingConfigSchema,
    );
  }),
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
  }),
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
      validationService.StarboardConfigSchema,
    );
  }),
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
      const [overview, discordRes] = await Promise.all([
        analyticsService.getOverview(guildId),
        fetch(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, {
          headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
        }),
      ]);

      // Use Discord API for accurate member/online counts
      if (discordRes.ok) {
        const discordGuild = await discordRes.json() as any;
        overview.totalMembers = discordGuild.approximate_member_count ?? overview.totalMembers;
      }

      res.json(overview);
    } catch (error) {
      logger.error('Error fetching analytics overview:', { guildId, error });
      res.status(500).json({ error: 'Failed to fetch analytics overview' });
    }
  }),
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
        period as 'day' | 'week' | 'month',
      );
      res.json(growth);
    } catch (error) {
      logger.error('Error fetching growth metrics:', { guildId, error });
      res.status(500).json({ error: 'Failed to fetch growth metrics' });
    }
  }),
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
  }),
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
  }),
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
        updates,
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
        validationResult.data,
      );

      res.json({ success: true, data: updated });
    } catch (error) {
      logger.error('Error updating backup config:', { guildId, error });
      res.status(500).json({ error: 'Failed to update backup configuration' });
    }
  }),
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
  }),
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
        },
      );

      res.json({ success: true, data: backup });
    } catch (error) {
      logger.error('Error creating backup:', { guildId, error });
      res.status(500).json({ error: 'Failed to create backup' });
    }
  }),
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
  }),
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
  }),
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
  }),
);

// ============================================================================
// Ticket System Endpoints
// ============================================================================

// GET /guilds/:guildId/ticket-config
guildsRouter.get('/:guildId/ticket-config', requireAuth, requireGuildAccess, asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  try {
    const result = await db.query('SELECT * FROM ticket_config WHERE guild_id = $1', [guildId]);
    res.json(result.rows[0] || {
      guild_id: guildId, transcript_channel_id: null,
      max_tickets_per_user: 1, auto_close_hours: 0,
      welcome_message: 'Welcome! Please describe your issue and a staff member will assist you shortly.',
    });
  } catch (error) {
    logger.error('Error fetching ticket config:', { guildId, error });
    res.status(500).json({ error: 'Failed to fetch ticket configuration' });
  }
}));

// PUT /guilds/:guildId/ticket-config
guildsRouter.put('/:guildId/ticket-config', requireAuth, requireGuildAccess,
  rateLimitByGuild({ max: 10, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    const { guildId } = req.params;
    const { transcript_channel_id, max_tickets_per_user, auto_close_hours, welcome_message } = req.body;
    try {
      await db.query(
        `INSERT INTO ticket_config (guild_id, transcript_channel_id, max_tickets_per_user, auto_close_hours, welcome_message)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (guild_id) DO UPDATE SET
           transcript_channel_id=$2, max_tickets_per_user=$3,
           auto_close_hours=$4, welcome_message=$5, updated_at=NOW()`,
        [guildId, transcript_channel_id||null, max_tickets_per_user||1, auto_close_hours||0, welcome_message||''],
      );
      res.json({ success: true });
    } catch (error) {
      logger.error('Error updating ticket config:', { guildId, error });
      res.status(500).json({ error: 'Failed to update ticket configuration' });
    }
  }),
);

// GET /guilds/:guildId/ticket-panels
guildsRouter.get('/:guildId/ticket-panels', requireAuth, requireGuildAccess, asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  try {
    const panels = await db.query('SELECT * FROM ticket_panels WHERE guild_id = $1 ORDER BY id', [guildId]);
    if (panels.rows.length === 0) {
      res.json([]);
      return;
    }
    const panelIds = panels.rows.map((p: any) => p.id);
    const cats = await db.query(
      'SELECT * FROM ticket_categories WHERE panel_id = ANY($1::int[]) ORDER BY panel_id, position',
      [panelIds],
    );
    // Group categories by panel_id
    const catsByPanel: Record<number, any[]> = {};
    for (const cat of cats.rows) {
      if (!catsByPanel[cat.panel_id]) catsByPanel[cat.panel_id] = [];
      catsByPanel[cat.panel_id].push(cat);
    }
    const result = panels.rows.map((p: any) => ({ ...p, categories: catsByPanel[p.id] || [] }));
    res.json(result);
  } catch (error) {
    logger.error('Error fetching ticket panels:', { guildId, error });
    res.status(500).json({ error: 'Failed to fetch ticket panels' });
  }
}));

// POST /guilds/:guildId/ticket-panels
guildsRouter.post('/:guildId/ticket-panels', requireAuth, requireGuildAccess,
  rateLimitByGuild({ max: 10, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    const { guildId } = req.params;
    const { name, style = 'channel', panel_type = 'buttons', category_open_id, category_closed_id,
            overflow_category_id, channel_name_template = '{type}-{number}',
            stack_group, stack_position = 0 } = req.body;
    if (!name) { res.status(400).json({ error: 'name is required' }); return; }
    try {
      const r = await db.query(
        `INSERT INTO ticket_panels (guild_id,name,style,panel_type,category_open_id,category_closed_id,overflow_category_id,channel_name_template,stack_group,stack_position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [guildId, name, style, panel_type, category_open_id||null, category_closed_id||null, overflow_category_id||null, channel_name_template, stack_group||null, stack_position],
      );
      res.json(r.rows[0]);
    } catch (error) {
      logger.error('Error creating ticket panel:', { guildId, error });
      res.status(500).json({ error: 'Failed to create ticket panel' });
    }
  }),
);

// GET /guilds/:guildId/ticket-panels/:panelId
guildsRouter.get('/:guildId/ticket-panels/:panelId', requireAuth, requireGuildAccess, asyncHandler(async (req, res) => {
  const { guildId, panelId } = req.params;
  try {
    const panel = await db.query('SELECT * FROM ticket_panels WHERE id=$1 AND guild_id=$2', [panelId, guildId]);
    if (!panel.rows[0]) { res.status(404).json({ error: 'Panel not found' }); return; }
    const cats = await db.query('SELECT * FROM ticket_categories WHERE panel_id=$1 ORDER BY position', [panelId]);
    const catIds = cats.rows.map((c: any) => c.id);
    const fieldsByCategory: Record<number, any[]> = {};
    if (catIds.length > 0) {
      const fields = await db.query(
        'SELECT * FROM ticket_form_fields WHERE category_id = ANY($1::int[]) ORDER BY category_id, position',
        [catIds],
      );
      for (const f of fields.rows) {
        if (!fieldsByCategory[f.category_id]) fieldsByCategory[f.category_id] = [];
        fieldsByCategory[f.category_id].push(f);
      }
    }
    const categoriesWithFields = cats.rows.map((cat: any) => ({
      ...cat,
      form_fields: fieldsByCategory[cat.id] || [],
    }));
    res.json({ ...panel.rows[0], categories: categoriesWithFields });
  } catch (error) {
    logger.error('Error fetching ticket panel:', { guildId, panelId, error });
    res.status(500).json({ error: 'Failed to fetch ticket panel' });
  }
}));

// PUT /guilds/:guildId/ticket-panels/:panelId
guildsRouter.put('/:guildId/ticket-panels/:panelId', requireAuth, requireGuildAccess,
  rateLimitByGuild({ max: 20, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    const { guildId, panelId } = req.params;
    const { name, style, panel_type, category_open_id, category_closed_id, overflow_category_id,
            channel_name_template, stack_group, stack_position } = req.body;
    try {
      const r = await db.query(
        `UPDATE ticket_panels SET
           name=COALESCE($3,name), style=COALESCE($4,style), panel_type=COALESCE($5,panel_type),
           category_open_id=$6, category_closed_id=$7, overflow_category_id=$8,
           channel_name_template=COALESCE($9,channel_name_template),
           stack_group=COALESCE($10,stack_group),
           stack_position=COALESCE($11,stack_position)
         WHERE id=$1 AND guild_id=$2 RETURNING *`,
        [panelId, guildId, name, style, panel_type, category_open_id||null, category_closed_id||null, overflow_category_id||null, channel_name_template, stack_group??null, stack_position??null],
      );
      if (!r.rows[0]) { res.status(404).json({ error: 'Panel not found' }); return; }
      res.json(r.rows[0]);
    } catch (error) {
      logger.error('Error updating ticket panel:', { guildId, panelId, error });
      res.status(500).json({ error: 'Failed to update ticket panel' });
    }
  }),
);

// DELETE /guilds/:guildId/ticket-panels/:panelId
guildsRouter.delete('/:guildId/ticket-panels/:panelId', requireAuth, requireGuildAccess,
  rateLimitByGuild({ max: 10, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    const { guildId, panelId } = req.params;
    try {
      const r = await db.query('DELETE FROM ticket_panels WHERE id=$1 AND guild_id=$2 RETURNING id', [panelId, guildId]);
      if (!r.rows[0]) { res.status(404).json({ error: 'Panel not found' }); return; }
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting ticket panel:', { guildId, panelId, error });
      res.status(500).json({ error: 'Failed to delete ticket panel' });
    }
  }),
);

// POST /guilds/:guildId/ticket-panels/:panelId/categories
guildsRouter.post('/:guildId/ticket-panels/:panelId/categories', requireAuth, requireGuildAccess,
  rateLimitByGuild({ max: 20, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    const { guildId, panelId } = req.params;
    const { name, emoji, description, support_role_ids = [], observer_role_ids = [] } = req.body;
    if (!name) { res.status(400).json({ error: 'name is required' }); return; }
    // Validate role ID arrays
    const isValidSnowflake = (id: string) => /^\d{17,20}$/.test(id);
    if (!Array.isArray(support_role_ids) || support_role_ids.length > 10 || !support_role_ids.every(isValidSnowflake)) {
      res.status(400).json({ error: 'support_role_ids must be an array of up to 10 Discord snowflakes' });
      return;
    }
    if (!Array.isArray(observer_role_ids) || observer_role_ids.length > 10 || !observer_role_ids.every(isValidSnowflake)) {
      res.status(400).json({ error: 'observer_role_ids must be an array of up to 10 Discord snowflakes' });
      return;
    }
    try {
      const posResult = await db.query(
        'SELECT COALESCE(MAX(position),-1)+1 as next FROM ticket_categories WHERE panel_id=$1',
        [panelId],
      );
      const r = await db.query(
        `INSERT INTO ticket_categories (panel_id,guild_id,name,emoji,description,support_role_ids,observer_role_ids,position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [panelId, guildId, name, emoji||null, description||null, support_role_ids, observer_role_ids, posResult.rows[0].next],
      );
      res.json(r.rows[0]);
    } catch (error) {
      logger.error('Error creating ticket category:', { guildId, panelId, error });
      res.status(500).json({ error: 'Failed to create ticket category' });
    }
  }),
);

// PUT /guilds/:guildId/ticket-categories/:categoryId
guildsRouter.put('/:guildId/ticket-categories/:categoryId', requireAuth, requireGuildAccess,
  rateLimitByGuild({ max: 20, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    const { guildId, categoryId } = req.params;
    const { name, emoji, description, support_role_ids, observer_role_ids, position } = req.body;
    // Validate role ID arrays if provided
    const isValidSnowflake = (id: string) => /^\d{17,20}$/.test(id);
    if (support_role_ids !== undefined) {
      if (!Array.isArray(support_role_ids) || support_role_ids.length > 10 || !support_role_ids.every(isValidSnowflake)) {
        res.status(400).json({ error: 'support_role_ids must be an array of up to 10 Discord snowflakes' });
        return;
      }
    }
    if (observer_role_ids !== undefined) {
      if (!Array.isArray(observer_role_ids) || observer_role_ids.length > 10 || !observer_role_ids.every(isValidSnowflake)) {
        res.status(400).json({ error: 'observer_role_ids must be an array of up to 10 Discord snowflakes' });
        return;
      }
    }
    try {
      const r = await db.query(
        `UPDATE ticket_categories SET
           name=COALESCE($3,name), emoji=$4, description=$5,
           support_role_ids=COALESCE($6,support_role_ids),
           observer_role_ids=COALESCE($7,observer_role_ids),
           position=COALESCE($8,position)
         WHERE id=$1 AND guild_id=$2 RETURNING *`,
        [categoryId, guildId, name, emoji||null, description||null, support_role_ids, observer_role_ids, position],
      );
      if (!r.rows[0]) { res.status(404).json({ error: 'Category not found' }); return; }
      res.json(r.rows[0]);
    } catch (error) {
      logger.error('Error updating ticket category:', { guildId, categoryId, error });
      res.status(500).json({ error: 'Failed to update ticket category' });
    }
  }),
);

// DELETE /guilds/:guildId/ticket-categories/:categoryId
guildsRouter.delete('/:guildId/ticket-categories/:categoryId', requireAuth, requireGuildAccess,
  rateLimitByGuild({ max: 10, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    const { guildId, categoryId } = req.params;
    try {
      const r = await db.query('DELETE FROM ticket_categories WHERE id=$1 AND guild_id=$2 RETURNING id', [categoryId, guildId]);
      if (!r.rows[0]) { res.status(404).json({ error: 'Category not found' }); return; }
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting ticket category:', { guildId, categoryId, error });
      res.status(500).json({ error: 'Failed to delete ticket category' });
    }
  }),
);

// GET /guilds/:guildId/ticket-categories/:categoryId/form-fields
guildsRouter.get('/:guildId/ticket-categories/:categoryId/form-fields', requireAuth, requireGuildAccess,
  asyncHandler(async (req, res) => {
    const { guildId, categoryId } = req.params;
    try {
      const r = await db.query(
        `SELECT ff.* FROM ticket_form_fields ff
         JOIN ticket_categories tc ON ff.category_id = tc.id
         JOIN ticket_panels tp ON tc.panel_id = tp.id
         WHERE ff.category_id = $1 AND tp.guild_id = $2
         ORDER BY ff.position`,
        [categoryId, guildId],
      );
      res.json(r.rows);
    } catch (error) {
      logger.error('Error fetching form fields:', { guildId, categoryId, error });
      res.status(500).json({ error: 'Failed to fetch form fields' });
    }
  }),
);

// POST /guilds/:guildId/ticket-categories/:categoryId/form-fields
guildsRouter.post('/:guildId/ticket-categories/:categoryId/form-fields', requireAuth, requireGuildAccess,
  rateLimitByGuild({ max: 20, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    const { guildId, categoryId } = req.params;
    try {
      // Check count limit
      const countResult = await db.query('SELECT COUNT(*) FROM ticket_form_fields WHERE category_id=$1', [categoryId]);
      if (parseInt(countResult.rows[0].count) >= 5) {
        res.status(400).json({ error: 'Maximum 5 form fields per category (Discord modal limit)' });
        return;
      }
      const { label, placeholder, min_length = 0, max_length = 1024, style = 'short', required = true } = req.body;
      if (!label) { res.status(400).json({ error: 'label is required' }); return; }
      const posResult = await db.query(
        'SELECT COALESCE(MAX(position),-1)+1 as next FROM ticket_form_fields WHERE category_id=$1',
        [categoryId],
      );
      const r = await db.query(
        `INSERT INTO ticket_form_fields (category_id,label,placeholder,min_length,max_length,style,required,position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [categoryId, label, placeholder||null, min_length, max_length, style, required, posResult.rows[0].next],
      );
      res.json(r.rows[0]);
    } catch (error) {
      logger.error('Error creating form field:', { guildId, categoryId, error });
      res.status(500).json({ error: 'Failed to create form field' });
    }
  }),
);

// PUT /guilds/:guildId/ticket-form-fields/:fieldId
guildsRouter.put('/:guildId/ticket-form-fields/:fieldId', requireAuth, requireGuildAccess,
  rateLimitByGuild({ max: 20, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    const { guildId, fieldId } = req.params;
    const { label, placeholder, min_length, max_length, style, required, position } = req.body;
    try {
      const r = await db.query(
        `UPDATE ticket_form_fields SET
           label=COALESCE($2,label), placeholder=$3,
           min_length=COALESCE($4,min_length), max_length=COALESCE($5,max_length),
           style=COALESCE($6,style), required=COALESCE($7,required), position=COALESCE($8,position)
         WHERE id=$1
           AND category_id IN (
             SELECT tc.id FROM ticket_categories tc
             JOIN ticket_panels tp ON tc.panel_id = tp.id
             WHERE tp.guild_id = $9
           )
         RETURNING *`,
        [fieldId, label, placeholder||null, min_length, max_length, style, required, position, guildId],
      );
      if (!r.rows[0]) { res.status(404).json({ error: 'Field not found' }); return; }
      res.json(r.rows[0]);
    } catch (error) {
      logger.error('Error updating form field:', { guildId, fieldId, error });
      res.status(500).json({ error: 'Failed to update form field' });
    }
  }),
);

// DELETE /guilds/:guildId/ticket-form-fields/:fieldId
guildsRouter.delete('/:guildId/ticket-form-fields/:fieldId', requireAuth, requireGuildAccess,
  rateLimitByGuild({ max: 10, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    const { guildId, fieldId } = req.params;
    try {
      const r = await db.query(
        `DELETE FROM ticket_form_fields
         WHERE id = $1
           AND category_id IN (
             SELECT tc.id FROM ticket_categories tc
             JOIN ticket_panels tp ON tc.panel_id = tp.id
             WHERE tp.guild_id = $2
           )
         RETURNING id`,
        [fieldId, guildId],
      );
      if (!r.rows[0]) { res.status(404).json({ error: 'Field not found' }); return; }
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting form field:', { guildId, fieldId, error });
      res.status(500).json({ error: 'Failed to delete form field' });
    }
  }),
);

// GET /guilds/:guildId/tickets
guildsRouter.get('/:guildId/tickets', requireAuth, requireGuildAccess, asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const status = req.query.status as string || 'open,claimed';
  const statuses = status.split(',').filter(s => ['open','claimed','closed'].includes(s));
  const panelId = req.query.panel_id;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

  let query = `SELECT t.*, tc.name as category_name, tp.name as panel_name
               FROM tickets t
               LEFT JOIN ticket_categories tc ON t.category_id = tc.id
               LEFT JOIN ticket_panels tp ON t.panel_id = tp.id
               WHERE t.guild_id = $1 AND t.status = ANY($2::text[])`;
  const params: any[] = [guildId, statuses];

  if (panelId) {
    query += ` AND t.panel_id = $${params.length + 1}`;
    params.push(panelId);
  }

  query += ` ORDER BY t.created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  try {
    const r = await db.query(query, params);
    res.json(r.rows);
  } catch (error) {
    logger.error('Error fetching tickets:', { guildId, error });
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
}));

// Copy settings from one guild to another
guildsRouter.post(
  '/:guildId/copy-from/:sourceGuildId',
  requireAuth,
  requireGuildAccess,  // checks :guildId (target)
  rateLimitByUser({ max: 3, windowSeconds: 60 }),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const targetGuildId = req.params.guildId;
    const { sourceGuildId } = req.params;

    // Guard: same guild
    if (targetGuildId === sourceGuildId) {
      res.status(400).json({ error: 'Cannot copy settings to the same server' });
      return;
    }

    // Guard: user must also have access to source guild
    if (!authReq.user?.guilds) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    if (!userHasGuildAccess(authReq.user, sourceGuildId)) {
      res.status(403).json({ error: "You don't have permission to access the source server" });
      return;
    }

    try {
      // Fetch source config
      const sourceResult = await db.query(
        'SELECT config FROM guild_configs WHERE guild_id = $1',
        [sourceGuildId],
      );

      if (sourceResult.rows.length === 0) {
        res.status(404).json({ error: 'Source server has no configuration' });
        return;
      }

      const sourceConfig = sourceResult.rows[0].config;
      const cleanedConfig = stripServerIds(sourceConfig);

      await db.query(
        `INSERT INTO guild_configs (guild_id, config, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (guild_id)
         DO UPDATE SET config = $2, updated_at = NOW()`,
        [targetGuildId, JSON.stringify(cleanedConfig)],
      );

      logger.info('Guild config copied', { sourceGuildId, targetGuildId, userId: authReq.user!.id });
      res.json({ success: true });
    } catch (error) {
      logger.error('Error copying guild config:', { sourceGuildId, targetGuildId, error });
      res.status(500).json({ error: 'Failed to copy guild settings' });
    }
  }),
);

// GET /api/guilds/:guildId/roles — returns all guild roles (for dashboard access dropdown)
guildsRouter.get('/:guildId/roles', requireAuth, requireGuildAccess, asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'Bot token not configured' });
    return;
  }

  try {
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${token}` },
    });

    if (!response.ok) {
      res.status(response.status).json({ error: 'Failed to fetch guild roles' });
      return;
    }

    const roles = await response.json() as { id: string; name: string; color: number; position: number }[];

    const sorted = roles
      .filter(r => r.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map(r => ({ id: r.id, name: r.name, color: r.color }));

    res.json(sorted);
  } catch (error) {
    logger.error('Error fetching guild roles:', error);
    res.status(500).json({ error: 'Failed to fetch guild roles' });
  }
}));

// GET /api/guilds/:guildId/channels — returns text channels for dropdowns
guildsRouter.get('/:guildId/channels', requireAuth, requireGuildAccess, asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'Bot token not configured' });
    return;
  }
  try {
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!response.ok) {
      res.status(response.status).json({ error: 'Failed to fetch channels' });
      return;
    }
    const all = await response.json() as { id: string; name: string; type: number; position: number; parent_id: string | null }[];
    // Type 0 = text channel, type 5 = announcement channel
    const text = all
      .filter(c => c.type === 0 || c.type === 5)
      .sort((a, b) => a.position - b.position)
      .map(c => ({ id: c.id, name: c.name, parent_id: c.parent_id }));
    res.json(text);
  } catch (error) {
    logger.error('Error fetching guild channels:', error);
    res.status(500).json({ error: 'Failed to fetch guild channels' });
  }
}));
