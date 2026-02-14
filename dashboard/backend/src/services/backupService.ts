import { db } from '../db/index.js';
import { logger } from '../utils/logger.js';
import { guildConfigService } from './index.js';
import type { Backup, BackupListItem, BackupConfig } from '@wall-e/shared';

/**
 * Backup & Restore Service
 * Handles creation, storage, and restoration of guild configuration backups
 */

/**
 * Create a manual backup
 */
export async function createBackup(
  guildId: string,
  name: string,
  userId?: string,
  options: {
    includeRoles?: boolean;
    includeChannels?: boolean;
    includeMembers?: boolean;
  } = {}
): Promise<Backup> {
  try {
    // Get current guild configuration
    const config = await guildConfigService.getConfig(guildId);

    if (!config) {
      throw new Error('Guild configuration not found');
    }

    // Build backup data
    const backupData: Backup['data'] = {
      config,
    };

    // Optionally include roles (from Discord API or cache)
    if (options.includeRoles) {
      // In production, this would fetch from Discord API
      backupData.roles = [];
    }

    // Optionally include channels
    if (options.includeChannels) {
      backupData.channels = [];
    }

    // Optionally include members
    if (options.includeMembers) {
      backupData.members = [];
    }

    // Calculate backup size (approximate)
    const dataString = JSON.stringify(backupData);
    const size = Buffer.byteLength(dataString, 'utf8');

    // Store backup in database
    const result = await db.query(
      `INSERT INTO guild_backups (guild_id, name, type, size, created_by, data)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, guild_id, name, type, size, created_at, created_by`,
      [guildId, name, 'manual', size, userId || null, backupData]
    );

    const backup: Backup = {
      id: result.rows[0].id,
      guildId: result.rows[0].guild_id,
      name: result.rows[0].name,
      type: result.rows[0].type,
      size: result.rows[0].size,
      createdAt: new Date(result.rows[0].created_at),
      createdBy: result.rows[0].created_by,
      data: backupData,
    };

    logger.info(`Created backup for guild ${guildId}`, { backupId: backup.id, name });

    return backup;
  } catch (error) {
    logger.error('Failed to create backup:', error);
    throw error;
  }
}

/**
 * List all backups for a guild
 */
export async function listBackups(guildId: string): Promise<BackupListItem[]> {
  try {
    const result = await db.query(
      `SELECT id, name, type, size, created_at, created_by
       FROM guild_backups
       WHERE guild_id = $1
       ORDER BY created_at DESC`,
      [guildId]
    );

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      size: row.size,
      createdAt: new Date(row.created_at),
      createdBy: row.created_by,
    }));
  } catch (error) {
    logger.error('Failed to list backups:', error);
    throw error;
  }
}

/**
 * Get a specific backup
 */
export async function getBackup(backupId: string, guildId: string): Promise<Backup | null> {
  try {
    const result = await db.query(
      `SELECT id, guild_id, name, type, size, created_at, created_by, data
       FROM guild_backups
       WHERE id = $1 AND guild_id = $2`,
      [backupId, guildId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      guildId: row.guild_id,
      name: row.name,
      type: row.type,
      size: row.size,
      createdAt: new Date(row.created_at),
      createdBy: row.created_by,
      data: row.data,
    };
  } catch (error) {
    logger.error('Failed to get backup:', error);
    throw error;
  }
}

/**
 * Restore from a backup
 */
export async function restoreBackup(
  backupId: string,
  guildId: string
): Promise<void> {
  try {
    const backup = await getBackup(backupId, guildId);

    if (!backup) {
      throw new Error('Backup not found');
    }

    // Restore the configuration
    await db.query(
      `UPDATE guild_configs
       SET config = $1, updated_at = NOW()
       WHERE guild_id = $2`,
      [backup.data.config, guildId]
    );

    logger.info(`Restored backup ${backupId} for guild ${guildId}`);
  } catch (error) {
    logger.error('Failed to restore backup:', error);
    throw error;
  }
}

/**
 * Delete a backup
 */
export async function deleteBackup(backupId: string, guildId: string): Promise<void> {
  try {
    const result = await db.query(
      `DELETE FROM guild_backups
       WHERE id = $1 AND guild_id = $2
       RETURNING id`,
      [backupId, guildId]
    );

    if (result.rows.length === 0) {
      throw new Error('Backup not found');
    }

    logger.info(`Deleted backup ${backupId} for guild ${guildId}`);
  } catch (error) {
    logger.error('Failed to delete backup:', error);
    throw error;
  }
}

/**
 * Get backup configuration
 */
export async function getBackupConfig(guildId: string): Promise<BackupConfig> {
  try {
    const config = await guildConfigService.getConfigSection(guildId, 'backup');

    // Return defaults if not found
    if (!config) {
      return {
        enabled: false,
        autoBackup: false,
        backupFrequency: 'weekly',
        maxBackups: 10,
        includeMessages: false,
        includeMembers: false,
        includeRoles: false,
        includeChannels: false,
      };
    }

    return config;
  } catch (error) {
    logger.error('Failed to get backup config:', error);
    throw error;
  }
}

/**
 * Update backup configuration
 */
export async function updateBackupConfig(
  guildId: string,
  config: Partial<BackupConfig>
): Promise<BackupConfig> {
  try {
    const updated = await guildConfigService.updateConfigSection(guildId, 'backup', config);
    return updated;
  } catch (error) {
    logger.error('Failed to update backup config:', error);
    throw error;
  }
}

/**
 * Clean up old backups based on maxBackups setting
 */
export async function cleanupOldBackups(guildId: string): Promise<void> {
  try {
    const config = await getBackupConfig(guildId);

    if (!config.enabled || !config.autoBackup) {
      return;
    }

    // Delete backups exceeding maxBackups
    await db.query(
      `DELETE FROM guild_backups
       WHERE guild_id = $1
       AND type = 'automatic'
       AND id NOT IN (
         SELECT id FROM guild_backups
         WHERE guild_id = $1 AND type = 'automatic'
         ORDER BY created_at DESC
         LIMIT $2
       )`,
      [guildId, config.maxBackups]
    );

    logger.info(`Cleaned up old backups for guild ${guildId}`);
  } catch (error) {
    logger.error('Failed to cleanup old backups:', error);
    throw error;
  }
}
