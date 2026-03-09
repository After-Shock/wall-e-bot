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

import { CronExpressionParser } from 'cron-parser';
import { TextChannel, EmbedBuilder, ActivityType, Message } from 'discord.js';
import type { WallEClient } from '../structures/Client.js';
import { COLORS } from '@wall-e/shared';
import { logger } from '../utils/logger.js';
import { sendLong } from '../utils/sendLong.js';
import { parseCembed } from '../utils/parseCembed.js';

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
  private autoCloseInterval: ReturnType<typeof setInterval> | null = null;
  private autoDeleteInterval: ReturnType<typeof setInterval> | null = null;
  private activityInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private client: WallEClient) {}

  /**
   * Start the scheduler background loop.
   * Should be called once during bot initialization.
   */
  start() {
    // Check every minute for tasks due to execute
    this.checkInterval = setInterval(() => {
      this.checkScheduledTasks();
      this.checkIntervalCommands();
    }, 60 * 1000); // 60 seconds

    // Run immediately on start to catch any missed tasks
    this.checkScheduledTasks();
    this.checkIntervalCommands();

    // Check for inactive tickets every hour
    this.autoCloseInterval = setInterval(() => { this.checkAutoClose(); }, 60 * 60 * 1000);
    this.checkAutoClose(); // run on start too

    // Check auto-delete channels every hour
    this.autoDeleteInterval = setInterval(() => { this.checkAutoDelete(); }, 60 * 60 * 1000);
    this.checkAutoDelete(); // run on start too

    // Apply bot activity status every 5 minutes (re-applies after gateway reconnects)
    this.activityInterval = setInterval(() => { this.applyBotActivity(); }, 5 * 60 * 1000);
    this.applyBotActivity(); // apply on start

    logger.info('Scheduler service started');
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    if (this.autoCloseInterval) {
      clearInterval(this.autoCloseInterval);
      this.autoCloseInterval = null;
    }
    if (this.autoDeleteInterval) {
      clearInterval(this.autoDeleteInterval);
      this.autoDeleteInterval = null;
    }
    if (this.activityInterval) {
      clearInterval(this.activityInterval);
      this.activityInterval = null;
    }
  }

  private async applyBotActivity() {
    try {
      const result = await this.client.db.pool.query(
        "SELECT value FROM bot_settings WHERE key = 'activity'",
      );
      const data = result.rows[0]?.value;
      if (!data?.text) return;

      const typeMap: Record<string, ActivityType> = {
        PLAYING: ActivityType.Playing,
        WATCHING: ActivityType.Watching,
        LISTENING: ActivityType.Listening,
        COMPETING: ActivityType.Competing,
      };
      const activityType = typeMap[data.type] ?? ActivityType.Playing;
      this.client.user?.setActivity(data.text, { type: activityType });
    } catch (error) {
      logger.error('Error applying bot activity:', error);
    }
  }

  private async checkScheduledTasks() {
    try {
      const now = new Date();
      
      const result = await this.client.db.pool.query(
        `SELECT * FROM scheduled_messages 
         WHERE enabled = true AND next_run <= $1`,
        [now],
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
          [task.id],
        );
        return;
      }

      // Update last_run and next_run
      await this.client.db.pool.query(
        'UPDATE scheduled_messages SET last_run = NOW(), next_run = $2 WHERE id = $1',
        [task.id, nextRun],
      );

      logger.info(`Executed scheduled task ${task.id} in guild ${task.guild_id}`);
    } catch (error) {
      logger.error(`Error executing scheduled task ${task.id}:`, error);
    }
  }

  private async checkAutoClose() {
    try {
      // Get global config for all guilds with auto-close enabled
      const configs = await this.client.db.pool.query(
        `SELECT guild_id, auto_close_hours FROM ticket_config
         WHERE auto_close_hours > 0`,
      );

      for (const config of configs.rows) {
        const { guild_id, auto_close_hours } = config;

        // Find tickets inactive for longer than auto_close_hours
        const staleTickets = await this.client.db.pool.query(
          `SELECT t.id, t.channel_id, t.user_id, t.warned_inactive
           FROM tickets t
           WHERE t.guild_id = $1
             AND t.status IN ('open', 'claimed')
             AND t.last_activity < NOW() - INTERVAL '1 hour' * $2`,
          [guild_id, auto_close_hours],
        );

        const guild = this.client.guilds.cache.get(guild_id);
        if (!guild) continue;

        for (const ticket of staleTickets.rows) {
          const channel = guild.channels.cache.get(ticket.channel_id) as TextChannel | undefined;
          if (!channel) continue;

          if (ticket.warned_inactive) {
            // Already warned — close it now
            await channel.send({
              embeds: [new EmbedBuilder()
                .setColor(COLORS.ERROR)
                .setTitle('🔒 Ticket Auto-Closed')
                .setDescription('This ticket has been automatically closed due to inactivity.'),
              ],
            });

            await this.client.db.pool.query(
              `UPDATE tickets SET status = 'closed', closed_by = $2, closed_at = NOW(),
               close_reason = 'Auto-closed due to inactivity' WHERE id = $1`,
              [ticket.id, this.client.user?.id ?? 'auto-close'],
            );

            // Try to move to closed category
            const panelData = await this.client.db.pool.query(
              `SELECT tp.category_closed_id FROM tickets t
               JOIN ticket_panels tp ON t.panel_id = tp.id
               WHERE t.id = $1`,
              [ticket.id],
            );
            if (panelData.rows[0]?.category_closed_id) {
              try {
                await channel.setParent(panelData.rows[0].category_closed_id, { lockPermissions: false });
                await channel.setName(`closed-${channel.name}`.substring(0, 100));
              } catch { /* Ignore if already closed */ }
            } else {
              setTimeout(async () => {
                try { await channel.delete(); } catch { /* already deleted */ }
              }, 5000);
            }
          } else {
            // First warning
            await channel.send({
              embeds: [new EmbedBuilder()
                .setColor(COLORS.WARNING)
                .setTitle('⚠️ Inactivity Warning')
                .setDescription(
                  'This ticket will be automatically closed in **1 hour** due to inactivity.\n' +
                  'Send a message to keep it open.',
                ),
              ],
            });
            await this.client.db.pool.query(
              'UPDATE tickets SET warned_inactive = TRUE WHERE id = $1',
              [ticket.id],
            );
          }
        }
      }
    } catch (error) {
      logger.error('Error in auto-close check:', error);
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
    try {
      const interval = CronExpressionParser.parse(expression);
      return interval.next().toDate();
    } catch {
      // Fallback: 1 hour from now
      return new Date(Date.now() + 60 * 60 * 1000);
    }
  }

  private async checkIntervalCommands() {
    try {
      const now = new Date();
      const result = await this.client.db.pool.query(
        `SELECT id, guild_id, name, responses, embed_response, cembed_response, embed_color,
                interval_cron, interval_channel_id, case_sensitive
         FROM custom_commands
         WHERE trigger_type = 'interval'
           AND enabled = TRUE
           AND interval_cron IS NOT NULL
           AND interval_channel_id IS NOT NULL
           AND (interval_next_run IS NULL OR interval_next_run <= $1)`,
        [now],
      );

      for (const cmd of result.rows) {
        await this.fireIntervalCommand(cmd);
      }
    } catch (error) {
      logger.error('Error checking interval commands:', error);
    }
  }

  private async fireIntervalCommand(cmd: {
    id: number;
    guild_id: string;
    responses: string[];
    embed_response: boolean;
    cembed_response: boolean;
    embed_color: string | null;
    interval_cron: string;
    interval_channel_id: string;
  }) {
    try {
      const guild = this.client.guilds.cache.get(cmd.guild_id);
      if (!guild) return;

      const channel = guild.channels.cache.get(cmd.interval_channel_id);
      if (!channel || !channel.isTextBased() || !('send' in channel)) return;

      const responses = cmd.responses as string[];
      const raw = responses[Math.floor(Math.random() * responses.length)];
      const rendered = this.client.template.render(raw, {
        server: guild.name,
        memberCount: guild.memberCount,
        channel: 'name' in channel ? `#${(channel as { name: string }).name}` : '',
        channelId: channel.id,
        user: '',
        username: '',
        userId: '',
        args: [],
      });

      if (cmd.cembed_response) {
        const embedData = parseCembed(rendered);
        if (!embedData) {
          await (channel as import('discord.js').TextChannel).send('⚠️ Failed to parse embed.');
        } else {
          const { EmbedBuilder } = await import('discord.js');
          const embed = new EmbedBuilder();
          if (embedData.title) embed.setTitle(embedData.title);
          if (embedData.description) embed.setDescription(embedData.description);
          if (embedData.color != null) embed.setColor(embedData.color);
          if (embedData.url) embed.setURL(embedData.url);
          if (embedData.author?.name) embed.setAuthor({ name: embedData.author.name, iconURL: embedData.author.icon_url, url: embedData.author.url });
          if (embedData.footer?.text) embed.setFooter({ text: embedData.footer.text, iconURL: embedData.footer.icon_url });
          if (embedData.thumbnail) embed.setThumbnail(embedData.thumbnail);
          if (embedData.image) embed.setImage(embedData.image);
          if (embedData.fields?.length) embed.addFields(embedData.fields.map(f => ({ name: f.name, value: f.value, inline: f.inline ?? false })));
          await (channel as import('discord.js').TextChannel).send({ embeds: [embed] });
        }
      } else if (cmd.embed_response) {
        const { EmbedBuilder } = await import('discord.js');
        const embed = new EmbedBuilder()
          .setDescription(rendered)
          .setColor((cmd.embed_color ?? '#5865F2') as `#${string}`);
        await (channel as import('discord.js').TextChannel).send({ embeds: [embed] });
      } else {
        await sendLong(channel as import('discord.js').TextChannel, rendered);
      }

      // Update uses + schedule next run
      const nextRun = this.getNextCronRun(cmd.interval_cron);
      await this.client.db.pool.query(
        `UPDATE custom_commands
         SET uses = uses + 1, interval_next_run = $2
         WHERE id = $1`,
        [cmd.id, nextRun],
      );
    } catch (error) {
      logger.error(`Error firing interval command ${cmd.id}:`, error);
    }
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
    },
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
        options.createdBy,
      ],
    );

    return result.rows[0].id;
  }

  async deleteScheduledMessage(guildId: string, taskId: number): Promise<boolean> {
    const result = await this.client.db.pool.query(
      'DELETE FROM scheduled_messages WHERE id = $1 AND guild_id = $2 RETURNING id',
      [taskId, guildId],
    );
    return result.rowCount! > 0;
  }

  async listScheduledMessages(guildId: string): Promise<ScheduledTask[]> {
    const result = await this.client.db.pool.query(
      'SELECT * FROM scheduled_messages WHERE guild_id = $1 ORDER BY next_run',
      [guildId],
    );
    return result.rows;
  }

  private async checkAutoDelete() {
    try {
      const result = await this.client.db.pool.query(
        `SELECT * FROM auto_delete_channels WHERE enabled = TRUE`,
      );
      for (const config of result.rows) {
        await this.runAutoDelete(config).catch(e =>
          logger.error(`Auto-delete failed for channel ${config.channel_id}:`, e),
        );
      }
    } catch (error) {
      logger.error('Error in checkAutoDelete:', error);
    }
  }

  private async runAutoDelete(config: {
    guild_id: string;
    channel_id: string;
    max_age_hours: number | null;
    max_messages: number | null;
    exempt_roles: string[];
  }) {
    const guild = this.client.guilds.cache.get(config.guild_id);
    if (!guild) return;

    const channel = guild.channels.cache.get(config.channel_id);
    if (!channel || !channel.isTextBased()) return;
    const textChannel = channel as TextChannel;

    // Fetch all messages (paginated, up to 500 max to avoid abuse)
    const allMessages: Message[] = [];
    let lastId: string | undefined;
    for (let page = 0; page < 5; page++) {
      const batch = await textChannel.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) });
      if (batch.size === 0) break;
      allMessages.push(...batch.values());
      lastId = batch.last()?.id;
      if (batch.size < 100) break;
    }

    // Filter out pinned messages and messages from exempt roles
    const candidates = allMessages.filter(msg => {
      if (msg.pinned) return false;
      if (config.exempt_roles.length > 0) {
        const memberRoles = msg.member?.roles.cache;
        if (memberRoles && config.exempt_roles.some(r => memberRoles.has(r))) return false;
      }
      return true;
    });

    // Determine which messages to delete
    const toDelete: Message[] = [];
    const now = Date.now();
    const cutoff = config.max_age_hours ? now - config.max_age_hours * 60 * 60 * 1000 : null;

    // Sort newest first
    const sorted = candidates.sort((a, b) => b.createdTimestamp - a.createdTimestamp);

    sorted.forEach((msg, index) => {
      let shouldDelete = false;
      if (cutoff && msg.createdTimestamp < cutoff) shouldDelete = true;
      if (config.max_messages != null && index >= config.max_messages) shouldDelete = true;
      if (shouldDelete) toDelete.push(msg);
    });

    if (toDelete.length === 0) return;

    const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;
    const bulk = toDelete.filter(m => m.createdTimestamp > fourteenDaysAgo);
    const individual = toDelete.filter(m => m.createdTimestamp <= fourteenDaysAgo);

    // Bulk delete recent messages (batches of 100)
    for (let i = 0; i < bulk.length; i += 100) {
      const batch = bulk.slice(i, i + 100);
      if (batch.length === 1) {
        await batch[0].delete().catch(e =>
          logger.error(`Single delete failed in ${config.channel_id}:`, e),
        );
      } else {
        await textChannel.bulkDelete(batch, true).catch(e =>
          logger.error(`Bulk delete failed in ${config.channel_id}:`, e),
        );
      }
    }

    // Delete old messages one by one (rate-limit friendly)
    for (const msg of individual) {
      await msg.delete().catch(() => null);
      await new Promise(r => setTimeout(r, 1000));
    }

    logger.info(`Auto-delete: removed ${toDelete.length} messages from ${config.channel_id} in ${config.guild_id}`);
  }
}
