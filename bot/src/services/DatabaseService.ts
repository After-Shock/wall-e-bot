/**
 * Database Service
 * 
 * Provides PostgreSQL connection pooling and query methods for all bot data.
 * Uses node-postgres (pg) with connection pooling for optimal performance.
 * 
 * @module services/DatabaseService
 */

import pg from 'pg';
import { logger } from '../utils/logger.js';
import type { GuildConfig, GuildMember } from '@wall-e/shared';

const { Pool } = pg;

/**
 * PostgreSQL database service with connection pooling.
 * 
 * Manages:
 * - Guild configurations (prefixes, modules, settings)
 * - Member data (XP, levels, message counts)
 * - Warnings and moderation actions
 * - Scheduled tasks and temporary bans
 */
export class DatabaseService {
  /** PostgreSQL connection pool - exposed for direct queries in commands */
  public pool!: pg.Pool;

  /**
   * Initialize the database connection pool.
   * 
   * Uses DATABASE_URL environment variable for connection string.
   * Pool automatically manages connection lifecycle and reconnection.
   * 
   * @throws {Error} If database connection fails
   */
  async connect() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Pool defaults: max 10 connections, idle timeout 10s
    });

    // Verify connection with simple query
    await this.pool.query('SELECT NOW()');
    logger.info('Connected to PostgreSQL');
  }

  /**
   * Retrieve guild configuration settings.
   * 
   * @param guildId - Discord guild/server ID
   * @returns Guild config object or null if not found
   */
  async getGuildConfig(guildId: string): Promise<GuildConfig | null> {
    const result = await this.pool.query(
      'SELECT * FROM guild_configs WHERE guild_id = $1',
      [guildId]
    );
    return result.rows[0] || null;
  }

  /**
   * Create or update guild configuration.
   * Uses PostgreSQL UPSERT (INSERT ... ON CONFLICT) for atomicity.
   * 
   * @param config - Partial config with required guildId
   */
  async upsertGuildConfig(config: Partial<GuildConfig> & { guildId: string }) {
    await this.pool.query(
      `INSERT INTO guild_configs (guild_id, config)
       VALUES ($1, $2)
       ON CONFLICT (guild_id) DO UPDATE SET config = $2, updated_at = NOW()`,
      [config.guildId, JSON.stringify(config)]
    );
  }

  async getMember(guildId: string, odiscordId: string): Promise<GuildMember | null> {
    const result = await this.pool.query(
      'SELECT * FROM guild_members WHERE guild_id = $1 AND user_id = $2',
      [guildId, odiscordId]
    );
    return result.rows[0] || null;
  }

  async upsertMember(guildId: string, odiscordId: string, data: Partial<GuildMember>) {
    await this.pool.query(
      `INSERT INTO guild_members (guild_id, user_id, xp, level, total_xp, message_count)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (guild_id, user_id) DO UPDATE SET
         xp = COALESCE($3, guild_members.xp),
         level = COALESCE($4, guild_members.level),
         total_xp = COALESCE($5, guild_members.total_xp),
         message_count = COALESCE($6, guild_members.message_count),
         updated_at = NOW()`,
      [guildId, odiscordId, data.xp, data.level, data.totalXp, data.messageCount]
    );
  }

  /**
   * Add XP to a member and handle level-ups.
   * 
   * Level formula: level = floor(0.1 * sqrt(total_xp))
   * This creates a smooth progression curve where higher levels
   * require exponentially more XP.
   * 
   * @param guildId - Discord guild ID
   * @param odiscordId - Discord user ID
   * @param xp - Amount of XP to add
   * @returns Object with new XP, new level, and whether user leveled up
   */
  async addXp(guildId: string, odiscordId: string, xp: number): Promise<{ newXp: number; newLevel: number; leveledUp: boolean }> {
    const result = await this.pool.query(
      `UPDATE guild_members 
       SET xp = xp + $3, total_xp = total_xp + $3, last_xp_gain = NOW()
       WHERE guild_id = $1 AND user_id = $2
       RETURNING xp, level, total_xp`,
      [guildId, odiscordId, xp]
    );

    // If no existing record, create new member with initial XP
    if (result.rows.length === 0) {
      await this.pool.query(
        `INSERT INTO guild_members (guild_id, user_id, xp, level, total_xp, message_count)
         VALUES ($1, $2, $3, 0, $3, 1)`,
        [guildId, odiscordId, xp]
      );
      return { newXp: xp, newLevel: 0, leveledUp: false };
    }

    // Calculate new level using square root formula
    const { xp: newXp, level, total_xp } = result.rows[0];
    const newLevel = Math.floor(0.1 * Math.sqrt(total_xp));
    const leveledUp = newLevel > level;

    // Update level in database if user leveled up
    if (leveledUp) {
      await this.pool.query(
        'UPDATE guild_members SET level = $3 WHERE guild_id = $1 AND user_id = $2',
        [guildId, odiscordId, newLevel]
      );
    }

    return { newXp, newLevel, leveledUp };
  }

  async getLeaderboard(guildId: string, limit = 10): Promise<Array<{ odiscordId: string; xp: number; level: number }>> {
    const result = await this.pool.query(
      `SELECT user_id as "odiscordId", total_xp as xp, level 
       FROM guild_members 
       WHERE guild_id = $1 
       ORDER BY total_xp DESC 
       LIMIT $2`,
      [guildId, limit]
    );
    return result.rows;
  }

  async addWarning(guildId: string, odiscordId: string, moderatorId: string, reason: string): Promise<number> {
    const result = await this.pool.query(
      `INSERT INTO warnings (guild_id, user_id, moderator_id, reason)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [guildId, odiscordId, moderatorId, reason]
    );
    
    // Return total warnings count
    const countResult = await this.pool.query(
      'SELECT COUNT(*) FROM warnings WHERE guild_id = $1 AND user_id = $2 AND active = true',
      [guildId, odiscordId]
    );
    
    return parseInt(countResult.rows[0].count);
  }

  async getWarnings(guildId: string, odiscordId: string) {
    const result = await this.pool.query(
      `SELECT * FROM warnings 
       WHERE guild_id = $1 AND user_id = $2 AND active = true 
       ORDER BY created_at DESC`,
      [guildId, odiscordId]
    );
    return result.rows;
  }

  async clearWarnings(guildId: string, odiscordId: string) {
    await this.pool.query(
      'UPDATE warnings SET active = false WHERE guild_id = $1 AND user_id = $2',
      [guildId, odiscordId]
    );
  }

  async logModAction(guildId: string, targetId: string, moderatorId: string, action: string, reason?: string, duration?: number) {
    await this.pool.query(
      `INSERT INTO mod_actions (guild_id, target_id, moderator_id, action, reason, duration)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [guildId, targetId, moderatorId, action, reason, duration]
    );
  }

  async close() {
    await this.pool.end();
  }
}
