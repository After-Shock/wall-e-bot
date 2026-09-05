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
import { recordSchedulerTick } from '../utils/heartbeat.js';

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
  failure_count: number;         // Consecutive delivery failures
}

/** Consecutive delivery failures before a scheduled message is disabled. */
const MAX_TASK_FAILURES = 5;

/**
 * Background scheduler for timed tasks.
 * 
 * Runs on a 60-second interval, checking for tasks that need execution.
 * Handles scheduled messages, temp ban expirations, and other timed operations.
 */
export class SchedulerService {
  private schedulerTimeout: ReturnType<typeof setTimeout> | null = null;
  private schedulerTick: Promise<void> | null = null;
  private started = false;
  private autoCloseInterval: ReturnType<typeof setInterval> | null = null;
  private autoDeleteInterval: ReturnType<typeof setInterval> | null = null;
  private activityInterval: ReturnType<typeof setInterval> | null = null;
  private autoDeleteSubscriber: import('ioredis').Redis | null = null;

  constructor(private client: WallEClient) {}

  /** Runs the critical scheduled-message, interval-command, and temp-ban checks. */
  async runSchedulerTick(): Promise<void> {
    try {
      await this.checkScheduledTasks();
    } catch (err) {
      logger.error('[Scheduler] checkScheduledTasks failed:', err);
    }
    try {
      await this.checkIntervalCommands();
    } catch (err) {
      logger.error('[Scheduler] checkIntervalCommands failed:', err);
    }
    try {
      await this.checkTempBans();
    } catch (err) {
      logger.error('[Scheduler] checkTempBans failed:', err);
    }
    // Last: a heartbeat only means something if the work above actually ran.
    await recordSchedulerTick(this.client);
  }

  /** Run one tick at a time and wait about a minute after it finishes. */
  private async runGuardedSchedulerTick(): Promise<void> {
    if (this.schedulerTick) return this.schedulerTick;

    const tick = this.runSchedulerTick()
      .catch((err) => {
        logger.error('[Scheduler] scheduler tick failed:', err);
      })
      .finally(() => {
        if (this.schedulerTick === tick) this.schedulerTick = null;
        if (this.started) {
          this.schedulerTimeout = setTimeout(() => {
            this.schedulerTimeout = null;
            void this.runGuardedSchedulerTick();
          }, 60_000);
        }
      });
    this.schedulerTick = tick;
    return tick;
  }

  /** Unban users whose temp ban has expired. */
  private async checkTempBans() {
    const { rows } = await this.client.db.pool.query(
      `SELECT id, guild_id, user_id FROM temp_bans
       WHERE unbanned = false AND unban_at <= NOW()`,
    );
    for (const ban of rows as { id: number; guild_id: string; user_id: string }[]) {
      // If the guild isn't on this process (not ready yet, another shard, bot
      // removed) `guild?.members.unban(...)` used to evaluate to undefined, the
      // await resolved, and the row was flipped to unbanned = true — leaving the
      // user banned forever with nothing left to retry. Skip instead: the row
      // stays due and the next tick, or the shard that owns the guild, gets it.
      const guild = this.client.guilds.cache.get(ban.guild_id);
      if (!guild) continue;

      try {
        // unban throws if the user is not banned (already manually unbanned) —
        // treat that as success so we stop retrying every tick.
        await guild.members.unban(ban.user_id, 'Temp ban expired').catch((e: { code?: number }) => {
          if (e?.code !== 10026 /* Unknown Ban */) throw e;
        });
        await this.client.db.pool.query(
          'UPDATE temp_bans SET unbanned = true WHERE id = $1',
          [ban.id],
        );
      } catch (err) {
        logger.error(`Failed to lift temp ban ${ban.id} (${ban.user_id} in ${ban.guild_id}):`, err);
      }
    }
  }

