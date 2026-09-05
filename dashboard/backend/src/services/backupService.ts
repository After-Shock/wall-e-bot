import { db } from '../db/index.js';
import { logger } from '../utils/logger.js';
import { invalidateGuildConfigCache } from '../utils/guildConfigCache.js';
import { guildConfigService } from './index.js';
import type { ConfigurationSnapshot, ConfigurationSnapshotListItem } from '@wall-e/shared';

/**
 * Configuration Snapshot Service
 * Handles creation, storage, and restoration of guild JSON configuration snapshots
 */

/**
 * Create a manual backup
 */
export async function createBackup(
  guildId: string,
  name: string,
  userId?: string,
): Promise<ConfigurationSnapshot> {
  try {
    // Get current guild configuration
    const config = await guildConfigService.getConfig(guildId);

    if (!config) {
      throw new Error('Guild configuration not found');
    }

    // Build backup data
    const backupData: ConfigurationSnapshot['data'] = {
      config,
    };

    // Calculate backup size (approximate)
    const dataString = JSON.stringify(backupData);
    const size = Buffer.byteLength(dataString, 'utf8');

    // Store backup in database
    const result = await db.query(
      `INSERT INTO guild_backups (guild_id, name, type, size, created_by, data)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, guild_id, name, type, size, created_at, created_by`,
      [guildId, name, 'manual', size, userId || null, backupData],
    );

    const backup: ConfigurationSnapshot = {
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
export async function listBackups(guildId: string): Promise<ConfigurationSnapshotListItem[]> {
  try {
    const result = await db.query(
      `SELECT id, name, type, size, created_at, created_by
       FROM guild_backups
       WHERE guild_id = $1
       ORDER BY created_at DESC`,
      [guildId],
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
export async function getBackup(backupId: string, guildId: string): Promise<ConfigurationSnapshot | null> {
  try {
    const result = await db.query(
      `SELECT id, guild_id, name, type, size, created_at, created_by, data
       FROM guild_backups
       WHERE id = $1 AND guild_id = $2`,
      [backupId, guildId],
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
  guildId: string,
): Promise<boolean> {
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
      [backup.data.config, guildId],
    );

    logger.info(`Restored backup ${backupId} for guild ${guildId}`);
    return invalidateGuildConfigCache(guildId);
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
      [backupId, guildId],
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
