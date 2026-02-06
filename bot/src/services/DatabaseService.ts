import pg from 'pg';
import { logger } from '../utils/logger.js';
import type { GuildConfig, GuildMember } from '@wall-e/shared';

const { Pool } = pg;

export class DatabaseService {
  private pool!: pg.Pool;

  async connect() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    await this.pool.query('SELECT NOW()');
    logger.info('Connected to PostgreSQL');
  }

  async getGuildConfig(guildId: string): Promise<GuildConfig | null> {
    const result = await this.pool.query(
      'SELECT * FROM guild_configs WHERE guild_id = $1',
      [guildId]
    );
    return result.rows[0] || null;
  }

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

  async addXp(guildId: string, odiscordId: string, xp: number): Promise<{ newXp: number; newLevel: number; leveledUp: boolean }> {
    const result = await this.pool.query(
      `UPDATE guild_members 
       SET xp = xp + $3, total_xp = total_xp + $3, last_xp_gain = NOW()
       WHERE guild_id = $1 AND user_id = $2
       RETURNING xp, level, total_xp`,
      [guildId, odiscordId, xp]
    );

    if (result.rows.length === 0) {
      // Create new member record
      await this.pool.query(
        `INSERT INTO guild_members (guild_id, user_id, xp, level, total_xp, message_count)
         VALUES ($1, $2, $3, 0, $3, 1)`,
        [guildId, odiscordId, xp]
      );
      return { newXp: xp, newLevel: 0, leveledUp: false };
    }

    const { xp: newXp, level, total_xp } = result.rows[0];
    const newLevel = Math.floor(0.1 * Math.sqrt(total_xp));
    const leveledUp = newLevel > level;

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
