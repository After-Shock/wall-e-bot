/**
 * Discord Resource Validation Utilities
 * 
 * Functions to safely validate Discord resources (channels, roles, guilds)
 * before performing operations. Prevents errors from deleted resources.
 * 
 * @module utils/validate
 */

import { 
  Client, 
  Guild, 
  GuildChannel, 
  Role, 
  GuildMember,
  TextChannel,
  ChannelType,
  PermissionsBitField,
} from 'discord.js';
import { logger } from './logger.js';

/**
 * Result of a resource validation check.
 */
interface ValidationResult<T> {
  valid: boolean;
  resource?: T;
  error?: string;
}

/**
 * Validate and fetch a guild by ID.
 * 
 * @param client - Discord client
 * @param guildId - Guild ID to validate
 * @returns Validation result with guild if valid
 */
export async function validateGuild(
  client: Client,
  guildId: string
): Promise<ValidationResult<Guild>> {
  try {
    // Try cache first
    let guild = client.guilds.cache.get(guildId);
    
    if (!guild) {
      // Try fetching if not in cache
      try {
        guild = await client.guilds.fetch(guildId);
      } catch {
        return { valid: false, error: 'Guild not found or bot is not a member' };
      }
    }
    
    return { valid: true, resource: guild };
  } catch (error) {
    logger.warn(`Failed to validate guild ${guildId}:`, error);
    return { valid: false, error: 'Failed to fetch guild' };
  }
}

/**
 * Validate and fetch a channel by ID.
 * 
 * @param guild - Guild to search in
 * @param channelId - Channel ID to validate
 * @param requiredType - Optional required channel type
 * @returns Validation result with channel if valid
 */
export async function validateChannel(
  guild: Guild,
  channelId: string,
  requiredType?: ChannelType
): Promise<ValidationResult<GuildChannel>> {
  try {
    // Try cache first
    let channel = guild.channels.cache.get(channelId) as GuildChannel | undefined;
    
    if (!channel) {
      // Try fetching if not in cache
      try {
        channel = await guild.channels.fetch(channelId) as GuildChannel | null ?? undefined;
      } catch {
        return { valid: false, error: 'Channel not found or was deleted' };
      }
    }
    
    if (!channel) {
      return { valid: false, error: 'Channel not found' };
    }
    
    // Check type if required
    if (requiredType !== undefined && channel.type !== requiredType) {
      return { valid: false, error: `Channel must be of type ${ChannelType[requiredType]}` };
    }
    
    return { valid: true, resource: channel };
  } catch (error) {
    logger.warn(`Failed to validate channel ${channelId}:`, error);
    return { valid: false, error: 'Failed to fetch channel' };
  }
}

/**
 * Validate and fetch a role by ID.
 * 
 * @param guild - Guild to search in
 * @param roleId - Role ID to validate
 * @returns Validation result with role if valid
 */
export async function validateRole(
  guild: Guild,
  roleId: string
): Promise<ValidationResult<Role>> {
  try {
    // Try cache first
    let role = guild.roles.cache.get(roleId);
    
    if (!role) {
      // Try fetching if not in cache
      try {
        await guild.roles.fetch();
        role = guild.roles.cache.get(roleId);
      } catch {
        return { valid: false, error: 'Role not found or was deleted' };
      }
    }
    
    if (!role) {
      return { valid: false, error: 'Role not found' };
    }
    
    // Check if bot can assign this role
    const botMember = guild.members.me;
    if (botMember && role.position >= botMember.roles.highest.position) {
      return { valid: false, error: 'Bot cannot manage this role (role is higher than bot\'s highest role)' };
    }
    
    return { valid: true, resource: role };
  } catch (error) {
    logger.warn(`Failed to validate role ${roleId}:`, error);
    return { valid: false, error: 'Failed to fetch role' };
  }
}

/**
 * Validate and fetch a guild member by ID.
 * 
 * @param guild - Guild to search in
 * @param userId - User ID to validate
 * @returns Validation result with member if valid
 */
