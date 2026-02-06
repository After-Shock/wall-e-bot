export const DEFAULT_PREFIX = '!';
export const DEFAULT_LANGUAGE = 'en';
export const DEFAULT_TIMEZONE = 'UTC';

export const XP_PER_MESSAGE = { min: 15, max: 25 };
export const XP_COOLDOWN = 60; // seconds

export const COLORS = {
  PRIMARY: 0x5865F2,    // Discord Blurple
  SUCCESS: 0x57F287,    // Green
  WARNING: 0xFEE75C,    // Yellow
  ERROR: 0xED4245,      // Red
  INFO: 0x5865F2,       // Blurple
  MUTED: 0x99AAB5,      // Gray
} as const;

export const EMOJIS = {
  SUCCESS: '✅',
  ERROR: '❌',
  WARNING: '⚠️',
  INFO: 'ℹ️',
  LOADING: '⏳',
  STAR: '⭐',
  CROWN: '👑',
  MOD: '🛡️',
  BAN: '🔨',
  MUTE: '🔇',
  KICK: '👢',
} as const;

export const PERMISSIONS = {
  ADMIN: 'Administrator',
  MANAGE_GUILD: 'ManageGuild',
  MANAGE_ROLES: 'ManageRoles',
  MANAGE_CHANNELS: 'ManageChannels',
  MANAGE_MESSAGES: 'ManageMessages',
  KICK_MEMBERS: 'KickMembers',
  BAN_MEMBERS: 'BanMembers',
  MODERATE_MEMBERS: 'ModerateMembers',
} as const;

export const RATE_LIMITS = {
  COMMANDS_PER_MINUTE: 20,
  XP_COOLDOWN: 60,
  CUSTOM_COMMAND_COOLDOWN: 5,
} as const;

export const LIMITS = {
  MAX_WARNINGS: 100,
  MAX_CUSTOM_COMMANDS: 50,
  MAX_REACTION_ROLES: 100,
  MAX_ROLE_REWARDS: 25,
  MAX_WORD_FILTER: 200,
  PREMIUM_MAX_CUSTOM_COMMANDS: 200,
  PREMIUM_MAX_REACTION_ROLES: 500,
} as const;

export function calculateLevel(totalXp: number): number {
  // Level formula: level = floor(0.1 * sqrt(totalXp))
  return Math.floor(0.1 * Math.sqrt(totalXp));
}

export function calculateXpForLevel(level: number): number {
  // Inverse of level formula
  return Math.pow(level / 0.1, 2);
}

export function calculateXpForNextLevel(currentLevel: number): number {
  return calculateXpForLevel(currentLevel + 1);
}
