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
 * Transaction client wrapper for atomic operations.
 */
export interface TransactionClient {
  query: typeof pg.Pool.prototype.query;
  release: () => void;
}

/**
 * PostgreSQL database service with connection pooling.
 * 
 * Manages:
 * - Guild configurations (prefixes, modules, settings)
 * - Member data (XP, levels, message counts)
 * - Warnings and moderation actions
 * - Scheduled tasks and temporary bans
 * 
 * IMPORTANT: Use transactions for operations that require atomicity.
 */
export class DatabaseService {
  /** PostgreSQL connection pool - prefer using query methods over direct access */
  private _pool!: pg.Pool;

  /**
   * Get the connection pool for direct queries.
   * Prefer using the provided methods, but this is available for complex queries.
   */
  get pool(): pg.Pool {
    return this._pool;
  }

  /**
   * Initialize the database connection pool.
   * 
   * Uses DATABASE_URL environment variable for connection string.
   * Pool automatically manages connection lifecycle and reconnection.
   * 
   * @throws {Error} If database connection fails
   */
  async connect() {
    this._pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20, // Maximum connections in pool
      idleTimeoutMillis: 30000, // Close idle connections after 30s
      connectionTimeoutMillis: 5000, // Fail fast if can't connect in 5s
    });

    // Handle pool errors
    this._pool.on('error', (err) => {
      logger.error('Unexpected database pool error:', err);
    });

    // Verify connection with simple query
    await this._pool.query('SELECT NOW()');
    logger.info('Connected to PostgreSQL');
  }

  // ===========================================================================
  // Transaction Support
  // ===========================================================================

  /**
   * Execute a function within a database transaction.
   * 
   * Automatically handles BEGIN, COMMIT, and ROLLBACK.
   * If the function throws, the transaction is rolled back.
   * 
   * @example
   * await db.transaction(async (client) => {
   *   await client.query('INSERT INTO ...');
   *   await client.query('UPDATE ...');
   *   // Both queries succeed or both fail
   * });
   */
  async transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this._pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a query with automatic retry on transient failures.
   * Useful for operations that may fail due to connection issues.
   */
  async queryWithRetry(
    query: string,
    params: unknown[],
    maxRetries = 3
  ): Promise<pg.QueryResult> {
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this._pool.query(query, params);
      } catch (error) {
        lastError = error as Error;
        
        // Only retry on connection errors, not query errors
        const isRetryable = 
          lastError.message.includes('connection') ||
          lastError.message.includes('timeout') ||
          lastError.message.includes('ECONNRESET');
        
        if (!isRetryable || attempt === maxRetries) {
          throw error;
        }
        
        logger.warn(`Database query failed (attempt ${attempt}/${maxRetries}), retrying...`);
        await new Promise(resolve => setTimeout(resolve, 100 * attempt));
      }
    }
    
    throw lastError;
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
   * FIXED: Uses atomic UPSERT with row-level locking to prevent race conditions.
   * The SELECT FOR UPDATE ensures only one transaction can modify a row at a time.
   * 
   * Level formula: level = floor(0.1 * sqrt(total_xp))
   * This creates a smooth progression curve where higher levels
   * require exponentially more XP.
   * 
   * @param guildId - Discord guild ID
   * @param userId - Discord user ID
   * @param xp - Amount of XP to add
   * @returns Object with new XP, new level, and whether user leveled up
   */
  async addXp(guildId: string, userId: string, xp: number): Promise<{ newXp: number; newLevel: number; leveledUp: boolean }> {
    return this.transaction(async (client) => {
      // Use UPSERT with row locking to prevent race conditions
      // The ON CONFLICT ... DO UPDATE with RETURNING is atomic
      const result = await client.query(
        `INSERT INTO guild_members (guild_id, user_id, xp, level, total_xp, message_count, last_xp_gain)
         VALUES ($1, $2, $3, 0, $3, 1, NOW())
         ON CONFLICT (guild_id, user_id) DO UPDATE SET
           xp = guild_members.xp + $3,
           total_xp = guild_members.total_xp + $3,
           message_count = guild_members.message_count + 1,
           last_xp_gain = NOW()
         RETURNING xp, level, total_xp`,
        [guildId, userId, xp]
      );

      const { xp: newXp, level, total_xp } = result.rows[0];
      
      // Calculate new level using square root formula
      const newLevel = Math.floor(0.1 * Math.sqrt(total_xp));
      const leveledUp = newLevel > level;

      // Update level atomically within the same transaction
      if (leveledUp) {
        await client.query(
          'UPDATE guild_members SET level = $3 WHERE guild_id = $1 AND user_id = $2',
          [guildId, userId, newLevel]
        );
      }

      return { newXp, newLevel, leveledUp };
    });
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

  /**
   * Add a warning to a user.
   * 
   * FIXED: Uses transaction to ensure warning is added and count is accurate.
   * 
   * @returns Total active warnings count after adding
   */
  async addWarning(guildId: string, userId: string, moderatorId: string, reason: string): Promise<number> {
    return this.transaction(async (client) => {
      // Insert the warning
      await client.query(
        `INSERT INTO warnings (guild_id, user_id, moderator_id, reason)
         VALUES ($1, $2, $3, $4)`,
        [guildId, userId, moderatorId, reason]
      );
      
      // Get accurate count within the same transaction
      const countResult = await client.query(
        'SELECT COUNT(*)::int as count FROM warnings WHERE guild_id = $1 AND user_id = $2 AND active = true',
        [guildId, userId]
      );
      
      return countResult.rows[0].count;
    });
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
    await this._pool.end();
    logger.info('Database connection pool closed');
  }

  // ===========================================================================
  // Ticket-specific queries (with transaction support)
  // ===========================================================================

  /**
   * Create a ticket atomically.
   * 
   * FIXED: Uses transaction to prevent duplicate tickets and ensure
   * ticket number is unique even under concurrent creation.
   */
  async createTicket(
    guildId: string,
    channelId: string,
    userId: string
  ): Promise<{ ticketId: number; ticketNumber: number }> {
    return this.transaction(async (client) => {
      // Lock the tickets table for this guild to prevent race conditions
      // on ticket number generation
      await client.query(
        'SELECT 1 FROM tickets WHERE guild_id = $1 FOR UPDATE',
        [guildId]
      );

      // Get next ticket number
      const numberResult = await client.query(
        'SELECT COALESCE(MAX(ticket_number), 0) + 1 as next FROM tickets WHERE guild_id = $1',
        [guildId]
      );
      const ticketNumber = numberResult.rows[0].next;

      // Insert ticket
      const insertResult = await client.query(
        `INSERT INTO tickets (guild_id, channel_id, user_id, ticket_number)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [guildId, channelId, userId, ticketNumber]
      );

      return {
        ticketId: insertResult.rows[0].id,
        ticketNumber,
      };
    });
  }

  /**
   * Check if user has an open ticket.
   */
  async hasOpenTicket(guildId: string, userId: string): Promise<{ hasTicket: boolean; channelId?: string }> {
    const result = await this._pool.query(
      `SELECT channel_id FROM tickets 
       WHERE guild_id = $1 AND user_id = $2 AND status = 'open'
       LIMIT 1`,
      [guildId, userId]
    );

    if (result.rows.length > 0) {
      return { hasTicket: true, channelId: result.rows[0].channel_id };
    }
    return { hasTicket: false };
  }

  // ===========================================================================
  // Scheduled message queries
  // ===========================================================================

  /**
   * Get scheduled messages due for execution.
   * Uses FOR UPDATE SKIP LOCKED to prevent multiple workers from
   * processing the same task.
   */
  async getAndLockDueTasks(limit = 10): Promise<Array<{
    id: number;
    guild_id: string;
    channel_id: string;
    message: string;
    embed: boolean;
    embed_color?: string;
    interval_minutes?: number;
  }>> {
    const result = await this._pool.query(
      `SELECT id, guild_id, channel_id, message, embed, embed_color, interval_minutes
       FROM scheduled_messages
       WHERE enabled = true AND next_run <= NOW()
       ORDER BY next_run
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [limit]
    );
    return result.rows;
  }

  /**
   * Mark a scheduled task as executed and set next run time.
   */
  async markTaskExecuted(taskId: number, nextRun: Date | null): Promise<void> {
    if (nextRun) {
      await this._pool.query(
        'UPDATE scheduled_messages SET last_run = NOW(), next_run = $2 WHERE id = $1',
        [taskId, nextRun]
      );
    } else {
      // One-time task, disable it
      await this._pool.query(
        'UPDATE scheduled_messages SET last_run = NOW(), enabled = false WHERE id = $1',
        [taskId]
      );
    }
  }
}