export async function validateMember(
  guild: Guild,
  userId: string
): Promise<ValidationResult<GuildMember>> {
  try {
    // Try cache first
    let member = guild.members.cache.get(userId);
    
    if (!member) {
      // Try fetching if not in cache
      try {
        member = await guild.members.fetch(userId);
      } catch {
        return { valid: false, error: 'User not found in this server' };
      }
    }
    
    return { valid: true, resource: member };
  } catch (error) {
    logger.warn(`Failed to validate member ${userId}:`, error);
    return { valid: false, error: 'Failed to fetch member' };
  }
}

/**
 * Check if the bot has required permissions in a channel.
 * 
 * @param channel - Channel to check permissions in
 * @param permissions - Required permissions
 * @returns Object with hasPermissions and missing permissions list
 */
export function checkBotPermissions(
  channel: GuildChannel,
  permissions: bigint[]
): { hasPermissions: boolean; missing: string[] } {
  const botMember = channel.guild.members.me;
  
  if (!botMember) {
    return { hasPermissions: false, missing: ['Bot member not found'] };
  }
  
  const channelPerms = channel.permissionsFor(botMember);
  
  if (!channelPerms) {
    return { hasPermissions: false, missing: ['Cannot determine permissions'] };
  }
  
  const missing: string[] = [];
  
  for (const perm of permissions) {
    if (!channelPerms.has(perm)) {
      // Convert permission bit to name
      const permName = Object.entries(PermissionsBitField.Flags)
        .find(([, value]) => value === perm)?.[0] ?? 'Unknown';
      missing.push(permName);
    }
  }
  
  return { hasPermissions: missing.length === 0, missing };
}

/**
 * Safely send a message to a channel, handling common errors.
 * 
 * @param channel - Channel to send to
 * @param content - Message content or options
 * @returns Success boolean and optional error message
 */
export async function safeSend(
  channel: TextChannel,
  content: string | { content?: string; embeds?: any[]; components?: any[] }
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if channel still exists and is text-based
    if (!channel || !channel.isTextBased()) {
      return { success: false, error: 'Invalid channel' };
    }
    
    // Check permissions
    const permsCheck = checkBotPermissions(channel, [
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
    ]);
    
    if (!permsCheck.hasPermissions) {
      return { success: false, error: `Missing permissions: ${permsCheck.missing.join(', ')}` };
    }
    
    await channel.send(content);
    return { success: true };
  } catch (error) {
    const errorMessage = (error as Error).message;
    
    // Handle known error codes
    if (errorMessage.includes('Unknown Channel')) {
      return { success: false, error: 'Channel was deleted' };
    }
    if (errorMessage.includes('Missing Access')) {
      return { success: false, error: 'Bot cannot access this channel' };
    }
    if (errorMessage.includes('Missing Permissions')) {
      return { success: false, error: 'Bot is missing permissions' };
    }
    
    logger.error('Error in safeSend:', error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Clean up orphaned database records for a guild.
 * Call this when the bot is removed from a guild.
 * 
 * @param guildId - Guild ID to clean up
 * @param db - Database service
 */
export async function cleanupGuildData(
  guildId: string,
  db: { pool: { query: (text: string, params: any[]) => Promise<any> } }
): Promise<void> {
  logger.info(`Cleaning up data for guild ${guildId}`);
  
  try {
    // Don't delete immediately - mark as inactive for potential restoration
    // Actual deletion can be done by a scheduled cleanup job after 30 days
    await db.pool.query(
      `UPDATE guild_configs SET active = false, left_at = NOW() WHERE guild_id = $1`,
      [guildId]
    );
    
    // Clear scheduled messages for this guild
    await db.pool.query(
      `UPDATE scheduled_messages SET enabled = false WHERE guild_id = $1`,
      [guildId]
    );
    
    logger.info(`Marked guild ${guildId} data as inactive`);
  } catch (error) {
    logger.error(`Failed to cleanup guild ${guildId} data:`, error);
  }
}
