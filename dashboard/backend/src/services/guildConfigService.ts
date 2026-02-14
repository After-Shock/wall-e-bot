import { db } from '../db/index.js';
import { logger } from '../utils/logger.js';

/**
 * Service for managing guild configurations stored in JSONB
 * Provides CRUD operations with proper deep merging for partial updates
 */

interface GuildConfigRow {
  id: number;
  guild_id: string;
  config: any;
  created_at: Date;
  updated_at: Date;
}

/**
 * Get full configuration for a guild
 * @param guildId - Discord guild ID
 * @returns Full config object or null if not found
 */
export async function getConfig(guildId: string): Promise<any | null> {
  try {
    const result = await db.query<GuildConfigRow>(
      'SELECT config FROM guild_configs WHERE guild_id = $1',
      [guildId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].config;
  } catch (error) {
    logger.error('Error fetching guild config:', { guildId, error });
    throw error;
  }
}

/**
 * Get a specific section of the guild configuration
 * @param guildId - Discord guild ID
 * @param section - Config section name (e.g., 'welcome', 'leveling')
 * @returns Section config object or null if not found
 */
export async function getConfigSection(guildId: string, section: string): Promise<any | null> {
  try {
    const result = await db.query<{ section_data: any }>(
      `SELECT config -> $2 AS section_data
       FROM guild_configs
       WHERE guild_id = $1`,
      [guildId, section]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].section_data || null;
  } catch (error) {
    logger.error('Error fetching guild config section:', { guildId, section, error });
    throw error;
  }
}

/**
 * Update a specific section of the guild configuration
 * Uses JSONB deep merge to preserve other sections and nested fields
 * @param guildId - Discord guild ID
 * @param section - Config section name
 * @param data - Partial config data to merge
 * @returns Updated section config
 */
export async function updateConfigSection(
  guildId: string,
  section: string,
  data: any
): Promise<any> {
  try {
    // Use PostgreSQL's JSONB || operator for deep merge
    // This preserves existing fields not present in the update
    const result = await db.query<GuildConfigRow>(
      `INSERT INTO guild_configs (guild_id, config, updated_at)
       VALUES ($1, jsonb_build_object($2, $3), NOW())
       ON CONFLICT (guild_id)
       DO UPDATE SET
         config = COALESCE(guild_configs.config, '{}'::jsonb) || jsonb_build_object($2,
           COALESCE(guild_configs.config -> $2, '{}'::jsonb) || $3
         ),
         updated_at = NOW()
       RETURNING config -> $2 AS updated_section`,
      [guildId, section, JSON.stringify(data)]
    );

    return result.rows[0];
  } catch (error) {
    logger.error('Error updating guild config section:', { guildId, section, error });
    throw error;
  }
}

/**
 * Initialize default configuration for a new guild
 * @param guildId - Discord guild ID
 * @returns Created default config
 */
export async function initializeConfig(guildId: string): Promise<any> {
  const defaultConfig = {
    prefix: '!',
    language: 'en',
    timezone: 'UTC',
    premium: false,
    modules: {
      moderation: true,
      automod: false,
      leveling: true,
      welcome: false,
      logging: false,
      reactionRoles: false,
      starboard: false,
      customCommands: false,
    },
    moderation: {
      warnThresholds: {
        kick: 3,
        ban: 5,
      },
      autoDeleteModCommands: false,
      dmOnAction: true,
    },
    automod: {
      enabled: false,
      antiSpam: {
        enabled: false,
        maxMessages: 5,
        interval: 5,
        action: 'warn' as const,
      },
      wordFilter: {
        enabled: false,
        words: [],
        action: 'delete' as const,
      },
      linkFilter: {
        enabled: false,
        allowedDomains: [],
        action: 'delete' as const,
      },
      capsFilter: {
        enabled: false,
        threshold: 70,
        minLength: 10,
        action: 'delete' as const,
      },
      ignoredChannels: [],
      ignoredRoles: [],
    },
    leveling: {
      enabled: true,
      xpPerMessage: { min: 15, max: 25 },
      xpCooldown: 60,
      levelUpMessage: 'Congratulations {user}! You reached level {level}!',
      roleRewards: [],
      ignoredChannels: [],
      ignoredRoles: [],
      xpMultipliers: [],
    },
    welcome: {
      enabled: false,
      message: 'Welcome {user} to {server}!',
      embedEnabled: false,
      dmEnabled: false,
      leaveEnabled: false,
    },
    logging: {
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
    },
    starboard: {
      enabled: false,
      threshold: 3,
      emoji: '⭐',
      selfStar: false,
      ignoredChannels: [],
    },
  };

  try {
    const result = await db.query<GuildConfigRow>(
      `INSERT INTO guild_configs (guild_id, config, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (guild_id) DO NOTHING
       RETURNING config`,
      [guildId, JSON.stringify(defaultConfig)]
    );

    if (result.rows.length === 0) {
      // Config already exists, fetch it
      return await getConfig(guildId);
    }

    return result.rows[0].config;
  } catch (error) {
    logger.error('Error initializing guild config:', { guildId, error });
    throw error;
  }
}

/**
 * Delete guild configuration (for cleanup)
 * @param guildId - Discord guild ID
 */
export async function deleteConfig(guildId: string): Promise<void> {
  try {
    await db.query('DELETE FROM guild_configs WHERE guild_id = $1', [guildId]);
    logger.info('Deleted guild config', { guildId });
  } catch (error) {
    logger.error('Error deleting guild config:', { guildId, error });
    throw error;
  }
}
