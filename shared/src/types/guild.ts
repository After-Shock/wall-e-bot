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
  embedColor?: string;
  ignoreBots?: boolean;
  ignoreNsfw?: boolean;
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

export type TriggerType =
  | 'command'
  | 'starts_with'
  | 'contains'
  | 'exact_match'
  | 'regex'
  | 'reaction'
  | 'interval';

export interface CommandGroup {
  id: number;
  guildId: string;
  name: string;
  description?: string;
  allowedRoles: string[];
  allowedChannels: string[];
  ignoreRoles: string[];
  ignoreChannels: string[];
  position: number;
  createdAt: Date;
}

export interface CustomCommand {
  id: number;
  guildId: string;
  name: string;
  triggerType: TriggerType;
  groupId?: number | null;
  responses: string[];
  embedResponse: boolean;
  cembedResponse: boolean;
  embedColor?: string;
  cooldown: number;
  deleteCommand: boolean;
  caseSensitive: boolean;
  triggerOnEdit: boolean;
  enabled: boolean;
  allowedRoles: string[];
  allowedChannels: string[];
  intervalCron?: string | null;
  intervalChannelId?: string | null;
  reactionMessageId?: string | null;
  reactionChannelId?: string | null;
  reactionEmoji?: string | null;
  reactionType?: 'add' | 'remove' | 'both' | null;
  uses: number;
  createdBy: string;
  createdAt: Date;
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

export interface TicketPanel {
  id: number;
  guildId: string;
  name: string;
  style: 'channel' | 'thread';
  panelType: 'buttons' | 'dropdown';
  panelChannelId?: string;
  panelMessageId?: string;
  categoryOpenId?: string;
  categoryClosedId?: string;
  overflowCategoryId?: string;
  channelNameTemplate: string;
  categories?: TicketCategory[];
  createdAt: Date;
}

export interface TicketCategory {
  id: number;
  panelId: number;
  guildId: string;
  name: string;
  emoji?: string;
  description?: string;
  supportRoleIds: string[];
  observerRoleIds: string[];
  position: number;
  formFields?: TicketFormField[];
  createdAt: Date;
}

export interface TicketFormField {
  id: number;
  categoryId: number;
  label: string;
  placeholder?: string;
  minLength: number;
  maxLength: number;
  style: 'short' | 'paragraph';
  required: boolean;
  position: number;
}

export interface TicketConfig {
  guildId: string;
  transcriptChannelId?: string;
  maxTicketsPerUser: number;
  autoCloseHours: number;
  welcomeMessage: string;
}

export interface Ticket {
  id: number;
  guildId: string;
  panelId?: number;
  categoryId?: number;
  channelId: string;
  threadId?: string;
  userId: string;
  ticketNumber: number;
  topic?: string;
  status: 'open' | 'claimed' | 'closed';
  claimedBy?: string;
  closedBy?: string;
  closedAt?: Date;
  closeReason?: string;
  transcriptMessageId?: string;
  lastActivity: Date;
  createdAt: Date;
}
