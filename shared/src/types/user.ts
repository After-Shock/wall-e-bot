export interface User {
  id: string;
  discordId: string;
  username: string;
  discriminator: string;
  avatar?: string;
  email?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface GuildMember {
  id: string;
  guildId: string;
  odiscordId: string;
  
  // Leveling
  xp: number;
  level: number;
  totalXp: number;
  lastXpGain: Date;
  
  // Moderation
  warnings: Warning[];
  muted: boolean;
  mutedUntil?: Date;
  
  // Stats
  messageCount: number;
  voiceMinutes: number;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface Warning {
  id: string;
  guildId: string;
  userId: string;
  moderatorId: string;
  reason: string;
  createdAt: Date;
  active: boolean;
}

export interface ModAction {
  id: string;
  guildId: string;
  targetId: string;
  moderatorId: string;
  action: 'warn' | 'mute' | 'unmute' | 'kick' | 'ban' | 'unban' | 'timeout';
  reason?: string;
  duration?: number;
  createdAt: Date;
}

export interface Reminder {
  id: string;
  odiscordId: string;
  channelId: string;
  guildId?: string;
  message: string;
  remindAt: Date;
  createdAt: Date;
  completed: boolean;
}
