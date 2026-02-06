/**
 * Scheduler Service
 * 
 * Background task scheduler for timed operations:
 * - Scheduled/recurring messages
 * - Temporary ban expirations
 * - Reminder notifications
 * 
 * Uses a polling approach (checks every 60 seconds) for simplicity.
 * For high-volume production use, consider a proper job queue (Bull, Agenda).
 * 
 * @module services/SchedulerService
 */

import { TextChannel, EmbedBuilder } from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { COLORS } from '@wall-e/shared';
import { logger } from '../utils/logger.js';

/**
 * Database row structure for scheduled messages.
 */
interface ScheduledTask {
  id: number;                    // Unique task identifier
  guild_id: string;              // Discord guild ID
  channel_id: string;            // Target channel for message
  message: string;               // Message content (supports variables)
  embed: boolean;                // Whether to send as embed
  embed_color?: string;          // Hex color for embed (e.g., '#5865F2')
  cron_expression?: string;      // Cron schedule (not fully implemented)
  interval_minutes?: number;     // Repeat interval in minutes
  next_run: Date;                // When task should next execute
  last_run?: Date;               // When task last executed
  enabled: boolean;              // Whether task is active
  created_by: string;            // User ID who created the task
}

/**
 * Background scheduler for timed tasks.
 * 
 * Runs on a 60-second interval, checking for tasks that need execution.
 * Handles scheduled messages, temp ban expirations, and other timed operations.
 */
export class SchedulerService {
  /** Interval handle for the background check loop */
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(private client: WallEClient) {}

  /**
   * Start the scheduler background loop.
   * Should be called once during bot initialization.
   */
  start() {
    // Check every minute for tasks due to execute
    this.checkInterval = setInterval(() => {
      this.checkScheduledTasks();
    }, 60 * 1000); // 60 seconds

    // Run immediately on start to catch any missed tasks
    this.checkScheduledTasks();

    logger.info('Scheduler service started');
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  private async checkScheduledTasks() {
    try {
      const now = new Date();
      
      const result = await this.client.db.pool.query(
        `SELECT * FROM scheduled_messages 
         WHERE enabled = true AND next_run <= $1`,
        [now]
      );

      for (const task of result.rows as ScheduledTask[]) {
        await this.executeTask(task);
      }
    } catch (error) {
      logger.error('Error checking scheduled tasks:', error);
    }
  }

  private async executeTask(task: ScheduledTask) {
    try {
      const guild = this.client.guilds.cache.get(task.guild_id);
      if (!guild) return;

      const channel = guild.channels.cache.get(task.channel_id) as TextChannel;
      if (!channel) return;

      // Send the message
      if (task.embed) {
        const embed = new EmbedBuilder()
          .setColor(task.embed_color ? parseInt(task.embed_color.replace('#', ''), 16) : COLORS.PRIMARY)
          .setDescription(this.parseVariables(task.message, guild))
          .setTimestamp();

        await channel.send({ embeds: [embed] });
      } else {
        await channel.send(this.parseVariables(task.message, guild));
      }

      // Calculate next run
      let nextRun: Date;
      if (task.interval_minutes) {
        nextRun = new Date(Date.now() + task.interval_minutes * 60 * 1000);
      } else if (task.cron_expression) {
        nextRun = this.getNextCronRun(task.cron_expression);
      } else {
        // One-time task, disable it
        await this.client.db.pool.query(
          'UPDATE scheduled_messages SET enabled = false, last_run = NOW() WHERE id = $1',
          [task.id]
        );
        return;
      }

      // Update last_run and next_run
      await this.client.db.pool.query(
        'UPDATE scheduled_messages SET last_run = NOW(), next_run = $2 WHERE id = $1',
        [task.id, nextRun]
      );

      logger.info(`Executed scheduled task ${task.id} in guild ${task.guild_id}`);
    } catch (error) {
      logger.error(`Error executing scheduled task ${task.id}:`, error);
    }
  }

  /**
   * Replace template variables in message content.
   * 
   * Supported variables:
   * - {server} - Guild name
   * - {memberCount} - Current member count
   * - {date} - Current date (locale format)
   * - {time} - Current time (locale format)
   * 
   * @param message - Raw message with variable placeholders
   * @param guild - Discord guild object for context
   * @returns Message with variables replaced
   */
  private parseVariables(message: string, guild: any): string {
    return message
      .replace(/{server}/g, guild.name)
      .replace(/{memberCount}/g, guild.memberCount.toString())
      .replace(/{date}/g, new Date().toLocaleDateString())
      .replace(/{time}/g, new Date().toLocaleTimeString());
  }

  /**
   * Calculate next execution time from cron expression.
   * 
   * NOTE: This is a simplified implementation. For production,
   * use a proper cron library like 'cron-parser' or 'node-cron'.
   * 
   * @param expression - Cron expression (minute hour day month dayOfWeek)
   * @returns Next execution Date
   */
  private getNextCronRun(expression: string): Date {
    // TODO: Implement proper cron parsing with cron-parser library
    const parts = expression.split(' ');
    const now = new Date();
    const next = new Date(now);

    // Fallback: just add 1 minute
    next.setMinutes(next.getMinutes() + 1);
    
    return next;
  }

  async createScheduledMessage(
    guildId: string,
    channelId: string,
    message: string,
    options: {
      embed?: boolean;
      embedColor?: string;
      intervalMinutes?: number;
      cronExpression?: string;
      runAt?: Date;
      createdBy: string;
    }
  ): Promise<number> {
    let nextRun: Date;
    
    if (options.runAt) {
      nextRun = options.runAt;
    } else if (options.intervalMinutes) {
      nextRun = new Date(Date.now() + options.intervalMinutes * 60 * 1000);
    } else if (options.cronExpression) {
      nextRun = this.getNextCronRun(options.cronExpression);
    } else {
      throw new Error('Must specify runAt, intervalMinutes, or cronExpression');
    }

    const result = await this.client.db.pool.query(
      `INSERT INTO scheduled_messages 
       (guild_id, channel_id, message, embed, embed_color, interval_minutes, cron_expression, next_run, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        guildId,
        channelId,
        message,
        options.embed ?? false,
        options.embedColor,
        options.intervalMinutes,
        options.cronExpression,
        nextRun,
        options.createdBy
      ]
    );

    return result.rows[0].id;
  }

  async deleteScheduledMessage(guildId: string, taskId: number): Promise<boolean> {
    const result = await this.client.db.pool.query(
      'DELETE FROM scheduled_messages WHERE id = $1 AND guild_id = $2 RETURNING id',
      [taskId, guildId]
    );
    return result.rowCount! > 0;
  }

  async listScheduledMessages(guildId: string): Promise<ScheduledTask[]> {
    const result = await this.client.db.pool.query(
      'SELECT * FROM scheduled_messages WHERE guild_id = $1 ORDER BY next_run',
      [guildId]
    );
    return result.rows;
  }
}
