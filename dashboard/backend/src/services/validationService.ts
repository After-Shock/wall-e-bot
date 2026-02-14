import { z } from 'zod';

/**
 * Validation schemas for guild configuration sections
 * All schemas use .partial() to allow incremental updates
 * Patterns match Discord's ID format (17-19 digit snowflakes)
 */

// Discord snowflake ID regex (17-19 digits)
const discordIdRegex = /^\d{17,19}$/;
const discordId = z.string().regex(discordIdRegex, 'Invalid Discord ID format');

// Hex color regex (#RRGGBB)
const hexColorRegex = /^#[0-9A-F]{6}$/i;
const hexColor = z.string().regex(hexColorRegex, 'Invalid hex color (must be #RRGGBB)');

/**
 * Welcome & Leave Messages Configuration
 */
export const WelcomeConfigSchema = z.object({
  enabled: z.boolean(),
  channelId: discordId.optional(),
  message: z.string().min(1).max(2000), // Discord message limit
  embedEnabled: z.boolean(),
  embedColor: hexColor.optional(),
  embedImage: z.string().url().optional(),
  dmEnabled: z.boolean(),
  dmMessage: z.string().min(1).max(2000).optional(),
  autoRole: z.array(discordId).max(50).optional(), // Max 50 auto-roles

  // Leave messages
  leaveEnabled: z.boolean(),
  leaveChannelId: discordId.optional(),
  leaveMessage: z.string().min(1).max(2000).optional(),
}).partial();

/**
 * Leveling System Configuration
 */
export const LevelingConfigSchema = z.object({
  enabled: z.boolean(),
  xpPerMessage: z.object({
    min: z.number().int().min(0).max(100),
    max: z.number().int().min(0).max(100),
  }),
  xpCooldown: z.number().int().min(0).max(300), // Max 5 minutes
  levelUpChannel: z.union([
    discordId,
    z.literal('current'),
    z.literal('dm'),
  ]).optional(),
  levelUpMessage: z.string().min(1).max(2000),
  roleRewards: z.array(z.object({
    level: z.number().int().min(1).max(1000),
    roleId: discordId,
    removeOnHigherLevel: z.boolean(),
  })),
  ignoredChannels: z.array(discordId),
  ignoredRoles: z.array(discordId),
  xpMultipliers: z.array(z.object({
    roleId: discordId,
    multiplier: z.number().min(0.1).max(10), // 0.1x to 10x
  })),
}).partial();

/**
 * Moderation Configuration
 */
export const ModerationConfigSchema = z.object({
  muteRoleId: discordId.optional(),
  modLogChannelId: discordId.optional(),
  warnThresholds: z.object({
    kick: z.number().int().min(1).max(100),
    ban: z.number().int().min(1).max(100),
  }),
  autoDeleteModCommands: z.boolean(),
  dmOnAction: z.boolean(),
}).partial();

/**
 * Auto-Moderation Configuration
 */
export const AutoModConfigSchema = z.object({
  enabled: z.boolean(),

  // Spam detection
  antiSpam: z.object({
    enabled: z.boolean(),
    maxMessages: z.number().int().min(1).max(50),
    interval: z.number().int().min(1).max(60), // seconds
    action: z.enum(['warn', 'mute', 'kick', 'ban']),
    muteDuration: z.number().int().min(1).max(10080).optional(), // minutes, max 1 week
  }).partial(),

  // Word filter
  wordFilter: z.object({
    enabled: z.boolean(),
    words: z.array(z.string().min(1).max(100)).max(1000), // Max 1000 filtered words
    action: z.enum(['delete', 'warn', 'mute']),
    muteDuration: z.number().int().min(1).max(10080).optional(),
  }).partial(),

  // Link filter
  linkFilter: z.object({
    enabled: z.boolean(),
    allowedDomains: z.array(z.string().max(255)).max(1000),
    action: z.enum(['delete', 'warn', 'mute']),
  }).partial(),

  // Caps detection
  capsFilter: z.object({
    enabled: z.boolean(),
    threshold: z.number().int().min(0).max(100), // percentage
    minLength: z.number().int().min(1).max(2000),
    action: z.enum(['delete', 'warn']),
  }).partial(),

  // Advanced: Image scanning (Premium)
  imageScanning: z.object({
    enabled: z.boolean(),
    scanForNsfw: z.boolean(),
    scanForViolence: z.boolean(),
    scanForGore: z.boolean(),
    action: z.enum(['delete', 'warn', 'mute']),
    threshold: z.number().int().min(0).max(100), // confidence threshold
  }).partial().optional(),

  // Advanced: Link safety (Premium)
  linkSafety: z.object({
    enabled: z.boolean(),
    checkPhishing: z.boolean(),
    checkMalware: z.boolean(),
    checkIpLoggers: z.boolean(),
    action: z.enum(['delete', 'warn', 'mute']),
  }).partial().optional(),

  // Advanced: Raid protection (Premium)
  raidProtection: z.object({
    enabled: z.boolean(),
    joinThreshold: z.number().int().min(1).max(100), // max joins per minute
    accountAgeMinimum: z.number().int().min(0).max(365), // days
    verificationLevel: z.enum(['low', 'medium', 'high']),
    action: z.enum(['kick', 'ban']),
    alertChannel: discordId.optional(),
  }).partial().optional(),

  // Ignored channels/roles
  ignoredChannels: z.array(discordId).max(100),
  ignoredRoles: z.array(discordId).max(100),
}).partial();