  async start(): Promise<void> {
    if (this.started) {
      if (this.schedulerTick) await this.schedulerTick;
      return;
    }
    this.started = true;

    // Check for inactive tickets every hour
    this.autoCloseInterval = setInterval(() => { this.checkAutoClose(); }, 60 * 60 * 1000);
    this.checkAutoClose(); // run on start too

    // Check auto-delete channels every hour
    this.autoDeleteInterval = setInterval(() => { this.checkAutoDelete(); }, 60 * 60 * 1000);
    this.checkAutoDelete(); // run on start too

    // Subscribe to Redis pub/sub for on-demand auto-delete triggers.
    //
    // duplicate() inherits the cache client's options, and those are tuned for
    // cache reads: lazyConnect (so nothing races startup) and no offline queue
    // (so a read fails fast instead of hanging). Both are wrong for a
    // subscriber — it would never connect, and subscribe() would throw. Give it
    // an eagerly-connected client with the offline queue on, so the
    // subscription survives a reconnect.
    this.autoDeleteSubscriber = this.client.cache.redisClient.duplicate({
      lazyConnect: false,
      enableOfflineQueue: true,
    });
    this.autoDeleteSubscriber.on('error', (err) =>
      logger.error('autoDeleteSubscriber Redis error:', err),
    );
    this.autoDeleteSubscriber.subscribe('auto-delete:trigger', (err) => {
      if (err) logger.error('Failed to subscribe to auto-delete:trigger:', err);
      else logger.info('Subscribed to auto-delete:trigger channel');
    });
    this.autoDeleteSubscriber.on('message', (_channel, message) => {
      try {
        const payload = JSON.parse(message) as { guildId: string; configId?: number };
        if (payload.configId !== null && payload.configId !== undefined) {
          this.runAutoDeleteById(payload.configId, payload.guildId).catch(e =>
            logger.error('run-now single failed:', e),
          );
        } else {
          this.checkAutoDeleteForGuild(payload.guildId).catch(e =>
            logger.error('run-now all failed:', e),
          );
        }
      } catch (e) {
        logger.error('Failed to parse auto-delete:trigger message:', e);
      }
    });

    // Apply bot activity status every 5 minutes (re-applies after gateway reconnects)
    this.activityInterval = setInterval(() => { this.applyBotActivity(); }, 5 * 60 * 1000);
    this.applyBotActivity(); // apply on start

    // Await the first durable-work poll so ready never reports a scheduler that
    // has not yet checked work accumulated while this process was offline.
    await this.runGuardedSchedulerTick();
    logger.info('Scheduler service started');
  }

