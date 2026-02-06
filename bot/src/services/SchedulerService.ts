import { TextChannel, EmbedBuilder } from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { COLORS } from '@wall-e/shared';
import { logger } from '../utils/logger.js';

interface ScheduledTask {
  id: number;
  guild_id: string;
  channel_id: string;
  message: string;
  embed: boolean;
  embed_color?: string;
  cron_expression?: string;
  interval_minutes?: number;
  next_run: Date;
  last_run?: Date;
  enabled: boolean;
  created_by: string;
}

export class SchedulerService {
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(private client: WallEClient) {}

  start() {
    // Check every minute for scheduled tasks
    this.checkInterval = setInterval(() => {
      this.checkScheduledTasks();
    }, 60 * 1000);

    // Also check immediately on start
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

  private parseVariables(message: string, guild: any): string {
    return message
      .replace(/{server}/g, guild.name)
      .replace(/{memberCount}/g, guild.memberCount.toString())
      .replace(/{date}/g, new Date().toLocaleDateString())
      .replace(/{time}/g, new Date().toLocaleTimeString());
  }

  private getNextCronRun(expression: string): Date {
    // Simplified cron parsing - supports basic patterns
    // Format: minute hour day month dayOfWeek
    const parts = expression.split(' ');
    const now = new Date();
    const next = new Date(now);

    // For simplicity, just add the interval
    // In production, use a proper cron library
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