/**
 * Logging Configuration
 */
export const LoggingConfigSchema = z.object({
  enabled: z.boolean(),
  channelId: discordId.optional(),

  events: z.object({
    messageDelete: z.boolean(),
    messageEdit: z.boolean(),
    memberJoin: z.boolean(),
    memberLeave: z.boolean(),
    memberBan: z.boolean(),
    memberUnban: z.boolean(),
    roleCreate: z.boolean(),
    roleDelete: z.boolean(),
    channelCreate: z.boolean(),
    channelDelete: z.boolean(),
    voiceStateUpdate: z.boolean(),
    nicknameChange: z.boolean(),
    usernameChange: z.boolean(),
  }).partial(),

  ignoredChannels: z.array(discordId).max(100),
}).partial();

/**
 * Starboard Configuration
 */
export const StarboardConfigSchema = z.object({
  enabled: z.boolean(),
  channelId: discordId.optional(),
  threshold: z.number().int().min(1).max(100),
  emoji: z.string().min(1).max(100), // Unicode emoji or custom emoji format
  selfStar: z.boolean(),
  ignoredChannels: z.array(discordId).max(100),
}).partial();

/**
 * Backup Configuration
 */
export const BackupConfigSchema = z.object({
  enabled: z.boolean(),
  autoBackup: z.boolean(),
  backupFrequency: z.enum(['daily', 'weekly', 'monthly']),
  maxBackups: z.number().int().min(1).max(50),
  includeMessages: z.boolean(),
  includeMembers: z.boolean(),
  includeRoles: z.boolean(),
  includeChannels: z.boolean(),
}).partial();

/**
 * Full Guild Configuration Schema
 * Used for validating the entire config object
 */
export const GuildConfigSchema = z.object({
  prefix: z.string().min(1).max(10),
  language: z.string().length(2), // ISO 639-1 codes
  timezone: z.string().max(50),
  premium: z.boolean(),
  premiumUntil: z.string().datetime().optional(),

  modules: z.object({
    moderation: z.boolean(),
    automod: z.boolean(),
    leveling: z.boolean(),
    welcome: z.boolean(),
    logging: z.boolean(),
    reactionRoles: z.boolean(),
    starboard: z.boolean(),
    customCommands: z.boolean(),
  }).partial(),

  moderation: ModerationConfigSchema,
  automod: AutoModConfigSchema,
  leveling: LevelingConfigSchema,
  welcome: WelcomeConfigSchema,
  logging: LoggingConfigSchema,
  starboard: StarboardConfigSchema,
}).partial();

/**
 * Map of config sections to their validation schemas
 */
export const sectionSchemas: Record<string, z.ZodTypeAny> = {
  welcome: WelcomeConfigSchema,
  leveling: LevelingConfigSchema,
  moderation: ModerationConfigSchema,
  automod: AutoModConfigSchema,
  logging: LoggingConfigSchema,
  starboard: StarboardConfigSchema,
};

/**
 * Validate data against a schema
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Validated and typed data
 * @throws ZodError if validation fails
 */
export function validateConfig<T>(schema: z.ZodType<T>, data: any): T {
  return schema.parse(data);
}

/**
 * Safely validate data against a schema
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Success object with validated data or error object
 */
export function safeValidateConfig<T>(
  schema: z.ZodType<T>,
  data: any
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Get validation schema for a config section
 * @param section - Config section name
 * @returns Zod schema or undefined if section not found
 */
export function getSchemaForSection(section: string): z.ZodTypeAny | undefined {
  return sectionSchemas[section];
}