  async stop(): Promise<void> {
    this.started = false;
    if (this.schedulerTimeout) {
      clearTimeout(this.schedulerTimeout);
      this.schedulerTimeout = null;
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
    if (this.autoDeleteSubscriber) {
      const subscriber = this.autoDeleteSubscriber;
      this.autoDeleteSubscriber = null;
      try {
        await subscriber.unsubscribe();
      } finally {
        subscriber.disconnect();
      }
    }
    if (this.schedulerTick) await this.schedulerTick;
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

  /**
   * Work out when a repeating task should next fire.
   *
   * Anchored on the run it was *due* for, not on "now", so execution latency
   * doesn't accumulate into drift. If the bot was down long enough that the
   * anchored time is still in the past, skip forward rather than replaying
   * every missed run.
   */
  private computeNextRun(task: ScheduledTask): Date | null {
    const now = Date.now();

    if (task.interval_minutes) {
      const step = task.interval_minutes * 60 * 1000;
      const due = new Date(task.next_run).getTime();
      const missed = Math.max(1, Math.ceil((now - due) / step));
      return new Date(due + missed * step);
    }

    if (task.cron_expression) {
      return this.getNextCronRun(task.cron_expression);
    }

    return null; // one-time task
  }

  /**
   * Claim a task by advancing its cursor, and only send if the claim succeeded.
   *
   * The previous order was send-then-update, which re-sent the message whenever
   * the process died or Discord errored between the two. Worse, an uncached
   * guild or a deleted channel returned early without ever advancing next_run,
   * so the task stayed due and was retried every 60 seconds forever, silently.
   *
   * The compare-and-set on next_run also gives cross-process mutual exclusion
   * for free: with several shards polling, exactly one wins the claim.
   */
  private async executeTask(task: ScheduledTask) {
    const nextRun = this.computeNextRun(task);

    const claim = nextRun
      ? await this.client.db.pool.query(
          `UPDATE scheduled_messages SET next_run = $2, last_run = NOW()
           WHERE id = $1 AND next_run = $3 AND enabled = true
           RETURNING id`,
          [task.id, nextRun, task.next_run],
        )
      : await this.client.db.pool.query(
          `UPDATE scheduled_messages SET enabled = false, last_run = NOW()
           WHERE id = $1 AND next_run = $2 AND enabled = true
           RETURNING id`,
          [task.id, task.next_run],
        );

    if (claim.rowCount === 0) return; // another process (or shard) took it

    try {
      const guild = this.client.guilds.cache.get(task.guild_id);
      if (!guild) throw new Error(`Guild ${task.guild_id} not available on this process`);

      const channel = guild.channels.cache.get(task.channel_id) as TextChannel | undefined;
      if (!channel?.isTextBased()) throw new Error(`Channel ${task.channel_id} not found or not text`);

      if (task.embed) {
        const embed = new EmbedBuilder()
          .setColor(this.parseEmbedColor(task.embed_color))
          .setDescription(this.parseVariables(task.message, guild))
          .setTimestamp();

        await channel.send({ embeds: [embed] });
      } else {
        await channel.send(this.parseVariables(task.message, guild));
      }

      await this.client.db.pool.query(
        'UPDATE scheduled_messages SET failure_count = 0, last_error = NULL WHERE id = $1',
        [task.id],
      );

      logger.info(`Executed scheduled task ${task.id} in guild ${task.guild_id}`);
    } catch (error) {
      await this.recordTaskFailure(task, error);
    }
  }

  /** Count a failed delivery, and disable the task once it is clearly broken. */
  private async recordTaskFailure(task: ScheduledTask, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const failures = (task.failure_count ?? 0) + 1;

    try {
      if (failures >= MAX_TASK_FAILURES) {
        await this.client.db.pool.query(
          'UPDATE scheduled_messages SET enabled = false, failure_count = $2, last_error = $3 WHERE id = $1',
          [task.id, failures, message],
        );
        logger.error(
          `Disabled scheduled task ${task.id} (guild ${task.guild_id}) after ${failures} consecutive failures: ${message}`,
        );
      } else {
        await this.client.db.pool.query(
          'UPDATE scheduled_messages SET failure_count = $2, last_error = $3 WHERE id = $1',
          [task.id, failures, message],
        );
        logger.warn(`Scheduled task ${task.id} failed (${failures}/${MAX_TASK_FAILURES}): ${message}`);
      }
    } catch (dbError) {
      logger.error(`Could not record failure for scheduled task ${task.id}:`, dbError);
    }
  }

  /** Hex string to an embed colour, falling back rather than throwing on junk. */
  private parseEmbedColor(raw: string | undefined): number {
    if (!raw) return COLORS.PRIMARY;
    const parsed = parseInt(raw.replace('#', ''), 16);
    return Number.isNaN(parsed) ? COLORS.PRIMARY : parsed;
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
          if (embedData.color !== undefined) embed.setColor(embedData.color);
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

  private async checkAutoDelete() {
    try {
      const result = await this.client.db.pool.query(
        'SELECT * FROM auto_delete_channels WHERE enabled = TRUE',
      );
      for (const config of result.rows) {
        await this.runAutoDelete(config).catch(e =>
          logger.error(`Auto-delete failed for channel ${config.channel_id}: ${e instanceof Error ? e.stack ?? e.message : String(e)}`),
        );
      }
    } catch (error) {
      logger.error('Error in checkAutoDelete:', error);
    }
  }

  private async checkAutoDeleteForGuild(guildId: string) {
    try {
      const result = await this.client.db.pool.query(
        'SELECT * FROM auto_delete_channels WHERE enabled = TRUE AND guild_id = $1',
        [guildId],
      );
      for (const config of result.rows) {
        await this.runAutoDelete(config).catch(e =>
          logger.error(`Auto-delete failed for channel ${config.channel_id}: ${e instanceof Error ? e.stack ?? e.message : String(e)}`),
        );
      }
    } catch (error) {
      logger.error(`Error in checkAutoDeleteForGuild for ${guildId}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    }
  }

  private async runAutoDeleteById(configId: number, guildId: string) {
    try {
      const result = await this.client.db.pool.query(
        'SELECT * FROM auto_delete_channels WHERE id = $1 AND guild_id = $2',
        [configId, guildId],
      );
      if (result.rows.length === 0) {
        logger.warn(`Auto-delete run-now: config ${configId} not found in guild ${guildId}`);
        return;
      }
      await this.runAutoDelete(result.rows[0]);
    } catch (error) {
      logger.error(`Error in runAutoDeleteById for config ${configId}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    }
  }

  /**
   * Discord API error codes that will never succeed on retry:
   * 10003 Unknown Channel, 50001 Missing Access, 50013 Missing Permissions.
   * Hitting one of these disables the config instead of erroring every cycle.
   */
  private static readonly PERMANENT_AUTODELETE_ERRORS = new Set([10003, 50001, 50013]);

  /**
   * Duck-typed rather than `instanceof DiscordAPIError` — nested copies of
   * @discordjs/rest in a Docker build make instanceof unreliable.
   */
  private static isPermanentAutoDeleteError(error: unknown): error is Error & { code: number | string } {
    return error instanceof Error && 'code' in error &&
      SchedulerService.PERMANENT_AUTODELETE_ERRORS.has(Number((error as { code: unknown }).code));
  }

  private async disableAutoDelete(configId: number, channelId: string, error: Error & { code: number | string }): Promise<void> {
    await this.client.db.pool.query(
      'UPDATE auto_delete_channels SET enabled = FALSE WHERE id = $1',
      [configId],
    ).catch(e => logger.error(`Failed to disable auto-delete config ${configId}:`, e));
    logger.warn(
      `Auto-delete disabled for channel ${channelId} (config ${configId}): ` +
      `${error.message} (code ${error.code}). Fix the bot's channel permissions ` +
      'and re-enable it from the dashboard.',
    );
  }

  private async runAutoDelete(config: {
    id: number;
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
    try {
      let lastId: string | undefined;
      for (let page = 0; page < 5; page++) {
        const batch = await textChannel.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) });
        if (batch.size === 0) break;
        allMessages.push(...batch.values());
        lastId = batch.last()?.id;
        if (batch.size < 100) break;
      }
    } catch (error) {
      if (SchedulerService.isPermanentAutoDeleteError(error)) {
        await this.disableAutoDelete(config.id, config.channel_id, error);
        return;
      }
      throw error;
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
      if (config.max_messages !== null && index >= config.max_messages) shouldDelete = true;
      if (shouldDelete) toDelete.push(msg);
    });

    if (toDelete.length === 0) return;

    const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;
    const bulk = toDelete.filter(m => m.createdTimestamp > fourteenDaysAgo);
    const individual = toDelete.filter(m => m.createdTimestamp <= fourteenDaysAgo);

    // Bulk delete recent messages (batches of 100)
    for (let i = 0; i < bulk.length; i += 100) {
      const batch = bulk.slice(i, i + 100);
      try {
        if (batch.length === 1) {
          await batch[0].delete();
        } else {
          await textChannel.bulkDelete(batch, true);
        }
      } catch (e) {
        if (SchedulerService.isPermanentAutoDeleteError(e)) {
          await this.disableAutoDelete(config.id, config.channel_id, e);
          return;
        }
        logger.error(`Delete failed in ${config.channel_id}: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
      }
    }

    // Delete old messages one by one (rate-limit friendly)
    for (const msg of individual) {
      await msg.delete().catch(e => logger.warn(`Failed to delete old message ${msg.id} in ${config.channel_id}: ${e instanceof Error ? e.message : String(e)}`));
      await new Promise(r => setTimeout(r, 1000));
    }

    logger.info(`Auto-delete: removed ${toDelete.length} messages from ${config.channel_id} in ${config.guild_id}`);
  }
}
