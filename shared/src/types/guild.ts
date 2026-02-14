export interface GuildConfig {
  guildId: string;
  prefix: string;
  language: string;
  timezone: string;
  premium: boolean;
  premiumUntil?: Date;
  
  // Module toggles
  modules: {
    moderation: boolean;
    automod: boolean;
    leveling: boolean;
    welcome: boolean;
    logging: boolean;
    reactionRoles: boolean;
    starboard: boolean;
    customCommands: boolean;
  };
  
  // Moderation settings
  moderation: ModerationConfig;
  
  // Auto-mod settings
  automod: AutoModConfig;
  
  // Leveling settings
  leveling: LevelingConfig;
  
  // Welcome settings
  welcome: WelcomeConfig;
  
  // Logging settings
  logging: LoggingConfig;
  
  // Starboard settings
  starboard: StarboardConfig;
}

export interface ModerationConfig {
  muteRoleId?: string;
  modLogChannelId?: string;
  warnThresholds: {
    kick: number;
    ban: number;
  };
  autoDeleteModCommands: boolean;
  dmOnAction: boolean;
}

export interface AutoModConfig {
  enabled: boolean;

  // Spam detection
  antiSpam: {
    enabled: boolean;
    maxMessages: number;
    interval: number; // seconds
    action: 'warn' | 'mute' | 'kick' | 'ban';
    muteDuration?: number; // minutes
  };

  // Word filter
  wordFilter: {
    enabled: boolean;
    words: string[];
    action: 'delete' | 'warn' | 'mute';
    muteDuration?: number;
  };

  // Link filter
  linkFilter: {
    enabled: boolean;
    allowedDomains: string[];
    action: 'delete' | 'warn' | 'mute';
  };

  // Caps detection
  capsFilter: {
    enabled: boolean;
    threshold: number; // percentage
    minLength: number;
    action: 'delete' | 'warn';
  };

  // Advanced: Image scanning (Premium)
  imageScanning?: {
    enabled: boolean;
    scanForNsfw: boolean;
    scanForViolence: boolean;
    scanForGore: boolean;
    action: 'delete' | 'warn' | 'mute';
    threshold: number; // 0-100 confidence threshold
  };

  // Advanced: Link safety (Premium)
  linkSafety?: {
    enabled: boolean;
    checkPhishing: boolean;
    checkMalware: boolean;
    checkIpLoggers: boolean;
    action: 'delete' | 'warn' | 'mute';
  };

  // Advanced: Raid protection (Premium)
  raidProtection?: {
    enabled: boolean;
    joinThreshold: number; // max joins per minute
    accountAgeMinimum: number; // minimum account age in days
    verificationLevel: 'low' | 'medium' | 'high';
    action: 'kick' | 'ban';
    alertChannel?: string;
  };

  // Ignored channels/roles
  ignoredChannels: string[];
  ignoredRoles: string[];
}

export interface LevelingConfig {
  enabled: boolean;
  xpPerMessage: { min: number; max: number };
  xpCooldown: number; // seconds
  levelUpChannel?: string; // channel id or 'current' or 'dm'
  levelUpMessage: string;
  roleRewards: Array<{
    level: number;
    roleId: string;
    removeOnHigherLevel: boolean;
  }>;
  ignoredChannels: string[];
  ignoredRoles: string[];
  xpMultipliers: Array<{
    roleId: string;
    multiplier: number;
  }>;
}

export interface WelcomeConfig {
  enabled: boolean;
  channelId?: string;
  message: string;
  embedEnabled: boolean;
  embedColor?: string;
  embedImage?: string;
  dmEnabled: boolean;
  dmMessage?: string;
  autoRole?: string[];
  
  // Leave messages
  leaveEnabled: boolean;
  leaveChannelId?: string;
  leaveMessage?: string;
}

export interface LoggingConfig {
  enabled: boolean;
  channelId?: string;
  
  events: {
    messageDelete: boolean;
    messageEdit: boolean;
    memberJoin: boolean;
    memberLeave: boolean;
    memberBan: boolean;
    memberUnban: boolean;
    roleCreate: boolean;
    roleDelete: boolean;
    channelCreate: boolean;
    channelDelete: boolean;
    voiceStateUpdate: boolean;
    nicknameChange: boolean;
    usernameChange: boolean;
  };
  
  ignoredChannels: string[];
}

export interface StarboardConfig {
  enabled: boolean;
  channelId?: string;
  threshold: number;
  emoji: string;
  selfStar: boolean;
  ignoredChannels: string[];
}

export interface ReactionRole {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  emoji: string;
  roleId: string;
  mode: 'toggle' | 'add' | 'remove';
}

export interface CustomCommand {
  id: string;
  guildId: string;
  name: string;
  response: string;
  embedResponse: boolean;
  embedColor?: string;
  allowedRoles: string[];
  allowedChannels: string[];
  cooldown: number;
  deleteCommand: boolean;
  createdBy: string;
  createdAt: Date;
  uses: number;
}

// Analytics types
export interface AnalyticsOverview {
  totalMembers: number;
  totalMessages: number;
  activeMembers: number; // last 7 days
  newMembers: number; // last 7 days
  memberGrowth: number; // percentage change
  messageGrowth: number; // percentage change
}

export interface GrowthMetrics {
  period: 'day' | 'week' | 'month';
  data: Array<{
    date: string;
    members: number;
    messages: number;
    joins: number;
    leaves: number;
  }>;
}

export interface ChannelActivity {
  channelId: string;
  channelName: string;
  messageCount: number;
  uniqueUsers: number;
  averagePerDay: number;
}

export interface MemberActivity {
  userId: string;
  username: string;
  messageCount: number;
  lastActive: Date;
  joinedAt: Date;
}

export interface ContentInsights {
  topChannels: ChannelActivity[];
  topMembers: MemberActivity[];
  peakHours: Array<{
    hour: number;
    messageCount: number;
  }>;
  peakDays: Array<{
    day: string;
    messageCount: number;
  }>;
}

// Backup & Restore types
export interface BackupConfig {
  enabled: boolean;
  autoBackup: boolean;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
  maxBackups: number; // Keep last N backups
  includeMessages: boolean;
  includeMembers: boolean;
  includeRoles: boolean;
  includeChannels: boolean;
}

export interface Backup {
  id: string;
  guildId: string;
  name: string;
  type: 'manual' | 'automatic';
  size: number; // bytes
  createdAt: Date;
  createdBy?: string; // user ID who created manual backup
  data: {
    config: GuildConfig;
    roles?: any[];
    channels?: any[];
    members?: any[];
    messages?: any[];
  };
}

export interface BackupListItem {
  id: string;
  name: string;
  type: 'manual' | 'automatic';
  size: number;
  createdAt: Date;
  createdBy?: string;
}
